export interface Dispatcher {
  send(frame: unknown): void;
  sendCustom(name: string, payload?: unknown): void;
  sendAction(ref: string, payload?: unknown): void;
}

export type StateBag = Map<string, unknown>;
export type AdapterContext<Args = unknown> = {
  args: Args;
  node: HTMLElement | null;
  dispatcher: Dispatcher;
  stateBag: StateBag;
  instance: { cleanup?: () => void; [key: string]: unknown };
};

export interface Adapter<Args = unknown> {
  argsShape: unknown;
  mounted?(ctx: AdapterContext<Args>): void;
  updated?(ctx: AdapterContext<Args>): void;
  destroyed?(ctx: AdapterContext<Args>): void;
}

type Mounted = { adapterName: string; args: unknown; context: AdapterContext };

export class AdapterRegistry {
  readonly instances = new Map<string, Mounted>();
  private readonly adapters = new Map<string, Adapter>();
  constructor(
    private readonly dispatcher: Dispatcher,
    private readonly stateBag: StateBag,
  ) {}
  registerAdapter(name: string, adapter: Adapter): void {
    this.adapters.set(name, adapter);
  }
  get(name: string): Adapter | undefined {
    return this.adapters.get(name);
  }
  mount(effectId: string, adapterName: string, args: unknown, node: HTMLElement | null): void {
    const adapter = this.adapters.get(adapterName);
    if (!adapter) throw new Error(`Unknown adapter: ${adapterName}`);
    const context: AdapterContext = {
      args,
      node,
      dispatcher: this.dispatcher,
      stateBag: this.stateBag,
      instance: {},
    };
    this.instances.set(effectId, { adapterName, args, context });
    adapter.mounted?.(context);
  }
  update(effectId: string, adapterName: string, args: unknown): void {
    const mounted = this.instances.get(effectId),
      adapter = this.adapters.get(adapterName);
    if (!mounted || !adapter) return;
    mounted.adapterName = adapterName;
    mounted.args = args;
    mounted.context.args = args;
    adapter.updated?.(mounted.context);
  }
  destroy(effectId: string): void {
    const mounted = this.instances.get(effectId),
      adapter = mounted && this.adapters.get(mounted.adapterName);
    if (!mounted) return;
    if (adapter?.destroyed) adapter.destroyed(mounted.context);
    else mounted.context.instance.cleanup?.();
    this.instances.delete(effectId);
  }
}
