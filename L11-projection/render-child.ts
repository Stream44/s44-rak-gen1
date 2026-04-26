import { compileMorphism } from "./algebra.ts";
import { BindingResolver } from "./bindings.ts";
import {
  resolveManifestRef,
  type ResolvedManifest,
  type ResolvedManifestEntry,
} from "./dispatch.ts";
import { materializeProjectionNode } from "./materialize-node.ts";
import { normalizeMorphismResult } from "./normalize-result.ts";
import {
  resolveActionBinding,
  resolveEditableActionBinding,
  resolveProps,
  truthy,
} from "./binding-resolution.ts";
import { mergeUiContextFrame } from "./session-state.ts";
import type {
  ActionBindingDef,
  ChildSpec,
  CompositeUseNode,
  IfNode,
  ListNode,
  PrimitiveNode,
  ProjectionModel,
  ProjectionNode,
  ProjectionTree,
  RenderContext,
} from "../L01-foundation/projection-types.ts";
import { AssetRegistry } from "./asset-registry.ts";
import type { MorphismAST } from "../L01-foundation/morphism-ast.ts";
import type { ProjectionSession } from "./session.ts";
import evaluateProjectionMorphism from "./morphisms/evaluate-projection-morphism.ts";

type CapabilityEngine = {
  authorize(intent: unknown, capabilityId: string): { authorized: boolean };
  authorizeResource(
    capId: string,
    resourceId: string,
    subject: { id: string },
  ): { authorized: boolean };
};

export interface RenderChildContext {
  doc: ProjectionModel;
  manifest: ResolvedManifest;
  pageBindings: Map<string, unknown>;
  uiContextState: Map<string, Record<string, unknown>>;
  session: ProjectionSession;
  capabilityEngine?: CapabilityEngine;
  assetRegistry: AssetRegistry;
}

