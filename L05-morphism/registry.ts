/**
 * Layer 12: Morphisms — typed transformations as content-addressed data.
 *
 * A Morphism is a pure function A→B stored as data. It carries source/target
 * type references and a KernelExpression that performs the transformation.
 * Morphisms are content-addressed by hashing {sourceType, targetType, expr}.
 */

import type { Datum, TypeRef } from "../L01-foundation/types.ts";
import { JsonEncoder } from "../L01-foundation/encoder.ts";
import { deepEqual } from "../L01-foundation/equality.ts";
import type { MorphismAST } from "../L01-foundation/morphism-ast.ts";
import type { ExpressionEvaluator, KernelExpression } from "../L04-expression/evaluator.ts";
import type { MetamodelKernel } from "../L03-tower/metamodel-kernel.ts";

// ── Morphism Interface ───────────────────────────────────────────────────

/**
 * Algebra impls carry an embedded AST for registry-owned evaluation.
 */
export type MorphismImpl =
  | { kind: "algebra"; ast: MorphismAST | KernelExpression }
  | { kind: "module"; uri: string; export: string };

export type ModuleResolver = (uri: string, exportName: string) => Promise<Function>;

interface CompilerRunner {
  run(cidOrInput?: unknown, input?: unknown): unknown | Promise<unknown>;
}

class ParityMismatchError extends Error {
  readonly morphismId: string;
  readonly sourceValue: unknown;
  readonly compiledValue: unknown;
  readonly input: unknown;

  constructor(args: {
    morphismId: string;
    sourceValue: unknown;
    compiledValue: unknown;
    input: unknown;
  }) {
    super(`Parity mismatch for ${args.morphismId}`);
    this.name = "ParityMismatchError";
    this.morphismId = args.morphismId;
    this.sourceValue = args.sourceValue;
    this.compiledValue = args.compiledValue;
    this.input = args.input;
  }
}

export interface Morphism {
  id: string;
  name: string;
  sourceType: TypeRef;
  targetType: TypeRef;
  expr: KernelExpression;
  isIsomorphism: boolean;
  inverseId?: string;
  cid: string;
  impl?: MorphismImpl;
  defaultContext?: Record<string, unknown>;
  compiled?: CompiledMorphismRef;
}

export interface CompiledMorphismRef {
  cid: string;
  bundleUri?: string;
  compilerVersion: number;
}

export interface MorphismDefineOptions {
  isIsomorphism?: boolean;
  inverseId?: string;
  version?: string;
  impl?: MorphismImpl;
  defaultContext?: Record<string, unknown>;
  compiled?: CompiledMorphismRef;
  id?: string;
}

export interface MorphismListOptions {
  sourceType?: TypeRef;
  targetType?: TypeRef;
}

export type CompilerMode = "source" | "compiled" | "parity";

export interface MorphismRegistryEvent {
  kind: "registry:compiled-fallback";
  morphismId: string;
  cid: string;
  mode: Extract<CompilerMode, "compiled">;
}

// ── Morphism Registry ────────────────────────────────────────────────────

export class MorphismRegistry {
  private morphisms = new Map<string, Morphism>();
  private moduleResolver?: ModuleResolver;
  private resolvedModules = new Map<string, Function>();
  private pendingModuleLoads = new Map<string, Promise<Function>>();
  private readonly listeners = new Set<(event: MorphismRegistryEvent) => void>();
  private readonly kernel: MetamodelKernel;
  private readonly evaluator: ExpressionEvaluator;
  private readonly encoder = new JsonEncoder();
  private vm: CompilerRunner | null = null;
  private mode: CompilerMode = "source";

  constructor(kernel: MetamodelKernel, evaluator: ExpressionEvaluator) {
    this.kernel = kernel;
    this.evaluator = evaluator;
  }

  /**
   * Define a new morphism: a typed transformation from sourceType to targetType.
   * The morphism is content-addressed by hashing {sourceType, targetType, expr}.
   * Module-backed morphisms must still pass a positional `expr` placeholder;
   * the runtime implementation is supplied lazily via `opts.impl`.
   */
  define(
    name: string,
    sourceType: TypeRef,
    targetType: TypeRef,
    expr: KernelExpression,
    opts?: MorphismDefineOptions,
  ): Morphism {
    // Verify source and target types exist
    this.kernel.resolveType(sourceType);
    this.kernel.resolveType(targetType);

    const version = opts?.version ?? "1.0";
    const id = opts?.id ?? `morphism://github.com/Stream44/s44-rak-gen1@1.0/${name}/${version}`;

    // Content-address: hash the semantic content
    const contentKey = opts?.impl
      ? {
          sourceType,
          targetType,
          expr,
          impl: opts.impl,
          defaultContext: opts.defaultContext,
        }
      : { sourceType, targetType, expr, defaultContext: opts?.defaultContext };
    const { cid } = this.encoder.encodeAndHash(contentKey);

    const morphism: Morphism = {
      id,
      name,
      sourceType,
      targetType,
      expr,
      isIsomorphism: opts?.isIsomorphism ?? false,
      inverseId: opts?.inverseId,
      cid,
      impl: opts?.impl,
      defaultContext: opts?.defaultContext,
      compiled: opts?.compiled,
    };

    this.morphisms.set(id, morphism);
    return morphism;
  }

