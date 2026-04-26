import type { CapabilityEngine } from "../../L07-agency/capability.ts";
import { compileMorphism, evaluateMorphism } from "../algebra.ts";
import { BindingResolver } from "../bindings.ts";
import { makeCapabilityGate } from "../capability-enforcement.ts";
import type {
  ActionBindingDef,
  ChildSpec,
  PrimitiveNode,
  ProjectionModel,
  ProjectionNode,
  ProjectionTree,
  RenderContext,
} from "../../L01-foundation/projection-types.ts";
import type { ProjectionSession } from "../session.ts";
import { AssetRegistry } from "../../L13-facade/index.ts";

type Input = {
  pageName: string;
  props: Record<string, unknown>;
  doc: ProjectionModel;
  session: ProjectionSession;
  bindings: Map<string, unknown>;
  assetRegistry: AssetRegistry;
  capabilityEngine?: CapabilityEngine;
  uiContextState?: Map<string, Record<string, unknown>>;
};

const cloneUiContextStack = (state?: Map<string, Record<string, unknown>>) =>
  [...(state?.entries() ?? [])].map(([scope, values]) => ({ scope, values: { ...values } }));

const mergeUiContextFrame = (
  stack: Array<Record<string, unknown>>,
  scope: string,
  initial: Record<string, unknown>,
  state?: Map<string, Record<string, unknown>>,
) => [
  ...stack.filter((frame) => frame?.scope !== scope),
  { scope, values: { ...initial, ...(state?.get(scope) ?? {}) } },
];

export default function renderMorphismCompat(input: Input): ProjectionTree {
  const { pageName, props, doc, session, bindings, assetRegistry, capabilityEngine } = input,
    ctx: RenderContext = {
      pageName,
      route: session.route,
      currentUser: session.currentUser,
      bindings,
      props: { ...props, __pp09ContextStack: cloneUiContextStack(input.uiContextState) },
      nodeIdCounter: { n: 0 },
      session,
    },
    actionHandlers: ProjectionTree["actionHandlers"] = [];
  const children = normalizeMorphismResult(
    evaluateMorphism(doc.morphism!, {
      bindings,
      props,
      route: session.route,
      currentUser: session.currentUser,
      capabilityGate: makeCapabilityGate(session, capabilityEngine),
      resolveAsset: (ref, rawProps) =>
        resolveMorphismAsset(
          ref,
          rawProps,
          ctx,
          actionHandlers,
          doc,
          assetRegistry,
          session,
          bindings,
          capabilityEngine,
          input.uiContextState,
        ),
    }),
    ctx,
    actionHandlers,
    doc,
    assetRegistry,
    session,
    bindings,
    capabilityEngine,
    input.uiContextState,
  );
  return { root: { component: "Stack", props: {}, children }, pageName, actionHandlers };
}

function resolveMorphismAsset(
  ref: string,
  rawProps: Record<string, unknown> | undefined,
  ctx: RenderContext,
  handlers: ProjectionTree["actionHandlers"],
  doc: ProjectionModel,
  assetRegistry: AssetRegistry,
  session: ProjectionSession,
  bindings: Map<string, unknown>,
  capabilityEngine?: CapabilityEngine,
  uiContextState?: Map<string, Record<string, unknown>>,
): ProjectionNode {
  const resolver = new BindingResolver(ctx);
  const asset = assetRegistry.resolve(ref, doc.conformsToKind),
    component = asset?.name ?? inferAssetName(ref),
    props =
      component === "Endpoint"
        ? { ...(rawProps ?? {}) }
        : resolveProps({ ...(rawProps ?? {}) }, resolver),
    rawChildren = props.children,
    rawOnClick = props.onClick,
    rawOnSubmit = props.onSubmit;
  mergeEditableBindings({ component, props: rawProps ?? {}, children: [] }, props, resolver);
  delete props.children;
  delete props.onClick;
  delete props.onSubmit;
  const actionBinding =
    rawOnClick && typeof rawOnClick === "object" && !Array.isArray(rawOnClick)
      ? resolveActionBinding(rawOnClick as ActionBindingDef, resolver)
      : rawOnSubmit && typeof rawOnSubmit === "object" && !Array.isArray(rawOnSubmit)
        ? resolveActionBinding(rawOnSubmit as ActionBindingDef, resolver)
        : undefined;
  const nodeId = `n${ctx.nodeIdCounter.n++}`;
  if (actionBinding) handlers.push({ nodeId, binding: actionBinding });
  return {
    component,
    props,
    children: normalizeMorphismResult(
      rawChildren,
      ctx,
      handlers,
      doc,
      assetRegistry,
      session,
      bindings,
      capabilityEngine,
      uiContextState,
    ),
    ...(actionBinding ? { actionBinding, nodeId } : { nodeId }),
  };
}

