import { describe, expect, test } from "bun:test";
import normalizeDispatchFrame from "./normalize-dispatch-frame.ts";

describe("normalizeDispatchFrame", () => {
  test("passes through actionRef frames", () => {
    expect(
      normalizeDispatchFrame({ actionRef: "Echo", payload: { ok: true } }, true, false),
    ).toEqual({ actionRef: "Echo", payload: { ok: true } });
  });

  test("bounces ref frames through Dispatch when direct action is absent", () => {
    expect(normalizeDispatchFrame({ ref: "Echo", target: "x" }, true, false)).toEqual({
      actionRef: "Echo",
      target: "x",
      payload: undefined,
      capabilityId: undefined,
    });
  });

  test("returns null when neither dispatch path applies", () => {
    expect(normalizeDispatchFrame({ ref: "Echo" }, false, false)).toBeNull();
  });
});
