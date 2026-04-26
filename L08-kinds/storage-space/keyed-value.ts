export interface KeyedValueStore {
  open(config: Record<string, unknown>): Promise<void>;
  setBindingMeta?(bindingName: string, meta: { schemaVersion?: string }): void;
  get(bindingName: string, key: string): unknown | undefined;
  put(bindingName: string, key: string, value: unknown): void;
  delete(bindingName: string, key: string): void;
  has(bindingName: string, key: string): boolean;
  snapshot(bindingName: string): Record<string, unknown>;
  hydrate(bindingName: string, records: Record<string, unknown>): void;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}
