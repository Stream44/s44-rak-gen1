import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  ActionBindingDef,
  ProjectionModel,
  ProjectionNode,
  ProjectionTree,
  RenderContext,
} from "../L01-foundation/projection-types.ts";
import type { CapabilityEngine } from "../L13-facade/index.ts";
import type { ModelBoot } from "../L09-demand/model-loader.ts";
import type { AssetRegistry } from "./asset-registry.ts";
import type { ResolvedManifest } from "./dispatch.ts";
import type { HtmlOutput } from "./render-html.ts";
import { renderHtmlTree } from "./render-html.ts";
import renderProjection from "./morphisms/render.ts";
import renderMorphismCompat from "./morphisms/resolve-morphism-asset.ts";
import type { ProjectionSession } from "./session.ts";
import defaultShellTemplate from "../L08-kinds/ui-html-ws/shell-template.ts";
import { syncAutoBindings } from "./meta-document.ts";
import { bindProjectionInstances, cloneUiContextStack } from "./session-state.ts";
import { renderChild, type RenderChildContext } from "./render-child.ts";
import { resolveActionBinding, resolveProps } from "./binding-resolution.ts";
import { materializeProjectionNode } from "./materialize-node.ts";
import { normalizeMorphismResult } from "./normalize-result.ts";
import { renderMorphism } from "./render-morphism-wrapper.ts";
import { resolveDefaultPageName } from "./meta-state.ts";

export interface MetaRenderState {
  app: ModelBoot | null;
  bindings: Map<string, unknown>;
  capabilityEngine: CapabilityEngine | undefined;
  manifest: ResolvedManifest;
  session: ProjectionSession;
  uiContextState: Map<string, Record<string, unknown>>;
  assetRegistry: AssetRegistry;
}

export interface ProjectionKernelRenderState {
  app: ModelBoot | null;
  assetRegistry: AssetRegistry;
  capabilityEngine?: {
    authorize(intent: unknown, capabilityId: string): { authorized: boolean };
    authorizeResource(
      capId: string,
      resourceId: string,
      subject: { id: string },
    ): { authorized: boolean };
  };
  doc: ProjectionModel | null;
  manifest: ResolvedManifest;
  pageBindings: Map<string, unknown>;
  session: ProjectionSession;
  uiContextState: Map<string, Record<string, unknown>>;
  yamlDir: string | null;
}

export function renderTree(
  state: MetaRenderState,
  doc: ProjectionModel,
  pageName: string,
  props: Record<string, unknown>,
): ProjectionTree {
  syncAutoBindings(doc, state.app, state.bindings);
  if (doc.morphism) {
    return renderMorphismCompat({
      pageName,
      props,
      doc,
      session: state.session,
      bindings: state.bindings,
      assetRegistry: state.assetRegistry,
      capabilityEngine: state.capabilityEngine,
      uiContextState: state.uiContextState,
    });
  }
  return renderProjection({
    app: state.app,
    bindings: state.bindings,
    capabilityEngine: state.capabilityEngine,
    components: doc.components,
    doc,
    manifest: state.manifest,
    pageName,
    props,
    session: state.session,
    uiContextState: state.uiContextState,
  });
}

export function renderHtmlFor(
  state: MetaRenderState,
  doc: ProjectionModel,
  pageName: string,
  props: Record<string, unknown>,
): { tree: ProjectionTree; html: string; handlersJs: string } {
  const tree = renderTree(state, doc, pageName, props);
  const out = renderHtmlTree(tree);
  return { tree, html: out.html, handlersJs: out.handlersJs };
}

function requireProjectionDoc(doc: ProjectionModel | null): ProjectionModel {
  if (!doc) throw new Error("No projector loaded. Call loadDocument() first.");
  return doc;
}

function projectionRenderContext(state: ProjectionKernelRenderState): RenderChildContext {
  return {
    doc: requireProjectionDoc(state.doc),
    manifest: state.manifest,
    pageBindings: state.pageBindings,
    uiContextState: state.uiContextState,
    session: state.session,
    capabilityEngine: state.capabilityEngine,
    assetRegistry: state.assetRegistry,
  };
}

function normalizeProjectionResult(
  state: ProjectionKernelRenderState,
  value: unknown,
  context: RenderContext,
  handlers: ProjectionTree["actionHandlers"],
): ProjectionNode[] {
  return normalizeMorphismResult(value, {
    context,
    handlers,
    pageBindings: state.pageBindings,
    session: state.session,
    capabilityEngine: state.capabilityEngine,
    renderChild: (child, nextCtx, nextHandlers) =>
      renderChild(
        child,
        nextCtx,
        nextHandlers,
        projectionRenderContext(state),
        (ref, rawProps, assetCtx, assetHandlers) =>
          resolveProjectionAsset(state, ref, rawProps, assetCtx, assetHandlers),
      ),
    materializeProjectionNode: (node, nextCtx, nextHandlers) =>
      materializeProjectionNode(
        node,
        nextCtx,
        nextHandlers,
        state.uiContextState,
        (entry, ctx, hs) => normalizeProjectionResult(state, entry, ctx, hs),
      ),
    resolveAsset: (ref, rawProps) =>
      resolveProjectionAsset(state, ref, rawProps, context, handlers),
  });
}

