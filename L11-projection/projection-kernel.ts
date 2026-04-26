/** spec 02 §10.3 + §12.1: imperative/meta kernel factory seam. */
import { readFileSync } from "fs";
import { dirname, resolve as resolvePath } from "path";
import type { JsonSchema } from "../L01-foundation/types.ts";
import type { ModelBoot } from "../L09-demand/model-loader.ts";
import type { ActionType } from "../L07-agency/intent.ts";
import { SchemaValidator } from "../L01-foundation/validator.ts";
import type {
  ProjectionAsset,
  ProjectionKind,
  ProjectionModel,
  ProjectionTree,
} from "../L01-foundation/projection-types.ts";
import { AssetRegistry } from "./asset-registry.ts";
import { renderPassRegistry } from "./render-pass-registry.ts";
import {
  injectProjectionActionMap,
  injectProjectionSchemas,
  registerProjectionAsset,
  registerProjectionKind,
  setProjectionBinding,
  setProjectionUiContext,
  applyProjectionSessionPatch,
} from "./session-state.ts";
import { buildProjectionManifest } from "./meta-document.ts";
import { resolveDefaultPageName } from "./meta-state.ts";
import { PrimitiveRegistry } from "./primitive-registry.ts";
import { authorizeProjectionNodePath, surveyProjectionCapabilities } from "./capability-gate.ts";
import {
  renderProjectionHtml,
  renderProjectionShell,
  renderProjectionTree,
  type ProjectionKernelRenderState,
} from "./meta-renderer.ts";
import {
  dispatchProjectionFrame,
  resolveManifestRef,
  type DispatchResult,
  type ResolvedManifest,
  type ResolvedManifestEntry,
} from "./dispatch.ts";
import type { ProjectionSession } from "./session.ts";
import { createDefaultSession } from "./session.ts";
import type {
  DispatchFrameInput,
  ProjectionAuthorizationContext,
  ProjectionKernelOptions,
  RenderFullOptions,
  RenderShellExtras,
} from "./runtime-types.ts";
export * from "./projection-kernel-types.ts";

export class ProjectionKernel {
  protected doc: ProjectionModel | null = null;
  protected yamlDir: string | null = null;
  protected readonly validator = new SchemaValidator();
  private manifest: ResolvedManifest = { byName: new Map(), byUri: new Map() };
  private readonly assetRegistry = new AssetRegistry();
  private readonly primitiveRegistry: PrimitiveRegistry;
  private readonly pageBindings = new Map<string, unknown>();
  private readonly uiContextState = new Map<string, Record<string, unknown>>();
  private session: ProjectionSession = createDefaultSession();
  private injectedActions: Map<string, ActionType> | null;
  private injectedSchemas: Map<string, JsonSchema> | null = null;
  private readonly capabilityEngine?: ProjectionKernelOptions["capabilityEngine"];
  constructor(
    private app: ModelBoot | null,
    opts: ProjectionKernelOptions = {},
  ) {
    this.primitiveRegistry = opts.primitives ?? PrimitiveRegistry.createWithBuiltins();
    this.injectedActions = opts.modelActions ?? opts.intentProcessor?.actions ?? null;
    this.capabilityEngine = opts.capabilityEngine;
  }
  registerKind(kind: ProjectionKind): void {
    registerProjectionKind(this.assetRegistry, kind);
  }
  registerAsset(asset: ProjectionAsset): void {
    registerProjectionAsset(this.assetRegistry, asset);
  }
  loadYamlFile(path: string): ProjectionModel {
    this.yamlDir = dirname(resolvePath(path));
    return this.loadYaml(readFileSync(path, "utf-8"));
  }
  loadYaml(content: string): ProjectionModel {
    return this.loadDocument(Bun.YAML.parse(content) as ProjectionModel);
  }
  loadDocument(doc: ProjectionModel): ProjectionModel {
    this.manifest = buildProjectionManifest({
      app: this.app,
      doc,
      injectedActions: this.injectedActions,
      injectedSchemas: this.injectedSchemas,
      primitiveRegistry: this.primitiveRegistry,
    });
    this.doc = doc;
    return doc;
  }
  setSession(session: Partial<ProjectionSession>): void {
    this.session = applyProjectionSessionPatch(this.session, session);
  }
  getSession(): ProjectionSession {
    return this.session;
  }
  setBinding(name: string, value: unknown): void {
    setProjectionBinding(this.pageBindings, name, value);
  }
  setUiContext(ctxPath: string, path: string, value: unknown): void {
    setProjectionUiContext(this.uiContextState, ctxPath, path, value);
  }
  injectActionMap(map: Map<string, ActionType>): void {
    this.injectedActions = injectProjectionActionMap(map);
    if (this.doc)
      this.manifest = buildProjectionManifest({
        app: this.app,
        doc: this.doc,
        injectedActions: this.injectedActions,
        injectedSchemas: this.injectedSchemas,
        primitiveRegistry: this.primitiveRegistry,
      });
  }
  injectSchemas(map: Map<string, unknown>): void {
    this.injectedSchemas = injectProjectionSchemas(map);
  }
  render(pageName: string, props: Record<string, unknown> = {}): ProjectionTree {
    return this.withSplit(renderProjectionTree(this.renderState(), pageName, props));
  }
  async dispatch(frame: DispatchFrameInput): Promise<DispatchResult> {
    return dispatchProjectionFrame({
      doc: this.doc,
      manifest: this.manifest,
      app: this.app,
      session: this.session,
      validator: this.validator,
      frame,
    });
  }
  listManifestActions(): string[] {
    return [...this.manifest.byName.keys()];
  }
  actionKind(ref: string): "model" | "custom" | "ephemeral" | null {
    return resolveManifestRef(this.manifest, ref)?.kind ?? null;
  }
  authorize(
    requires: string[] | undefined,
    session: ProjectionSession = this.session,
    ctx: ProjectionAuthorizationContext,
  ) {
    return authorizeProjectionNodePath(requires, session, ctx, this.capabilityEngine);
  }
  surveyCapabilities() {
    return surveyProjectionCapabilities(this.doc);
  }
  defaultPageName(): string | null {
    if (!this.doc) throw new Error("No projector loaded.");
    return resolveDefaultPageName(this.doc);
  }
  get document(): ProjectionModel | null {
    return this.doc;
  }
  get assets(): AssetRegistry {
    return this.assetRegistry;
  }
  get primitives(): PrimitiveRegistry {
    return this.primitiveRegistry;
  }
  renderHtml(pageName: string, props: Record<string, unknown> = {}) {
    return renderProjectionHtml(this.renderState(), pageName, props);
  }
  renderShell(opts: RenderFullOptions, extra: RenderShellExtras = {}): string {
    return renderProjectionShell(this.renderState(), opts, extra);
  }
  private renderState(): ProjectionKernelRenderState {
    return {
      app: this.app,
      doc: this.doc!,
      manifest: this.manifest,
      pageBindings: this.pageBindings,
      uiContextState: this.uiContextState,
      session: this.session,
      capabilityEngine: this.capabilityEngine,
      assetRegistry: this.assetRegistry,
      yamlDir: this.yamlDir,
    };
  }
  private withSplit(tree: ProjectionTree): ProjectionTree {
    const passes = renderPassRegistry.byName("split");
    if (process.env.ADK_RPR_SPLIT === "true")
      for (const pass of passes) tree.splitArtefact = pass.run(tree, {});
    return tree;
  }
}