  registerModuleResolver(resolver: ModuleResolver): void {
    this.moduleResolver = resolver;
  }

  getEvaluator(): ExpressionEvaluator {
    return this.evaluator;
  }

  /**
   * registerCompiler swaps the active VM + dispatch mode without compiling eagerly.
   */
  registerCompiler(vm: CompilerRunner, mode: CompilerMode): void {
    this.vm = vm;
    this.mode = mode;
  }

  getCompilerMode(): CompilerMode {
    return this.mode;
  }

  onEvent(listener: (event: MorphismRegistryEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Module-backed morphisms lazy-load on first evaluation and cache by
   * morphism id. Concurrent calls for the same morphism share a single
   * in-flight load promise, so repeated dispatches do not trigger duplicate
   * imports. The same single-flight guard also covers re-entrancy: if loading
   * morphism A somehow reaches evaluate(A, ...) again before the first load
   * resolves, the nested call awaits the pending promise instead of starting a
   * second import. Rejected loads are not retained in the pending map, so a
   * later evaluate() call retries from scratch rather than reusing a poisoned
   * promise. Algebra-impl morphisms evaluate their embedded AST via the owned
   * ExpressionEvaluator; no cache is needed because the evaluator is pure.
   */
  async evaluate(
    morphismId: string,
    input: unknown,
    context: Record<string, unknown> = {},
  ): Promise<unknown> {
    const morphism = this.resolve(morphismId);
    const evaluationContext = { ...morphism.defaultContext, $input: input, ...context };
    const needsRuntimeContext =
      Object.keys(morphism.defaultContext ?? {}).length > 0 || Object.keys(context).length > 0;

    const inputValidation = this.kernel.validate(morphism.sourceType, input);
    if (!inputValidation.valid) {
      throw new Error(
        `Morphism ${morphism.id}: input does not conform to ${morphism.sourceType}: ${inputValidation.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
      );
    }

    const validateOutput = (value: unknown): unknown => {
      const outputValidation = this.kernel.validate(morphism.targetType, value);
      if (!outputValidation.valid) {
        throw new Error(
          `Morphism ${morphism.id}: output does not conform to ${morphism.targetType}: ${outputValidation.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
        );
      }
      return value;
    };

    const evaluateSource = async (): Promise<unknown> => {
      if (!morphism.impl) {
        const evaluation = this.evaluator.evaluate(morphism.expr, evaluationContext);
        if (evaluation.error) {
          throw new Error(`Morphism evaluation failed: ${evaluation.error}`);
        }
        return validateOutput(evaluation.value);
      }

      if (morphism.impl.kind === "algebra") {
        const ast = morphism.impl.ast as KernelExpression;
        const evaluation = this.evaluator.evaluate(ast, evaluationContext);
        if (evaluation.error) {
          throw new Error(
            `Morphism ${morphism.id}: algebra evaluation failed: ${evaluation.error}`,
          );
        }
        return validateOutput(evaluation.value);
      }

      if (this.moduleResolver === undefined) {
        throw new Error(
          `Morphism ${morphism.id}: no module resolver configured; call registerModuleResolver() before evaluating module-backed morphisms`,
        );
      }

      const moduleImpl = morphism.impl;
      const cacheKey = morphism.id;
      const invoke = (fn: Function): unknown | Promise<unknown> => {
        const maybeResult = fn(input, context);
        if (maybeResult instanceof Promise) {
          return maybeResult.then((resolved) => validateOutput(resolved));
        }
        return validateOutput(maybeResult);
      };
      let fn = this.resolvedModules.get(cacheKey);
      if (!fn) {
        const pending = this.pendingModuleLoads.get(cacheKey);
        if (pending) {
          return await pending.then((resolved) => invoke(resolved));
        } else {
          const loadPromise = this.moduleResolver(moduleImpl.uri, moduleImpl.export)
            .then((loaded) => {
              this.resolvedModules.set(cacheKey, loaded);
              return loaded;
            })
            .catch((err) => {
              const message = err instanceof Error ? err.message : String(err);
              const wrapped = new Error(
                `Morphism ${morphism.id}: lazy module load failed for ${moduleImpl.uri}#${moduleImpl.export}: ${message}. ` +
                  `Consider adding this URI to the kernel model's computeModulePreload.`,
              );
              throw wrapped;
            })
            .finally(() => {
              this.pendingModuleLoads.delete(cacheKey);
            });
          this.pendingModuleLoads.set(cacheKey, loadPromise);
          return await loadPromise.then((resolved) => invoke(resolved));
        }
      }

      return await invoke(fn);
    };

    const evaluateCompiled = async (): Promise<unknown> => {
      if (!morphism.compiled || this.vm === null || needsRuntimeContext) {
        this.emit({
          kind: "registry:compiled-fallback",
          morphismId: morphism.id,
          cid: morphism.cid,
          mode: "compiled",
        });
        return evaluateSource();
      }
      return validateOutput(await this.vm.run(morphism.compiled.cid, input));
    };

    if (this.mode === "compiled") {
      return evaluateCompiled();
    }
    if (this.mode === "parity") {
      const sourceValue = await evaluateSource();
      if (!morphism.compiled || this.vm === null || needsRuntimeContext) {
        return sourceValue;
      }
      const compiledValue = validateOutput(await this.vm.run(morphism.compiled.cid, input));
      if (!deepEqual(sourceValue, compiledValue)) {
        throw new ParityMismatchError({
          morphismId: morphism.id,
          sourceValue,
          compiledValue,
          input,
        });
      }
      return sourceValue;
    }
    return evaluateSource();
  }

  /**
   * Apply a morphism to a datum. Evaluates the morphism's expression with
   * datum.data bound as $input, validates output against targetType, and
   * returns a new Datum of the target type.
   */
  apply(morphismId: string, datum: Datum): Datum {
    const morphism = this.resolve(morphismId);

    // Validate input datum against source type
    const inputValidation = this.kernel.validate(morphism.sourceType, datum.data);
    if (!inputValidation.valid) {
      throw new Error(
        `Input datum does not conform to source type "${morphism.sourceType}": ${inputValidation.errors.map((e) => e.message).join(", ")}`,
      );
    }

    // Evaluate the expression with datum.data as $input
    const result = this.evaluator.evaluate(morphism.expr, { $input: datum.data });
    if (result.error) {
      throw new Error(`Morphism evaluation failed: ${result.error}`);
    }

    // Validate output against target type
    const outputValidation = this.kernel.validate(morphism.targetType, result.value);
    if (!outputValidation.valid) {
      throw new Error(
        `Morphism output does not conform to target type "${morphism.targetType}": ${outputValidation.errors.map((e) => e.message).join(", ")}`,
      );
    }

    // Create new datum of target type
    return this.kernel.createDatum(morphism.targetType, result.value, [
      { rel: "derivedFrom", target: datum.id },
      { rel: "appliedMorphism", target: morphism.id },
    ]);
  }

  /**
   * Compose two morphisms: g ∘ f (apply f first, then g).
   * Requires that targetType of f === sourceType of g.
   */
  compose(fId: string, gId: string): Morphism {
    const f = this.resolve(fId);
    const g = this.resolve(gId);

    if (f.targetType !== g.sourceType) {
      throw new Error(
        `Cannot compose: target type of f ("${f.targetType}") does not match source type of g ("${g.sourceType}")`,
      );
    }

    // Build composed expression: apply f to $input, then apply g to that result
    const composedExpr: KernelExpression = {
      op: "let",
      name: "$mid",
      value: {
        op: "apply",
        fn: { op: "lambda", param: "$input", body: f.expr },
        arg: { op: "var", name: "$input" },
      },
      body: {
        op: "apply",
        fn: { op: "lambda", param: "$input", body: g.expr },
        arg: { op: "var", name: "$mid" },
      },
    };

    const composedName = `${g.name}_after_${f.name}`;
    return this.define(composedName, f.sourceType, g.targetType, composedExpr);
  }

  /**
   * Create an identity morphism for a type. The expression simply returns $input.
   */
  identity(typeRef: TypeRef): Morphism {
    this.kernel.resolveType(typeRef);

    const expr: KernelExpression = { op: "var", name: "$input" };
    const parsed = typeRef.split("/");
    const typeName = parsed[parsed.length - 2] ?? "unknown";

    return this.define(`identity_${typeName}`, typeRef, typeRef, expr);
  }

  /**
   * Invert an isomorphism. The morphism must be marked as isIsomorphism
   * and must have an inverseId pointing to the inverse morphism.
   */
  invert(morphismId: string): Morphism {
    const morphism = this.resolve(morphismId);

    if (!morphism.isIsomorphism) {
      throw new Error(`Morphism "${morphismId}" is not an isomorphism and cannot be inverted`);
    }

    if (!morphism.inverseId) {
      throw new Error(`Morphism "${morphismId}" is an isomorphism but has no inverseId`);
    }

    return this.resolve(morphism.inverseId);
  }

  /**
   * Resolve a morphism by its ID. Throws if not found.
   */
  resolve(id: string): Morphism {
    const morphism = this.morphisms.get(id);
    if (!morphism) {
      throw new Error(`Morphism not found: ${id}`);
    }
    return morphism;
  }

  /**
   * List all morphisms, optionally filtered by sourceType and/or targetType.
   */
  list(opts?: MorphismListOptions): Morphism[] {
    let results = Array.from(this.morphisms.values());

    if (opts?.sourceType) {
      results = results.filter((m) => m.sourceType === opts.sourceType);
    }
    if (opts?.targetType) {
      results = results.filter((m) => m.targetType === opts.targetType);
    }

    return results;
  }

  private emit(event: MorphismRegistryEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch {
        // Listener failures must not affect morphism dispatch.
      }
    }
  }
}
