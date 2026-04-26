/**
 * E2E Business Workflow Tests for the Axiomatic Data Kernel.
 *
 * Each test simulates a real business scenario from start to finish
 * using the e-commerce domain fixtures.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { MetaLevel, Compatibility } from "../../../L13-facade/index.ts";
import { AlgebraicKernel } from "../../../L13-facade/index.ts";
import type { KernelExpression } from "../../../L13-facade/index.ts";
import type { Transition } from "../../../L06-process/engine.ts";
import type { Pattern } from "../../../L13-facade/index.ts";
import { setupEcommerceDomain, SAMPLE, ECOM_ORIGIN } from "../../../tests/kernel-fixtures/index.ts";
import type { EcommerceDomain } from "../../../tests/kernel-fixtures/index.ts";

// ── Helpers ────────────────────────────────────────────────────────────

/** Build a record pattern matching `{ status: <value> }`. */
function statusPattern(status: string): Pattern {
  return { kind: "record", fields: { status: { kind: "const", value: status } } };
}

/** Build a record pattern matching `{ verb: <value> }`. */
function eventPattern(verb: string): Pattern {
  return { kind: "record", fields: { verb: { kind: "const", value: verb } } };
}

/** Const expression producing next state object. */
function toState(status: string): KernelExpression {
  return { op: "const", value: { status } };
}

/**
 * Register a properly-typed order lifecycle state machine.
 *
 * The fixture's state machine uses a string-enum stateType which cannot
 * validate the `{ status }` object states produced by transitions. This
 * helper defines a union stateType with object variants so step validation
 * passes end-to-end.
 */
function registerWorkflowStateMachine(ak: AlgebraicKernel): string {
  const smId = `sm://${ECOM_ORIGIN}/OrderLifecycleE2E/1.0`;

  const stateTypeId = ak.defineUnion("OrderStateObject", "1.0", [
    { type: "object", properties: { status: { const: "pending" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "confirmed" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "paid" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "shipped" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "delivered" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "cancelled" } }, required: ["status"] },
    { type: "object", properties: { status: { const: "refunded" } }, required: ["status"] },
  ]);

  const eventTypeId = ak.defineUnion("OrderEventObject", "1.0", [
    { type: "object", properties: { verb: { const: "confirm" } }, required: ["verb"] },
    { type: "object", properties: { verb: { const: "pay" } }, required: ["verb"] },
    { type: "object", properties: { verb: { const: "ship" } }, required: ["verb"] },
    { type: "object", properties: { verb: { const: "deliver" } }, required: ["verb"] },
    { type: "object", properties: { verb: { const: "cancel" } }, required: ["verb"] },
    { type: "object", properties: { verb: { const: "refund" } }, required: ["verb"] },
  ]);

  const transitions: Transition[] = [
    {
      from: statusPattern("pending"),
      event: eventPattern("confirm"),
      to: toState("confirmed"),
      label: "confirm",
    },
    {
      from: statusPattern("confirmed"),
      event: eventPattern("pay"),
      to: toState("paid"),
      label: "pay",
    },
    {
      from: statusPattern("paid"),
      event: eventPattern("ship"),
      to: toState("shipped"),
      label: "ship",
    },
    {
      from: statusPattern("shipped"),
      event: eventPattern("deliver"),
      to: toState("delivered"),
      label: "deliver",
    },
    {
      from: statusPattern("pending"),
      event: eventPattern("cancel"),
      to: toState("cancelled"),
      label: "cancel-pending",
    },
    {
      from: statusPattern("confirmed"),
      event: eventPattern("cancel"),
      to: toState("cancelled"),
      label: "cancel-confirmed",
    },
    {
      from: statusPattern("paid"),
      event: eventPattern("refund"),
      to: toState("refunded"),
      label: "refund",
    },
  ];

  ak.defineStateMachine({
    id: smId,
    name: "OrderLifecycleE2E",
    stateType: stateTypeId,
    eventType: eventTypeId,
    initialState: { status: "pending" },
    transitions,
  });

  return smId;
}

// ── Test state ─────────────────────────────────────────────────────────

let ak: AlgebraicKernel;
let domain: EcommerceDomain;
let smId: string;

