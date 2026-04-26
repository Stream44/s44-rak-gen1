import { describe, expect, test } from "bun:test";
import { buildRuntimeBundle } from "./runtime-bundle.ts";

describe("buildRuntimeBundle", () => {
  test("resolves to a bundled runtime string >= 1000 bytes", async () => {
    const bundle = await buildRuntimeBundle();
    expect(bundle.length).toBeGreaterThanOrEqual(1000);
  });

  test('contains "data-slot-id"', async () => {
    expect(await buildRuntimeBundle()).toContain("data-slot-id");
  });

  test('contains "WebSocket"', async () => {
    expect(await buildRuntimeBundle()).toContain("WebSocket");
  });

  test("does not contain unresolved import syntax", async () => {
    const bundle = await buildRuntimeBundle();
    expect(bundle.includes("import {")).toBeFalse();
    expect(bundle.includes("import *")).toBeFalse();
  });

  test("returns the same cached string across successive calls", async () => {
    const first = await buildRuntimeBundle();
    const second = await buildRuntimeBundle();
    expect(Object.is(first, second)).toBeTrue();
  });
});
