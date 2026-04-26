/**
 * Layer 13: Refinement Types — predicates narrowing base types.
 *
 * A RefinementType is a base type narrowed by a KernelExpression predicate
 * that must evaluate to true. E.g. `{ x: integer | x > 0 }` = PositiveInteger.
 */

import type {
  TypeDef,
  TypeRef,
  ValidationError,
  ValidationResult,
} from "../L01-foundation/types.ts";
import type { ExpressionEvaluator, KernelExpression } from "../L04-expression/evaluator.ts";
import type { MetamodelKernel } from "../L03-tower/metamodel-kernel.ts";

// ── Refinement Type Definition ───────────────────────────────────────

export interface RefinementTypeDef extends TypeDef {
  refines: TypeRef;
  predicate: KernelExpression;
}

// ── Refinement Validation Result ─────────────────────────────────────

export interface RefinementResult {
  structurallyValid: boolean;
  predicateSatisfied: boolean | null;
  errors: ValidationError[];
}

// ── Refinement Engine ────────────────────────────────────────────────

export class RefinementEngine {
  private readonly kernel: MetamodelKernel;
  private readonly evaluator: ExpressionEvaluator;
  private readonly refinements = new Map<string, RefinementTypeDef>();

  constructor(kernel: MetamodelKernel, evaluator: ExpressionEvaluator) {
    this.kernel = kernel;
    this.evaluator = evaluator;
  }

  /**
   * Define a new refinement type: a base type narrowed by a predicate.
   */
  define(
    name: string,
    version: string,
    baseTypeRef: TypeRef,
    predicate: KernelExpression,
    origin: string = "github.com/Stream44/s44-rak-gen1@1.0",
  ): RefinementTypeDef {
    const id = `type://${origin}/${name}/${version}`;

    // Resolve the base type to ensure it exists
    const baseType = this.kernel.resolveType(baseTypeRef);

    const refinement: RefinementTypeDef = {
      id,
      level: baseType.level,
      conformsTo: baseType.conformsTo,
      schema: baseType.schema,
      name,
      version,
      refines: baseTypeRef,
      predicate,
    };

    this.refinements.set(id, refinement);
    return refinement;
  }

  /**
   * Validate data against a refinement type.
   *
   * First validates structurally against the base type schema.
   * If structural validation passes, evaluates the predicate with { $self: data }.
   */
  validate(data: unknown, refinementId: string): RefinementResult {
    const refinement = this.refinements.get(refinementId);
    if (!refinement) {
      throw new Error(`Unknown refinement: ${refinementId}`);
    }

    // Step 1: structural validation against base type
    const structural: ValidationResult = this.kernel.validate(refinement.refines, data);

    if (!structural.valid) {
      return {
        structurallyValid: false,
        predicateSatisfied: null,
        errors: structural.errors,
      };
    }

    // Step 2: evaluate predicate
    const evalResult = this.evaluator.evaluate(refinement.predicate, {
      $self: data,
    });

    if (evalResult.error) {
      return {
        structurallyValid: true,
        predicateSatisfied: false,
        errors: [
          {
            path: "",
            message: `Predicate evaluation error: ${evalResult.error}`,
            keyword: "refinement",
            params: { error: evalResult.error },
          },
        ],
      };
    }

    const satisfied = evalResult.value === true;

    return {
      structurallyValid: true,
      predicateSatisfied: satisfied,
      errors: satisfied
        ? []
        : [
            {
              path: "",
              message: `Refinement predicate not satisfied`,
              keyword: "refinement",
              params: { refinementId },
            },
          ],
    };
  }

  /**
   * Conservative subtype check: if r1 refines the same base as r2 and
   * r1's predicate implies r2's predicate (tested by evaluating both
   * on sample data — NOT formal, just practical).
   */
  isSubtype(r1Id: string, r2Id: string): boolean {
    const r1 = this.refinements.get(r1Id);
    const r2 = this.refinements.get(r2Id);
    if (!r1 || !r2) return false;

    // Must refine the same base type
    if (r1.refines !== r2.refines) return false;

    // Practical implication test: generate sample values and check
    // that whenever r1's predicate holds, r2's predicate also holds.
    const samples = [0, 1, -1, 2, 3, 4, 5, 10, 100, -100, 0.5];
    for (const sample of samples) {
      const r1Result = this.evaluator.evaluate(r1.predicate, {
        $self: sample,
      });
      const r2Result = this.evaluator.evaluate(r2.predicate, {
        $self: sample,
      });

      // If r1 holds but r2 doesn't, then r1 is NOT a subtype of r2
      if (r1Result.value === true && r2Result.value !== true) {
        return false;
      }
    }

    return true;
  }

  /**
   * Resolve a refinement definition by id.
   */
  resolve(id: string): RefinementTypeDef | undefined {
    return this.refinements.get(id);
  }
}
