import { JsonEncoder } from "../../L01-foundation/encoder.ts";
import type { Bundle } from "../ir/bytecode";

const encoder = new JsonEncoder();

const bundleCid = (bundle: Bundle): string =>
  encoder.encodeAndHashWithExclusion(
    {
      cid: bundle.cid,
      code: bundle.code,
      constants: bundle.constants,
      registerCount: bundle.registerCount,
      moduleTable: bundle.moduleTable,
      closureTable: bundle.closureTable,
      compilerVersion: bundle.compilerVersion,
    },
    ["cid"],
  ).cid;

export class BundleCache {
  private map = new Map<string, Bundle>();

  get(cid: string): Bundle | null {
    return this.map.get(cid) ?? null;
  }

  put(bundle: Bundle): void {
    const expected = bundleCid(bundle);
    if (bundle.cid !== expected)
      throw new Error(`Bundle CID mismatch: expected ${expected}, got ${bundle.cid}`);
    this.map.set(bundle.cid, bundle);
  }

  has(cid: string): boolean {
    return this.map.has(cid);
  }

  size(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }
}
