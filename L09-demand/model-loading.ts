import { JsonEncoder } from "../L01-foundation/encoder.ts";
import type { Compatibility, TypeDef } from "../L01-foundation/types.ts";
import { MetaLevel } from "../L01-foundation/types.ts";
import { ADK_ORIGIN, buildTypeUri } from "../L01-foundation/utils.ts";
import type { AlgebraicKernel } from "../L13-facade/kernel.export.ts";
import { normalizeActionDef } from "./action-registration.ts";
import {
  buildEntitySchema,
  compileEntity,
  compileContract,
  compileLifecycle,
  compileRelation,
} from "./entity-registration.ts";
import type { ModelDocument, ModelLoadResult } from "./model-types.ts";

export interface ModelLoaderState {
  kernel: AlgebraicKernel;
  prefixes: Map<string, string>;
  loadedModels: Map<string, ModelLoadResult>;
  versionHistoryMap: Map<string, string[]>;
  cidHistoryMap: Map<string, string[]>;
  encoder: JsonEncoder;
}

export function createModelLoaderState(kernel: AlgebraicKernel): ModelLoaderState {
  return {
    kernel,
    prefixes: new Map<string, string>(),
    loadedModels: new Map<string, ModelLoadResult>(),
    versionHistoryMap: new Map<string, string[]>(),
    cidHistoryMap: new Map<string, string[]>(),
    encoder: new JsonEncoder(),
  };
}

export function loadModelDocument(
  state: ModelLoaderState,
  doc: ModelDocument,
  resolveTypeRef: (ref: string, currentOrigin: string, version: string) => string,
): ModelLoadResult {
  let origin = ADK_ORIGIN;
  if (doc.origin) origin = doc.origin.replace(/^https?:\/\//, "");
  state.prefixes.set(doc.model, origin);

  const { cid } = state.encoder.encodeAndHash(doc);
  const result: ModelLoadResult = {
    cid,
    modelId: doc.model,
    origin,
    version: doc.version,
    conformsTo: doc.conformsTo,
    document: { ...doc },
    typesRegistered: [],
    propositionIds: [],
    actionDefs: [],
    errors: [],
  };
  const resolver = (ref: string) => resolveTypeRef(ref, origin, doc.version);

  const register = <T>(
    entries: Array<[string, T]>,
    label: string,
    fn: (name: string, value: T) => void,
  ) => {
    for (const [name, value] of entries) {
      try {
        fn(name, value);
      } catch (error: any) {
        result.errors.push(`${label} ${name}: ${error.message}`);
      }
    }
  };

  register(Object.entries(doc.enums ?? {}), "enum", (name, enumDef) => {
    const enumUri = buildTypeUri(ADK_ORIGIN, name, doc.version);
    state.kernel.defineEnum(name, doc.version, enumDef.values, {
      type: "string",
      description: enumDef.description,
    });
    result.typesRegistered.push(enumUri);
  });

  register(Object.entries(doc.entities ?? {}), "entity", (name, entity) => {
    result.typesRegistered.push(
      compileEntity(state.kernel, name, entity, origin, doc.version, resolver),
    );
  });

  register(Object.entries(doc.relations ?? {}), "relation", (name, relation) => {
    result.typesRegistered.push(
      compileRelation(state.kernel, name, relation, origin, doc.version, resolver),
    );
  });

  if (doc.lifecycle) {
    try {
      result.statemachineId = compileLifecycle(
        state.kernel,
        doc.model,
        doc.lifecycle,
        origin,
        doc.version,
      );
    } catch (error: any) {
      result.errors.push(`lifecycle: ${error.message}`);
    }
  }

  register(Object.entries(doc.contracts ?? {}), "contract", (name, contract) => {
    const propositionId = compileContract(state.kernel, name, contract, origin);
    if (propositionId) result.propositionIds.push(propositionId);
  });

  if (doc.actions) {
    const normalizedActions: Record<string, ReturnType<typeof normalizeActionDef>> = {};
    for (const [name, actionDef] of Object.entries(doc.actions)) {
      try {
        const normalized = normalizeActionDef(doc, name, actionDef);
        normalizedActions[name] = normalized;
        result.actionDefs.push({ name, def: normalized });
      } catch (error: any) {
        result.errors.push(error.message);
      }
    }
    result.document.actions = normalizedActions;
  }

  if (result.statemachineId && result.document.actions) {
    result.document.actions = Object.fromEntries(
      Object.entries(result.document.actions).map(([name, actionDef]) => [
        name,
        { ...actionDef, targetMachine: result.statemachineId },
      ]),
    );
  }

  state.loadedModels.set(doc.model, result);
  const versions = state.versionHistoryMap.get(doc.model) ?? [];
  if (!versions.includes(doc.version)) versions.push(doc.version);
  state.versionHistoryMap.set(doc.model, versions);
  const cids = state.cidHistoryMap.get(doc.model) ?? [];
  if (!cids.includes(cid)) cids.push(cid);
  state.cidHistoryMap.set(doc.model, cids);
  return result;
}

export function reloadModelDocument(
  state: ModelLoaderState,
  doc: ModelDocument,
  loadModel: (doc: ModelDocument) => ModelLoadResult,
  resolveTypeRef: (ref: string, currentOrigin: string, version: string) => string,
): ModelLoadResult {
  const existing = state.loadedModels.get(doc.model);
  if (!existing) return loadModel(doc);

  const errors: string[] = [];
  let origin = ADK_ORIGIN;
  if (doc.origin) origin = doc.origin.replace(/^https?:\/\//, "");
  const resolver = (ref: string) => resolveTypeRef(ref, origin, doc.version);

  for (const [name, entity] of Object.entries(doc.entities ?? {})) {
    const oldRef = existing.typesRegistered.find((typeRef) => typeRef.includes(`/${name}/`));
    if (!oldRef) continue;
    try {
      const newTypeRef = buildTypeUri(origin, name, doc.version);
      const tempDef: TypeDef = {
        id: newTypeRef,
        level: MetaLevel.Model,
        conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
        schema: buildEntitySchema(entity, origin, doc.version, resolver),
        name,
        version: doc.version,
      };
      state.kernel.defineType(tempDef);
      const compat = state.kernel.checkCompatibility(
        oldRef,
        newTypeRef,
        "BACKWARD" as Compatibility,
      );
      if (!compat.compatible) {
        errors.push(
          `Breaking change in ${name}: ${compat.breakingChanges.map((change) => change.message).join("; ")}`,
        );
      }
    } catch (error: any) {
      errors.push(`compatibility check for ${name}: ${error.message}`);
    }
  }

  if (errors.length === 0) return loadModel(doc);
  return {
    cid: existing.cid,
    modelId: doc.model,
    origin,
    version: existing.version,
    conformsTo: existing.conformsTo,
    document: existing.document,
    typesRegistered: existing.typesRegistered,
    statemachineId: existing.statemachineId,
    propositionIds: existing.propositionIds,
    actionDefs: existing.actionDefs,
    errors,
  };
}
