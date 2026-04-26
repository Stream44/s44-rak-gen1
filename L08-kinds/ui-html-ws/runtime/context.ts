import type { SlotId, CtxScopeDescriptor } from "../wire-protocol.ts";
import type { Dispatcher } from "./dispatch.ts";

export type ScopeFrame = {
  scope: string;
  scopePath: string;
  initial: Record<string, unknown>;
  values: Map<string, { value: unknown; version: number }>;
  mirror: Set<string>;
  subscribers: Map<string, Set<SlotId>>;
  parent?: ScopeFrame;
  key?: unknown;
};
const norm = (path = "page") => path.replace(/^\$ui\./, "").replace(/\./g, "/") || "page";
const root = (): ScopeFrame => ({
  scope: "page",
  scopePath: "page",
  initial: {},
  values: new Map(),
  mirror: new Set(),
  subscribers: new Map(),
});
const read = (frame: ScopeFrame | undefined, key: string) =>
  frame?.values.get(key)?.value ?? frame?.initial[key];
const parentPath = (scopePath: string) =>
  scopePath.includes("/") ? scopePath.slice(0, scopePath.lastIndexOf("/")) : "page";

export const getCurrentCtxStack = (frames: Map<string, ScopeFrame>, currentScopePath: string) => {
  const out: ScopeFrame[] = [];
  for (
    let frame = frames.get(norm(currentScopePath)) ?? frames.get("page");
    frame;
    frame = frame.parent
  )
    out.push(frame);
  return out;
};

export class ContextResolver {
  private frames = new Map<string, ScopeFrame>();
  private byScope = new Map<string, ScopeFrame[]>();
  readonly affectedSlots = new Set<SlotId>();
  constructor(private readonly dispatcher: Pick<Dispatcher, "sendUiSet">) {
    this.index(root());
  }
  private index(frame: ScopeFrame) {
    (this.byScope.get(frame.scope) ?? this.byScope.set(frame.scope, []).get(frame.scope)!).push(
      frame,
    );
    this.frames.set(frame.scopePath, frame);
  }
  loadFromSkeleton(scopes: CtxScopeDescriptor[]): void {
    const prev = this.frames;
    this.frames = new Map();
    this.byScope = new Map();
    this.index(root());
    for (const scope of [...scopes].sort(
      (a, b) => a.scopePath.split("/").length - b.scopePath.split("/").length,
    )) {
      const scopePath = norm(scope.scopePath);
      if (scopePath === "page") continue;
      const prior = prev.get(scopePath);
      this.index({
        scope: scope.scope,
        scopePath,
        initial: scope.initial ?? {},
        values: prior?.scope === scope.scope && prior?.key === scope.key ? prior.values : new Map(),
        mirror: new Set(scope.mirror ?? []),
        subscribers: prior?.subscribers ?? new Map(),
        parent: this.frames.get(parentPath(scopePath)),
        key: scope.key,
      });
    }
  }
  resolve(fullPath: string, currentScopePath = "page"): unknown {
    if (fullPath.startsWith("$ctx.")) {
      const key = fullPath.slice(5);
      for (const frame of getCurrentCtxStack(this.frames, currentScopePath)) {
        const value = read(frame, key);
        if (value !== undefined) return value;
      }
      return undefined;
    }
    if (!fullPath.startsWith("$ui.")) return undefined;
    const [scope, ...rest] = fullPath.slice(4).split("."),
      key = rest.join("."),
      frame =
        getCurrentCtxStack(this.frames, currentScopePath).find((entry) => entry.scope === scope) ??
        this.byScope.get(scope)?.[0];
    return read(frame, key);
  }
  setUi(scopePath: string, key: string, value: unknown): void {
    const frame = this.frames.get(norm(scopePath)) ?? this.byScope.get(scopePath)?.[0];
    if (!frame) throw new Error(`Unknown context scopePath: ${scopePath}`);
    const version = frame.values.get(key)?.version ?? 0;
    frame.values.set(key, { value, version: version + 1 });
    this.affectedSlots.clear();
    for (const slotId of frame.subscribers.get(key) ?? []) this.affectedSlots.add(slotId);
    if (frame.mirror.has(key)) this.dispatcher.sendUiSet(frame.scopePath, key, value);
  }
  subscribeSlot(scopePath: string, key: string, slotId: SlotId): () => void {
    const frame = this.frames.get(norm(scopePath)) ?? this.byScope.get(scopePath)?.[0];
    if (!frame) return () => {};
    const slots = frame.subscribers.get(key) ?? frame.subscribers.set(key, new Set()).get(key)!;
    slots.add(slotId);
    return () => slots.delete(slotId);
  }
}