export function renderChild(
  child: ChildSpec,
  context: RenderContext,
  handlers: ProjectionTree["actionHandlers"],
  state: RenderChildContext,
  resolveMorphismAsset: (
    ref: string,
    rawProps: Record<string, unknown> | undefined,
    nextContext: RenderContext,
    nextHandlers: ProjectionTree["actionHandlers"],
  ) => ProjectionNode,
): ProjectionNode[] {
  if (!child || typeof child !== "object") return [];
  const normalize = (
    value: unknown,
    nextContext = context,
    nextHandlers = handlers,
  ): ProjectionNode[] =>
    normalizeMorphismResult(value, {
      context: nextContext,
      handlers: nextHandlers,
      pageBindings: state.pageBindings,
      session: state.session,
      capabilityEngine: state.capabilityEngine,
      renderChild: (entry, ctx, hs) => renderChild(entry, ctx, hs, state, resolveMorphismAsset),
      materializeProjectionNode: (node, ctx, hs): ProjectionNode =>
        materializeProjectionNode(
          node,
          ctx,
          hs,
          state.uiContextState,
          (value, nextCtx, nextHs): ProjectionNode[] => normalize(value, nextCtx, nextHs),
        ),
      resolveAsset: (ref, rawProps) =>
        resolveMorphismAsset(ref, rawProps, nextContext, nextHandlers),
    });
  if ("op" in child && !("for" in child) && !("if" in child) && !("use" in child)) {
    return normalize(
      evaluateProjectionMorphism({
        compiledMorphism: compileMorphism(child) as MorphismAST,
        context,
        handlers,
        pageBindings: state.pageBindings,
        session: state.session,
        capabilityEngine: state.capabilityEngine,
        resolveAsset: (ref, rawProps) => resolveMorphismAsset(ref, rawProps, context, handlers),
      }),
    );
  }
  if ("component" in child && child.component === "Context") {
    const scope = typeof child.props?.scope === "string" ? String(child.props.scope) : undefined;
    const initial =
      child.props?.initial && typeof child.props.initial === "object"
        ? { ...(child.props.initial as Record<string, unknown>) }
        : {};
    for (const key of Object.keys(initial)) {
      if (context.bindings.has(key)) initial[key] = context.bindings.get(key);
    }
    const stack = Array.isArray(context.props.__pp09ContextStack)
      ? [...(context.props.__pp09ContextStack as Array<Record<string, unknown>>)]
      : [];
    if (scope)
      stack.splice(
        0,
        stack.length,
        ...mergeUiContextFrame(stack, scope, initial, state.uiContextState),
      );
    return (child.children ?? []).flatMap((entry) =>
      renderChild(
        entry,
        {
          ...context,
          props: {
            ...context.props,
            ...(scope ? { __pp09ContextScope: scope } : {}),
            __pp09ContextStack: stack,
          },
        },
        handlers,
        state,
        resolveMorphismAsset,
      ),
    );
  }
  if ("for" in child) {
    const list = new BindingResolver(context).resolve((child as ListNode).for);
    if (!Array.isArray(list) || list.length === 0) {
      const fallback =
        "emptyFallback" in child
          ? (child as ListNode & { emptyFallback?: ChildSpec }).emptyFallback
          : undefined;
      return fallback ? renderChild(fallback, context, handlers, state, resolveMorphismAsset) : [];
    }
    return list.flatMap((item, index) =>
      renderChild(
        (child as ListNode).template,
        { ...context, iteration: { item, index, name: (child as ListNode).as ?? "item" } },
        handlers,
        state,
        resolveMorphismAsset,
      ),
    );
  }
  if ("if" in child) {
    const ifNode = child as IfNode;
    const branch = truthy(new BindingResolver(context).resolve(ifNode.if))
      ? ifNode.then
      : ifNode.else;
    if (!branch) return [];
    return (Array.isArray(branch) ? branch : [branch]).flatMap((entry) =>
      renderChild(entry as ChildSpec, context, handlers, state, resolveMorphismAsset),
    );
  }
  if ("use" in child) {
    const useNode = child as CompositeUseNode,
      component = state.doc.components?.[useNode.use];
    if (!component)
      return [
        { component: "Text", props: { text: `[unknown composite: ${useNode.use}]` }, children: [] },
      ];
    return renderChild(
      component.template as ChildSpec,
      { ...context, props: resolveProps(useNode.props ?? {}, context) },
      handlers,
      state,
      resolveMorphismAsset,
    );
  }
  const primitive = child as PrimitiveNode,
    props =
      primitive.component === "Endpoint"
        ? { ...(primitive.props ?? {}) }
        : resolveProps(primitive.props ?? {}, context);
  if (primitive.component === "EditableText") {
    for (const [key, binding] of Object.entries({
      onEditStart: primitive.onEditStart,
      onEditCommit: primitive.onEditCommit,
      onEditCancel: primitive.onEditCancel,
      onEditEnd: primitive.onEditEnd,
    })) {
      if (binding) props[key] = resolveEditableActionBinding(binding, context);
    }
  }
  const bindingPaths = Object.fromEntries([
    ...Object.entries(primitive.props ?? {}).filter(
      ([, value]) => typeof value === "string" && value.startsWith("$"),
    ),
    ...Object.entries(primitive.bind ?? {}).filter(
      ([, value]) => typeof value === "string" && value.startsWith("$"),
    ),
  ]);
  if (
    primitive.component === "Text" &&
    primitive.bind &&
    "value" in primitive.bind &&
    props.text === undefined
  ) {
    props.text = new BindingResolver(context).resolve(
      (primitive.bind as Record<string, unknown>).value,
    );
  }
  let disabled = truthy(props.disabled),
    hidden = false,
    boundAction: ActionBindingDef | undefined;
  let kind: ResolvedManifestEntry["kind"] | undefined;
  if (primitive.onClick) {
    boundAction = resolveActionBinding(primitive.onClick, context);
    const resolved = resolveManifestRef(state.manifest, boundAction.action);
    if (resolved) {
      kind = resolved.kind;
      if (
        resolved.kind === "model" &&
        resolved.action &&
        !state.session.currentUser.capabilities[resolved.action.verb]
      ) {
        boundAction.hideIfUnauthorized ? (hidden = true) : (disabled = true);
      }
    }
  }
  if (hidden) return [];
  const nodeId = `n${context.nodeIdCounter.n++}`;
  const node: ProjectionNode = {
    component: primitive.component,
    props,
    children: (primitive.children ?? []).flatMap((entry) =>
      renderChild(entry, context, handlers, state, resolveMorphismAsset),
    ),
    actionBinding: boundAction,
    disabled,
    nodeId,
    ...(Object.keys(bindingPaths).length
      ? { bindingPaths: bindingPaths as Record<string, string> }
      : {}),
    ...(typeof context.props.__pp09ContextScope === "string"
      ? { contextScope: String(context.props.__pp09ContextScope) }
      : {}),
  };
  if (boundAction) handlers.push({ nodeId, binding: boundAction, kind });
  return [node];
}
