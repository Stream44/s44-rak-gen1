import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { createMetaProjectionKernel } from "../bootstrap.ts";
import {
  compileMorphism,
  compose,
  cond,
  evaluateMorphism,
  extend,
  fmap,
  guard,
  iter,
  literal,
  product,
  ref,
  restrict,
  sum,
} from "../algebra.ts";
import type { FmapNode, InterpreterContext, MorphismAST, RestrictNode } from "../algebra.ts";

const KERNEL_MODEL_PATH = resolve(import.meta.dir, "..", "..", "L00-model", "kernel.model.yaml");

function makeCtx(overrides: Partial<InterpreterContext> = {}): InterpreterContext {
  return {
    bindings: new Map<string, unknown>([["seed", { id: "seed-1" }]]),
    props: { seed: { id: "seed-1" }, items: [{ id: "a" }, { id: "b" }, { id: "c" }] },
    route: { path: "/orders/42", params: { orderId: "42" }, query: { view: "full" } },
    currentUser: { id: "user-1", capabilities: {} },
    ...overrides,
  };
}

describe("projection algebra", () => {
  test("ref constructor + compile round-trip preserves asset and props", () => {
    const constructed = ref("asset://demo/button", { label: "Hello" });
    const compiled = compileMorphism({
      op: "ref",
      asset: "asset://demo/button",
      props: { label: "Hello" },
    });

    expect(constructed.asset).toBe("asset://demo/button");
    expect(compiled).toEqual(constructed);
    expect(evaluateMorphism(compiled, makeCtx())).toEqual({
      kind: "ref",
      asset: "asset://demo/button",
      props: { label: "Hello" },
    });
  });

  test("ref compile rejects missing asset", () => {
    expect(() => compileMorphism({ op: "ref" })).toThrow(/\.asset/);
  });

  test("compose substitutes inner tree into outer props and bindings", () => {
    const ast = compose(
      cond(
        { eq: ["$bind.inner.asset", "asset://inner"] },
        literal("binding-hit"),
        literal("binding-miss"),
      ),
      ref("asset://inner", { x: 1 }),
    );

    expect(evaluateMorphism(ast, makeCtx())).toBe("binding-hit");
  });

  test("compose compile rejects missing inner", () => {
    expect(() =>
      compileMorphism({
        op: "compose",
        outer: { op: "literal", value: "x" },
      }),
    ).toThrow(/\.inner/);
  });

  test("product evaluates both branches", () => {
    const ast = product(literal("left"), literal("right"));

    expect(evaluateMorphism(ast, makeCtx())).toEqual({
      kind: "product",
      left: "left",
      right: "right",
    });
  });

  test("product compile rejects missing right", () => {
    expect(() =>
      compileMorphism({
        op: "product",
        left: { op: "literal", value: 1 },
      }),
    ).toThrow(/\.right/);
  });

  test("sum truthy predicate picks then branch", () => {
    const ast = sum({ eq: ["$route.orderId", "42"] }, literal("then"), literal("else"));
    expect(evaluateMorphism(ast, makeCtx())).toBe("then");
  });

  test("sum false predicate picks else branch", () => {
    const ast = sum({ gt: ["oops", 1] }, literal("then"), literal("else"));
    expect(evaluateMorphism(ast, makeCtx())).toBe("else");
  });

  test("restrict truthy predicate returns main branch", () => {
    const ast = restrict(
      { eq: ["$route.query.view", "full"] },
      literal("allowed"),
      literal("denied"),
    );
    expect(evaluateMorphism(ast, makeCtx())).toBe("allowed");
  });

  test("restrict deny returns fallback", () => {
    const ast = restrict(
      { eq: ["$route.query.view", "compact"] },
      literal("allowed"),
      literal("denied"),
    );
    expect(evaluateMorphism(ast, makeCtx())).toBe("denied");
  });

  test("extend uses resolveDemand result under source.name", () => {
    const ast = extend(
      { name: "order", spec: { demand: "Order", key: "42" } },
      cond({ eq: ["$bind.order.id", "42"] }, literal("matched"), literal("missed")),
    );

    const result = evaluateMorphism(
      ast,
      makeCtx({
        resolveDemand: () => ({ id: "42" }),
      }),
    );

    expect(result).toBe("matched");
  });

  test("extend falls back to BindingResolver when no resolveDemand exists", () => {
    const ast = extend(
      { name: "order", spec: "$props.seed" },
      cond({ eq: ["$bind.order.id", "seed-1"] }, literal("from-binding"), literal("missed")),
    );

    expect(evaluateMorphism(ast, makeCtx())).toBe("from-binding");
  });

  test("fmap populates $source for the inner morphism", () => {
    const ast = fmap(
      { demand: "Synthetic" },
      cond({ eq: ["$bind.source.id", "mapped-1"] }, literal("mapped"), literal("missed")),
    );

    const result = evaluateMorphism(
      ast,
      makeCtx({
        resolveDemand: () => ({ id: "mapped-1" }),
      }),
    );

    expect(result).toBe("mapped");
  });

  test("fmap compile rejects missing binding", () => {
    expect(() =>
      compileMorphism({
        op: "fmap",
        f: { op: "literal", value: "x" },
      }),
    ).toThrow(/\.binding/);
  });

  test("iter maps over array values", () => {
    const ast = iter(
      "$props.items",
      cond({ eq: ["$item.id", "b"] }, literal("middle"), literal("other")),
    );

    expect(evaluateMorphism(ast, makeCtx())).toEqual(["other", "middle", "other"]);
  });

  test("iter returns [] for non-array input", () => {
    const ast = iter("$route.orderId", literal("ignored"));
    expect(evaluateMorphism(ast, makeCtx())).toEqual([]);
  });

  test("iter emptyFallback renders the fallback node exactly for empty arrays", () => {
    const ast = compileMorphism({
      op: "iter",
      for: "$props.emptyItems",
      as: "item",
      body: { op: "literal", value: "row" },
      emptyFallback: {
        op: "literal",
        value: { kind: "EmptyState", message: "No morphisms registered." },
      },
    });

    expect(
      evaluateMorphism(
        ast,
        makeCtx({
          props: { ...makeCtx().props, emptyItems: [] },
        }),
      ),
    ).toEqual({ kind: "EmptyState", message: "No morphisms registered." });
  });

  test("iter with emptyFallback still renders per-item output for non-empty arrays", () => {
    const ast = compileMorphism({
      op: "iter",
      for: "$props.items",
      as: "item",
      template: {
        op: "cond",
        if: { eq: ["$item.id", "b"] },
        then: { op: "literal", value: "middle" },
        else: { op: "literal", value: "other" },
      },
      emptyFallback: { op: "literal", value: "should-not-run" },
    });

    expect(evaluateMorphism(ast, makeCtx())).toEqual(["other", "middle", "other"]);
  });

  test("iter without emptyFallback keeps empty-array backward compatibility", () => {
    const ast = compileMorphism({
      op: "iter",
      for: "$props.emptyItems",
      template: { op: "literal", value: "row" },
    });

    expect(
      evaluateMorphism(
        ast,
        makeCtx({
          props: { ...makeCtx().props, emptyItems: [] },
        }),
      ),
    ).toEqual([]);
  });

  test("iter emptyFallback resolves $ctx and $bind selectors", () => {
    const ast = compileMorphism({
      op: "iter",
      for: "$props.emptyItems",
      template: { op: "literal", value: "row" },
      emptyFallback: {
        op: "cond",
        if: { eq: ["$ctx.emptyMessage", "No items"] },
        then: {
          op: "cond",
          if: { eq: ["$bind.seed.id", "seed-1"] },
          then: { op: "literal", value: "resolved-fallback" },
          else: { op: "literal", value: "bind-miss" },
        },
        else: { op: "literal", value: "ctx-miss" },
      },
    });

    expect(
      evaluateMorphism(
        ast,
        makeCtx({
          props: {
            ...makeCtx().props,
            emptyItems: [],
            __pp09ContextStack: [{ scope: "page", values: { emptyMessage: "No items" } }],
          },
        }),
      ),
    ).toBe("resolved-fallback");
  });

  test("cond branches between then and else", () => {
    const yes = evaluateMorphism(
      cond({ eq: ["$route.query.view", "full"] }, literal("yes"), literal("no")),
      makeCtx(),
    );
    const no = evaluateMorphism(
      cond({ eq: ["$route.query.view", "compact"] }, literal("yes"), literal("no")),
      makeCtx(),
    );

    expect(yes).toBe("yes");
    expect(no).toBe("no");
  });

  test("cond without else returns null on false", () => {
    const ast = cond({ eq: ["$route.query.view", "compact"] }, literal("yes"));
    expect(evaluateMorphism(ast, makeCtx())).toBeNull();
  });

  test("literal passes through the raw value", () => {
    const value = { nested: ["a", 2, true] };
    expect(evaluateMorphism(literal(value), makeCtx())).toEqual(value);
  });

  test("literal compile rejects missing value", () => {
    expect(() => compileMorphism({ op: "literal" })).toThrow(/\.value/);
  });

  test("guard allows, falls back, and returns null when capability is missing", () => {
    const held = evaluateMorphism(
      guard(["cap://x/1.0"], literal("ok"), { fallback: literal("nope") }),
      makeCtx({
        capabilityGate: (requires) => requires?.[0] === "cap://x/1.0",
      }),
    );
    const denied = evaluateMorphism(
      guard(["cap://x/1.0"], literal("ok"), { fallback: literal("nope") }),
      makeCtx({
        capabilityGate: () => false,
      }),
    );
    const deniedNoFallback = evaluateMorphism(
      guard(["cap://x/1.0"], literal("ok")),
      makeCtx({
        capabilityGate: () => false,
      }),
    );

    expect(held).toBe("ok");
    expect(denied).toBe("nope");
    expect(deniedNoFallback).toBeNull();
  });

  test("guard compile desugars into restrict with _derivedFromGuard annotation", () => {
    const ast = compileMorphism({
      op: "guard",
      requires: ["cap://x/1.0"],
      f: { op: "ref", asset: "a" },
    }) as RestrictNode;

    expect(ast.op).toBe("restrict");
    expect(ast._derivedFromGuard?.requires).toContain("cap://x/1.0");
    expect(ast.predicate).toEqual({
      $capabilityCheck: { requires: ["cap://x/1.0"], requiresAny: undefined },
    });
  });

  test("compiled guard is observationally equivalent to a manual restrict sentinel", () => {
    const capabilityGate = (requires?: string[], requiresAny?: string[]) =>
      requires?.[0] === "cap://allow/1.0" || requiresAny?.includes("cap://allow/1.0") === true;
    const compiled = compileMorphism({
      op: "guard",
      requires: ["cap://allow/1.0"],
      f: { op: "literal", value: "granted" },
      fallback: { op: "literal", value: "denied" },
    });
    const manual: MorphismAST = restrict(
      { $capabilityCheck: { requires: ["cap://allow/1.0"] } },
      literal("granted"),
      literal("denied"),
    );

    expect(evaluateMorphism(compiled, makeCtx({ capabilityGate }))).toBe(
      evaluateMorphism(manual, makeCtx({ capabilityGate })),
    );
  });

  test("single-entry projections sugar desugars to one fmap + guard pair", () => {
    const compiled = compileMorphism({
      source: { pii: { email: "ada@example.com" } },
      projections: [
        {
          path: "pii.email",
          requires: ["cap://pii/view/1.0"],
          fallback: "(redacted)",
        },
      ],
    });

    expect(compiled).toEqual({
      op: "fmap",
      binding: {
        $projectionSource: { pii: { email: "ada@example.com" } },
        $projectionPath: ["pii", "email"],
      },
      f: {
        op: "restrict",
        predicate: {
          $capabilityCheck: { requires: ["cap://pii/view/1.0"], requiresAny: undefined },
        },
        f: { op: "literal", value: { $projectedSource: true } },
        fallback: { op: "literal", value: "(redacted)" },
        _derivedFromGuard: { requires: ["cap://pii/view/1.0"], requiresAny: undefined },
        _derivedFromProjections: true,
      },
      _derivedFromProjections: true,
    } satisfies FmapNode);
  });

  test("multi-entry projections sugar nests the fmap chain in YAML order", () => {
    const compiled = compileMorphism({
      source: { pii: { email: "ada@example.com" } },
      projections: [
        { path: "pii", requires: ["cap://pii/view/1.0"] },
        { path: "email", requires: ["cap://pii/email/view/1.0"], fallback: "(redacted)" },
      ],
    });

    expect(compiled).toEqual({
      op: "fmap",
      binding: {
        $projectionSource: { pii: { email: "ada@example.com" } },
        $projectionPath: ["pii"],
      },
      f: {
        op: "restrict",
        predicate: {
          $capabilityCheck: { requires: ["cap://pii/view/1.0"], requiresAny: undefined },
        },
        f: {
          op: "fmap",
          binding: {
            $projectionSource: "$bind.source",
            $projectionPath: ["email"],
          },
          f: {
            op: "restrict",
            predicate: {
              $capabilityCheck: {
                requires: ["cap://pii/email/view/1.0"],
                requiresAny: undefined,
              },
            },
            f: { op: "literal", value: { $projectedSource: true } },
            fallback: { op: "literal", value: "(redacted)" },
            _derivedFromGuard: {
              requires: ["cap://pii/email/view/1.0"],
              requiresAny: undefined,
            },
            _derivedFromProjections: true,
          },
          _derivedFromProjections: true,
        },
        fallback: { op: "literal", value: null },
        _derivedFromGuard: { requires: ["cap://pii/view/1.0"], requiresAny: undefined },
        _derivedFromProjections: true,
      },
      _derivedFromProjections: true,
    } satisfies FmapNode);
  });

  test("projections sugar returns the original value when capabilities are held", () => {
    const compiled = compileMorphism({
      source: { pii: { email: "ada@example.com" } },
      projections: [
        {
          path: "pii.email",
          requires: ["cap://pii/view/1.0"],
          fallback: "(redacted)",
        },
      ],
    });

    expect(
      evaluateMorphism(
        compiled,
        makeCtx({
          capabilityGate: (requires) => requires?.includes("cap://pii/view/1.0") === true,
        }),
      ),
    ).toBe("ada@example.com");
  });

  test("projections sugar returns the fallback when capabilities are absent", () => {
    const compiled = compileMorphism({
      source: { pii: { email: "ada@example.com" } },
      projections: [
        {
          path: "pii.email",
          requires: ["cap://pii/view/1.0"],
          fallback: "(redacted)",
        },
      ],
    });

    expect(
      evaluateMorphism(
        compiled,
        makeCtx({
          capabilityGate: () => false,
        }),
      ),
    ).toBe("(redacted)");
  });

  test("whole-binding requires wraps the projections chain with an outer guard", () => {
    const compiled = compileMorphism({
      source: { pii: { email: "ada@example.com" } },
      requires: ["cap://binding/view/1.0"],
      projections: [
        {
          path: "pii.email",
          requires: ["cap://pii/view/1.0"],
          fallback: "(redacted)",
        },
      ],
    }) as RestrictNode;

    expect(compiled.op).toBe("restrict");
    expect(compiled._derivedFromProjections).toBe(true);
    expect((compiled.f as FmapNode)._derivedFromProjections).toBe(true);
  });

  test("surveyCapabilities enumerates each projections requires entry once", async () => {
    const projector = await createMetaProjectionKernel(null, { yamlPath: KERNEL_MODEL_PATH });
    projector.loadDocument({
      projector: "projection-caps",
      version: "1.0.0",
      session: { scope: "projection-caps" },
      bindsModel: "",
      conformsToKind: "ui.html.ws",
      pages: {
        home: {
          bind: {
            customerEmail: {
              source: { pii: { email: "ada@example.com" } },
              projections: [
                {
                  path: "pii.email",
                  requires: ["cap://pii/view/1.0"],
                  fallback: "(redacted)",
                },
              ],
            },
          },
        },
      },
    });

    expect(await projector.surveyCapabilities()).toEqual([
      {
        scope: "binding",
        nodePath: "pages.home.bind.customerEmail.projections[0]",
        caps: ["cap://pii/view/1.0"],
        combinator: "all",
      },
    ]);
  });

  test("compileMorphism rejects unknown operators with a path hint", () => {
    expect(() => compileMorphism({ op: "mystery" })).toThrow(/\$.*mystery/);
  });
});
