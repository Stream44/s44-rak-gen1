import { describe, expect, test } from "bun:test";

import { compileMorphism, evaluateMorphism } from "../algebra.ts";
import type { InterpreterContext } from "../algebra.ts";
import { BindingResolver } from "../bindings.ts";
import { makeCapabilityGate } from "../capability-enforcement.ts";
import type { RenderContext } from "../../L01-foundation/projection-types.ts";

function makeRenderContext(overrides: Partial<RenderContext> = {}): RenderContext {
  return {
    pageName: "orders",
    route: { path: "/orders/ord-9", params: { id: "ord-9" }, query: {} },
    currentUser: { id: "user-1", capabilities: {} },
    bindings: new Map<string, unknown>([["order", { id: "ord-9", status: "pending" }]]),
    props: {},
    nodeIdCounter: { n: 0 },
    session: undefined,
    ...overrides,
  };
}

function makeInterpreterContext(overrides: Partial<InterpreterContext> = {}): InterpreterContext {
  return {
    bindings: new Map<string, unknown>(),
    props: {},
    route: { path: "/orders/ord-9", params: { id: "ord-9" }, query: {} },
    currentUser: { id: "user-1", capabilities: {} },
    ...overrides,
  };
}

describe("binding resolver capability lookups", () => {
  test("$capability.Verb returns the CID when held", () => {
    const resolver = new BindingResolver(
      makeRenderContext({
        currentUser: {
          id: "user-1",
          capabilities: { ConfirmOrder: "cid-abc" },
        },
      }),
    );

    expect(resolver.resolve("$capability.ConfirmOrder")).toBe("cid-abc");
  });

  test("$capability.Verb returns undefined when absent", () => {
    const resolver = new BindingResolver(makeRenderContext());

    expect(resolver.resolve("$capability.ConfirmOrder")).toBeUndefined();
  });

  test("{ capability: ... } returns the CID when held", () => {
    const resolver = new BindingResolver(
      makeRenderContext({
        currentUser: {
          id: "user-1",
          capabilities: { "cap://pii/view/1.0": "cid-pii" },
        },
      }),
    );

    expect(resolver.resolve({ capability: "cap://pii/view/1.0" })).toBe("cid-pii");
  });

  test("{ capability: ... } returns undefined when absent", () => {
    const resolver = new BindingResolver(makeRenderContext());

    expect(resolver.resolve({ capability: "cap://pii/view/1.0" })).toBeUndefined();
  });
});

describe("fmap + guard redaction", () => {
  test("fmap + guard allow returns the show branch", () => {
    const ast = compileMorphism({
      op: "fmap",
      binding: { demand: "Order", key: "$route.id" },
      f: {
        op: "guard",
        requires: ["cap://orders/view/1.0"],
        f: { op: "ref", asset: "show" },
        fallback: { op: "ref", asset: "redacted" },
      },
    });

    const result = evaluateMorphism(
      ast,
      makeInterpreterContext({
        capabilityGate: () => true,
        resolveDemand: () => ({ id: "ord-9" }),
      }),
    );

    expect(result).toEqual({ kind: "ref", asset: "show", props: undefined });
  });

  test("fmap + guard deny returns the redacted fallback", () => {
    const ast = compileMorphism({
      op: "fmap",
      binding: { demand: "Order", key: "$route.id" },
      f: {
        op: "guard",
        requires: ["cap://orders/view/1.0"],
        f: { op: "ref", asset: "show" },
        fallback: { op: "ref", asset: "redacted" },
      },
    });

    const result = evaluateMorphism(
      ast,
      makeInterpreterContext({
        capabilityGate: () => false,
        resolveDemand: () => ({ id: "ord-9" }),
      }),
    );

    expect(result).toEqual({ kind: "ref", asset: "redacted", props: undefined });
  });

  test("fmap + guard with makeCapabilityGate round-trips through authorizeRequirements", () => {
    const calls: Array<{ resourceId: string; capabilityId: string; subjectId: string }> = [];
    const ast = compileMorphism({
      op: "fmap",
      binding: { demand: "Order", key: "$route.id" },
      f: {
        op: "guard",
        requires: ["cap://orders/view/1.0"],
        f: { op: "ref", asset: "show" },
        fallback: { op: "ref", asset: "redacted" },
      },
    });

    const capabilityGate = makeCapabilityGate(
      {
        currentUser: {
          id: "user-1",
          capabilities: { "cap://orders/view/1.0": "cid-orders-view" },
        },
      },
      {
        authorizeResource(capabilityId, resourceId, subject) {
          calls.push({ capabilityId, resourceId, subjectId: subject.id });
          return { authorized: true };
        },
      },
    );

    const result = evaluateMorphism(
      ast,
      makeInterpreterContext({
        currentUser: {
          id: "user-1",
          capabilities: { "cap://orders/view/1.0": "cid-orders-view" },
        },
        capabilityGate,
        resolveDemand: () => ({ id: "ord-9" }),
      }),
    );

    expect(result).toEqual({ kind: "ref", asset: "show", props: undefined });
    expect(calls).toEqual([
      {
        capabilityId: "cid-orders-view",
        resourceId: "cap://orders/view/1.0",
        subjectId: "user-1",
      },
    ]);
  });

  test("fmap + guard integration deny resolves the whole binding to fallback literal null", () => {
    const ast = compileMorphism({
      op: "fmap",
      binding: { demand: "Order", key: "$route.id" },
      f: {
        op: "guard",
        requires: ["cap://orders/view/1.0"],
        f: { op: "ref", asset: "a" },
        fallback: { op: "literal", value: null },
      },
    });

    const result = evaluateMorphism(
      ast,
      makeInterpreterContext({
        capabilityGate: () => false,
        resolveDemand: () => ({ id: "ord-9" }),
      }),
    );

    expect(result).toBeNull();
  });
});
