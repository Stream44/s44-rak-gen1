export interface AppendOnlyJournal {
  open(config: Record<string, unknown>): Promise<void>;
  setBindingMeta?(bindingName: string, meta: { schemaVersion?: string }): void;
  append(bindingName: string, entry: Record<string, unknown>): void;
  scanFrom(bindingName: string, cursor: string | undefined): AsyncIterable<Record<string, unknown>>;
  scanFromSync?(bindingName: string, cursor: string | undefined): Iterable<Record<string, unknown>>;
  latestCursor(bindingName: string): string | undefined;
  flush?(): Promise<void>;
  close?(): Promise<void>;
}