function normalizeMorphismResult(
  value: unknown,
  ctx: RenderContext,
  handlers: ProjectionTree["actionHandlers"],
  doc: ProjectionModel,
  assetRegistry: AssetRegistry,
  session: ProjectionSession,
  bindings: Map<string, unknown>,
  capabilityEngine?: CapabilityEngine,
  uiContextState?: Map<string, Record<string, unknown>>,
): ProjectionNode[] {
  if (value == null) return [];
  if (Array.isArray(value))
    return value.flatMap((entry) =>
      normalizeMorphismResult(
        entry,
        ctx,
        handlers,
        doc,
        assetRegistry,
        session,
        bindings,
        capabilityEngine,
        uiContextState,
      ),
    );
  if (isPrimitiveNodeLike(value) || isChildSpecLike(value))
    return renderChildSpec(
      value as ChildSpec,
      ctx,
      handlers,
      doc,
      assetRegistry,
      session,
      bindings,
      capabilityEngine,
      uiContextState,
    );
  if (isProjectionNode(value))
    return [
      materializeProjectionNode(
        value,
        ctx,
        handlers,
        doc,
        assetRegistry,
        session,
        bindings,
        capabilityEngine,
        uiContextState,
      ),
    ];
  if (isProductNode(value))
    return [
      ...normalizeMorphismResult(
        value.left,
        ctx,
        handlers,
        doc,
        assetRegistry,
        session,
        bindings,
        capabilityEngine,
        uiContextState,
      ),
      ...normalizeMorphismResult(
        value.right,
        ctx,
        handlers,
        doc,
        assetRegistry,
        session,
        bindings,
        capabilityEngine,
        uiContextState,
      ),
    ];
  if (isMorphismLike(value))
    return normalizeMorphismResult(
      evaluateMorphism(compileMorphism(value), {
        bindings,
        props: ctx.props,
        route: session.route,
        currentUser: session.currentUser,
        capabilityGate: makeCapabilityGate(session, capabilityEngine),
        resolveAsset: (ref, rawProps) =>
          resolveMorphismAsset(
            ref,
            rawProps,
            ctx,
            handlers,
            doc,
            assetRegistry,
            session,
            bindings,
            capabilityEngine,
            uiContextState,
          ),
      }),
      ctx,
      handlers,
      doc,
      assetRegistry,
      session,
      bindings,
      capabilityEngine,
      uiContextState,
    );
  return [
    {
      component: "Text",
      props: { text: String(value) },
      children: [],
      nodeId: `n${ctx.nodeIdCounter.n++}`,
    },
  ];
}

function materializeProjectionNode(
  node: ProjectionNode,
  ctx: RenderContext,
  handlers: ProjectionTree["actionHandlers"],
  doc: ProjectionModel,
  assetRegistry: AssetRegistry,
  session: ProjectionSession,
  bindings: Map<string, unknown>,
  capabilityEngine?: CapabilityEngine,
  uiContextState?: Map<string, Record<string, unknown>>,
): ProjectionNode {
  const resolver = new BindingResolver(ctx),
    props =
      node.component === "Endpoint"
        ? { ...(node.props ?? {}) }
        : resolveProps(node.props ?? {}, resolver),
    rawChildren = props.children,
    rawOnClick = props.onClick,
    rawOnSubmit = props.onSubmit;
  mergeEditableBindings(node, props, resolver);
  delete props.children;
  delete props.onClick;
  delete props.onSubmit;
  const actionBinding =
    node.actionBinding ??
    (rawOnClick && typeof rawOnClick === "object" && !Array.isArray(rawOnClick)
      ? resolveActionBinding(rawOnClick as ActionBindingDef, resolver)
      : rawOnSubmit && typeof rawOnSubmit === "object" && !Array.isArray(rawOnSubmit)
        ? resolveActionBinding(rawOnSubmit as ActionBindingDef, resolver)
        : undefined);
  const nodeId = node.nodeId ?? `n${ctx.nodeIdCounter.n++}`;
  const nextCtx =
    node.component === "Context" && typeof props.scope === "string"
      ? {
          ...ctx,
          props: {
            ...ctx.props,
            __pp09ContextStack: mergeUiContextFrame(
              Array.isArray(ctx.props.__pp09ContextStack)
                ? (ctx.props.__pp09ContextStack as Array<Record<string, unknown>>)
                : [],
              String(props.scope),
              typeof props.initial === "object" &&
                props.initial !== null &&
                !Array.isArray(props.initial)
                ? (props.initial as Record<string, unknown>)
                : {},
              uiContextState,
            ),
          },
        }
      : ctx;
  const materialized: ProjectionNode = {
    ...node,
    props,
    children: [
      ...(node.children ?? []).flatMap((child) =>
        normalizeMorphismResult(
          child,
          nextCtx,
          handlers,
          doc,
          assetRegistry,
          session,
          bindings,
          capabilityEngine,
          uiContextState,
        ),
      ),
      ...normalizeMorphismResult(
        rawChildren,
        nextCtx,
        handlers,
        doc,
        assetRegistry,
        session,
        bindings,
        capabilityEngine,
        uiContextState,
      ),
    ],
    nodeId,
    ...(actionBinding ? { actionBinding } : {}),
  };
  if (actionBinding && !handlers.some((entry) => entry.nodeId === nodeId))
    handlers.push({ nodeId, binding: actionBinding });
  return materialized;
}

