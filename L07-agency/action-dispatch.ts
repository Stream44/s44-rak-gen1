import type { ActionDef, ModelBoot } from "../L09-demand/model-loader.ts";
import { ActionMorphismResolver } from "./action-morphism.ts";
import { generateKey } from "./keygen.ts";

const warnedLegacyCreateActions = new Set<string>();

/** Exported for tests only. Resets the legacy-keyField deprecation gate. */
export function __resetActionDispatchWarnings(): void {
  warnedLegacyCreateActions.clear();
}

type DispatchFrame = { ref: string; payload?: Record<string, unknown>; target?: string };
type DispatchContext = {
  bindings: Map<string, unknown>;
  session: { currentUser?: { id: string; capabilities: Record<string, string> } };
  route: { path: string; params: Record<string, string>; query: Record<string, string> };
};

export async function dispatchAction(
  app: ModelBoot,
  frame: DispatchFrame,
  ctx: DispatchContext,
): Promise<{ handled: boolean; events?: unknown[] }> {
  const action = app.getActionDef(frame.ref);
  if (!action) return { handled: false };
  const kind = action.kind ?? "mutate";
  const payload = frame.payload ?? {};

  switch (kind) {
    case "mutate": {
      const target = frame.target ?? String(payload[action.targetField ?? "id"] ?? "");
      await app.submit(action.verb, target, payload);
      return { handled: true };
    }
    case "create": {
      const key = generateKey(action.keyStrategy, payload);
      // DC7: do NOT embed the key into state. The map-key is authoritative identity.
      // If a binding wants `id` back on read, declare `derived: { id: "$key" }`.
      if (action.keyField && !warnedLegacyCreateActions.has(frame.ref)) {
        warnedLegacyCreateActions.add(frame.ref);
        console.warn(
          `[action-dispatch] action "${action.verb}" declares keyField="${action.keyField}" - deprecated. ` +
            "Move keyField/keyStrategy to the binding's aspect. " +
            `keyField is now ignored; map-key is the sole identity.`,
        );
      }
      const state = { ...(action.defaults ?? {}), ...payload };
      await app.submit(action.verb, key, state);
      return { handled: true };
    }
    case "remove": {
      const target = String(payload[action.targetField ?? "id"] ?? frame.target ?? "");
      if (!target) throw new Error(`remove action ${frame.ref} requires a target`);
      await app.removeInstance(target);
      return { handled: true };
    }
    case "batch":
      return dispatchBatch(app, action, payload, ctx);
    case "custom":
      return { handled: false };
  }
}

async function dispatchBatch(
  app: ModelBoot,
  action: ActionDef,
  payload: Record<string, unknown>,
  ctx: DispatchContext,
): Promise<{ handled: boolean }> {
  const resolver = new ActionMorphismResolver(ctx);
  const items = resolver.resolve(action.selector);
  if (!Array.isArray(items)) return { handled: true };
  const calls: Array<{ verb: string; target: string; payload: Record<string, unknown> }> = [];
  for (const [index, item] of items.entries()) {
    const sub = new ActionMorphismResolver({ ...ctx, payload, item, index }).resolve(
      action.submit,
    ) as {
      verb: string;
      target: string;
      payload?: Record<string, unknown>;
    };
    calls.push({ verb: sub.verb, target: String(sub.target), payload: sub.payload ?? {} });
  }
  await app.batch(calls);
  return { handled: true };
}