function resolveProjectionAsset(
  state: ProjectionKernelRenderState,
  ref: string,
  rawProps: Record<string, unknown> | undefined,
  context: RenderContext,
  handlers: ProjectionTree["actionHandlers"],
): ProjectionNode {
  const doc = requireProjectionDoc(state.doc);
  const component =
      state.assetRegistry.resolve(ref, doc.conformsToKind)?.name ?? ref.split("/").at(-2) ?? ref,
    props =
      component === "Endpoint"
        ? { ...(rawProps ?? {}) }
        : resolveProps({ ...(rawProps ?? {}) }, context),
    rawChildren = props.children,
    rawOnClick = props.onClick,
    rawOnSubmit = props.onSubmit;
  delete props.children;
  delete props.onClick;
  delete props.onSubmit;
  const actionBinding =
    rawOnClick && typeof rawOnClick === "object" && !Array.isArray(rawOnClick)
      ? resolveActionBinding(rawOnClick as ActionBindingDef, context)
      : rawOnSubmit && typeof rawOnSubmit === "object" && !Array.isArray(rawOnSubmit)
        ? resolveActionBinding(rawOnSubmit as ActionBindingDef, context)
        : undefined;
  const nodeId = `n${context.nodeIdCounter.n++}`;
  const node: ProjectionNode = {
    component,
    props,
    children: normalizeProjectionResult(state, rawChildren, context, handlers),
    ...(actionBinding ? { actionBinding, nodeId } : { nodeId }),
  };
  if (actionBinding) handlers.push({ nodeId, binding: actionBinding });
  return node;
}

export function renderProjectionTree(
  state: ProjectionKernelRenderState,
  pageName: string,
  props: Record<string, unknown> = {},
): ProjectionTree {
  const doc = requireProjectionDoc(state.doc);
  bindProjectionInstances(doc, state.pageBindings, state.app);
  if (doc.morphism) {
    return renderMorphism({
      doc,
      pageName,
      props,
      pageBindings: state.pageBindings,
      session: state.session,
      capabilityEngine: state.capabilityEngine,
      resolveAsset: (ref, rawProps, ctx, handlers) =>
        resolveProjectionAsset(state, ref, rawProps, ctx, handlers),
      normalizeResult: (value, ctx, handlers) =>
        normalizeProjectionResult(state, value, ctx, handlers),
    });
  }
  const targetPage = pageName || resolveDefaultPageName(doc) || "";
  const page = (doc.pages ?? {})[targetPage];
  if (!page) throw new Error(`Unknown page: "${targetPage}"`);
  const ctx: RenderContext = {
    pageName: targetPage,
    route: state.session.route,
    currentUser: state.session.currentUser,
    bindings: state.pageBindings,
    props: { ...props, __pp09ContextStack: cloneUiContextStack(state.uiContextState) },
    nodeIdCounter: { n: 0 },
    session: state.session,
  };
  const actionHandlers: ProjectionTree["actionHandlers"] = [];
  return {
    root: {
      component: "Stack",
      props: {},
      children: (page.children ?? []).flatMap((child) =>
        renderChild(
          child,
          ctx,
          actionHandlers,
          projectionRenderContext(state),
          (ref, rawProps, nextCtx, nextHandlers) =>
            resolveProjectionAsset(state, ref, rawProps, nextCtx, nextHandlers),
        ),
      ),
    },
    pageName: targetPage,
    actionHandlers,
  };
}

export function renderProjectionHtml(
  state: ProjectionKernelRenderState,
  pageName: string,
  props: Record<string, unknown> = {},
): HtmlOutput & { tree: ProjectionTree } {
  const tree = renderProjectionTree(state, pageName, props);
  const out = renderHtmlTree(tree);
  return { tree, html: out.html, handlersJs: out.handlersJs };
}

function loadShellTemplate(doc: ProjectionModel, yamlDir: string | null): string {
  if (!doc.shell) return defaultShellTemplate;
  if (!yamlDir)
    throw new Error(
      "Projector declares shell: but was not loaded via loadYamlFile — cannot resolve shell path.",
    );
  return readFileSync(resolve(yamlDir, doc.shell), "utf-8");
}

export function renderShellFor(
  state: MetaRenderState,
  doc: ProjectionModel,
  yamlDir: string | null,
  opts: { pageName: string; props?: Record<string, unknown> },
  extra: { mount?: string; vars?: Record<string, string> } = {},
): string {
  const { html, handlersJs } = renderHtmlFor(state, doc, opts.pageName, opts.props ?? {});
  const template = loadShellTemplate(doc, yamlDir);
  const vars: Record<string, string> = {
    body: html,
    handlersJs,
    title: doc.title ?? doc.projector ?? "ADK",
    mount: extra.mount ?? "",
    ...(extra.vars ?? {}),
  };
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? (vars[key] ?? match) : match,
  );
}

export function renderProjectionShell(
  state: ProjectionKernelRenderState,
  opts: { pageName: string; props?: Record<string, unknown> },
  extra: { mount?: string; vars?: Record<string, string> } = {},
): string {
  const doc = requireProjectionDoc(state.doc);
  const out = renderProjectionHtml(state, opts.pageName, opts.props ?? {});
  const template = loadShellTemplate(doc, state.yamlDir);
  const vars = {
    body: out.html,
    handlersJs: out.handlersJs,
    title: doc.title ?? doc.projector ?? "ADK",
    mount: extra.mount ?? "",
    ...(extra.vars ?? {}),
  } as Record<string, string>;
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => vars[key] ?? match);
}
