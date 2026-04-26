import type { AlgebraicKernel, ActionType, JsonSchema } from "../L13-facade/index.ts";
import type { ModelBoot } from "../L09-demand/model-loader.ts";
import type {
  ProjectionAsset,
  ProjectionKind,
  ProjectionModel,
  ProjectionTree,
} from "../L01-foundation/projection-types.ts";
import type { ResolvedManifest } from "./dispatch.ts";
import type { AssetRegistry } from "./asset-registry.ts";
import type { PrimitiveRegistry } from "./primitive-registry.ts";
import type { ProjectionSession } from "./session.ts";
import type { createLocalModuleResolver } from "./module-loader.ts";
import type preloadModules from "./morphisms/preload-modules.ts";
import type installKernelModel from "./morphisms/install-kernel-model.ts";
import type { surveyCapabilityRequirements } from "./capability-enforcement.ts";

export type ProjectionAuthorizationContext = {
  scope: "projection" | "page" | "route" | "component" | "asset" | "binding" | "action";
  nodePath: string;
  requiresAny?: string[];
};

export type DispatchFrameInput =
  | {
      ref: string;
      target?: string;
      payload?: Record<string, unknown>;
      capabilityId?: string;
      origin?: { kind: string; source?: unknown };
    }
  | {
      actionRef: string;
      target?: string;
      payload?: Record<string, unknown>;
      capabilityId?: string;
      origin?: { kind: string; source?: unknown };
    };

export interface DispatchOutcome {
  success: boolean;
  value?: unknown;
  error?: string;
}

export interface ProjectionKernelOptions {
  primitives?: PrimitiveRegistry;
  intentProcessor?: { actions: Map<string, ActionType> };
  modelActions?: Map<string, ActionType>;
  capabilityEngine?: LoadKernelModelOptions["capabilityEngine"];
}

export interface RenderFullOptions {
  pageName: string;
  props?: Record<string, unknown>;
}

export interface RenderShellExtras {
  mount?: string;
  vars?: Record<string, string>;
}

export interface ProjectionKernelRuntime {
  compile(doc: unknown): Promise<unknown>;
  render(pageName: string, props?: Record<string, unknown>): ProjectionTree;
  dispatch(frame: DispatchFrameInput): Promise<DispatchOutcome>;
  authorize(
    requires: string[] | undefined,
    session: unknown,
    ctx: ProjectionAuthorizationContext,
  ): Promise<unknown>;
  surveyCapabilities(): Promise<ReturnType<typeof surveyCapabilityRequirements>>;
}

export interface LoadKernelModelOptions {
  kernel?: AlgebraicKernel;
  capabilityEngine?: {
    authorize(intent: unknown, capabilityId: string): { authorized: boolean; error?: string };
    authorizeResource(
      capId: string,
      resourceId: string,
      subject: { id: string },
    ): { authorized: boolean; error?: string };
  };
  app?: ModelBoot | null;
  session?: ProjectionSession;
  dispatchManifest?: ResolvedManifest;
  dispatchCapabilityRequirement?: string;
  onPreloadComplete?: (preloaded: string[]) => void;
  internals?: {
    resolverOverride?: ReturnType<typeof createLocalModuleResolver>;
    preloadModulesOverride?: typeof preloadModules;
    installKernelModelOverride?: typeof installKernelModel;
  };
}

export interface MetaProjectionKernelOptions extends LoadKernelModelOptions {
  primitives?: PrimitiveRegistry;
  intentProcessor?: { actions: Map<string, ActionType> };
  modelActions?: Map<string, ActionType>;
  yamlPath?: string;
}

export interface MetaProjectionKernel extends ProjectionKernelRuntime {
  readonly assets: AssetRegistry;
  readonly document: ProjectionModel | null;
  readonly primitives: PrimitiveRegistry;
  defaultPageName(): string | null;
  getAssetsDir(): string | null;
  getSession(): ProjectionSession;
  loadDocument(doc: ProjectionModel): ProjectionModel;
  loadYaml(content: string): ProjectionModel;
  loadYamlFile(path: string): ProjectionModel;
  renderHtml(
    pageName: string,
    props?: Record<string, unknown>,
  ): { tree: ProjectionTree; html: string; handlersJs: string };
  renderShell(
    opts: { pageName: string; props?: Record<string, unknown> },
    extra?: { mount?: string; vars?: Record<string, string> },
  ): string;
  actionKind(ref: string): "model" | "custom" | "ephemeral" | null;
  getBindings(): Map<string, unknown>;
  listManifestActions(): string[];
  injectActionMap(map: Map<string, ActionType>): void;
  injectSchemas(map: Map<string, unknown>): void;
  registerAsset(asset: ProjectionAsset): void;
  registerKind(kind: ProjectionKind): void;
  setBinding(name: string, value: unknown): void;
  setSession(session: Partial<ProjectionSession>): void;
  setUiContext(ctxPath: string, path: string, value: unknown): void;
}

export type DispatchAction = (frame: DispatchFrameInput) => Promise<DispatchOutcome>;

export interface MutableManifest {
  byName: Map<string, unknown>;
  byUri: Map<string, unknown>;
}
