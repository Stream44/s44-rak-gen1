import type { ContentStore } from "../../L01-foundation/types.ts";

export default class MemoryContentStore implements ContentStore {
  private store = new Map<string, Uint8Array>();

  get(id: string): Uint8Array | null {
    return this.store.get(id) ?? null;
  }

  put(id: string, bytes: Uint8Array): void {
    this.store.set(id, bytes);
  }

  has(id: string): boolean {
    return this.store.has(id);
  }

  delete(id: string): boolean {
    return this.store.delete(id);
  }

  get size(): number {
    return this.store.size;
  }

  clear(): void {
    this.store.clear();
  }
}
