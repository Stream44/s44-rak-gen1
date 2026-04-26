import registerBuiltins from "./adapters-builtin.ts";
import { AdapterRegistry, type Dispatcher, type StateBag } from "./adapters.ts";

type EffectFrame = {
  effectId?: string;
  adapter: string;
  args?: unknown;
  op?: "mount" | "update" | "destroy";
};
type Frame =
  | { type: "skeleton"; effects?: Array<EffectFrame & { ["node-selector"]?: string }> }
  | { type: "patch"; slot?: string; effectId: string; adapter: string; args?: unknown }
  | { type: "list"; removed?: Array<{ effectId?: string }> }
  | ({ type: "effect" } & EffectFrame);

export function registerEffectBootstrap(root: ParentNode = document) {
  const stateBag: StateBag = new Map();
  const dispatcher: Dispatcher = {
    send(frame) {
      window.__adkSend?.(frame);
    },
    sendCustom(name, payload) {
      window.__adkCustomAction?.(name, payload);
    },
    sendAction(ref, payload) {
      window.__adkSend?.({ type: "action", ref, payload });
    },
  };
  const registry = new AdapterRegistry(dispatcher, stateBag);
  registerBuiltins(registry, { dispatcher, stateBag });
  const handleFrame = (frame: Frame) => {
    if (frame.type === "skeleton")
      frame.effects?.forEach((e) =>
        registry.mount(
          e.effectId ?? `${e.adapter}:${JSON.stringify(e.args ?? null)}`,
          e.adapter,
          e.args,
          e["node-selector"] ? root.querySelector(e["node-selector"]) : null,
        ),
      );
    if (frame.type === "patch" && frame.slot === "effectMeta")
      registry.update(frame.effectId, frame.adapter, frame.args);
    if (frame.type === "list")
      frame.removed?.forEach((entry) => entry.effectId && registry.destroy(entry.effectId));
    if (frame.type === "effect") {
      if (frame.op === "destroy" && frame.effectId) registry.destroy(frame.effectId);
      else if (frame.op === "update" && frame.effectId)
        registry.update(frame.effectId, frame.adapter, frame.args);
      else
        registry.mount(
          frame.effectId ?? `server:${frame.adapter}`,
          frame.adapter,
          frame.args,
          null,
        );
    }
  };
  window.__adkEffects = { registry, handleFrame };
  return { registry, handleFrame };
}

export default registerEffectBootstrap;

declare global {
  interface Window {
    __adkSend?: (frame: unknown) => void;
    __adkCustomAction?: (name: string, payload?: unknown) => void;
    __adkEffects?: { registry: AdapterRegistry; handleFrame: (frame: Frame) => void };
  }
}
