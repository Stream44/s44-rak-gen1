import { describe, test, expect } from "bun:test";
import { AlgebraicKernel } from "../../L13-facade/index.ts";
import { setupEcommerceDomain, SAMPLE, ECOM_ORIGIN } from "./index.ts";

describe("20-fixtures thin index", () => {
  test("registers every legacy domain type", () => {
    const ak = AlgebraicKernel.create();
    const domain = setupEcommerceDomain(ak);
    expect(Object.keys(domain.types)).toEqual([
      "Customer",
      "Product",
      "OrderItem",
      "Order",
      "Invoice",
      "Shipment",
      "OrderStatus",
      "Currency",
      "CustomerTier",
    ]);
    for (const ref of Object.values(domain.types)) expect(ak.resolveType(ref).id).toBe(ref);
    expect(ECOM_ORIGIN).toBe("test.ecommerce.example");
  });

  test("defines the order lifecycle state machine", () => {
    const ak = AlgebraicKernel.create();
    const domain = setupEcommerceDomain(ak);
    expect(ak.stateMachines.resolve(domain.stateMachine.id).transitions).toHaveLength(7);
  });

  test("preserves computeTotal morphism behavior", () => {
    const ak = AlgebraicKernel.create();
    const domain = setupEcommerceDomain(ak);
    expect(
      ak.evaluate(ak.morphisms.resolve(domain.morphisms.computeTotal).expr, {
        $input: [10, 20, 30],
      }).value,
    ).toBe(60);
  });

  test("preserves refinement and brand registration", () => {
    const ak = AlgebraicKernel.create();
    const domain = setupEcommerceDomain(ak);
    expect(ak.validateRefinement(5, domain.refinements.PositivePrice).predicateSatisfied).toBe(
      true,
    );
    expect(ak.validateRefinement(-1, domain.refinements.PositivePrice).predicateSatisfied).toBe(
      false,
    );
    expect(ak.brands.resolve(domain.brands.USD).brand).toBe("USD");
  });

  test("exports SAMPLE with the legacy shape", () => {
    expect(SAMPLE.customer.name).toBe("Ada Lovelace");
    expect(SAMPLE.product.price).toBe(9.99);
    expect(SAMPLE.productPremium.currency).toBe("EUR");
  });
});
