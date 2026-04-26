import { describe, test, expect, beforeEach } from "bun:test";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import type { KernelExpression } from "../L13-facade/index.ts";
import { CapabilityEngine } from "./capability.ts";
import type { Intent } from "./intent.ts";

// ── Helpers ──────────────────────────────────────────────────────────────

function makeIntent(action: string, payload: unknown): Intent {
  return {
    id: "cid:sha256:test-intent",
    action,
    target: "sm://test/machine/1.0",
    targetKey: "order-001",
    payload,
    issuer: "user-alice",
    timestamp: new Date().toISOString(),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("Layer 24 — Capability & Authorization Engine", () => {
  let kernel: AlgebraicKernel;
  let engine: CapabilityEngine;

  beforeEach(() => {
    kernel = AlgebraicKernel.create();
    engine = new CapabilityEngine(kernel);
  });

  // 1. issue() creates capability with CID, correct action and issuer
  test("issue() creates capability with CID, correct action and issuer", () => {
    const cap = engine.issue("action://test/place-order/1.0", "admin-root");
    expect(cap.id).toMatch(/^cid:sha256:/);
    expect(cap.action).toBe("action://test/place-order/1.0");
    expect(cap.issuer).toBe("admin-root");
    expect(cap.caveats).toEqual([]);
    expect(cap.delegatedFrom).toBeUndefined();
  });

  // 2. authorize() with matching action and no caveats → authorized
  test("authorize() with matching action and no caveats → authorized", () => {
    const cap = engine.issue("action://test/place-order/1.0", "admin-root");
    const intent = makeIntent("action://test/place-order/1.0", { amount: 100 });
    const result = engine.authorize(intent, cap.id);
    expect(result.authorized).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.failedCaveat).toBeUndefined();
  });

  // 3. authorize() with wrong action → rejected (action mismatch)
  test("authorize() with wrong action → rejected (action mismatch)", () => {
    const cap = engine.issue("action://test/place-order/1.0", "admin-root");
    const intent = makeIntent("action://test/cancel-order/1.0", { orderId: "x" });
    const result = engine.authorize(intent, cap.id);
    expect(result.authorized).toBe(false);
    expect(result.error).toBe("action mismatch");
  });

  // 4. Capability with temporal caveat (expiresAt in the future) → authorized
  test("capability with expiresAt in the future → authorized", () => {
    const futureDate = new Date(Date.now() + 3_600_000).toISOString(); // +1 hour
    const cap = engine.issue("action://test/place-order/1.0", "admin-root", {
      expiresAt: futureDate,
    });
    const intent = makeIntent("action://test/place-order/1.0", { amount: 100 });
    const result = engine.authorize(intent, cap.id);
    expect(result.authorized).toBe(true);
  });

  // 5. Capability with expired expiresAt → rejected
  test("capability with expiresAt in the past → rejected", () => {
    const pastDate = new Date(Date.now() - 3_600_000).toISOString(); // -1 hour
    const cap = engine.issue("action://test/place-order/1.0", "admin-root", {
      expiresAt: pastDate,
    });
    const intent = makeIntent("action://test/place-order/1.0", { amount: 100 });
    const result = engine.authorize(intent, cap.id);
    expect(result.authorized).toBe(false);
    expect(result.error).toBe("capability expired");
  });

  // 6. Capability with payload caveat: amount < 1000
  test("payload caveat: amount < 1000 — authorized for 500, rejected for 5000", () => {
    const amountCaveat: KernelExpression = {
      op: "call",
      fn: "lt",
      args: [
        { op: "get", path: "amount" },
        { op: "const", value: 1000 },
      ],
    };

    const cap = engine.issue("action://test/place-order/1.0", "admin-root", {
      caveats: [amountCaveat],
    });

    // amount = 500 → authorized
    const intent500 = makeIntent("action://test/place-order/1.0", { amount: 500 });
    const result500 = engine.authorize(intent500, cap.id);
    expect(result500.authorized).toBe(true);

    // amount = 5000 → rejected
    const intent5000 = makeIntent("action://test/place-order/1.0", { amount: 5000 });
    const result5000 = engine.authorize(intent5000, cap.id);
    expect(result5000.authorized).toBe(false);
    expect(result5000.failedCaveat).toBe("caveat 0");
  });

  // 7. delegate() creates child with additional caveats, inherits parent's caveats
  test("delegate() creates child with additional caveats, inherits parent caveats", () => {
    const parentCaveat: KernelExpression = {
      op: "call",
      fn: "lt",
      args: [
        { op: "get", path: "amount" },
        { op: "const", value: 10000 },
      ],
    };
    const parent = engine.issue("action://test/place-order/1.0", "admin-root", {
      caveats: [parentCaveat],
    });

    const childCaveat: KernelExpression = {
      op: "call",
      fn: "lt",
      args: [
        { op: "get", path: "amount" },
        { op: "const", value: 1000 },
      ],
    };
    const child = engine.delegate(parent.id, [childCaveat]);

    expect(child.id).toMatch(/^cid:sha256:/);
    expect(child.id).not.toBe(parent.id);
    expect(child.action).toBe(parent.action);
    expect(child.issuer).toBe(parent.issuer);
    expect(child.delegatedFrom).toBe(parent.id);
    expect(child.caveats).toHaveLength(2);
    // First caveat from parent, second from delegation
    expect(child.caveats[0]).toEqual(parentCaveat);
    expect(child.caveats[1]).toEqual(childCaveat);
  });

  // 8. Authorize delegated capability → both parent and child caveats evaluated
  test("authorize delegated capability evaluates both parent and child caveats", () => {
    const parentCaveat: KernelExpression = {
      op: "call",
      fn: "lt",
      args: [
        { op: "get", path: "amount" },
        { op: "const", value: 10000 },
      ],
    };
    const parent = engine.issue("action://test/place-order/1.0", "admin-root", {
      caveats: [parentCaveat],
    });

    const childCaveat: KernelExpression = {
      op: "call",
      fn: "lt",
      args: [
        { op: "get", path: "amount" },
        { op: "const", value: 1000 },
      ],
    };
    const child = engine.delegate(parent.id, [childCaveat]);

    // amount=500 passes both caveats
    const ok = engine.authorize(
      makeIntent("action://test/place-order/1.0", { amount: 500 }),
      child.id,
    );
    expect(ok.authorized).toBe(true);

    // amount=5000 passes parent caveat (<10000) but fails child (<1000)
    const fail = engine.authorize(
      makeIntent("action://test/place-order/1.0", { amount: 5000 }),
      child.id,
    );
    expect(fail.authorized).toBe(false);
    expect(fail.failedCaveat).toBe("caveat 1"); // child caveat is index 1
  });

  // 9. verifyChain(): root cap → depth 1, root = issuer
  test("verifyChain() on root capability → depth 1, root = issuer", () => {
    const cap = engine.issue("action://test/place-order/1.0", "admin-root");
    const chain = engine.verifyChain(cap.id);
    expect(chain.valid).toBe(true);
    expect(chain.depth).toBe(1);
    expect(chain.root).toBe("admin-root");
  });

  // 10. verifyChain(): delegated cap → depth 2, root = original issuer
  test("verifyChain() on delegated capability → depth 2, root = original issuer", () => {
    const root = engine.issue("action://test/place-order/1.0", "admin-root");
    const child = engine.delegate(root.id, []);
    const chain = engine.verifyChain(child.id);
    expect(chain.valid).toBe(true);
    expect(chain.depth).toBe(2);
    expect(chain.root).toBe("admin-root");
  });

  // 11. Double delegation: root → admin → user → depth 3
  test("double delegation: root → admin → user → depth 3", () => {
    const root = engine.issue("action://test/place-order/1.0", "system-root");
    const admin = engine.delegate(root.id, []);
    const user = engine.delegate(admin.id, []);

    const chain = engine.verifyChain(user.id);
    expect(chain.valid).toBe(true);
    expect(chain.depth).toBe(3);
    expect(chain.root).toBe("system-root");
  });

  // 12. resolve() throws for unknown id
  test("resolve() throws for unknown id", () => {
    expect(() => engine.resolve("cid:sha256:nonexistent")).toThrow(
      "Capability not found: cid:sha256:nonexistent",
    );
  });

  test("authorizeResource() with matching resourceId and no caveats → authorized", () => {
    const cap = engine.issue("resource://orders/read/1.0", "admin-root");
    const result = engine.authorizeResource(cap.id, "resource://orders/read/1.0", { id: "user-1" });
    expect(result).toEqual({ authorized: true });
  });

  test("authorizeResource() with wrong resourceId → resource mismatch", () => {
    const cap = engine.issue("resource://orders/read/1.0", "admin-root");
    const result = engine.authorizeResource(cap.id, "resource://invoices/read/1.0", {
      id: "user-1",
    });
    expect(result.authorized).toBe(false);
    expect(result.error).toBe("resource mismatch");
    expect(result.error).not.toBe("action mismatch");
  });

  test("authorizeResource() with unknown capability → not found", () => {
    const result = engine.authorizeResource("cid:sha256:nonexistent", "resource://x", {
      id: "user-1",
    });
    expect(result.authorized).toBe(false);
    expect(result.error).toMatch(/Capability not found/);
  });

  test("authorizeResource() caveats see $resource and $subject", () => {
    const resourceCaveat: KernelExpression = {
      op: "call",
      fn: "eq",
      args: [
        { op: "var", name: "$resource" },
        { op: "const", value: "resource://orders/read/1.0" },
      ],
    };
    const resourceCap = engine.issue("resource://orders/read/1.0", "admin-root", {
      caveats: [resourceCaveat],
    });
    expect(
      engine.authorizeResource(resourceCap.id, "resource://orders/read/1.0", {
        id: "user-1",
      }),
    ).toEqual({ authorized: true });

    const subjectCaveat: KernelExpression = {
      op: "call",
      fn: "eq",
      args: [
        { op: "get", path: "$subject/id" },
        { op: "const", value: "user-admin" },
      ],
    };
    const subjectCap = engine.issue("resource://orders/read/1.0", "admin-root", {
      caveats: [subjectCaveat],
    });
    expect(
      engine.authorizeResource(subjectCap.id, "resource://orders/read/1.0", {
        id: "user-admin",
      }),
    ).toEqual({ authorized: true });
    expect(
      engine.authorizeResource(subjectCap.id, "resource://orders/read/1.0", {
        id: "user-other",
      }),
    ).toEqual({ authorized: false, failedCaveat: "caveat 0" });
  });

  test("authorizeResource() temporal bound uses wall-clock time", () => {
    const expiredCap = engine.issue("resource://orders/read/1.0", "admin-root", {
      expiresAt: "2000-01-01T00:00:00Z",
    });
    expect(
      engine.authorizeResource(expiredCap.id, "resource://orders/read/1.0", {
        id: "user-1",
      }),
    ).toEqual({ authorized: false, error: "capability expired" });

    const futureCap = engine.issue("resource://orders/read/1.0", "admin-root", {
      expiresAt: "2999-01-01T00:00:00Z",
    });
    expect(
      engine.authorizeResource(futureCap.id, "resource://orders/read/1.0", {
        id: "user-1",
      }),
    ).toEqual({ authorized: true });
  });

  test("authorize() with intent still works unchanged after authorizeResource addition", () => {
    const cap = engine.issue("action://test/place-order/1.0", "admin-root");
    const intent = makeIntent("action://test/place-order/1.0", { amount: 100 });
    expect(engine.authorize(intent, cap.id)).toEqual({ authorized: true });
  });
});
