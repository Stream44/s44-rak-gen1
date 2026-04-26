/**
 * Layer 19: YAML Model Loader — compiles model documents into ADK TypeDefs.
 */

import { readFileSync } from "node:fs";
import { JsonEncoder } from "../L01-foundation/encoder.ts";
import { buildTypeUri } from "../L01-foundation/utils.ts";
import type { IntentProcessor } from "../L07-agency/intent.ts";
import type { AlgebraicKernel } from "../L13-facade/kernel.export.ts";
import { buildCrossRefIndex } from "./cross-ref-index.ts";
import { createModelBoot, registerModelActions } from "./action-registration.ts";
import { loadModelDocument, reloadModelDocument, type ModelLoaderState } from "./model-loading.ts";
import type {
  CrossRefIndex,
  ModelBoot,
  ModelDocument,
  ModelLoadResult,
  ModelSummary,
} from "./model-types.ts";

export type {
  ActionDef,
  ActionKind,
  AttributeDef,
  BatchSubmitDef,
  ContractDef,
  CrossRefIndex,
  EntityDef,
  EnumDef,
  KeyStrategy,
  LifecycleDef,
  ModelBoot,
  ModelDocument,
  ModelInspectorOverride,
  ModelInspectorSectionOverride,
  ModelLoadResult,
  ModelSummary,
  RelationDef,
} from "./model-types.ts";
export { compileAttributeType, compileInnerType, parseClaim } from "./type-compilers.ts";

export class ModelLoader {
  private kernel: AlgebraicKernel;
  private prefixes = new Map<string, string>();
  private loadedModels = new Map<string, ModelLoadResult>();
  private versionHistoryMap = new Map<string, string[]>();
  private cidHistoryMap = new Map<string, string[]>();
  private encoder = new JsonEncoder();
  private _intentProcessor: IntentProcessor | null = null;

  constructor(kernel: AlgebraicKernel) {
    this.kernel = kernel;
  }

  setIntentProcessor(intentProcessor: IntentProcessor): void {
    this._intentProcessor = intentProcessor;
  }

  loadYamlFile(filePath: string): ModelLoadResult {
    const doc = Bun.YAML.parse(readFileSync(filePath, "utf-8")) as ModelDocument;
    return this.loadModel({ ...doc, __sourceFile: filePath } as ModelDocument);
  }

  bootYamlFile(filePath: string): ModelBoot {
    const doc = Bun.YAML.parse(readFileSync(filePath, "utf-8")) as ModelDocument;
    return this.boot({ ...doc, __sourceFile: filePath } as ModelDocument);
  }

  static loadSeedFile(filePath: string): unknown[] {
    return Bun.YAML.parse(readFileSync(filePath, "utf-8")) as unknown[];
  }

  registerPrefix(prefix: string, origin: string): void {
    this.prefixes.set(prefix, origin);
  }

  loadModel(doc: ModelDocument): ModelLoadResult {
    return loadModelDocument(this.loaderState(), doc, this.resolveTypeRef.bind(this));
  }

  reloadModel(doc: ModelDocument): ModelLoadResult {
    return reloadModelDocument(
      this.loaderState(),
      doc,
      this.loadModel.bind(this),
      this.resolveTypeRef.bind(this),
    );
  }

  resolveTypeRef(ref: string, currentOrigin: string, version: string): string {
    if (ref.includes(":")) {
      const colonIdx = ref.indexOf(":");
      const prefix = ref.slice(0, colonIdx);
      const name = ref.slice(colonIdx + 1);
      const prefixOrigin = this.prefixes.get(prefix);
      return prefixOrigin
        ? buildTypeUri(prefixOrigin, name, version)
        : buildTypeUri(prefix, name, version);
    }
    return buildTypeUri(currentOrigin, ref, version);
  }

  getLoadedModel(modelId: string): ModelLoadResult | undefined {
    return this.loadedModels.get(modelId);
  }

  getLoadResult(modelId: string): ModelLoadResult | undefined {
    return this.getLoadedModel(modelId);
  }

  versionHistory(modelId: string): string[] {
    return this.versionHistoryMap.get(modelId) ?? [];
  }

  listCids(modelId: string): string[] {
    return [...(this.cidHistoryMap.get(modelId) ?? [])];
  }

  async listLoadedModels(): Promise<Array<ModelSummary>> {
    return (await this.kernel.morphisms.evaluate("morphism://adk/listLoadedModels/1.0", {
      loader: { loadedModels: Object.fromEntries(this.loadedModels) },
    })) as Array<ModelSummary>;
  }

  async getModelDocument(modelId: string): Promise<ModelDocument | undefined> {
    const result = await this.kernel.morphisms.evaluate("morphism://adk/getModelDocument/1.0", {
      loader: { loadedModels: Object.fromEntries(this.loadedModels) },
      modelId,
    });
    return result == null ? undefined : (result as ModelDocument);
  }

  async walkCrossRefs(modelId: string): Promise<CrossRefIndex | undefined> {
    const document = await this.getModelDocument(modelId);
    return document ? buildCrossRefIndex(document) : undefined;
  }

  registerActions(loadResult: ModelLoadResult, intentProcessor: IntentProcessor): string[] {
    return registerModelActions(loadResult, intentProcessor);
  }

  boot(doc: ModelDocument): ModelBoot {
    const result = this.loadModel(doc);
    if (result.errors.length > 0) {
      throw new Error(`Model boot failed: ${result.errors.join("; ")}`);
    }
    if (!this._intentProcessor) {
      throw new Error(
        "ModelLoader.boot() requires an IntentProcessor. Pass one via setIntentProcessor() before calling boot().",
      );
    }
    return createModelBoot(this.kernel, this._intentProcessor, result);
  }

  private loaderState(): ModelLoaderState {
    return {
      kernel: this.kernel,
      prefixes: this.prefixes,
      loadedModels: this.loadedModels,
      versionHistoryMap: this.versionHistoryMap,
      cidHistoryMap: this.cidHistoryMap,
      encoder: this.encoder,
    };
  }
}
