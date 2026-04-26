/**
 * Layer 16: Proof System — propositions and verification.
 *
 * Following Curry-Howard: propositions are types, proofs are programs.
 * A Proposition is a named logical statement (KernelExpression returning boolean).
 * Verification checks whether a witness satisfies the proposition.
 */

import type { TypeRef } from "../L01-foundation/types.ts";
import type { ExpressionEvaluator, KernelExpression } from "../L04-expression/evaluator.ts";
import { MetamodelKernel } from "../L03-tower/metamodel-kernel.ts";

// ── Proposition ──────────────────────────────────────────────────────────

export interface Proposition {
  id: string;
  name: string;
  statement: KernelExpression; // evaluates to boolean
  context: Record<string, TypeRef>; // free variables and their types
  origin?: string;
}

// ── ProofResult ──────────────────────────────────────────────────────────

export interface ProofResult {
  valid: boolean;
  method: "evaluation" | "exhaustive" | "witness";
  witness?: unknown;
  error?: string;
}

// ── ProofEngine ──────────────────────────────────────────────────────────

export class ProofEngine {
  private readonly kernel: MetamodelKernel;
  private readonly evaluator: ExpressionEvaluator;
  private readonly propositions = new Map<string, Proposition>();

  constructor(kernel: MetamodelKernel, evaluator: ExpressionEvaluator) {
    this.kernel = kernel;
    this.evaluator = evaluator;
  }

  /**
   * Define a named proposition. ID: `prop://{origin}/{name}`.
   */
  defineProposition(
    name: string,
    statement: KernelExpression,
    context: Record<string, TypeRef>,
    origin?: string,
  ): Proposition {
    const resolvedOrigin = origin ?? "github.com/Stream44/s44-rak-gen1@1.0";
    const id = `prop://${resolvedOrigin}/${name}`;

    const proposition: Proposition = {
      id,
      name,
      statement,
      context,
      origin: resolvedOrigin,
    };

    this.propositions.set(id, proposition);
    return proposition;
  }

  /**
   * Evaluate the proposition's statement with the given variable bindings.
   */
  verify(propositionId: string, bindings: Record<string, unknown>): ProofResult {
    const prop = this.resolve(propositionId);
    const result = this.evaluator.evaluate(prop.statement, bindings);

    if (result.error) {
      return { valid: false, method: "evaluation", error: result.error };
    }

    return { valid: result.value === true, method: "evaluation" };
  }

  /**
   * Evaluate the proposition for each sample value of the given variable.
   * All must return true. If any fails, include the failing sample as witness.
   */
  verifyForAll(propositionId: string, variable: string, samples: unknown[]): ProofResult {
    const prop = this.resolve(propositionId);

    for (const sample of samples) {
      const result = this.evaluator.evaluate(prop.statement, {
        [variable]: sample,
      });

      if (result.error) {
        return {
          valid: false,
          method: "exhaustive",
          witness: sample,
          error: `Failed for ${variable}=${JSON.stringify(sample)}: ${result.error}`,
        };
      }

      if (result.value !== true) {
        return {
          valid: false,
          method: "exhaustive",
          witness: sample,
          error: `Failed for ${variable}=${JSON.stringify(sample)}`,
        };
      }
    }

    return { valid: true, method: "exhaustive" };
  }

  /**
   * Try each candidate as binding for the first context variable.
   * Return the first one where the statement evaluates to true, or null.
   */
  findWitness(propositionId: string, candidates: unknown[]): unknown | null {
    const prop = this.resolve(propositionId);
    const firstVar = Object.keys(prop.context)[0];

    for (const candidate of candidates) {
      const result = this.evaluator.evaluate(prop.statement, {
        [firstVar]: candidate,
      });

      if (result.value === true) {
        return candidate;
      }
    }

    return null;
  }

  /**
   * Resolve a proposition by ID. Throws if not found.
   */
  resolve(id: string): Proposition {
    const prop = this.propositions.get(id);
    if (!prop) {
      throw new Error(`Unknown proposition: ${id}`);
    }
    return prop;
  }
}
