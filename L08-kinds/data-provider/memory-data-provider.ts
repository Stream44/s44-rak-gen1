import type { DataProvider } from "../../L09-demand/demand.ts";

export default class MemoryDataProvider implements DataProvider {
  private store = new Map<string, unknown>();

  put(key: string, data: unknown): void {
    this.store.set(key, data);
  }

  load(key: string): unknown | null {
    if (!this.store.has(key)) return null;
    return this.store.get(key)!;
  }

  loadBatch(keys: string[]): Map<string, unknown> {
    const result = new Map<string, unknown>();
    for (const key of keys) {
      if (this.store.has(key)) result.set(key, this.store.get(key)!);
    }
    return result;
  }
}
