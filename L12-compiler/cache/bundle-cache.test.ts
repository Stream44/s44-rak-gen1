import { describe, expect, test } from "bun:test";
import { JsonEncoder } from "../../L01-foundation/encoder.ts";
import type { Bundle } from "../ir/bytecode";
import { BundleCache } from "./bundle-cache";
import { deserializeBundle, serializeBundle } from "./serialize";

const encoder = new JsonEncoder();
const cid = (bundle: Omit<Bundle, "cid">, seed = "ignored") =>
  encoder.encodeAndHashWithExclusion(
    {
      cid: seed,
      code: bundle.code,
      constants: bundle.constants,
      registerCount: bundle.registerCount,
      moduleTable: bundle.moduleTable,
      closureTable: bundle.closureTable,
      compilerVersion: bundle.compilerVersion,
    },
    ["cid"],
  ).cid;
const make = (overrides: Partial<Omit<Bundle, "cid">> = {}): Bundle => {
  const bundle = {
    compilerVersion: 1,
    code: new Uint32Array([1, 2, 3, 4]),
    constants: [{ deep: { ok: true } }, "x"],
    registerCount: 4,
    entryPoint: 0,
    moduleTable: ["module:a"],
    calleeTable: ["cid:sha256:callee"],
    closureTable: [{ bodyOffset: 3, registerCount: 2, captureCount: 1 }],
    sourceMap: { 0: 10, 3: 11 },
    ...overrides,
  };
  return { ...bundle, cid: cid(bundle) };
};

describe("BundleCache", () => {
  test("empty cache get/has/size behave", () => {
    const cache = new BundleCache();
    expect(cache.get("x")).toBeNull();
    expect(cache.has("x")).toBe(false);
    expect(cache.size()).toBe(0);
  });
  test("put and get round-trip", () => {
    const cache = new BundleCache();
    const bundle = make();
    cache.put(bundle);
    expect(cache.get(bundle.cid)).toEqual(bundle);
  });
  test("same content yields same CID", () => expect(make().cid).toBe(make().cid));
  test("different code changes CID", () =>
    expect(make({ code: new Uint32Array([9, 2, 3, 4]) }).cid).not.toBe(make().cid));
  test("clear empties cache", () => {
    const cache = new BundleCache();
    cache.put(make());
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(cache.get("x")).toBeNull();
  });
  test("put rejects mismatched CID", () =>
    expect(() => new BundleCache().put({ ...make(), cid: "cid:sha256:bad" })).toThrow(
      "Bundle CID mismatch",
    ));
  test("serializeBundle emits valid JSON", () => {
    const bundle = make();
    const json = JSON.parse(new TextDecoder().decode(serializeBundle(bundle)));
    expect(json.cid).toBe(bundle.cid);
    expect(typeof json.code).toBe("string");
  });
  test("serialize/deserialize deep-equals", () => {
    const bundle = make({ code: new Uint32Array([8, 13, 21, 34]) });
    expect(deserializeBundle(serializeBundle(bundle))).toEqual(bundle);
  });
  test("large Uint32Array round-trips", () => {
    const code = new Uint32Array(Array.from({ length: 1000 }, (_, i) => i));
    expect(deserializeBundle(serializeBundle(make({ code }))).code).toEqual(code);
  });
  test("CID uses encodeAndHashWithExclusion excluding cid", () => {
    const bundle = make();
    expect(bundle.cid).toBe(cid(bundle, "cid:sha256:fake"));
  });
  test("compilerVersion changes CID", () =>
    expect(make({ compilerVersion: 2 }).cid).not.toBe(make().cid));
  test("nested constants round-trip", () =>
    expect(
      deserializeBundle(serializeBundle(make({ constants: [{ a: [1, { b: "c" }] }] }))).constants,
    ).toEqual([{ a: [1, { b: "c" }] }]));
  test("empty module/callee/closure tables work", () => {
    const bundle = make({ moduleTable: [], calleeTable: [], closureTable: [] });
    expect(deserializeBundle(serializeBundle(bundle))).toEqual(bundle);
  });
  test("sourceMap preserves integer keys", () => {
    const out = deserializeBundle(serializeBundle(make({ sourceMap: { 1: 9, 7: 11 } })));
    expect(out.sourceMap[1]).toBe(9);
    expect(Object.keys(out.sourceMap)).toEqual(["1", "7"]);
  });
});
