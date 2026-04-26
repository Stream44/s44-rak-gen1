import type { AlgebraicKernel, TypeRef } from "../../L13-facade/index.ts";
import { readFileSync } from "fs";
import { resolve } from "path";

type Sample = {
  customer: { id: string; name: string; email: string; tier: string };
  product: {
    sku: string;
    name: string;
    price: number;
    currency: string;
    stock: number;
    category: string;
  };
  productGadget: {
    sku: string;
    name: string;
    price: number;
    currency: string;
    stock: number;
    category: string;
  };
  productPremium: {
    sku: string;
    name: string;
    price: number;
    currency: string;
    stock: number;
    category: string;
  };
  orderItem: { product: string; quantity: number; unitPrice: number };
};
type Fixtures = {
  origin: string;
  types: Array<{ id: TypeRef; name: string } & Record<string, unknown>>;
  stateMachine: { id: string; [k: string]: unknown };
  refinements: Array<{ name: string; version: string; base: TypeRef; predicate: any }>;
  brands: Array<{ name: string; version: string; base: TypeRef; brand: string }>;
  morphisms: Array<{ name: string; from: TypeRef; to: TypeRef; body: any }>;
  dependentTypes: Array<{
    name: string;
    indices: Array<{ name: string; type: TypeRef }>;
    baseSchema: any;
    refineJs: string;
  }>;
  propositions: Array<{ name: string; predicate: any; witness: Record<string, TypeRef> }>;
};

const FIXTURES = Bun.YAML.parse(
  readFileSync(
    resolve(import.meta.dir, "../../examples/model-world/models/ecommerce.fixtures.yaml"),
    "utf-8",
  ),
) as Fixtures;
export const SAMPLE = (
  Bun.YAML.parse(
    readFileSync(
      resolve(import.meta.dir, "../../examples/model-world/seeds/ecommerce.samples.yaml"),
      "utf-8",
    ),
  ) as { samples: Sample }
).samples;
export const ECOM_ORIGIN: string = FIXTURES.origin;

export interface EcommerceDomain {
  types: {
    Customer: TypeRef;
    Product: TypeRef;
    OrderItem: TypeRef;
    Order: TypeRef;
    Invoice: TypeRef;
    Shipment: TypeRef;
    OrderStatus: TypeRef;
    Currency: TypeRef;
    CustomerTier: TypeRef;
  };
  stateMachine: { id: string };
  refinements: { PositivePrice: string; NonEmptyOrder: string };
  brands: { USD: string; EUR: string; GBP: string };
  morphisms: { computeTotal: string; applyDiscount: string; eurToUsd: string };
  dependentTypes: { StockLevel: string };
  propositions: { totalNonNegative: string; stockNonNegative: string };
}

const typeId = (name: string) => FIXTURES.types.find((t) => t.name === name)!.id;
export function setupEcommerceDomain(ak: AlgebraicKernel): EcommerceDomain {
  for (const type of FIXTURES.types) ak.defineType(type as any);
  ak.defineStateMachine(FIXTURES.stateMachine as any);
  const refinements = Object.fromEntries(
    FIXTURES.refinements.map((r) => [
      r.name,
      ak.defineRefinement(r.name, r.version, r.base, r.predicate).id,
    ]),
  );
  const brands = Object.fromEntries(
    FIXTURES.brands.map((b) => [
      b.name,
      ak.defineBrandedType(b.name, b.version, b.base, b.brand).id,
    ]),
  );
  const morphisms = Object.fromEntries(
    FIXTURES.morphisms.map((m) => [m.name, ak.defineMorphism(m.name, m.from, m.to, m.body).id]),
  );
  const dependentTypes = Object.fromEntries(
    FIXTURES.dependentTypes.map((d) => [
      d.name,
      // Temporary escape hatch per WP: deserialize refineJs into the generator closure.
      ak.defineDependentType(
        d.name,
        d.indices,
        d.baseSchema,
        new Function("indices", `return (${d.refineJs});`) as (
          indices: Record<string, unknown>,
        ) => Record<string, unknown>,
      ).id,
    ]),
  );
  const propositions = Object.fromEntries(
    FIXTURES.propositions.map((p) => [
      p.name,
      ak.defineProposition(p.name, p.predicate, p.witness).id,
    ]),
  );
  return {
    types: {
      Customer: typeId("Customer"),
      Product: typeId("Product"),
      OrderItem: typeId("OrderItem"),
      Order: typeId("Order"),
      Invoice: typeId("Invoice"),
      Shipment: typeId("Shipment"),
      OrderStatus: typeId("OrderStatus"),
      Currency: typeId("Currency"),
      CustomerTier: typeId("CustomerTier"),
    },
    stateMachine: { id: FIXTURES.stateMachine.id },
    refinements: {
      PositivePrice: refinements.PositivePrice,
      NonEmptyOrder: refinements.NonEmptyOrder,
    },
    brands: { USD: brands.USD, EUR: brands.EUR, GBP: brands.GBP },
    morphisms: {
      computeTotal: morphisms.computeOrderTotal,
      applyDiscount: morphisms.applyDiscount,
      eurToUsd: morphisms.eurToUsd,
    },
    dependentTypes: { StockLevel: dependentTypes.StockLevel },
    propositions: {
      totalNonNegative: propositions["order-total-non-negative"],
      stockNonNegative: propositions["stock-non-negative"],
    },
  };
}