function resolveProps(
  raw: Record<string, unknown>,
  resolver: BindingResolver,
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, resolver.resolve(value)]),
  );
}

function resolveActionBinding(ab: ActionBindingDef, resolver: BindingResolver): ActionBindingDef {
  return {
    action: ab.action.startsWith("$") ? String(resolver.resolve(ab.action) ?? "") : ab.action,
    ...(ab.target !== undefined ? { target: resolver.resolve(ab.target) } : {}),
    ...(ab.payload ? { payload: resolveProps(ab.payload, resolver) } : {}),
    ...(ab.capability ? { capability: ab.capability } : {}),
    ...(ab.hideIfUnauthorized ? { hideIfUnauthorized: ab.hideIfUnauthorized } : {}),
    ...(ab.onSuccess ? { onSuccess: ab.onSuccess } : {}),
    ...(ab.onError ? { onError: ab.onError } : {}),
    ...(ab.to ? { to: ab.to } : {}),
    ...(ab.optimistic ? { optimistic: ab.optimistic } : {}),
  };
}

function resolveEditableActionBinding(
  ab: ActionBindingDef,
  resolver: BindingResolver,
): ActionBindingDef {
  return {
    ...resolveActionBinding(ab, resolver),
    ...(ab.payload
      ? {
          payload: Object.fromEntries(
            Object.entries(ab.payload).map(([key, value]) => [
              key,
              value === "$event.value" ? "$event.value" : resolver.resolve(value),
            ]),
          ),
        }
      : {}),
  };
}

function mergeEditableBindings(
  node: PrimitiveNode | ProjectionNode,
  props: Record<string, unknown>,
  resolver: BindingResolver,
): void {
  if (node.component !== "EditableText") return;
  const editableBindings = {
    onEditStart: "onEditStart" in node ? node.onEditStart : undefined,
    onEditCommit: "onEditCommit" in node ? node.onEditCommit : undefined,
    onEditCancel: "onEditCancel" in node ? node.onEditCancel : undefined,
    onEditEnd: "onEditEnd" in node ? node.onEditEnd : undefined,
  };
  for (const [key, binding] of Object.entries(editableBindings)) {
    if (binding) props[key] = resolveEditableActionBinding(binding, resolver);
  }
}

function inferAssetName(ref: string): string {
  const parts = ref.split("/");
  return parts.length >= 2 ? parts[parts.length - 2]! : ref;
}

function isProjectionNode(value: unknown): value is ProjectionNode {
  return !!value && typeof value === "object" && "component" in value;
}

function isPrimitiveNodeLike(value: unknown): value is PrimitiveNode {
  return !!value && typeof value === "object" && "component" in value;
}

function isChildSpecLike(value: unknown): value is ChildSpec {
  return (
    isPrimitiveNodeLike(value) ||
    (!!value && typeof value === "object" && ("use" in value || "for" in value || "if" in value))
  );
}

function isProductNode(
  value: unknown,
): value is { kind: "product"; left: unknown; right: unknown } {
  return !!value && typeof value === "object" && (value as { kind?: unknown }).kind === "product";
}

function isMorphismLike(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && "op" in (value as Record<string, unknown>);
}

