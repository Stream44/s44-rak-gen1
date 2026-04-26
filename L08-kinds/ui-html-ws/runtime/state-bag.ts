type Entry = { value: unknown; version: number };
type Store = Map<string, Entry>;
type Delegate = {
  getCtx?: (path: string, scope?: string) => unknown;
  setCtx?: (scope: string, path: string, value: unknown) => void;
};
type Sub = (value: unknown, path: string) => void;

const hit = (left: string, right: string) =>
  left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);
const split = (path: string) => {
  const dot = path.indexOf(".");
  return [dot < 0 ? path : path.slice(0, dot), dot < 0 ? "" : path.slice(dot + 1)] as const;
};

export class StateBag {
  private readonly stores: Record<string, Store> = {
    $ws: new Map(),
    $bind: new Map(),
    $ui: new Map(),
    $ctx: new Map(),
  };
  private readonly subs = new Map<string, Set<Sub>>();
  private delegate?: Delegate;
  constructor(delegate?: Delegate) {
    this.delegate = delegate;
  }
  setCtxResolver(resolver: {
    resolve: (path: string, scope?: string) => unknown;
    setUi: (scope: string, path: string, value: unknown) => void;
  }): void {
    this.delegate = {
      ...this.delegate,
      getCtx: resolver.resolve.bind(resolver),
      setCtx: resolver.setUi.bind(resolver),
    };
  }
  get(path: string, currentScope?: string | { currentScopePath?: string }): unknown {
    const [ns, key] = split(path);
    const scope = typeof currentScope === "string" ? currentScope : currentScope?.currentScopePath;
    if ((ns === "$ctx" || (ns === "$ui" && key.includes("."))) && this.delegate?.getCtx)
      return this.delegate.getCtx(ns === "$ctx" ? path : `$ui.${key}`, scope);
    return this.stores[ns]?.get(key)?.value;
  }
  set(path: string, value: unknown, currentScope = "page"): void {
    const [ns, key] = split(path);
    if ((ns === "$ctx" || (ns === "$ui" && key.includes("."))) && this.delegate?.setCtx)
      return void this.delegate.setCtx(
        ns === "$ctx" ? currentScope : key.slice(0, key.lastIndexOf(".")),
        key.slice(key.lastIndexOf(".") + 1),
        value,
      );
    const store = this.stores[ns] ?? this.stores.$ui,
      prev = store.get(key)?.version ?? 0;
    store.set(key, { value, version: prev + 1 });
    for (const [prefix, handlers] of this.subs)
      if (hit(prefix, path)) for (const handler of handlers) handler(value, path);
  }
  subscribe(pathPrefix: string, handler: Sub): () => void {
    (this.subs.get(pathPrefix) ?? this.subs.set(pathPrefix, new Set()).get(pathPrefix)!).add(
      handler,
    );
    return () => this.subs.get(pathPrefix)?.delete(handler);
  }
  setUi(ctxPath: string, path: string, value: unknown): void {
    this.delegate?.setCtx
      ? this.delegate.setCtx(ctxPath, path, value)
      : this.set(path.startsWith("$") ? path : `$ui.${ctxPath}.${path}`, value, ctxPath);
  }
  version(path: string): number {
    const [ns, key] = split(path);
    return this.stores[ns]?.get(key)?.version ?? 0;
  }
}

export function createStateBag(delegate?: Delegate): StateBag {
  return new StateBag(delegate);
}
