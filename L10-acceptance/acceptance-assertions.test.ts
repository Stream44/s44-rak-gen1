import { describe, expect, test } from "bun:test";
import { deepEqual, type Scenario } from "./acceptance.ts";
import { getAcceptanceMorphismKernel } from "./m1.ts";
import { AcceptanceEngine } from "./acceptance.ts";
import { bootTestApp, buildSuite } from "./test-support.ts";

describe("deepEqual", () => {
  test("primitives", () => {
    expect(deepEqual(1, 1)).toBe(true);
    expect(deepEqual("a", "a")).toBe(true);
    expect(deepEqual(null, null)).toBe(true);
    expect(deepEqual(1, 2)).toBe(false);
  });

  test("objects with same keys", () => {
    expect(deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
  });

  test("nested objects", () => {
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 1 } })).toBe(true);
    expect(deepEqual({ a: { b: 1 } }, { a: { b: 2 } })).toBe(false);
  });

  test("arrays", () => {
    expect(deepEqual([1, 2, 3], [1, 2, 3])).toBe(true);
    expect(deepEqual([1, 2], [1, 2, 3])).toBe(false);
  });
});

describe("evaluatePredicate", () => {
  const evaluatePredicateViaMorphism = async (
    expression: string,
    context: Record<string, unknown>,
  ): Promise<boolean> =>
    (
      (await getAcceptanceMorphismKernel().morphisms.evaluate(
        "morphism://adk/evaluatePredicate/1.0",
        { expression, context },
      )) as { passed: boolean }
    ).passed;

  test("supports equality", async () => {
    expect(
      await evaluatePredicateViaMorphism("state.status == 'confirmed'", {
        state: { status: "confirmed" },
      }),
    ).toBe(true);
  });

  test("supports inequality", async () => {
    expect(
      await evaluatePredicateViaMorphism("state.status != 'cancelled'", {
        state: { status: "confirmed" },
      }),
    ).toBe(true);
  });

  test("supports greater-than and greater-than-or-equal", async () => {
    expect(await evaluatePredicateViaMorphism("state.amount > 2", { state: { amount: 3 } })).toBe(
      true,
    );
    expect(await evaluatePredicateViaMorphism("state.amount >= 3", { state: { amount: 3 } })).toBe(
      true,
    );
  });

  test("supports membership checks", async () => {
    expect(
      await evaluatePredicateViaMorphism("state.status in ['pending', 'confirmed']", {
        state: { status: "pending" },
      }),
    ).toBe(true);
  });

  test("supports and/or composition", async () => {
    expect(
      await evaluatePredicateViaMorphism(
        "state.status == 'confirmed' and state.amount >= 10 or state.vip == true",
        {
          state: { status: "confirmed", amount: 10, vip: false },
        },
      ),
    ).toBe(true);
  });

  test("supports deep path lookup", async () => {
    expect(
      await evaluatePredicateViaMorphism("instance.state.customer.tier == 'gold'", {
        instance: { state: { customer: { tier: "gold" } } },
      }),
    ).toBe(true);
  });

  test("is undefined/null safe", async () => {
    expect(
      await evaluatePredicateViaMorphism("state.customer.name == 'alice'", {
        state: { customer: null },
      }),
    ).toBe(false);
    expect(
      await evaluatePredicateViaMorphism("not state.customer.name == 'alice'", {
        state: { customer: null },
      }),
    ).toBe(true);
  });

  test("surfaces parse errors", async () => {
    await expect(
      evaluatePredicateViaMorphism("state.status == ", { state: { status: "confirmed" } }),
    ).rejects.toThrow("Unexpected token");
  });
});

describe("assertions", () => {
  test("state-equals passes when state matches", async () => {
    const engine = new AcceptanceEngine(bootTestApp());
    engine.setSuite(
      buildSuite([
        {
          id: "s",
          name: "s",
          seedKeys: ["ord-001"],
          root: {
            id: "confirm",
            personaId: "alice",
            verb: "confirm",
            targetKey: "ord-001",
            assertions: [
              { kind: "state-equals", targetKey: "ord-001", expected: { status: "confirmed" } },
            ],
          },
        },
      ]),
    );
    const res = await engine.run();
    expect(res.passed).toBe(true);
  });

  test("state-equals fails when state differs", async () => {
    const engine = new AcceptanceEngine(bootTestApp());
    engine.setSuite(
      buildSuite([
        {
          id: "s",
          name: "s",
          seedKeys: ["ord-001"],
          root: {
            id: "confirm",
            personaId: "alice",
            verb: "confirm",
            targetKey: "ord-001",
            assertions: [
              { kind: "state-equals", targetKey: "ord-001", expected: { status: "paid" } },
            ],
          },
        },
      ]),
    );
    const res = await engine.run();
    expect(res.passed).toBe(false);
    const step = res.useCases[0].scenarios[0].traces[0].steps[0];
    expect(step.assertions[0].passed).toBe(false);
  });

  test("state-field-match with multiple fields", async () => {
    const engine = new AcceptanceEngine(bootTestApp());
    engine.setSuite(
      buildSuite([
        {
          id: "s",
          name: "s",
          seedKeys: ["ord-001"],
          root: {
            id: "confirm",
            personaId: "alice",
            verb: "confirm",
            targetKey: "ord-001",
            assertions: [
              { kind: "state-field-match", targetKey: "ord-001", fields: { status: "confirmed" } },
            ],
          },
        },
      ]),
    );
    const res = await engine.run();
    expect(res.passed).toBe(true);
  });

  test("event-emitted after successful step", async () => {
    const engine = new AcceptanceEngine(bootTestApp());
    engine.setSuite(
      buildSuite([
        {
          id: "s",
          name: "s",
          seedKeys: ["ord-001"],
          root: {
            id: "confirm",
            personaId: "alice",
            verb: "confirm",
            targetKey: "ord-001",
            assertions: [
              {
                kind: "event-emitted",
                targetKey: "ord-001",
                newStateFields: { status: "confirmed" },
              },
            ],
          },
        },
      ]),
    );
    const res = await engine.run();
    expect(res.passed).toBe(true);
  });

  test("error-expected with messageContains matches the transition error", async () => {
    const engine = new AcceptanceEngine(bootTestApp());
    engine.setSuite(
      buildSuite([
        {
          id: "s",
          name: "s",
          seedKeys: ["ord-001"],
          root: {
            id: "ship-pending",
            personaId: "admin",
            verb: "ship",
            targetKey: "ord-001",
            expectSuccess: false,
            assertions: [{ kind: "error-expected", messageContains: "transition" }],
          },
        },
      ]),
    );
    const res = await engine.run();
    expect(res.passed).toBe(true);
  });
});
