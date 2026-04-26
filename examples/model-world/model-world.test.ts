/**
 * 28-model-world — Model World integration test.
 *
 * Tests the EXTERNAL interface a full-stack app would use:
 *   1. Create kernel + loader
 *   2. Load model files (which define types, lifecycle, actions, contracts)
 *   3. Boot the model (returns a ModelBoot handle)
 *   4. Submit intents by verb name
 *   5. Observe state changes
 *
 * No internal wiring (IntentProcessor, CapabilityEngine, UnfoldingEngine)
 * is touched directly. Everything goes through ModelLoader.boot().
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AlgebraicKernel,
  ModelLoader,
  IntentProcessor,
  Compatibility,
} from "../../L13-facade/index.ts";
import { buildTypeUri } from "../../L13-facade/index.ts";
import type { ModelDocument, ModelBoot } from "../../L09-demand/model-loader.ts";

import { CORE_MODEL } from "./core.model.ts";
import { ECOMMERCE_MODEL } from "./ecommerce.model.ts";
import { ECOMMERCE_V2_MODEL } from "./ecommerce-v2.model.ts";

// ── Setup ──────────────────────────────────────────────────────────────

const ECOM_ORIGIN = "test.ecommerce.example";
const SEED_DIR = resolve(import.meta.dir, "seeds");
const SEED_CUSTOMERS = Bun.YAML.parse(
  readFileSync(resolve(SEED_DIR, "customers.yaml"), "utf-8"),
) as Array<Record<string, unknown>>;
const SEED_PRODUCTS = Bun.YAML.parse(
  readFileSync(resolve(SEED_DIR, "products.yaml"), "utf-8"),
) as Array<Record<string, unknown>>;
const SEED_ORDERS = Bun.YAML.parse(
  readFileSync(resolve(SEED_DIR, "orders.yaml"), "utf-8"),
) as Array<Record<string, unknown>>;

let ak: AlgebraicKernel;
let loader: ModelLoader;
let app: ModelBoot;

beforeEach(() => {
  ak = AlgebraicKernel.create();
  loader = new ModelLoader(ak);
  loader.setIntentProcessor(new IntentProcessor(ak));

  // Load models
  loader.loadModel(CORE_MODEL as ModelDocument);

  // Boot the ecommerce model — returns the public handle
  app = loader.boot(ECOMMERCE_MODEL as ModelDocument);

  // Seed initial order states
  for (const order of SEED_ORDERS) {
    app.setState(String(order.id), { status: "pending" });
  }
});

// ═══════════════════════════════════════════════════════════════════════
// A. Model provides types
// ═══════════════════════════════════════════════════════════════════════

describe("A. Types from model", () => {
  test("entity types are registered", () => {
    expect(ak.hasType(buildTypeUri(ECOM_ORIGIN, "Customer", "1.0.0"))).toBe(true);
    expect(ak.hasType(buildTypeUri(ECOM_ORIGIN, "Product", "1.0.0"))).toBe(true);
    expect(ak.hasType(buildTypeUri(ECOM_ORIGIN, "Order", "1.0.0"))).toBe(true);
    expect(ak.hasType(buildTypeUri(ECOM_ORIGIN, "Invoice", "1.0.0"))).toBe(true);
  });

  test("seed data validates against model types", () => {
    for (const c of SEED_CUSTOMERS) {
      expect(ak.validate(buildTypeUri(ECOM_ORIGIN, "Customer", "1.0.0"), c).valid).toBe(true);
    }
    for (const p of SEED_PRODUCTS) {
      expect(ak.validate(buildTypeUri(ECOM_ORIGIN, "Product", "1.0.0"), p).valid).toBe(true);
    }
    for (const o of SEED_ORDERS) {
      expect(ak.validate(buildTypeUri(ECOM_ORIGIN, "Order", "1.0.0"), o).valid).toBe(true);
    }
  });

  test("content-addressed datums created from seed data", () => {
    for (const c of SEED_CUSTOMERS) {
      const d = ak.createDatum(buildTypeUri(ECOM_ORIGIN, "Customer", "1.0.0"), c);
      expect(d.id).toMatch(/^cid:sha256:/);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════
// B. Model provides actions
// ═══════════════════════════════════════════════════════════════════════

describe("B. Actions from model", () => {
  test("model defines 5 actions", () => {
    const verbs = Object.keys(app.actions);
    expect(verbs).toContain("confirm");
    expect(verbs).toContain("pay");
    expect(verbs).toContain("ship");
    expect(verbs).toContain("deliver");
    expect(verbs).toContain("cancel");
  });

  test("model provides a state machine", () => {
    expect(app.stateMachineId).toBeTruthy();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// C. Submit intents by verb — the app interface
// ═══════════════════════════════════════════════════════════════════════

describe("C. Submit intents", () => {
  test("confirm: pending → confirmed", async () => {
    const r = await app.submit("confirm", "ord-001");
    expect(r.success).toBe(true);
    expect(r.newState).toEqual({ status: "confirmed" });
  });

  test("pay: confirmed → paid", async () => {
    await app.submit("confirm", "ord-001");
    const r = await app.submit("pay", "ord-001", { amount: 39.97 });
    expect(r.success).toBe(true);
    expect(r.newState).toEqual({ status: "paid" });
  });

  test("ship: paid → shipped", async () => {
    await app.submit("confirm", "ord-001");
    await app.submit("pay", "ord-001", { amount: 39.97 });
    const r = await app.submit("ship", "ord-001");
    expect(r.success).toBe(true);
    expect(r.newState).toEqual({ status: "shipped" });
  });

  test("deliver: shipped → delivered", async () => {
    await app.submit("confirm", "ord-001");
    await app.submit("pay", "ord-001", { amount: 39.97 });
    await app.submit("ship", "ord-001");
    const r = await app.submit("deliver", "ord-001");
    expect(r.success).toBe(true);
    expect(r.newState).toEqual({ status: "delivered" });
  });

  test("cancel: pending → cancelled", async () => {
    const r = await app.submit("cancel", "ord-001");
    expect(r.success).toBe(true);
    expect(r.newState).toEqual({ status: "cancelled" });
  });

  test("invalid verb returns error", async () => {
    const r = await app.submit("explode", "ord-001");
    expect(r.success).toBe(false);
    expect(r.error).toContain("No action");
  });

  test("invalid transition returns error", async () => {
    // Can't ship a pending order (must confirm + pay first)
    const r = await app.submit("ship", "ord-001");
    expect(r.success).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// D. State observation
// ═══════════════════════════════════════════════════════════════════════

describe("D. State observation", () => {
  test("getState returns current state", async () => {
    expect(app.getState("ord-001")).toEqual({ status: "pending" });
    await app.submit("confirm", "ord-001");
    expect(app.getState("ord-001")).toEqual({ status: "confirmed" });
  });

  test("event stream fires on every transition", async () => {
    const events: unknown[] = [];
    app.onEvent((e) => events.push(e));

    await app.submit("confirm", "ord-001");
    await app.submit("pay", "ord-001", { amount: 39.97 });

    expect(events).toHaveLength(2);
  });

  test("events carry state change data", async () => {
    const events: Array<{ previousState: unknown; newState: unknown }> = [];
    app.onEvent((e) => events.push(e));

    await app.submit("confirm", "ord-001");

    expect(events[0].previousState).toEqual({ status: "pending" });
    expect(events[0].newState).toEqual({ status: "confirmed" });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// E. Full order lifecycle
// ═══════════════════════════════════════════════════════════════════════

describe("E. Full lifecycle", () => {
  test("happy path: confirm → pay → ship → deliver", async () => {
    const events: unknown[] = [];
    app.onEvent((e) => events.push(e));

    for (const verb of ["confirm", "pay", "ship", "deliver"]) {
      const r = await app.submit(verb, "ord-001", verb === "pay" ? { amount: 39.97 } : undefined);
      expect(r.success).toBe(true);
    }

    expect(app.getState("ord-001")).toEqual({ status: "delivered" });
    expect(events).toHaveLength(4);
  });

  test("cancellation path: confirm → cancel", async () => {
    await app.submit("confirm", "ord-002");
    const r = await app.submit("cancel", "ord-002");
    expect(r.success).toBe(true);
    expect(app.getState("ord-002")).toEqual({ status: "cancelled" });
  });

  test("two orders processed independently", async () => {
    const events: unknown[] = [];
    app.onEvent((e) => events.push(e));

    // ord-001: full delivery
    for (const verb of ["confirm", "pay", "ship", "deliver"]) {
      await app.submit(verb, "ord-001", verb === "pay" ? { amount: 39.97 } : undefined);
    }

    // ord-002: cancel
    await app.submit("confirm", "ord-002");
    await app.submit("cancel", "ord-002");

    expect(app.getState("ord-001")).toEqual({ status: "delivered" });
    expect(app.getState("ord-002")).toEqual({ status: "cancelled" });
    expect(events).toHaveLength(6);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// F. Schema evolution
// ═══════════════════════════════════════════════════════════════════════

describe("F. Schema evolution", () => {
  test("v2 adds optional fields — backward compatible", () => {
    loader.loadModel(ECOMMERCE_V2_MODEL as ModelDocument);
    const v1 = buildTypeUri(ECOM_ORIGIN, "Customer", "1.0.0");
    const v2 = buildTypeUri(ECOM_ORIGIN, "Customer", "2.0.0");
    expect(ak.checkCompatibility(v1, v2, Compatibility.Backward).compatible).toBe(true);
  });

  test("v1 data validates under v2", () => {
    loader.loadModel(ECOMMERCE_V2_MODEL as ModelDocument);
    const v2 = buildTypeUri(ECOM_ORIGIN, "Customer", "2.0.0");
    for (const c of SEED_CUSTOMERS) {
      expect(ak.validate(v2, c).valid).toBe(true);
    }
  });
});