beforeEach(() => {
  ak = AlgebraicKernel.create();
  domain = setupEcommerceDomain(ak);
  smId = registerWorkflowStateMachine(ak);
});

// ── Tests ──────────────────────────────────────────────────────────────

describe("E2E Business Workflows", () => {
  // ── Workflow 1 ──────────────────────────────────────────────────────

  test("Workflow 1: registration → order → delivery", async () => {
    // 1. Register customer
    const customer = ak.createDatum(domain.types.Customer, SAMPLE.customer);
    expect(customer.id).toMatch(/^cid:sha256:/);

    // 2. Create products
    const widget = ak.createDatum(domain.types.Product, SAMPLE.product);
    const gadget = ak.createDatum(domain.types.Product, SAMPLE.productGadget);

    // 3. Create order items (with refs to products)
    const item1 = ak.createDatum(domain.types.OrderItem, {
      product: widget.id,
      quantity: 2,
      unitPrice: 9.99,
    });
    const item2 = ak.createDatum(domain.types.OrderItem, {
      product: gadget.id,
      quantity: 1,
      unitPrice: 19.99,
    });

    // 4. Create order (ref to customer and items)
    const order = ak.createDatum(
      domain.types.Order,
      {
        id: "ord-001",
        customer: customer.id,
        items: [
          { product: widget.id, quantity: 2, unitPrice: 9.99 },
          { product: gadget.id, quantity: 1, unitPrice: 19.99 },
        ],
        status: "pending",
        total: 39.97,
        placedAt: "2026-04-16",
      },
      [
        { rel: "customer", target: customer.id },
        { rel: "item", target: item1.id },
        { rel: "item", target: item2.id },
      ],
    );

    // 5. Process through state machine: confirm → pay → ship → deliver
    let state: { status: string } = { status: "pending" };
    for (const verb of ["confirm", "pay", "ship", "deliver"]) {
      const result = ak.stepStateMachine(smId, state, { verb });
      expect(result.success).toBe(true);
      state = result.newState as { status: string };
    }
    expect(state.status).toBe("delivered");

    // 6. Create invoice (refs to order)
    const invoice = ak.createDatum(
      domain.types.Invoice,
      {
        id: "inv-001",
        order: order.id,
        amount: 39.97,
        currency: "USD",
        issuedAt: "2026-04-16",
      },
      [{ rel: "order", target: order.id }],
    );
    expect(invoice.id).toMatch(/^cid:sha256:/);

    // 7. Verify all datums validate
    expect(ak.validate(domain.types.Customer, SAMPLE.customer).valid).toBe(true);
    expect(ak.validate(domain.types.Order, order.data).valid).toBe(true);
  });

  // ── Workflow 2 ──────────────────────────────────────────────────────

  test("Workflow 2: customer cancels order before payment", async () => {
    // Create customer + order (pending)
    const customer = ak.createDatum(domain.types.Customer, SAMPLE.customer);
    ak.createDatum(domain.types.Order, {
      id: "ord-002",
      customer: customer.id,
      items: [{ product: "cid:placeholder", quantity: 1, unitPrice: 9.99 }],
      status: "pending",
      total: 9.99,
    });

    // Step: pending + cancel → cancelled
    let state: { status: string } = { status: "pending" };
    const cancelResult = ak.stepStateMachine(smId, state, { verb: "cancel" });
    expect(cancelResult.success).toBe(true);
    state = cancelResult.newState as { status: string };
    expect(state.status).toBe("cancelled");

    // Verify: no invoice exists (we never created one — order was cancelled)

    // Verify: step cancelled + pay → fails (no transition)
    const payResult = ak.stepStateMachine(smId, state, { verb: "pay" });
    expect(payResult.success).toBe(false);
  });

  // ── Workflow 3 ──────────────────────────────────────────────────────

  test("Workflow 3: refund after payment", async () => {
    // Create customer + order, confirm, pay → paid
    const customer = ak.createDatum(domain.types.Customer, SAMPLE.customer);
    ak.createDatum(domain.types.Order, {
      id: "ord-003",
      customer: customer.id,
      items: [{ product: "cid:placeholder", quantity: 2, unitPrice: 9.99 }],
      status: "pending",
      total: 19.98,
    });

    let state: { status: string } = { status: "pending" };
    for (const verb of ["confirm", "pay"]) {
      const result = ak.stepStateMachine(smId, state, { verb });
      expect(result.success).toBe(true);
      state = result.newState as { status: string };
    }
    expect(state.status).toBe("paid");

    // Create invoice
    ak.createDatum(domain.types.Invoice, {
      id: "inv-003",
      order: "ord-003",
      amount: 19.98,
      currency: "USD",
      issuedAt: "2026-04-16",
    });

    // Step: paid + refund → refunded
    const refundResult = ak.stepStateMachine(smId, state, { verb: "refund" });
    expect(refundResult.success).toBe(true);
    state = refundResult.newState as { status: string };
    expect(state.status).toBe("refunded");

    // Verify: cannot ship (refunded + ship → error)
    const shipResult = ak.stepStateMachine(smId, state, { verb: "ship" });
    expect(shipResult.success).toBe(false);
  });

  // ── Workflow 4 ──────────────────────────────────────────────────────

  test("Workflow 4: multi-item order with discount", () => {
    // Create 3 products (Widget $9.99, Gadget $19.99, Premium $49.99)
    const widget = ak.createDatum(domain.types.Product, SAMPLE.product);
    const gadget = ak.createDatum(domain.types.Product, SAMPLE.productGadget);
    const premium = ak.createDatum(domain.types.Product, {
      ...SAMPLE.productPremium,
      currency: "USD",
      price: 49.99,
    });

    // Compute line totals: [19.98, 19.99, 49.99] = 89.96
    const lineTotals = [2 * 9.99, 1 * 19.99, 1 * 49.99];

    // Evaluate computeTotal expression (fold/sum)
    const totalResult = ak.evaluate(
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
      { $input: lineTotals },
    );
    expect(totalResult.error).toBeUndefined();
    expect(totalResult.value).toBeCloseTo(89.96, 2);

    // Apply 10% discount: $input * (1 - discountRate) → ~80.964
    const discountResult = ak.evaluate(
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
      { $input: totalResult.value, discountRate: 0.1 },
    );
    expect(discountResult.error).toBeUndefined();
    expect(discountResult.value as number).toBeCloseTo(80.964, 2);

    // Create order with discounted total
    const customer = ak.createDatum(domain.types.Customer, SAMPLE.customer);
    const discountedTotal = Math.round((discountResult.value as number) * 100) / 100;
    const order = ak.createDatum(domain.types.Order, {
      id: "ord-004",
      customer: customer.id,
      items: [
        { product: widget.id, quantity: 2, unitPrice: 9.99 },
        { product: gadget.id, quantity: 1, unitPrice: 19.99 },
        { product: premium.id, quantity: 1, unitPrice: 49.99 },
      ],
      status: "pending",
      total: discountedTotal,
    });
    expect(ak.validate(domain.types.Order, order.data).valid).toBe(true);

    // Process to delivered
    let state: { status: string } = { status: "pending" };
    for (const verb of ["confirm", "pay", "ship", "deliver"]) {
      const result = ak.stepStateMachine(smId, state, { verb });
      expect(result.success).toBe(true);
      state = result.newState as { status: string };
    }
    expect(state.status).toBe("delivered");
  });

  // ── Workflow 5 ──────────────────────────────────────────────────────

  test("Workflow 5: inventory check with dependent types", async () => {
    // Product has stock: 100
    const product = ak.createDatum(domain.types.Product, SAMPLE.product);
    expect(product.data).toHaveProperty("stock", 100);

    // The fixture's StockLevel index type is "integer" (raw string).
    // Register a matching scalar so index validation resolves it.
    ak.defineScalar("integer", "1.0", { type: "integer" });

    // Instantiate StockLevel<max=10000>
    const stockRef = ak.instantiateDependentType(domain.dependentTypes.StockLevel, {
      max: 10000,
    });
    expect(stockRef).toContain("StockLevel");

    // Validate stock: 100 → passes
    const valid100 = ak.validate(stockRef, 100);
    expect(valid100.valid).toBe(true);

    // After order of qty 3: new stock = 97
    const newStock = 100 - 3;
    const valid97 = ak.validate(stockRef, newStock);
    expect(valid97.valid).toBe(true);

    // Validate -1 → fails (minimum: 0)
    const invalidNeg = ak.validate(stockRef, -1);
    expect(invalidNeg.valid).toBe(false);
    expect(invalidNeg.errors.length).toBeGreaterThan(0);
  });

  // ── Workflow 6 ──────────────────────────────────────────────────────

  test("Workflow 6: currency conversion on international order", () => {
    // Product priced in EUR: 49.99
    const premiumProduct = ak.createDatum(domain.types.Product, SAMPLE.productPremium);
    expect(premiumProduct.data).toHaveProperty("currency", "EUR");
    expect(premiumProduct.data).toHaveProperty("price", 49.99);

    // Apply eurToUsd expression: 49.99 * 1.08 → ~53.9892
    const conversionResult = ak.evaluate(
      {
        op: "call",
        fn: "mul",
        args: [
          { op: "var", name: "$input" },
          { op: "const", value: 1.08 },
        ],
      },
      { $input: 49.99 },
    );
    expect(conversionResult.error).toBeUndefined();
    const usdPrice = conversionResult.value as number;
    expect(usdPrice).toBeCloseTo(53.9892, 2);

    // Verify USD and EUR brands are distinct
    expect(domain.brands.USD).not.toBe(domain.brands.EUR);
    expect(domain.brands.USD).toContain("USD");
    expect(domain.brands.EUR).toContain("EUR");

    // Create invoice in USD
    const customer = ak.createDatum(domain.types.Customer, SAMPLE.customer);
    const order = ak.createDatum(domain.types.Order, {
      id: "ord-006",
      customer: customer.id,
      items: [{ product: premiumProduct.id, quantity: 1, unitPrice: usdPrice }],
      status: "pending",
      total: Math.round(usdPrice * 100) / 100,
    });

    const invoice = ak.createDatum(domain.types.Invoice, {
      id: "inv-006",
      order: order.id,
      amount: Math.round(usdPrice * 100) / 100,
      currency: "USD",
      issuedAt: "2026-04-16",
    });
    expect(invoice.id).toMatch(/^cid:sha256:/);
    expect(ak.validate(domain.types.Invoice, invoice.data).valid).toBe(true);
  });

  // ── Workflow 7 ──────────────────────────────────────────────────────

  test("Workflow 7: schema evolution — adding shipping address", () => {
    // Define Customer v2 with optional shippingAddress
    const customerV2Ref = `type://${ECOM_ORIGIN}/Customer/2.0`;
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
          shippingAddress: {
            type: "object",
            properties: {
              street: { type: "string" },
              city: { type: "string" },
              zip: { type: "string" },
              country: { type: "string" },
            },
          },
        },
      },
    });

    // Check backward compatibility v1 → v2
    const compat = ak.checkCompatibility(
      domain.types.Customer,
      customerV2Ref,
      Compatibility.Backward,
    );
    expect(compat.compatible).toBe(true);

    // Validate v1 customer data against v2 → passes (shippingAddress is optional)
    const v1Data = SAMPLE.customer;
    const v2Validation = ak.validate(customerV2Ref, v1Data);
    expect(v2Validation.valid).toBe(true);

    // Create new customer with shippingAddress under v2
    const customerV2 = ak.createDatum(customerV2Ref, {
      id: "cust-002",
      name: "Grace Hopper",
      email: "grace@example.com",
      tier: "platinum",
      shippingAddress: {
        street: "123 Navy Way",
        city: "Arlington",
        zip: "22201",
        country: "US",
      },
    });
    expect(customerV2.id).toMatch(/^cid:sha256:/);
    expect(ak.validate(customerV2Ref, customerV2.data).valid).toBe(true);
  });

  // ── Workflow 8 ──────────────────────────────────────────────────────

  test("Workflow 8: business rule enforcement via proofs", () => {
    // Verify totalNonNegative proposition with total=39.97 → valid
    const validTotal = ak.verifyProof(domain.propositions.totalNonNegative, {
      $self: 39.97,
    });
    expect(validTotal.valid).toBe(true);

    // Verify totalNonNegative with total=-1 → invalid
    const invalidTotal = ak.verifyProof(domain.propositions.totalNonNegative, {
      $self: -1,
    });
    expect(invalidTotal.valid).toBe(false);

    // Verify stockNonNegative with stock=100 → valid
    const validStock = ak.verifyProof(domain.propositions.stockNonNegative, {
      $self: 100,
    });
    expect(validStock.valid).toBe(true);

    // Verify stockNonNegative with stock=-5 → invalid
    const invalidStock = ak.verifyProof(domain.propositions.stockNonNegative, {
      $self: -5,
    });
    expect(invalidStock.valid).toBe(false);

    // Verify PositivePrice via predicate evaluation: $self > 0
    const pricePredicate: KernelExpression = {
      op: "call",
      fn: "gt",
      args: [
        { op: "var", name: "$self" },
        { op: "const", value: 0 },
      ],
    };

    // price=9.99 → passes
    const pricePass = ak.evaluate(pricePredicate, { $self: 9.99 });
    expect(pricePass.value).toBe(true);

    // price=-1 → fails
    const priceFail = ak.evaluate(pricePredicate, { $self: -1 });
    expect(priceFail.value).toBe(false);
  });

  // ── Workflow 9 ──────────────────────────────────────────────────────

  test("Workflow 9: impact analysis — product price change", () => {
    // Query impactOf(Product) → should include OrderItem at minimum
    const productImpact = ak.impactOf(domain.types.Product);
    expect(productImpact).toContain(domain.types.OrderItem);

    // Query dependenciesOf(Order) → should include Customer at minimum
    const orderDeps = ak.dependenciesOf(domain.types.Order);
    expect(orderDeps).toContain(domain.types.Customer);

    // Verify type graph has no cycles
    expect(ak.kernel.graph.hasCycle()).toBe(false);
  });

  // ── Workflow 10 ─────────────────────────────────────────────────────

  test("Workflow 10: concurrent orders from same customer", async () => {
    // Create one customer
    const customer = ak.createDatum(domain.types.Customer, SAMPLE.customer);

    // Create two orders (A and B) both referencing same customer CID
    const orderA = ak.createDatum(
      domain.types.Order,
      {
        id: "ord-A",
        customer: customer.id,
        items: [{ product: "cid:prod-1", quantity: 2, unitPrice: 9.99 }],
        status: "pending",
        total: 19.98,
        placedAt: "2026-04-16T10:00:00Z",
      },
      [{ rel: "customer", target: customer.id }],
    );

    const orderB = ak.createDatum(
      domain.types.Order,
      {
        id: "ord-B",
        customer: customer.id,
        items: [{ product: "cid:prod-2", quantity: 1, unitPrice: 19.99 }],
        status: "pending",
        total: 19.99,
        placedAt: "2026-04-16T10:05:00Z",
      },
      [{ rel: "customer", target: customer.id }],
    );

    // Process order A: confirm → pay → ship → deliver
    let stateA: { status: string } = { status: "pending" };
    for (const verb of ["confirm", "pay", "ship", "deliver"]) {
      const result = ak.stepStateMachine(smId, stateA, { verb });
      expect(result.success).toBe(true);
      stateA = result.newState as { status: string };
    }

    // Process order B: confirm → cancel
    let stateB: { status: string } = { status: "pending" };
    const confirmB = ak.stepStateMachine(smId, stateB, { verb: "confirm" });
    expect(confirmB.success).toBe(true);
    stateB = confirmB.newState as { status: string };

    const cancelB = ak.stepStateMachine(smId, stateB, { verb: "cancel" });
    expect(cancelB.success).toBe(true);
    stateB = cancelB.newState as { status: string };

    // Verify both orders have distinct CIDs
    expect(orderA.id).not.toBe(orderB.id);
    expect(orderA.id).toMatch(/^cid:sha256:/);
    expect(orderB.id).toMatch(/^cid:sha256:/);

    // Verify both reference same customer CID
    expect(orderA.refs.find((r) => r.rel === "customer")?.target).toBe(customer.id);
    expect(orderB.refs.find((r) => r.rel === "customer")?.target).toBe(customer.id);

    // Verify A ends at delivered, B ends at cancelled
    expect(stateA.status).toBe("delivered");
    expect(stateB.status).toBe("cancelled");
  });
});
