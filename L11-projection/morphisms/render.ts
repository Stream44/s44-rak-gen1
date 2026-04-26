import type { CapabilityEngine } from "../../L07-agency/capability.ts";
import type { ModelBoot } from "../../L09-demand/model-loader.ts";
import { compileMorphism, evaluateMorphism } from "../algebra.ts";
import { BindingResolver } from "../bindings.ts";
import { resolveManifestRef, type ResolvedManifest } from "../dispatch.ts";
import type {
  ActionBindingDef,
  ChildSpec,
  ComponentDef,
  ProjectionModel,
  ProjectionNode,
  ProjectionTree,
  RenderContext,
} from "../../L01-foundation/projection-types.ts";

type Input = {
  doc: ProjectionModel;
  pageName: string;
  props?: Record<string, unknown>;
  bindings?: Map<string, unknown>;
  uiContextState?: Map<string, Record<string, unknown>>;
  session: NonNullable<RenderContext["session"]>;
  capabilityEngine?: CapabilityEngine;
  components?: Record<string, ComponentDef>;
  manifest?: ResolvedManifest;
  app?: Pick<ModelBoot, "listInstances"> | null;
  apps?: Map<string, Pick<ModelBoot, "listInstances">>;
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

// Stored records drop the redundant `id` field; the map key
// is authoritative identity. Re-inject it at the projection boundary so
// `$bind.instances` iteration keeps the `$t.id` contract for action refs.
function withIdentity({ key, state }: { key: string; state: unknown }): unknown {
  if (!state || typeof state !== "object") return state;
  const rec = state as Record<string, unknown>;
  return rec.id !== undefined ? rec : { ...rec, id: key };
}

function bindProjectionInstances(
  doc: ProjectionModel,
  bindings: Map<string, unknown>,
  app?: Pick<ModelBoot, "listInstances"> | null,
  apps?: Map<string, Pick<ModelBoot, "listInstances">>,
): void {
  const boundApps = apps ?? new Map<string, Pick<ModelBoot, "listInstances">>();
  const modelId = doc.bindsModel?.split("@")[0];
  if (app && modelId && !boundApps.has(modelId)) boundApps.set(modelId, app);
  if (doc.bindsModels) {
    const byModel: Record<string, unknown[]> = {};
    for (const entry of doc.bindsModels) {
      const instances = boundApps.get(entry.modelId)?.listInstances().map(withIdentity) ?? [];
      byModel[entry.modelId] = instances;
    }
    bindings.set("instances", byModel);
    return;
  }
  if (!modelId || !app) return;
  bindings.set("instances", app.listInstances().map(withIdentity));
}

export default function render(input: Input): ProjectionTree {
  const { doc, pageName, session, capabilityEngine } = input,
    props = input.props ?? {},
    bindings = input.bindings ?? new Map(),
    components = input.components ?? doc.components ?? {},
    manifest = input.manifest ??
      (doc as ProjectionModel & { manifest?: ResolvedManifest }).manifest ?? {
        byName: new Map(),
        byUri: new Map(),
      },
    targetPage =
      pageName ||
      (doc.routes ?? [])[0]?.page ||
      (doc.pages?.index ? "index" : (Object.keys(doc.pages ?? {})[0] ?? ""));
  bindProjectionInstances(doc, bindings, input.app, input.apps);
  const ctx: RenderContext = {
      pageName: targetPage,
      route: session.route,
      currentUser: session.currentUser,
      bindings,
      props: { ...props, __pp09ContextStack: cloneUiContextStack(input.uiContextState) },
      nodeIdCounter: { n: 0 },
      session,
    },
    actionHandlers: ProjectionTree["actionHandlers"] = [];
  const rp = (raw: Record<string, unknown>, r: BindingResolver) =>
    Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, r.resolve(v)]));
  const rab = (ab: ActionBindingDef, r: BindingResolver): ActionBindingDef => ({
    action: ab.action.startsWith("$") ? String(r.resolve(ab.action) ?? "") : ab.action,
    ...(ab.target !== undefined ? { target: r.resolve(ab.target) } : {}),
    ...(ab.payload ? { payload: rp(ab.payload, r) } : {}),
    ...(ab.capability ? { capability: ab.capability } : {}),
    ...(ab.hideIfUnauthorized ? { hideIfUnauthorized: true } : {}),
    ...(ab.onSuccess ? { onSuccess: ab.onSuccess } : {}),
    ...(ab.onError ? { onError: ab.onError } : {}),
    ...(ab.to ? { to: ab.to } : {}),
    ...(ab.optimistic ? { optimistic: ab.optimistic } : {}),
  });
  const reb = (ab: ActionBindingDef, r: BindingResolver): ActionBindingDef => ({
    ...rab(ab, r),
    ...(ab.payload
      ? {
          payload: Object.fromEntries(
            Object.entries(ab.payload).map(([key, value]) => [
              key,
              value === "$event.value" ? "$event.value" : r.resolve(value),
            ]),
          ),
        }
      : {}),
  });
  const mergeEditableBindings = (
    node: ProjectionNode | ChildSpec,
    props: Record<string, unknown>,
    r: BindingResolver,
  ) => {
    if (!("component" in node) || node.component !== "EditableText") return;
    const editableBindings = {
      onEditStart: "onEditStart" in node ? node.onEditStart : undefined,
      onEditCommit: "onEditCommit" in node ? node.onEditCommit : undefined,
      onEditCancel: "onEditCancel" in node ? node.onEditCancel : undefined,
      onEditEnd: "onEditEnd" in node ? node.onEditEnd : undefined,
    };
    for (const [key, binding] of Object.entries(editableBindings)) {
      if (binding) props[key] = reb(binding as ActionBindingDef, r);
    }
  };
  const truthy = (v: unknown) =>
    !(v == null || v === false || v === 0 || v === "" || (Array.isArray(v) && v.length === 0));
  const gate = (requires?: string[], requiresAny?: string[]) =>
    (requires ?? []).every(
      (cap) =>
        session.currentUser.capabilities[cap] &&
        capabilityEngine?.authorize(
          {
            id: `read-intent:${cap}:${session.currentUser.id}`,
            action: cap,
            target: cap,
            targetKey: session.currentUser.id,
            payload: { resource: cap, subject: session.currentUser.id },
            issuer: session.currentUser.id,
            timestamp: new Date(0).toISOString(),
          },
          session.currentUser.capabilities[cap],
        ).authorized,
    ) &&
    ((requiresAny ?? []).length === 0 ||
      (requiresAny ?? []).some(
        (cap) =>
          session.currentUser.capabilities[cap] &&
          capabilityEngine?.authorize(
            {
              id: `read-intent:${cap}:${session.currentUser.id}`,
              action: cap,
              target: cap,
              targetKey: session.currentUser.id,
              payload: { resource: cap, subject: session.currentUser.id },
              issuer: session.currentUser.id,
              timestamp: new Date(0).toISOString(),
            },
            session.currentUser.capabilities[cap],
          ).authorized,
      ));
  const materialize = (value: unknown, c: RenderContext): ProjectionNode[] => {
    if (value == null) return [];
    if (Array.isArray(value)) return value.flatMap((entry) => materialize(entry, c));
    if (
      value &&
      typeof value === "object" &&
      "left" in (value as Record<string, unknown>) &&
      "right" in (value as Record<string, unknown>)
    )
      return [
        ...materialize((value as { left: unknown }).left, c),
        ...materialize((value as { right: unknown }).right, c),
      ];
    if (
      !value ||
      typeof value !== "object" ||
      typeof (value as ProjectionNode).component !== "string"
    )
      return [
        {
          component: "Text",
          props: { text: String(value) },
          children: [],
          nodeId: `n${c.nodeIdCounter.n++}`,
        },
      ];
    const node = value as ProjectionNode,
      r = new BindingResolver(c),
      p = node.component === "Endpoint" ? { ...(node.props ?? {}) } : rp(node.props ?? {}, r),
      rawChildren = p.children,
      rawOnClick = p.onClick,
      rawOnSubmit = p.onSubmit;
    mergeEditableBindings(node, p, r);
    delete p.children;
    delete p.onClick;
    delete p.onSubmit;
    const actionBinding =
      node.actionBinding ??
      (rawOnClick && typeof rawOnClick === "object" && !Array.isArray(rawOnClick)
        ? rab(rawOnClick as ActionBindingDef, r)
        : rawOnSubmit && typeof rawOnSubmit === "object" && !Array.isArray(rawOnSubmit)
          ? rab(rawOnSubmit as ActionBindingDef, r)
          : undefined);
    const nodeId = node.nodeId ?? `n${c.nodeIdCounter.n++}`,
      kind = actionBinding ? resolveManifestRef(manifest, actionBinding.action)?.kind : undefined;
    if (actionBinding && !actionHandlers.some((entry) => entry.nodeId === nodeId))
      actionHandlers.push({ nodeId, binding: actionBinding, kind });
    const nextCtx =
      node.component === "Context" && typeof p.scope === "string"
        ? {
            ...c,
            props: {
              ...c.props,
              __pp09ContextStack: mergeUiContextFrame(
                Array.isArray(c.props.__pp09ContextStack)
                  ? (c.props.__pp09ContextStack as Array<Record<string, unknown>>)
                  : [],
                String(p.scope),
                typeof p.initial === "object" && p.initial !== null && !Array.isArray(p.initial)
                  ? (p.initial as Record<string, unknown>)
                  : {},
                input.uiContextState,
              ),
            },
          }
        : c;
    return [
      {
        ...node,
        props: p,
        children: [
          ...(node.children ?? []).flatMap((child) => materialize(child, nextCtx)),
          ...materialize(rawChildren, nextCtx),
        ],
        nodeId,
        ...(actionBinding ? { actionBinding } : {}),
      },
    ];
  };
  const renderChild = (child: ChildSpec, c: RenderContext): ProjectionNode[] => {
    if (!child || typeof child !== "object") return [];
    if ("op" in child && !("for" in child) && !("if" in child) && !("use" in child)) {
      return materialize(
        evaluateMorphism(compileMorphism(child), {
          bindings,
          props: c.props,
          route: session.route,
          currentUser: session.currentUser,
          capabilityGate: gate,
          resolveAsset: (ref) => ({ component: "Text", props: { text: ref }, children: [] }),
        }),
        c,
      );
    }
    if ("for" in child) {
      const items = new BindingResolver(c).resolve(child.for);
      if (!Array.isArray(items) || items.length === 0) {
        const fallback = "emptyFallback" in child ? child.emptyFallback : undefined;
        return !fallback ? [] : renderChild(fallback as ChildSpec, c);
      }
      return items.flatMap((item, index) =>
        renderChild(child.template, { ...c, iteration: { item, index, name: child.as ?? "item" } }),
      );
    }
    if ("if" in child) {
      const branch = truthy(new BindingResolver(c).resolve(child.if)) ? child.then : child.else;
      return !branch
        ? []
        : (Array.isArray(branch) ? branch : [branch]).flatMap((entry) =>
            renderChild(entry as ChildSpec, c),
          );
    }
    if ("use" in child)
      return components[child.use]
        ? renderChild(components[child.use].template as ChildSpec, {
            ...c,
            props: rp(child.props ?? {}, new BindingResolver(c)),
          })
        : [
            {
              component: "Text",
              props: { text: `[unknown composite: ${child.use}]` },
              children: [],
            },
          ];
    const r = new BindingResolver(c),
      p = child.component === "Endpoint" ? { ...(child.props ?? {}) } : rp(child.props ?? {}, r);
    mergeEditableBindings(child, p, r);
    const nextC =
      child.component === "Context" && typeof p.scope === "string"
        ? {
            ...c,
            props: {
              ...c.props,
              __pp09ContextStack: mergeUiContextFrame(
                Array.isArray(c.props.__pp09ContextStack)
                  ? (c.props.__pp09ContextStack as Array<Record<string, unknown>>)
                  : [],
                String(p.scope),
                typeof p.initial === "object" && p.initial !== null && !Array.isArray(p.initial)
                  ? (p.initial as Record<string, unknown>)
                  : {},
                input.uiContextState,
              ),
            },
          }
        : c;
    let disabled = truthy(p.disabled),
      hidden = false;
    const boundAction = child.onClick ? rab(child.onClick, r) : undefined,
      resolved = boundAction ? resolveManifestRef(manifest, boundAction.action) : null;
    if (
      resolved?.kind === "model" &&
      resolved.action &&
      !session.currentUser.capabilities[resolved.action.verb]
    )
      boundAction?.hideIfUnauthorized ? (hidden = true) : (disabled = true);
    if (hidden) return [];
    const nodeId = `n${c.nodeIdCounter.n++}`;
    if (boundAction) actionHandlers.push({ nodeId, binding: boundAction, kind: resolved?.kind });
    return [
      {
        component: child.component,
        props: p,
        children: (child.children ?? []).flatMap((entry) => renderChild(entry, nextC)),
        actionBinding: boundAction,
        disabled,
        nodeId,
      },
    ];
  };
  if (doc.morphism) {
    const children = materialize(
      evaluateMorphism(doc.morphism, {
        bindings,
        props,
        route: session.route,
        currentUser: session.currentUser,
        capabilityGate: gate,
        resolveAsset: (ref) => ({ component: "Text", props: { text: ref }, children: [] }),
      }),
      ctx,
    );
    return {
      root: { component: "Stack", props: {}, children },
      pageName: targetPage,
      actionHandlers,
    };
  }
  const page = (doc.pages ?? {})[targetPage];
  if (!page) throw new Error(`Unknown page: "${targetPage}"`);
  return {
    root: {
      component: "Stack",
      props: {},
      children: (page.children ?? []).flatMap((child) => renderChild(child, ctx)),
    },
    pageName: targetPage,
    actionHandlers,
  };
}
