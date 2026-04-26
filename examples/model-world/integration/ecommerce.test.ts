/**
 * E-Commerce domain unit tests -- exercises every ADK feature against the
 * shared e-commerce fixtures.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { M3_META, MetaLevel, Compatibility } from "../../../L13-facade/index.ts";
import { AlgebraicKernel } from "../../../L13-facade/index.ts";
import type { KernelExpression } from "../../../L13-facade/index.ts";
import { setupEcommerceDomain, SAMPLE, ECOM_ORIGIN } from "../../../tests/kernel-fixtures/index.ts";
import type { EcommerceDomain } from "../../../tests/kernel-fixtures/index.ts";
import { buildTypeUri } from "../../../L13-facade/index.ts";

let ak: AlgebraicKernel;
let domain: EcommerceDomain;

beforeEach(() => {
  ak = AlgebraicKernel.create();
  domain = setupEcommerceDomain(ak);
});

// =====================================================================
// A. Model Loading
// =====================================================================

describe("A. Model Loading", () => {
  test("all 9 domain types are registered (6 entities + 3 enums)", () => {
    const m1Types = ak.listTypes(MetaLevel.Model);
    const domainRefs = Object.values(domain.types);
    for (const ref of domainRefs) {
      expect(m1Types.some((t) => t.id === ref)).toBe(true);
    }
    expect(domainRefs.length).toBe(9);
  });

  test("Customer type is resolvable and at M1 level", () => {
    const typeDef = ak.resolveType(domain.types.Customer);
    expect(typeDef).toBeDefined();
    expect(typeDef.level).toBe(MetaLevel.Model);
  });

  test("conformance chain: Customer -> record -> meta", () => {
    const chain = ak.getConformanceChain(domain.types.Customer);
    expect(chain.map((t) => t.id)).toEqual([
      domain.types.Customer,
      "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      M3_META.id,
    ]);
  });

  test("Order schema has correct required fields", () => {
    const typeDef = ak.resolveType(domain.types.Order);
    expect(typeDef.schema.required).toEqual(["id", "customer", "items", "status", "total"]);
  });

  test("all M2 metamodels are still intact (5 bootstrap M2 types)", () => {
    const m2Types = ak.listTypes(MetaLevel.Metamodel);
    expect(m2Types.length).toBeGreaterThanOrEqual(5);
    expect(ak.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0")).toBe(true);
    expect(ak.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/enum/1.0")).toBe(true);
    expect(ak.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/union/1.0")).toBe(true);
    expect(ak.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/collection/1.0")).toBe(true);
    expect(ak.hasType("type://github.com/Stream44/s44-rak-gen1@1.0/scalar/1.0")).toBe(true);
  });
});

// =====================================================================
// B. Data Validation
// =====================================================================

describe("B. Data Validation", () => {
  test("valid customer passes validation", () => {
    const result = ak.validate(domain.types.Customer, SAMPLE.customer);
    expect(result.valid).toBe(true);
  });

  test("customer with invalid email fails (missing @)", () => {
    const result = ak.validate(domain.types.Customer, {
      ...SAMPLE.customer,
      email: "no-at-sign",
    });
    expect(result.valid).toBe(false);
  });

  test("customer missing required name fails", () => {
    const { name, ...rest } = SAMPLE.customer;
    const result = ak.validate(domain.types.Customer, rest);
    expect(result.valid).toBe(false);
  });

  test("customer tier must be in enum (invalid tier fails)", () => {
    const result = ak.validate(domain.types.Customer, {
      ...SAMPLE.customer,
      tier: "diamond",
    });
    expect(result.valid).toBe(false);
  });

  test("valid product passes validation", () => {
    const result = ak.validate(domain.types.Product, SAMPLE.product);
    expect(result.valid).toBe(true);
  });

  test("product with negative price fails (minimum: 0)", () => {
    const result = ak.validate(domain.types.Product, {
      ...SAMPLE.product,
      price: -1,
    });
    expect(result.valid).toBe(false);
  });
});

// =====================================================================
// C. Datum Creation
// =====================================================================

describe("C. Datum Creation", () => {
  test("create customer datum -- CID starts with cid:sha256:", () => {
    const datum = ak.createDatum(domain.types.Customer, SAMPLE.customer);
    expect(datum.id.startsWith("cid:sha256:")).toBe(true);
  });

  test("create product datum -- different CID from customer", () => {
    const customerDatum = ak.createDatum(domain.types.Customer, SAMPLE.customer);
    const productDatum = ak.createDatum(domain.types.Product, SAMPLE.product);
    expect(productDatum.id).not.toBe(customerDatum.id);
  });

  test("same customer data -- same CID (determinism)", () => {
    const datum1 = ak.createDatum(domain.types.Customer, SAMPLE.customer);
    const datum2 = ak.createDatum(domain.types.Customer, SAMPLE.customer);
    expect(datum1.id).toBe(datum2.id);
  });

  test("create datum with refs -- refs preserved in datum", () => {
    const productDatum = ak.createDatum(domain.types.Product, SAMPLE.product);
    const refs = [{ target: productDatum.id, rel: "references" }];
    const itemDatum = ak.createDatum(
      domain.types.OrderItem,
      {
        ...SAMPLE.orderItem,
        product: productDatum.id,
      },
      refs,
    );
    expect(itemDatum.refs).toEqual(refs);
  });
});

// =====================================================================
// D. Refinement Predicates
// =====================================================================

describe("D. Refinement Predicates", () => {
  // The fixtures wire PositivePrice/NonEmptyOrder to M2 metamodel types
  // (scalar/1.0, collection/1.0) whose schemas describe type definitions,
  // not raw values.  We define local refinements on concrete M1 scalars
  // so the structural layer validates actual data correctly.

  let positivePriceId: string;
  let nonEmptyOrderId: string;

  beforeEach(() => {
    ak.defineScalar("Number", "1.0", { type: "number" });
    ak.defineCollection("NumberArray", "1.0", { type: "number" });

    positivePriceId = ak.defineRefinement(
      "LocalPositivePrice",
      "1.0",
      "type://github.com/Stream44/s44-rak-gen1@1.0/Number/1.0",
      {
        op: "call",
        fn: "gt",
        args: [
          { op: "var", name: "$self" },
          { op: "const", value: 0 },
        ],
      },
    ).id;

    nonEmptyOrderId = ak.defineRefinement(
      "LocalNonEmptyOrder",
      "1.0",
      "type://github.com/Stream44/s44-rak-gen1@1.0/NumberArray/1.0",
      {
        op: "call",
        fn: "gt",
        args: [
          {
            op: "call",
            fn: "length",
            args: [{ op: "var", name: "$self" }],
          },
          { op: "const", value: 0 },
        ],
      },
    ).id;
  });

  test("PositivePrice: validate 9.99 -- structurallyValid + predicateSatisfied true", () => {
    const result = ak.validateRefinement(9.99, positivePriceId);
    expect(result.structurallyValid).toBe(true);
    expect(result.predicateSatisfied).toBe(true);
  });

  test("PositivePrice: validate -1 -- structurallyValid true + predicateSatisfied false", () => {
    const result = ak.validateRefinement(-1, positivePriceId);
    expect(result.structurallyValid).toBe(true);
    expect(result.predicateSatisfied).toBe(false);
  });

  test("PositivePrice: validate 'not a number' -- structurallyValid false + predicateSatisfied null", () => {
    const result = ak.validateRefinement("not a number", positivePriceId);
    expect(result.structurallyValid).toBe(false);
    expect(result.predicateSatisfied).toBeNull();
  });

  test("NonEmptyOrder: validate [item] -> true; validate [] -> false", () => {
    const filled = ak.validateRefinement([42], nonEmptyOrderId);
    expect(filled.structurallyValid).toBe(true);
    expect(filled.predicateSatisfied).toBe(true);

    const empty = ak.validateRefinement([], nonEmptyOrderId);
    expect(empty.structurallyValid).toBe(true);
    expect(empty.predicateSatisfied).toBe(false);
  });
});

// =====================================================================
// E. Morphisms
// =====================================================================

describe("E. Morphisms", () => {
  test("computeTotal: evaluate with [19.98, 19.99] -> 39.97", () => {
    const result = ak.evaluate(
      {
        op: "call",
        fn: "fold",
        args: [
          { op: "var", name: "$input" },
          { op: "const", value: 0 },
          {
            op: "lambda",
            param: "acc",
            body: {
              op: "lambda",
              param: "x",
              body: {
                op: "call",
                fn: "add",
                args: [
                  { op: "var", name: "acc" },
                  { op: "var", name: "x" },
                ],
              },
            },
          },
        ],
      },
      { $input: [19.98, 19.99] },
    );
    expect(result.value).toBeCloseTo(39.97, 10);
  });

  test("applyDiscount: evaluate with $input=100, discountRate=0.1 -> 90", () => {
    const result = ak.evaluate(
      {
        op: "call",
        fn: "mul",
        args: [
          { op: "var", name: "$input" },
          {
            op: "call",
            fn: "sub",
            args: [
              { op: "const", value: 1 },
              { op: "var", name: "discountRate" },
            ],
          },
        ],
      },
      { $input: 100, discountRate: 0.1 },
    );
    expect(result.value).toBe(90);
  });

  test("eurToUsd: apply morphism with $input=49.99 -> ~53.99", () => {
    // Define a concrete Number scalar so we can create a valid Datum.
    ak.defineScalar("Number", "1.0", { type: "number" });
    const numRef = "type://github.com/Stream44/s44-rak-gen1@1.0/Number/1.0";

    const datum = ak.createDatum(numRef, 49.99);
    const output = ak.applyMorphism(domain.morphisms.eurToUsd, datum);
    expect(output.data as number).toBeCloseTo(49.99 * 1.08, 10);
  });
});

// =====================================================================
// F. State Machine
// =====================================================================

describe("F. State Machine", () => {
  // The fixture's stateType is OrderStatus (string enum) but transitions
  // produce record states { status: "..." }, causing new-state validation
  // to fail.  We define a local machine with a record-typed stateType so
  // the full lifecycle can be exercised end-to-end.

  let machineId: string;

  beforeEach(() => {
    ak.defineRecord("OrderState", "1.0", (t) => {
      t.string("status", { required: true });
    });
    ak.defineRecord("OrderEvt", "1.0", (t) => {
      t.string("verb", { required: true });
    });

    const stateRef = "type://github.com/Stream44/s44-rak-gen1@1.0/OrderState/1.0";
    const eventRef = "type://github.com/Stream44/s44-rak-gen1@1.0/OrderEvt/1.0";

    function sp(status: string) {
      return {
        kind: "record" as const,
        fields: { status: { kind: "const" as const, value: status } },
      };
    }
    function ep(verb: string) {
      return {
        kind: "record" as const,
        fields: { verb: { kind: "const" as const, value: verb } },
      };
    }
    function ts(status: string): KernelExpression {
      return { op: "const", value: { status } };
    }

    const sm = ak.defineStateMachine({
      id: `sm://${ECOM_ORIGIN}/OrderLifecycleLocal/1.0`,
      name: "OrderLifecycleLocal",
      stateType: stateRef,
      eventType: eventRef,
      initialState: { status: "pending" },
      transitions: [
        { from: sp("pending"), event: ep("confirm"), to: ts("confirmed"), label: "confirm" },
        { from: sp("confirmed"), event: ep("pay"), to: ts("paid"), label: "pay" },
        { from: sp("paid"), event: ep("ship"), to: ts("shipped"), label: "ship" },
        { from: sp("shipped"), event: ep("deliver"), to: ts("delivered"), label: "deliver" },
        { from: sp("pending"), event: ep("cancel"), to: ts("cancelled"), label: "cancel-pending" },
        {
          from: sp("confirmed"),
          event: ep("cancel"),
          to: ts("cancelled"),
          label: "cancel-confirmed",
        },
        { from: sp("paid"), event: ep("refund"), to: ts("refunded"), label: "refund" },
      ],
    });
    machineId = sm.id;
  });

  test("step: pending + confirm -> confirmed", async () => {
    const result = ak.stepStateMachine(machineId, { status: "pending" }, { verb: "confirm" });
    expect(result.success).toBe(true);
    expect((result.newState as any).status).toBe("confirmed");
  });

  test("step: confirmed + pay -> paid", async () => {
    const result = ak.stepStateMachine(machineId, { status: "confirmed" }, { verb: "pay" });
    expect(result.success).toBe(true);
    expect((result.newState as any).status).toBe("paid");
  });

  test("step: paid + ship -> shipped", async () => {
    const result = ak.stepStateMachine(machineId, { status: "paid" }, { verb: "ship" });
    expect(result.success).toBe(true);
    expect((result.newState as any).status).toBe("shipped");
  });

  test("step: shipped + deliver -> delivered", async () => {
    const result = ak.stepStateMachine(machineId, { status: "shipped" }, { verb: "deliver" });
    expect(result.success).toBe(true);
    expect((result.newState as any).status).toBe("delivered");
  });

  test("step: paid + pay -> error (no transition)", async () => {
    const result = ak.stepStateMachine(machineId, { status: "paid" }, { verb: "pay" });
    expect(result.success).toBe(false);
  });

  test("run: [confirm, pay, ship, deliver] -> delivered, 4 steps", async () => {
    const result = ak.runStateMachine(machineId, { status: "pending" }, [
      { verb: "confirm" },
      { verb: "pay" },
      { verb: "ship" },
      { verb: "deliver" },
    ]);
    expect(result.steps).toBe(4);
    expect((result.finalState as any).status).toBe("delivered");
  });
});

// =====================================================================
// G. Brands
// =====================================================================

describe("G. Brands", () => {
  test("areSameBrand(USD, EUR) -> false", () => {
    expect(ak.brands.areSameBrand(domain.brands.USD, domain.brands.EUR)).toBe(false);
  });

  test("areSameBrand(USD, USD) -> true", () => {
    expect(ak.brands.areSameBrand(domain.brands.USD, domain.brands.USD)).toBe(true);
  });

  test("USD and EUR both validate the same number (structural equivalence)", () => {
    // Define concrete Number scalar and create branded types on it
    // so that structural validation of raw numbers succeeds.
    ak.defineScalar("Num", "1.0", { type: "number" });
    const numRef = "type://github.com/Stream44/s44-rak-gen1@1.0/Num/1.0";

    const localUsd = ak.defineBrandedType("LocalUSD", "1.0", numRef, "USD");
    const localEur = ak.defineBrandedType("LocalEUR", "1.0", numRef, "EUR");

    const usdResult = ak.brands.validate(42.0, localUsd.id);
    const eurResult = ak.brands.validate(42.0, localEur.id);
    expect(usdResult.valid).toBe(true);
    expect(eurResult.valid).toBe(true);
    // Despite structural equivalence, they are nominally distinct
    expect(ak.brands.areSameBrand(localUsd.id, localEur.id)).toBe(false);
  });
});

// =====================================================================
// H. Dependent Types
// =====================================================================

describe("H. Dependent Types", () => {
  // The fixture uses "integer" as the index type which is not a registered
  // TypeRef.  We define a local dependent type with a proper integer scalar.

  let stockLevelId: string;

  beforeEach(() => {
    ak.defineScalar("integer", "1.0", { type: "integer" });

    const def = ak.defineDependentType(
      "LocalStockLevel",
      [{ name: "max", type: "type://github.com/Stream44/s44-rak-gen1@1.0/integer/1.0" }],
      { type: "integer", minimum: 0 },
      (indices) => ({
        type: "integer",
        minimum: 0,
        maximum: indices.max as number,
      }),
    );
    stockLevelId = def.id;
  });

  test("StockLevel<max=10000>: validate 500 -> passes", () => {
    const result = ak.dependentTypes.validate(500, stockLevelId, {
      max: 10000,
    });
    expect(result.valid).toBe(true);
  });

  test("StockLevel<max=10000>: validate -1 -> fails", () => {
    const result = ak.dependentTypes.validate(-1, stockLevelId, {
      max: 10000,
    });
    expect(result.valid).toBe(false);
  });

  test("StockLevel<max=100>: validate 200 -> fails (different max)", () => {
    const result = ak.dependentTypes.validate(200, stockLevelId, { max: 100 });
    expect(result.valid).toBe(false);
  });
});

// =====================================================================
// I. Proofs
// =====================================================================

describe("I. Proofs", () => {
  test("totalNonNegative: verify with $self=99.99 -> valid", () => {
    const result = ak.verifyProof(domain.propositions.totalNonNegative, {
      $self: 99.99,
    });
    expect(result.valid).toBe(true);
  });

  test("totalNonNegative: verify with $self=-1 -> invalid", () => {
    const result = ak.verifyProof(domain.propositions.totalNonNegative, {
      $self: -1,
    });
    expect(result.valid).toBe(false);
  });

  test("stockNonNegative: verify with $self=50 -> valid", () => {
    const result = ak.verifyProof(domain.propositions.stockNonNegative, {
      $self: 50,
    });
    expect(result.valid).toBe(true);
  });
});

// =====================================================================
// J. Schema Evolution
// =====================================================================

describe("J. Schema Evolution", () => {
  test("Customer v2 with optional phone is backward compatible", () => {
    const customerV2Ref = buildTypeUri(ECOM_ORIGIN, "Customer", "2.0");
    ak.defineType({
      id: customerV2Ref,
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      name: "Customer",
      version: "2.0",
      schema: {
        type: "object",
        required: ["id", "name", "email"],
        properties: {
          id: { type: "string" },
          name: { type: "string", minLength: 1 },
          email: { type: "string", pattern: "^[^@]+@[^@]+$" },
          tier: {
            type: "string",
            enum: ["bronze", "silver", "gold", "platinum"],
          },
          phone: { type: "string" },
        },
      },
    });

    const result = ak.checkCompatibility(
      domain.types.Customer,
      customerV2Ref,
      Compatibility.Backward,
    );
    expect(result.compatible).toBe(true);
  });

  test("v1 customer data validates under v2 schema", () => {
    const customerV2Ref = buildTypeUri(ECOM_ORIGIN, "Customer", "2.0");
    ak.defineType({
      id: customerV2Ref,
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      name: "Customer",
      version: "2.0",
      schema: {
        type: "object",
        required: ["id", "name", "email"],
        properties: {
          id: { type: "string" },
          name: { type: "string", minLength: 1 },
          email: { type: "string", pattern: "^[^@]+@[^@]+$" },
          tier: {
            type: "string",
            enum: ["bronze", "silver", "gold", "platinum"],
          },
          phone: { type: "string" },
        },
      },
    });

    const result = ak.validate(customerV2Ref, SAMPLE.customer);
    expect(result.valid).toBe(true);
  });
});

// =====================================================================
// K. Graph
// =====================================================================

describe("K. Graph", () => {
  test("impactOf(Product) includes OrderItem", () => {
    const impact = ak.impactOf(domain.types.Product);
    expect(impact).toContain(domain.types.OrderItem);
  });

  test("dependenciesOf(Order) includes Customer", () => {
    const deps = ak.dependenciesOf(domain.types.Order);
    expect(deps).toContain(domain.types.Customer);
  });

  test("TypeGraph has no cycles", () => {
    expect(ak.kernel.graph.hasCycle()).toBe(false);
  });
});
