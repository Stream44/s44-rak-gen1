/**
 * registration-order:
 *   - auth
 *   - routing
 *   - compose
 *   - model-introspection
 *   - reflect-record
 * model-introspection follows the order-dependent docs; it is independent,
 * but keeping a stable sequence helps future debugging.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { AlgebraicKernel, CapabilityEngine, type JsonSchema } from "../L13-facade/index.ts";
import type { ModelBoot } from "../L09-demand/model-loader.ts";
import { AssetRegistry } from "./asset-registry.ts";
import {
  buildManifest,
  resolveManifestRef,
  validateActionReferences,
  type ResolvedManifest,
} from "./dispatch.ts";
import { PrimitiveRegistry } from "./primitive-registry.ts";
import type { ProjectionModel } from "../L01-foundation/projection-types.ts";
import { createDefaultSession } from "./session.ts";
import { loadKernelModel } from "./load-kernel-model.ts";
import {
  dispatchAndNarrow,
  dispatchAuthorize,
  dispatchSurveyCapabilities,
} from "./dispatch-helpers.ts";
import { validateDocument } from "./meta-document.ts";
import { buildModelActions, compileMetaProjection } from "./meta-actions.ts";
import {
  applySessionPatch,
  resolveAssetsDir,
  resolveDefaultPageName,
  setUiContextValue,
} from "./meta-state.ts";
import {
  renderTree,
  renderHtmlFor,
  renderShellFor,
  type MetaRenderState,
} from "./meta-renderer.ts";
import type {
  MetaProjectionKernel,
  MetaProjectionKernelOptions,
  ProjectionKernelRuntime,
} from "./runtime-types.ts";

export type {
  DispatchOutcome,
  LoadKernelModelOptions,
  MetaProjectionKernel,
  MetaProjectionKernelOptions,
  ProjectionKernelRuntime,
} from "./runtime-types.ts";
export { loadKernelModel } from "./load-kernel-model.ts";

const defaultKernelModelPath = resolve(import.meta.dir, "..", "L00-model", "kernel.model.yaml");

export async function createMetaProjectionKernel(
  app: ModelBoot | null,
  opts: MetaProjectionKernelOptions = {},
): Promise<MetaProjectionKernel> {
  const kernel = opts.kernel ?? AlgebraicKernel.create();
  const primitiveRegistry = opts.primitives ?? PrimitiveRegistry.createWithBuiltins();
  const assetRegistry = new AssetRegistry();
  const capabilityEngine = opts.capabilityEngine;
  const manifest: ResolvedManifest = { byName: new Map(), byUri: new Map() };
  const session = opts.session ?? createDefaultSession();
  const bindings = new Map<string, unknown>();
  const runtime = await loadKernelModel(opts.yamlPath ?? defaultKernelModelPath, {
    app,
    capabilityEngine,
    dispatchManifest: manifest,
    dispatchCapabilityRequirement: opts.dispatchCapabilityRequirement ?? "cap://none",
    kernel,
    session,
  });
  let actionMap = new Map(opts.modelActions ?? opts.intentProcessor?.actions ?? []);
  let schemaMap: Map<string, JsonSchema> | null = null;
  let doc: ProjectionModel | null = null;
  let yamlDir: string | null = null;
  const uiContextState = new Map<string, Record<string, unknown>>();
  const modelActions = () => buildModelActions(actionMap, app, schemaMap);
  const renderState = (): MetaRenderState => ({
    app,
    bindings,
    capabilityEngine: capabilityEngine as CapabilityEngine | undefined,
    manifest,
    session,
    uiContextState,
    assetRegistry,
  });
  const requireDoc = (): ProjectionModel => {
    if (!doc) throw new Error("No projector loaded. Call loadDocument() first.");
    return doc;
  };
  const syncManifest = (next: ResolvedManifest) => {
    manifest.byName = next.byName;
    manifest.byUri = next.byUri;
  };
  const adoptDocument = (input: ProjectionModel): ProjectionModel => {
    doc = validateDocument(input);
    syncManifest(buildManifest(doc, modelActions()));
    validateActionReferences(doc, primitiveRegistry, manifest);
    return doc;
  };
  assetRegistry.registerKind({
    actionSemantics: "",
    backends: [],
    cid: "builtin:ui.html.ws",
    id: "ui.html.ws",
    name: "ui.html.ws",
    primitives: [],
    targetCategory: "",
    version: "1.0.0",
  });
  const loadYamlFile = (path: string): ProjectionModel => {
    yamlDir = dirname(resolve(path));
    return adoptDocument(Bun.YAML.parse(readFileSync(path, "utf-8")) as ProjectionModel);
  };
  const compile = async (input: unknown): Promise<unknown> => {
    if (typeof input !== "string")
      throw new Error("MetaProjectionKernel.compile() expects YAML text.");
    return compileMetaProjection(input, kernel, modelActions());
  };
  return {
    ...runtime,
    get assets() {
      return assetRegistry;
    },
    get document() {
      return doc;
    },
    get primitives() {
      return primitiveRegistry;
    },
    compile,
    render: (pageName, props = {}) => renderTree(renderState(), requireDoc(), pageName, props),
    dispatch: (frame) => dispatchAndNarrow(runtime, manifest, frame),
    authorize: (requires, nextSession = session, ctx) =>
      dispatchAuthorize(runtime as ProjectionKernelRuntime, requires, nextSession, ctx),
    surveyCapabilities: () => dispatchSurveyCapabilities(runtime, doc),
    defaultPageName: () => resolveDefaultPageName(requireDoc()),
    getAssetsDir: () => resolveAssetsDir(doc, yamlDir),
    getSession: () => session,
    loadDocument: (nextDoc) => adoptDocument(nextDoc),
    loadYaml: (content) => adoptDocument(Bun.YAML.parse(content) as ProjectionModel),
    loadYamlFile,
    renderHtml: (pageName, props = {}) =>
      renderHtmlFor(renderState(), requireDoc(), pageName, props),
    renderShell: (opts, extra = {}) =>
      renderShellFor(renderState(), requireDoc(), yamlDir, opts, extra),
    actionKind: (ref) => resolveManifestRef(manifest, ref)?.kind ?? null,
    getBindings: () => new Map(bindings),
    listManifestActions: () => [...manifest.byName.keys()],
    injectActionMap: (map) => {
      actionMap = new Map(map);
      if (doc) syncManifest(buildManifest(doc, modelActions()));
    },
    injectSchemas: (map) => {
      schemaMap = map as Map<string, JsonSchema>;
    },
    registerAsset: (asset) => assetRegistry.register(asset),
    registerKind: (kind) => assetRegistry.registerKind(kind),
    setBinding: (name, value) => bindings.set(name, value),
    setSession: (next) => applySessionPatch(session, next),
    setUiContext: (ctxPath, path, value) => setUiContextValue(uiContextState, ctxPath, path, value),
  };
}
