import type { BuiltinFn, KernelExpression } from "../L04-expression/evaluator.ts";
import type { MorphismRegistry } from "../L05-morphism/registry.ts";
import { TypeRegistry } from "../L03-tower/registry.ts";
import type { TaggedAstNode } from "./ir/ast-tagged.ts";
import { BundleCache } from "./cache/bundle-cache.ts";
import { emit } from "./passes/emit.ts";
import { fold } from "./passes/fold.ts";
import { inline } from "./passes/inline.ts";
import { lower } from "./passes/lower.ts";
import { normalize } from "./passes/normalize.ts";
import { allocate } from "./passes/allocate.ts";
import { specialise } from "./passes/specialise.ts";
import type { OpcodeKernelVm } from "./runtime/kernel-vm.ts";

const BUILTINS = new Set<BuiltinFn>([
  "add",
  "sub",
  "mul",
  "div",
  "mod",
  "neg",
  "abs",
  "eq",
  "neq",
  "lt",
  "lte",
  "gt",
  "gte",
  "and",
  "or",
  "not",
  "concat",
  "arrayConcat",
  "length",
  "substr",
  "head",
  "tail",
  "map",
  "filter",
  "fold",
  "keys",
  "values",
  "has",
  "merge",
  "matches",
  "canonicalize",
  "eval",
]);

export function compileAllAlgebraMorphisms(registry: MorphismRegistry, vm: OpcodeKernelVm): void {
  const typeRegistry = (registry as unknown as { kernel: { registry: TypeRegistry } }).kernel
    .registry;
  const morphisms = registry.list();
  const validOps = new Set(
    typeRegistry.listAlgebraOperators().map((entry: { name: string }) => entry.name),
  );
  const taggedById = new Map<string, TaggedAstNode>();
  for (const morphism of morphisms) {
    if (morphism.impl?.kind !== "algebra") continue;
    taggedById.set(
      morphism.id,
      fold(normalize(morphism.impl.ast as KernelExpression, { validOps, validBuiltins: BUILTINS })),
    );
  }
  const inlined = inline({
    entryId: morphisms[0]?.id ?? "bootstrap",
    morphisms: Object.fromEntries(
      morphisms
        .filter((morphism) => morphism.impl?.kind === "algebra")
        .map((morphism) => [
          morphism.id,
          { ...morphism, impl: { ...morphism.impl!, ast: taggedById.get(morphism.id)! } },
        ]),
    ),
  });
  const cache =
    vm.options.registry instanceof BundleCache ? vm.options.registry : new BundleCache();
  for (const morphism of morphisms) {
    if (morphism.impl?.kind !== "algebra") continue;
    const bundle = emit(
      specialise(
        lower(
          allocate(
            (inlined.morphisms as Record<string, { impl: { ast: TaggedAstNode } }>)[morphism.id]!
              .impl.ast,
          ),
        ),
      ),
      1,
    );
    cache.put(bundle);
    morphism.compiled = { cid: bundle.cid, compilerVersion: 1 };
  }
}