function renderChildSpec(
  child: ChildSpec,
  ctx: RenderContext,
  handlers: ProjectionTree["actionHandlers"],
  doc: ProjectionModel,
  assetRegistry: AssetRegistry,
  session: ProjectionSession,
  bindings: Map<string, unknown>,
  capabilityEngine?: CapabilityEngine,
  uiContextState?: Map<string, Record<string, unknown>>,
): ProjectionNode[] {
  if (!child || typeof child !== "object") return [];
  if ("component" in child && child.component === "Context") {
    const scope = typeof child.props?.scope === "string" ? String(child.props.scope) : undefined;
    const stack = Array.isArray(ctx.props.__pp09ContextStack)
      ? [...(ctx.props.__pp09ContextStack as Array<Record<string, unknown>>)]
      : [];
    if (scope) {
      stack.splice(
        0,
        stack.length,
        ...mergeUiContextFrame(
          stack,
          scope,
          child.props?.initial &&
            typeof child.props.initial === "object" &&
            !Array.isArray(child.props.initial)
            ? { ...(child.props.initial as Record<string, unknown>) }
            : {},
          uiContextState,
        ),
      );
    }
    return (child.children ?? []).flatMap((entry) =>
      renderChildSpec(
        entry,
        {
          ...ctx,
          props: {
            ...ctx.props,
            ...(scope ? { __pp09ContextScope: scope } : {}),
            __pp09ContextStack: stack,
          },
        },
        handlers,
        doc,
        assetRegistry,
        session,
        bindings,
        capabilityEngine,
        uiContextState,
      ),
    );
  }
  if ("for" in child) {
    const items = new BindingResolver(ctx).resolve(child.for);
    if (!Array.isArray(items)) return [];
    return items.flatMap((item, index) =>
      renderChildSpec(
        child.template,
        { ...ctx, iteration: { item, index, name: child.as ?? "item" } },
        handlers,
        doc,
        assetRegistry,
        session,
        bindings,
        capabilityEngine,
        uiContextState,
      ),
    );
  }
  if ("if" in child) {
    const branch = truthy(new BindingResolver(ctx).resolve(child.if)) ? child.then : child.else;
    if (!branch) return [];
    return (Array.isArray(branch) ? branch : [branch]).flatMap((entry) =>
      renderChildSpec(
        entry as ChildSpec,
        ctx,
        handlers,
        doc,
        assetRegistry,
        session,
        bindings,
        capabilityEngine,
        uiContextState,
      ),
    );
  }
  if ("use" in child) {
    const component = doc.components?.[child.use];
    if (!component)
      return [
        { component: "Text", props: { text: `[unknown composite: ${child.use}]` }, children: [] },
      ];
    const resolver = new BindingResolver(ctx);
    return renderChildSpec(
      component.template as ChildSpec,
      { ...ctx, props: resolveProps(child.props ?? {}, resolver) },
      handlers,
      doc,
      assetRegistry,
      session,
      bindings,
      capabilityEngine,
      uiContextState,
    );
  }
  const primitive = child as PrimitiveNode;
  const resolver = new BindingResolver(ctx);
  const props =
    primitive.component === "Endpoint"
      ? { ...(primitive.props ?? {}) }
      : resolveProps(primitive.props ?? {}, resolver);
  mergeEditableBindings(primitive, props, resolver);
  const rawOnClick = props.onClick;
  const rawOnSubmit = props.onSubmit;
  delete props.onClick;
  delete props.onSubmit;
  const actionBinding =
    rawOnClick && typeof rawOnClick === "object" && !Array.isArray(rawOnClick)
      ? resolveActionBinding(rawOnClick as ActionBindingDef, resolver)
      : rawOnSubmit && typeof rawOnSubmit === "object" && !Array.isArray(rawOnSubmit)
        ? resolveActionBinding(rawOnSubmit as ActionBindingDef, resolver)
        : undefined;
  const nodeId = `n${ctx.nodeIdCounter.n++}`;
  if (actionBinding) handlers.push({ nodeId, binding: actionBinding });
  return [
    {
      component: primitive.component,
      props,
      children: (primitive.children ?? []).flatMap((entry) =>
        renderChildSpec(
          entry,
          ctx,
          handlers,
          doc,
          assetRegistry,
          session,
          bindings,
          capabilityEngine,
          uiContextState,
        ),
      ),
      ...(actionBinding ? { actionBinding } : {}),
      ...(typeof ctx.props.__pp09ContextScope === "string"
        ? { contextScope: String(ctx.props.__pp09ContextScope) }
        : {}),
      nodeId,
    },
  ];
}

function truthy(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  return !Array.isArray(value) || value.length > 0;
}
