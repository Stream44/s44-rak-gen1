/**
 * Layer 1: JsonEncoder + MemoryStore — content addressing infrastructure.
 */

import type { Encoder, ContentStore } from "./types.ts";
import { canonicalize } from "./utils.ts";

/**
 * Default Encoder using canonical JSON + SHA-256.
 * CID format: "cid:sha256:<hex>"
 */
export class JsonEncoder implements Encoder {
  private encoder = new TextEncoder();
  private decoder = new TextDecoder();

  encode(value: unknown): Uint8Array {
    return this.encoder.encode(canonicalize(value));
  }

  decode(bytes: Uint8Array): unknown {
    return JSON.parse(this.decoder.decode(bytes));
  }

  hash(bytes: Uint8Array): string {
    // Use Bun's native crypto (synchronous via SHA256)
    const hasher = new Bun.CryptoHasher("sha256");
    hasher.update(bytes);
    const hex = hasher.digest("hex");
    return `cid:sha256:${hex}`;
  }

  verify(id: string, bytes: Uint8Array): boolean {
    return this.hash(bytes) === id;
  }

  /** Convenience: encode + hash in one call. */
  encodeAndHash(value: unknown): { bytes: Uint8Array; cid: string } {
    const bytes = this.encode(value);
    const cid = this.hash(bytes);
    return { bytes, cid };
  }

  encodeAndHashWithExclusion(
    value: unknown,
    excludeFields: string[],
  ): { bytes: Uint8Array; cid: string } {
    const stripped: Record<string, unknown> = {};
    const obj = value as Record<string, unknown>;
    for (const key of Object.keys(obj)) if (!excludeFields.includes(key)) stripped[key] = obj[key];
    const bytes = this.encode(stripped);
    const cid = this.hash(bytes);
    return { bytes, cid };
  }
}

/**
 * In-memory content store. Suitable for testing and ephemeral sessions.
 */
export class MemoryStore implements ContentStore {
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
