/**
 * Layer 24: Capability & Authorization Engine — proof-carrying authorization tokens.
 *
 * Capabilities are content-addressed authorization tokens that an intent must
 * present in order to proceed. Each capability carries caveats (KernelExpression
 * predicates) that attenuate what the holder can do. Capabilities can be
 * delegated, forming a verifiable chain back to a root authority.
 */

import { JsonEncoder } from "../L01-foundation/encoder.ts";
import type { ExpressionEvaluator, KernelExpression } from "../L04-expression/evaluator.ts";
import type { AlgebraicKernel } from "../L13-facade/index.ts";
import type { Intent } from "./intent.ts";

// ── Types ────────────────────────────────────────────────────────────────

export interface Capability {
  id: string; // CID
  action: string; // action type ref the cap authorizes
  caveats: KernelExpression[]; // attenuation predicates
  issuer: string; // root authority identifier
  delegatedFrom?: string; // parent capability CID (delegation chain)
  expiresAt?: string; // ISO-8601 temporal bound (optional)
}

export interface AuthorizationResult {
  authorized: boolean;
  failedCaveat?: string; // which caveat failed (index or description)
  error?: string;
}

// ── CapabilityEngine ─────────────────────────────────────────────────────

export class CapabilityEngine {
  private capabilities = new Map<string, Capability>();
  private encoder = new JsonEncoder();
  private evaluator: ExpressionEvaluator;

  constructor(private kernel: AlgebraicKernel) {
    this.evaluator = kernel.evaluator;
  }

  /**
   * Issue a root capability for the given action type reference.
   * Computes a CID from { action, issuer, caveats } and stores the capability.
   */
  issue(
    actionRef: string,
    issuer: string,
    opts?: {
      caveats?: KernelExpression[];
      expiresAt?: string;
    },
  ): Capability {
    const caveats = opts?.caveats ?? [];
    const expiresAt = opts?.expiresAt;

    const { cid } = this.encoder.encodeAndHash({
      action: actionRef,
      issuer,
      caveats,
    });

    const cap: Capability = {
      id: cid,
      action: actionRef,
      caveats,
      issuer,
      ...(expiresAt ? { expiresAt } : {}),
    };

    this.capabilities.set(cid, cap);
    return cap;
  }

  /**
   * Delegate: create a child capability with additional caveats.
   * The child inherits the parent's action, issuer, and caveats,
   * plus the additional caveats supplied here.
   */
  delegate(parentCapId: string, additionalCaveats: KernelExpression[]): Capability {
    const parent = this.resolve(parentCapId);
    const caveats = [...parent.caveats, ...additionalCaveats];

    const { cid } = this.encoder.encodeAndHash({
      action: parent.action,
      issuer: parent.issuer,
      caveats,
      delegatedFrom: parentCapId,
    });

    const cap: Capability = {
      id: cid,
      action: parent.action,
      caveats,
      issuer: parent.issuer,
      delegatedFrom: parentCapId,
    };

    this.capabilities.set(cid, cap);
    return cap;
  }

  /**
   * Authorize an intent against a capability.
   *
   * 1. Resolve capability
   * 2. Check action match
   * 3. Check temporal bound (expiresAt vs intent.timestamp)
   * 4. Evaluate each caveat with context { $intent, $payload, $self }
   * 5. Return result
   */
  authorize(intent: Intent, capabilityId: string): AuthorizationResult {
    const cap = this.capabilities.get(capabilityId);
    if (!cap) {
      return { authorized: false, error: `Capability not found: ${capabilityId}` };
    }

    // Action match
    if (cap.action !== intent.action) {
      return { authorized: false, error: "action mismatch" };
    }

    // Temporal bound
    if (cap.expiresAt) {
      if (cap.expiresAt <= intent.timestamp) {
        return { authorized: false, error: "capability expired" };
      }
    }

    // Evaluate caveats
    for (let i = 0; i < cap.caveats.length; i++) {
      const result = this.evaluator.evaluate(cap.caveats[i], {
        $intent: intent,
        $payload: intent.payload,
        $self: intent.payload,
      });
      if (result.error || !result.value) {
        return { authorized: false, failedCaveat: `caveat ${i}` };
      }
    }

    return { authorized: true };
  }

  /**
   * Read-path authorization. Spec 01 §18.11 overload.
   * Resolves capabilityId; checks cap.action === resourceId.
   * URIs are URIs per §18.11.
   * Checks cap.expiresAt against wall-clock ISO.
   * Evaluates each caveat with { $resource, $subject }.
   */
  authorizeResource(
    capabilityId: string,
    resourceId: string,
    subject: { id: string },
  ): AuthorizationResult {
    const cap = this.capabilities.get(capabilityId);
    if (!cap) return { authorized: false, error: `Capability not found: ${capabilityId}` };
    if (cap.action !== resourceId) return { authorized: false, error: "resource mismatch" };
    if (cap.expiresAt && cap.expiresAt <= new Date().toISOString()) {
      return { authorized: false, error: "capability expired" };
    }
    for (let i = 0; i < cap.caveats.length; i++) {
      const result = this.evaluator.evaluate(cap.caveats[i], {
        $resource: resourceId,
        $subject: subject,
      });
      if (result.error || !result.value) {
        return { authorized: false, failedCaveat: `caveat ${i}` };
      }
    }
    return { authorized: true };
  }

  /**
   * Verify delegation chain integrity.
   * Walks delegatedFrom links to the root and returns depth + root issuer.
   */
  verifyChain(capabilityId: string): {
    valid: boolean;
    depth: number;
    root: string;
  } {
    let current = this.capabilities.get(capabilityId);
    if (!current) {
      return { valid: false, depth: 0, root: "" };
    }

    let depth = 1;
    while (current.delegatedFrom) {
      const parent = this.capabilities.get(current.delegatedFrom);
      if (!parent) {
        return { valid: false, depth, root: "" };
      }
      depth++;
      current = parent;
    }

    return { valid: true, depth, root: current.issuer };
  }

  /** Resolve a capability by id; throws if not found. */
  resolve(id: string): Capability {
    const cap = this.capabilities.get(id);
    if (!cap) throw new Error(`Capability not found: ${id}`);
    return cap;
  }
}
