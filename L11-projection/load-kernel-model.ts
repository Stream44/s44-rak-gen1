import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { AlgebraicKernel, CapabilityEngine, IntentProcessor } from "../L13-facade/index.ts";
import { SchemaValidator } from "../L01-foundation/validator.ts";
import "./model-introspection-m1.ts";
import "./reflect-record-m1.ts";
import { registerModelIntrospectionMorphisms } from "./model-introspection-m1.ts";
import { registerReflectRecordMorphisms } from "./reflect-record-m1.ts";
import { compileMorphism as _compileMorphism } from "./algebra.ts";
import { resolveManifestRef as _resolveManifestRef } from "./dispatch.ts";
import { createDefaultSession } from "./session.ts";
import { createLocalModuleResolver } from "./module-loader.ts";
import dispatchProjectionFrame from "./morphisms/dispatch-projection-frame.ts";
import evaluateActionMorphism from "./morphisms/evaluate-action-morphism.ts";
import installKernelModel from "./morphisms/install-kernel-model.ts";
import normalizeDispatchFrame from "./morphisms/normalize-dispatch-frame.ts";
import preloadModules from "./morphisms/preload-modules.ts";
import wireVerifyOneEngine from "./morphisms/wire-verify-one-engine.ts";
import { BundleCache } from "../L12-compiler/cache/bundle-cache.ts";
import { compileAllAlgebraMorphisms } from "../L12-compiler/bootstrap.ts";
import { OpcodeKernelVm } from "../L12-compiler/runtime/kernel-vm.ts";
import type { CompilerMode } from "../L05-morphism/registry.ts";
import { loadKindPack, parseKernelModel } from "./metamodel.ts";
import { dispatchAuthorize, dispatchSurveyCapabilities } from "./dispatch-helpers.ts";
import type {
  DispatchFrameInput,
  LoadKernelModelOptions,
  ProjectionKernelRuntime,
} from "./runtime-types.ts";

const phase2 = (method: string): never => {
  throw new Error(`ProjectionKernelRuntime.${method}() is not implemented yet.`);
};

export async function loadKernelModel(
  yamlPath: string,
  opts?: LoadKernelModelOptions,
): Promise<ProjectionKernelRuntime> {
  const resolvedYamlPath = resolve(yamlPath);
  const yamlDir = dirname(resolvedYamlPath);
  const moduleBaseDir =
    basename(resolvedYamlPath) === "kernel.model.yaml" && basename(yamlDir) === "L00-model"
      ? dirname(yamlDir)
      : yamlDir;
  const doc = parseKernelModel(readFileSync(yamlPath, "utf-8"));
  const ak = opts?.kernel ?? AlgebraicKernel.create();
  const intents = new IntentProcessor(ak);
  const capabilityEngine = opts?.capabilityEngine ?? new CapabilityEngine(ak);
  const resolver = opts?.internals?.resolverOverride ?? createLocalModuleResolver(moduleBaseDir);
  const validator = new SchemaValidator();
  const session = opts?.session ?? createDefaultSession();
  const app = opts?.app ?? null;
  const preload = opts?.internals?.preloadModulesOverride ?? preloadModules;
  const install = opts?.internals?.installKernelModelOverride ?? installKernelModel;
  for (const kind of Object.values(doc.kinds ?? {})) {
    const packDir = resolve(moduleBaseDir, kind.kindPath);
    loadKindPack(packDir);
    const handlersPath = resolve(packDir, "surface-handlers.ts");
    if (existsSync(handlersPath)) await import(pathToFileURL(handlersPath).href);
    const renderPassesPath = resolve(packDir, "register-passes.ts");
    if (existsSync(renderPassesPath)) await import(pathToFileURL(renderPassesPath).href);
  }
  registerModelIntrospectionMorphisms(ak);
  registerReflectRecordMorphisms(ak);
  const { algebraBindings, preloaded } = await preload({ doc, ak, resolver });
  opts?.onPreloadComplete?.(preloaded);
  const { morphismIdsByName, actionsByName, actionMorphisms, actionRequirements } = await install({
    doc,
    ak,
    intents,
    resolver,
    algebraBindings,
  });
  void (await wireVerifyOneEngine(resolver, capabilityEngine));
  const mode = process.env.ADK_COMPILED_KERNEL;
  if (mode === "true" || mode === "parity" || mode === "compiled") {
    const actualMode: CompilerMode = mode === "true" ? "compiled" : mode;
    const vm = new OpcodeKernelVm({
      registry: new BundleCache(),
      moduleResolver: (uri, exportName) => resolver(uri, exportName),
    });
    compileAllAlgebraMorphisms(ak.morphisms, vm);
    ak.morphisms.registerCompiler(vm, actualMode);
  }
  const runtime: ProjectionKernelRuntime = {
    async compile() {
      return phase2("compile");
    },
    render() {
      return phase2("render");
    },
    async dispatch(frame: DispatchFrameInput) {
      const actionRef = "ref" in frame ? frame.ref : frame.actionRef;
      const normalized = normalizeDispatchFrame(
        frame,
        actionsByName.has("Dispatch"),
        actionsByName.has(actionRef),
      );
      if (normalized) {
        try {
          if (!opts?.dispatchManifest)
            return {
              success: false,
              error: "Dispatch runtime requires loadKernelModel({ dispatchManifest }).",
            };
          return await dispatchProjectionFrame(
            normalized,
            opts.dispatchManifest,
            app,
            session,
            validator,
            opts.dispatchCapabilityRequirement ?? actionRequirements.get("Dispatch"),
            morphismIdsByName,
            algebraBindings,
            ak,
          );
        } catch (error) {
          return { success: false, error: error instanceof Error ? error.message : String(error) };
        }
      }
      const action = actionsByName.get(actionRef);
      if (!action) throw new Error(`Unknown action ref: ${actionRef}`);
      const requirement = actionRequirements.get(actionRef);
      if (requirement?.startsWith("cap://") && requirement !== "cap://none") {
        if (!frame.capabilityId)
          return { success: false, error: `Missing capability: ${requirement}` };
        const authorization = capabilityEngine.authorize(
          {
            id: `dispatch:${action.name}`,
            action: action.id,
            target: action.targetMachine,
            targetKey: frame.target ?? action.targetMachine,
            payload: frame.payload ?? {},
            timestamp: new Date(0).toISOString(),
          },
          frame.capabilityId,
        );
        if (!authorization.authorized)
          return {
            success: false,
            error: authorization.error
              ? `Capability denied: ${authorization.error}`
              : `Capability denied: ${requirement}`,
          };
      }
      const morphism = actionMorphisms.get(actionRef);
      if (!morphism) throw new Error(`Action ${actionRef} has no morphism mapping`);
      try {
        return {
          success: true,
          value: await evaluateActionMorphism(
            morphism,
            frame.payload ?? {},
            morphismIdsByName,
            algebraBindings,
            ak,
          ),
        };
      } catch (error) {
        return { success: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    async authorize(requires, nextSession = session, ctx) {
      return dispatchAuthorize(runtime, requires, nextSession, ctx);
    },
    async surveyCapabilities() {
      return dispatchSurveyCapabilities(runtime, doc);
    },
  };
  return runtime;
}
