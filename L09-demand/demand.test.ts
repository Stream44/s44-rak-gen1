import { describe, test, expect, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import type { KernelExpression, ProjectionAsset } from "../L13-facade/index.ts";
import { DemandEngine, MemoryDataProvider } from "./demand.ts";
import type { ActionType } from "../L07-agency/intent.ts";
import { AssetRegistry } from "../L11-projection/asset-registry.ts";
import { DATA_PROVIDER_M1, validateDataProviderM1 } from "../L08-kinds/data-provider/m1.ts";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeAction(overrides?: Partial<ActionType>): ActionType {
  return {
    id: "action://test/LoadCustomer/1.0",
    name: "LoadCustomer",
    version: "1.0",
    verb: "load",
    targetMachine: "customer-lifecycle",
    inputSchema: {
      type: "object" as const,
      properties: {
        customer: { type: "string" as const, $typeRef: "type://Customer/1.0" },
      },
      required: ["customer"],
    },
    preconditions: [],
    ...overrides,
  };
}

function makeActionNoTypeRef(): ActionType {
  return {
    id: "action://test/SimpleAction/1.0",
    name: "SimpleAction",
    version: "1.0",
    verb: "do",
    targetMachine: "simple-machine",
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string" as const },
      },
      required: ["name"],
    },
    preconditions: [],
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Layer 25: Demand Streams", () => {
  let kernel: AlgebraicKernel;
  let provider: MemoryDataProvider;
  let engine: DemandEngine;

  beforeEach(() => {
    kernel = AlgebraicKernel.create();
    provider = new MemoryDataProvider();
    provider.put("cust-001", { name: "Ada", tier: "gold" });
    provider.put("cust-002", { name: "Bob", tier: "silver" });
    engine = new DemandEngine(kernel, provider);
  });

  // ── MemoryDataProvider ──────────────────────────────────────────────

  describe("MemoryDataProvider", () => {
    test("put + load roundtrip", () => {
      const p = new MemoryDataProvider();
      p.put("key-1", { x: 42 });
      expect(p.load("key-1")).toEqual({ x: 42 });
    });

    test("load missing returns null", () => {
      const p = new MemoryDataProvider();
      expect(p.load("nonexistent")).toBeNull();
    });

    test("loadBatch returns map of found items, skips missing", () => {
      const p = new MemoryDataProvider();
      p.put("a", 1);
      p.put("b", 2);
      const result = p.loadBatch(["a", "b", "c"]);
      expect(result.size).toBe(2);
      expect(result.get("a")).toBe(1);
      expect(result.get("b")).toBe(2);
      expect(result.has("c")).toBe(false);
    });
  });

  // ── survey() ───────────────────────────────────────────────────────

  describe("survey()", () => {
    test("action with $typeRef in inputSchema produces requirement", async () => {
      const action = makeAction();
      const plan = await engine.survey(action, { customer: "cust-001" });
      expect(plan.requirements.length).toBe(1);
      expect(plan.requirements[0]).toEqual({
        typeRef: "type://Customer/1.0",
        key: "cust-001",
        optional: false,
      });
      expect(plan.estimatedCount).toBe(1);
    });

    test("action with no $typeRef fields produces empty plan", async () => {
      const action = makeActionNoTypeRef();
      const plan = await engine.survey(action, { name: "hello" });
      expect(plan.requirements.length).toBe(0);
      expect(plan.estimatedCount).toBe(0);
    });
  });

  // ── assemble() ─────────────────────────────────────────────────────

  describe("assemble()", () => {
    test("all data in provider yields complete context", async () => {
      const action = makeAction();
      const plan = await engine.survey(action, { customer: "cust-001" });
      const ctx = engine.assemble(plan);
      expect(ctx.complete).toBe(true);
      expect(ctx.missing.length).toBe(0);
      expect(ctx.cache.get("cust-001")).toEqual({ name: "Ada", tier: "gold" });
    });

    test("missing data yields incomplete context", async () => {
      const action = makeAction();
      const plan = await engine.survey(action, { customer: "cust-999" });
      const ctx = engine.assemble(plan);
      expect(ctx.complete).toBe(false);
      expect(ctx.missing).toContain("cust-999");
    });

    test("optional requirement missing still yields complete context", async () => {
      const action = makeAction({
        inputSchema: {
          type: "object" as const,
          properties: {
            customer: {
              type: "string" as const,
              $typeRef: "type://Customer/1.0",
              optional: true,
            },
          },
          required: [],
        },
      });
      const plan = await engine.survey(action, { customer: "cust-999" });
      expect(plan.requirements[0].optional).toBe(true);

      const ctx = engine.assemble(plan);
      expect(ctx.complete).toBe(true);
      expect(ctx.missing.length).toBe(0);
      expect(ctx.cache.size).toBe(0);
    });
  });

  // ── execute() ──────────────────────────────────────────────────────

  describe("execute()", () => {
    test("expression using context data returns correct result", () => {
      const ctx = {
        cache: new Map<string, unknown>([["cust-001", { name: "Ada", tier: "gold" }]]),
        missing: [],
        complete: true,
      };

      // Check that the loaded data has the expected "tier" key
      const expr: KernelExpression = {
        op: "call",
        fn: "has",
        args: [
          { op: "var", name: "cust-001" },
          { op: "const", value: "tier" },
        ],
      };

      const result = engine.execute(expr, ctx);
      expect(result).toBe(true);
    });
  });

  // ── run() ──────────────────────────────────────────────────────────

  describe("run()", () => {
    test("end-to-end survey + assemble + execute", async () => {
      const action = makeAction();
      // Check that loaded data has the expected "tier" key
      const expr: KernelExpression = {
        op: "call",
        fn: "has",
        args: [
          { op: "var", name: "cust-001" },
          { op: "const", value: "tier" },
        ],
      };

      const { result, context } = await engine.run(action, { customer: "cust-001" }, expr);
      expect(result).toBe(true);
      expect(context.complete).toBe(true);
    });

    test("run with missing required data yields incomplete context", async () => {
      const action = makeAction();
      // Use an expression that doesn't rely on the missing data
      // (just a constant) so the expression itself doesn't fail
      const expr: KernelExpression = { op: "const", value: "fallback" };

      const { result, context } = await engine.run(action, { customer: "cust-999" }, expr);
      expect(context.complete).toBe(false);
      expect(context.missing).toContain("cust-999");
      expect(result).toBe("fallback");
    });
  });

  describe("DataProvider via AssetRegistry", () => {
    test("registry-resolved path works", async () => {
      const registry = new AssetRegistry();
      const asset = Bun.YAML.parse(
        readFileSync(
          new URL("../L08-kinds/data-provider/MemoryDataProvider.asset.yaml", import.meta.url),
          "utf-8",
        ),
      ) as ProjectionAsset;
      registry.register({ ...asset, cid: "bafydata-provider-memory" });

      const viaRef = await DemandEngine.createFromRef(kernel, {
        providerRef: "MemoryDataProvider/1.0",
        registry,
      });
      (viaRef as unknown as { provider: MemoryDataProvider }).provider.put("cust-003", {
        name: "Cy",
        tier: "bronze",
      });

      const plan = await viaRef.survey(makeAction(), { customer: "cust-003" });
      const context = viaRef.assemble(plan);
      expect(context.complete).toBe(true);
      expect(context.cache.get("cust-003")).toEqual({ name: "Cy", tier: "bronze" });
    });

    test("unknown ref throws with clear message", async () => {
      await expect(
        DemandEngine.createFromRef(kernel, {
          providerRef: "Nonexistent/1.0",
          registry: new AssetRegistry(),
        }),
      ).rejects.toThrow(
        'DataProvider asset not found for ref "Nonexistent/1.0" and kind "data-provider"',
      );
    });

    test("M1 validator accepts the shipped M1", () => {
      expect(() => validateDataProviderM1(DATA_PROVIDER_M1)).not.toThrow();
    });

    test("M2 schema rejects malformed M1", () => {
      const malformed = { ...DATA_PROVIDER_M1, schema: { ...DATA_PROVIDER_M1.schema } };
      delete (malformed.schema as { methods?: unknown }).methods;
      expect(() => validateDataProviderM1(malformed)).toThrow(
        `${DATA_PROVIDER_M1.id}: missing methods`,
      );
    });
  });
});
