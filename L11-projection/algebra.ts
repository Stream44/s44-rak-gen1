/**
 * Layer 27: Projection algebra (spec §6).
 *
 * An AST for projection morphisms with a YAML compiler and an interpreter.
 * Eleven operators: ref | compose | product | sum | restrict | extend |
 * fmap | iter | cond | literal | guard. `guard` is **desugared at compile
 * time** into `restrict` + a fallback annotation so that the capability
 * surveyor can enumerate every `requires:` in one pass without
 * re-deriving guard semantics.
 */

// NOTE: guard(requires, f, fallback) is desugared at COMPILE time to
// restrict(<$capabilityCheck sentinel>, f, fallback) with a
// _derivedFromGuard annotation on the produced RestrictNode. This keeps
// the render interpreter's cases flat (no dedicated guard branch) AND
// lets surveyCapabilities see the requires: list after compile
// without re-parsing the source YAML. See spec §6.8 / §7.2 step 6.

import { BindingResolver } from "./bindings.ts";
import { TypeRegistry } from "../L03-tower/registry.ts";
import type { AlgebraOperatorM1 } from "../L02-metamodels/algebra-operator.ts";
import type { RenderContext } from "../L01-foundation/projection-types.ts";
import type {
  ComposeNode,
  CondNode,
  ExtendNode,
  FmapNode,
  GuardNode,
  IterNode,
  LiteralNode,
  MorphismAST,
  ProductNode,
  RefNode,
  RestrictNode,
  SumNode,
} from "../L01-foundation/morphism-ast.ts";
export type {
  ComposeNode,
  CondNode,
  ExtendNode,
  FmapNode,
  GuardNode,
  IterNode,
  LiteralNode,
  MorphismAST,
  ProductNode,
  RefNode,
  RestrictNode,
  SumNode,
} from "../L01-foundation/morphism-ast.ts";

export interface InterpreterContext {
  bindings: Map<string, unknown>;
  props: Record<string, unknown>;
  route: { path: string; params: Record<string, string>; query: Record<string, string> };
  currentUser: { id: string; capabilities: Record<string, string> };
  iteration?: { item: unknown; index: number; name: string };
  /**
   * Optional capability gate. If supplied, `restrict` nodes whose predicate
   * is a `{ $capabilityCheck: { requires, requiresAny } }` sentinel are
   * evaluated against this gate; absent → the check is treated as allow
   * (so algebra tests that don't care about capabilities run cleanly).
   */
  capabilityGate?: (requires: string[] | undefined, requiresAny: string[] | undefined) => boolean;
  /**
   * Optional asset resolver for `ref`. When undefined, `ref` nodes return
   * `{ asset, props }` as a shallow marker (enough for algebra tests).
   */
  resolveAsset?: (assetCid: string, props?: Record<string, unknown>) => unknown;
  /** Optional demand resolver for `fmap` and `extend`. */
  resolveDemand?: (binding: unknown) => unknown;
  /** Optional algebra-operator registry override for tests and custom dispatch. */
  operatorRegistry?: { listAlgebraOperators(): AlgebraOperatorM1[] };
}

type CapabilityCheckSentinel = {
  $capabilityCheck: { requires?: string[]; requiresAny?: string[] };
};

type ProjectionBindingSentinel = {
  $projectionSource: unknown;
  $projectionPath: string[];
};

type ProjectedSourceSentinel = {
  $projectedSource: true;
};

interface ProjectionEntry {
  path: string;
  requires?: string[];
  requiresAny?: string[];
  fallback?: unknown;
}

type OperatorDispatchNode = MorphismAST | { op: string; args?: unknown[] };
export type OperatorImplementation = (
  ctx: InterpreterContext,
  node: OperatorDispatchNode,
) => unknown;

function evaluateRef(ctx: InterpreterContext, node: RefNode): unknown {
  return ctx.resolveAsset
    ? ctx.resolveAsset(node.asset, node.props)
    : { kind: "ref", asset: node.asset, props: node.props };
}

function evaluateCompose(ctx: InterpreterContext, node: ComposeNode): unknown {
  const innerTree = evaluateMorphism(node.inner, ctx);
  const nextBindings = new Map(ctx.bindings);
  nextBindings.set("$inner", innerTree);
  nextBindings.set("inner", innerTree);
  return evaluateMorphism(node.outer, {
    ...ctx,
    bindings: nextBindings,
    props: { ...ctx.props, $inner: innerTree, inner: innerTree },
  });
}

function evaluateProduct(ctx: InterpreterContext, node: ProductNode): unknown {
  return {
    kind: "product",
    left: evaluateMorphism(node.left, ctx),
    right: evaluateMorphism(node.right, ctx),
  };
}

function evaluateSum(ctx: InterpreterContext, node: SumNode): unknown {
  return resolvePredicate(node.predicate, ctx)
    ? evaluateMorphism(node.then, ctx)
    : evaluateMorphism(node.else, ctx);
}

function evaluateExtend(ctx: InterpreterContext, node: ExtendNode): unknown {
  const boundValue = resolveDemandOrBinding(node.source.spec, ctx);
  const nextBindings = new Map(ctx.bindings);
  nextBindings.set(node.source.name, boundValue);
  return evaluateMorphism(node.f, { ...ctx, bindings: nextBindings });
}

function evaluateFmap(ctx: InterpreterContext, node: FmapNode): unknown {
  const sourceValue = resolveDemandOrBinding(node.binding, ctx);
  const nextBindings = new Map(ctx.bindings);
  nextBindings.set("$source", sourceValue);
  nextBindings.set("source", sourceValue);
  return evaluateMorphism(node.f, { ...ctx, bindings: nextBindings });
}

function evaluateIter(ctx: InterpreterContext, node: IterNode): unknown {
  const values = resolveBinding(node.for, ctx);
  if (!Array.isArray(values)) return [];
  if (values.length === 0) {
    return node.emptyFallback ? evaluateMorphism(node.emptyFallback, ctx) : [];
  }
  return values.map((item, index) =>
    evaluateMorphism(node.template, {
      ...ctx,
      iteration: { item, index, name: node.as ?? "item" },
    }),
  );
}

function evaluateCond(ctx: InterpreterContext, node: CondNode): unknown {
  if (resolvePredicate(node.if, ctx)) return evaluateMorphism(node.then, ctx);
  return node.else ? evaluateMorphism(node.else, ctx) : null;
}

function evaluateLiteral(ctx: InterpreterContext, node: LiteralNode): unknown {
  return isProjectedSourceSentinel(node.value) ? resolveBinding("$bind.source", ctx) : node.value;
}

const dispatchTable: Record<string, OperatorImplementation> = {
  ref: (ctx, node) => evaluateRef(ctx, node as RefNode),
  compose: (ctx, node) => evaluateCompose(ctx, node as ComposeNode),
  product: (ctx, node) => evaluateProduct(ctx, node as ProductNode),
  sum: (ctx, node) => evaluateSum(ctx, node as SumNode),
  restrict: (ctx, node) => evaluateRestrict(node as RestrictNode, ctx),
  extend: (ctx, node) => evaluateExtend(ctx, node as ExtendNode),
  fmap: (ctx, node) => evaluateFmap(ctx, node as FmapNode),
  iter: (ctx, node) => evaluateIter(ctx, node as IterNode),
  cond: (ctx, node) => evaluateCond(ctx, node as CondNode),
  literal: (ctx, node) => evaluateLiteral(ctx, node as LiteralNode),
  guard: (ctx, node) => evaluateGuard(node as GuardNode, ctx),
};

export function registerOperatorImpl(name: string, fn: OperatorImplementation): () => void {
  const previous = dispatchTable[name];
  dispatchTable[name] = fn;
  return () => {
    if (previous) dispatchTable[name] = previous;
    else delete dispatchTable[name];
  };
}

function getOperatorRegistry(ctx: InterpreterContext): {
  listAlgebraOperators(): AlgebraOperatorM1[];
} {
  return ctx.operatorRegistry ?? new TypeRegistry();
}

const operatorArgs: Record<string, (node: OperatorDispatchNode) => unknown[]> = {
  ref: (node) => [(node as RefNode).asset],
  compose: (node) => [(node as ComposeNode).outer, (node as ComposeNode).inner],
  product: (node) => [(node as ProductNode).left, (node as ProductNode).right],
  sum: (node) => [(node as SumNode).predicate, (node as SumNode).then, (node as SumNode).else],
  restrict: (node) => [(node as RestrictNode).predicate, (node as RestrictNode).f],
  extend: (node) => [(node as ExtendNode).source, (node as ExtendNode).f],
  fmap: (node) => [(node as FmapNode).binding, (node as FmapNode).f],
  iter: (node) => [(node as IterNode).for, (node as IterNode).template],
  cond: (node) => [(node as CondNode).if, (node as CondNode).then],
  literal: (node) => [(node as LiteralNode).value],
  guard: (node) => [
    [(node as GuardNode).requires, (node as GuardNode).requiresAny],
    (node as GuardNode).f,
  ],
};

function getOperatorArgs(node: OperatorDispatchNode): unknown[] {
  if ("args" in node && Array.isArray(node.args)) return node.args;
  return operatorArgs[node.op]?.(node) ?? [];
}

export const ref = (asset: string, props?: Record<string, unknown>): RefNode => ({
  op: "ref",
  asset,
  props,
});

export const compose = (outer: MorphismAST, inner: MorphismAST): ComposeNode => ({
  op: "compose",
  outer,
  inner,
});

export const product = (left: MorphismAST, right: MorphismAST): ProductNode => ({
  op: "product",
  left,
  right,
});

export const sum = (
  predicate: unknown,
  thenBranch: MorphismAST,
  elseBranch: MorphismAST,
): SumNode => ({
  op: "sum",
  predicate,
  then: thenBranch,
  else: elseBranch,
});

export const restrict = (
  predicate: unknown,
  f: MorphismAST,
  fallback?: MorphismAST,
): RestrictNode => ({
  op: "restrict",
  predicate,
  f,
  ...(fallback ? { fallback } : {}),
});

export const extend = (source: { name: string; spec: unknown }, f: MorphismAST): ExtendNode => ({
  op: "extend",
  source,
  f,
});

export const fmap = (binding: unknown, f: MorphismAST): FmapNode => ({
  op: "fmap",
  binding,
  f,
});

export const iter = (
  forPath: string,
  template: MorphismAST,
  as?: string,
  emptyFallback?: MorphismAST,
): IterNode => ({
  op: "iter",
  for: forPath,
  template,
  ...(as ? { as } : {}),
  ...(emptyFallback ? { emptyFallback } : {}),
});

export const cond = (
  ifExpr: unknown,
  thenBranch: MorphismAST,
  elseBranch?: MorphismAST,
): CondNode => ({
  op: "cond",
  if: ifExpr,
  then: thenBranch,
  ...(elseBranch ? { else: elseBranch } : {}),
});

export const literal = (value: unknown): LiteralNode => ({ op: "literal", value });

export const guard = (
  requires: string[] | undefined,
  f: MorphismAST,
  opts?: { requiresAny?: string[]; fallback?: MorphismAST },
): GuardNode => ({
  op: "guard",
  ...(requires ? { requires } : {}),
  f,
  ...(opts?.requiresAny ? { requiresAny: opts.requiresAny } : {}),
  ...(opts?.fallback ? { fallback: opts.fallback } : {}),
});

export function compileMorphism(yaml: unknown): MorphismAST {
  return compileNode(yaml, "$");
}

export function evaluateMorphism(ast: OperatorDispatchNode, ctx: InterpreterContext): unknown {
  const operators = getOperatorRegistry(ctx).listAlgebraOperators();
  const operatorByName = new Map(operators.map((operator) => [operator.name, operator]));
  const m1 = operatorByName.get(ast.op);
  if (!m1) {
    throw new Error(`unknown operator \`${ast.op}\`: missing AlgebraOperator registration`);
  }
  const impl = dispatchTable[ast.op];
  if (!impl) {
    throw new Error(`operator \`${ast.op}\` registered but has no implementation`);
  }
  const args = getOperatorArgs(ast);
  if (args.length !== m1.arity) {
    throw new Error(
      `operator \`${ast.op}\` expected arity ${m1.arity} but received ${args.length}`,
    );
  }
  return impl(ctx, ast);
}

function compileNode(node: unknown, path: string): MorphismAST {
  const yaml = expectRecord(node, path);
  if (isProjectionSugar(yaml)) {
    return desugarProjectionSugar(yaml, path);
  }
  const op = yaml.op;
  if (typeof op !== "string") {
    throw new Error(`Invalid morphism op at ${path}: ${preview(node)}`);
  }

  const operators = new TypeRegistry().listAlgebraOperators();
  const operatorByName = new Map(operators.map((operator) => [operator.name, operator]));
  const m1 = operatorByName.get(op);
  if (!m1) {
    throw new Error(`Unknown morphism op at ${path}: "${op}" missing AlgebraOperator registration`);
  }
  const compileImpl = compileDispatchTable[op];
  if (!compileImpl) {
    throw new Error(`operator \`${op}\` registered but has no compiler`);
  }
  return compileImpl(yaml, path);
}

type CompileOperatorImplementation = (yaml: Record<string, unknown>, path: string) => MorphismAST;

const compileDispatchTable: Record<string, CompileOperatorImplementation> = {
  ref: (yaml, path) => ({
    op: "ref",
    asset: expectString(yaml.asset, `${path}.asset`),
    ...(hasOwn(yaml, "props") ? { props: expectRecord(yaml.props, `${path}.props`) } : {}),
    ...(hasOwn(yaml, "requires")
      ? { requires: expectStringArray(yaml.requires, `${path}.requires`) }
      : {}),
    ...(hasOwn(yaml, "requiresAny")
      ? { requiresAny: expectStringArray(yaml.requiresAny, `${path}.requiresAny`) }
      : {}),
    ...(hasOwn(yaml, "fallback")
      ? { fallback: compileNode(yaml.fallback, `${path}.fallback`) }
      : {}),
  }),
  compose: (yaml, path) =>
    compose(
      compileNode(requireField(yaml, "outer", path), `${path}.outer`),
      compileNode(requireField(yaml, "inner", path), `${path}.inner`),
    ),
  product: (yaml, path) =>
    product(
      compileNode(requireField(yaml, "left", path), `${path}.left`),
      compileNode(requireField(yaml, "right", path), `${path}.right`),
    ),
  sum: (yaml, path) =>
    sum(
      requireField(yaml, "predicate", path),
      compileNode(requireField(yaml, "then", path), `${path}.then`),
      compileNode(requireField(yaml, "else", path), `${path}.else`),
    ),
  restrict: (yaml, path) => ({
    op: "restrict",
    predicate: requireField(yaml, "predicate", path),
    f: compileNode(requireField(yaml, "f", path), `${path}.f`),
    ...(hasOwn(yaml, "fallback")
      ? { fallback: compileNode(yaml.fallback, `${path}.fallback`) }
      : {}),
  }),
  extend: (yaml, path) =>
    extend(
      {
        name: expectString(readPath(yaml, ["source", "name"]), `${path}.source.name`),
        spec: requireNestedField(yaml, ["source", "spec"], `${path}.source.spec`),
      },
      compileNode(requireField(yaml, "f", path), `${path}.f`),
    ),
  fmap: (yaml, path) =>
    fmap(
      requireField(yaml, "binding", path),
      compileNode(requireField(yaml, "f", path), `${path}.f`),
    ),
  iter: (yaml, path) =>
    iter(
      expectString(requireField(yaml, "for", path), `${path}.for`),
      compileNode(
        requireField(yaml, hasOwn(yaml, "template") ? "template" : "body", path),
        `${path}.${hasOwn(yaml, "template") ? "template" : "body"}`,
      ),
      hasOwn(yaml, "as") ? expectString(yaml.as, `${path}.as`) : undefined,
      hasOwn(yaml, "emptyFallback")
        ? compileNode(yaml.emptyFallback, `${path}.emptyFallback`)
        : undefined,
    ),
  cond: (yaml, path) =>
    cond(
      requireField(yaml, "if", path),
      compileNode(requireField(yaml, "then", path), `${path}.then`),
      hasOwn(yaml, "else") ? compileNode(yaml.else, `${path}.else`) : undefined,
    ),
  literal: (yaml, path) => literal(requireField(yaml, "value", path)),
  guard: (yaml, path) =>
    desugarGuard(
      hasOwn(yaml, "requires") ? expectStringArray(yaml.requires, `${path}.requires`) : undefined,
      hasOwn(yaml, "requiresAny")
        ? expectStringArray(yaml.requiresAny, `${path}.requiresAny`)
        : undefined,
      compileNode(requireField(yaml, "f", path), `${path}.f`),
      hasOwn(yaml, "fallback") ? compileNode(yaml.fallback, `${path}.fallback`) : undefined,
    ),
};

function desugarGuard(
  requires: string[] | undefined,
  requiresAny: string[] | undefined,
  f: MorphismAST,
  fallback?: MorphismAST,
): RestrictNode {
  return {
    op: "restrict",
    predicate: { $capabilityCheck: { requires, requiresAny } },
    f,
    ...(fallback ? { fallback } : {}),
    _derivedFromGuard: { requires, requiresAny },
  };
}

function desugarProjectionSugar(yaml: Record<string, unknown>, path: string): MorphismAST {
  const projections = expectProjectionEntries(
    requireField(yaml, "projections", path),
    `${path}.projections`,
  );
  const source = requireField(yaml, "source", path);
  const chain = desugarProjectionEntries(source, projections, path);

  const requires = hasOwn(yaml, "requires")
    ? expectStringArray(yaml.requires, `${path}.requires`)
    : undefined;
  const requiresAny = hasOwn(yaml, "requiresAny")
    ? expectStringArray(yaml.requiresAny, `${path}.requiresAny`)
    : undefined;

  if (!requires?.length && !requiresAny?.length) {
    return chain;
  }

  return {
    ...desugarGuard(requires, requiresAny, chain),
    _derivedFromProjections: true,
  };
}

function desugarProjectionEntries(
  source: unknown,
  projections: ProjectionEntry[],
  path: string,
): MorphismAST {
  const [head, ...tail] = projections;
  if (!head) {
    throw new Error(`Expected at least one projection entry at ${path}.projections`);
  }

  const success =
    tail.length === 0
      ? literal({ $projectedSource: true } satisfies ProjectedSourceSentinel)
      : desugarProjectionEntries("$bind.source", tail, path);

  return {
    op: "fmap",
    binding: {
      $projectionSource: source,
      $projectionPath: head.path.split(".").filter(Boolean),
    } satisfies ProjectionBindingSentinel,
    f: {
      ...desugarGuard(head.requires, head.requiresAny, success, literal(head.fallback ?? null)),
      _derivedFromProjections: true,
    },
    _derivedFromProjections: true,
  };
}

function evaluateRestrict(ast: RestrictNode, ctx: InterpreterContext): unknown {
  const allow = isCapabilityCheck(ast.predicate)
    ? ctx.capabilityGate
      ? ctx.capabilityGate(
          ast.predicate.$capabilityCheck.requires,
          ast.predicate.$capabilityCheck.requiresAny,
        )
      : true
    : resolvePredicate(ast.predicate, ctx);

  if (allow) return evaluateMorphism(ast.f, ctx);
  return ast.fallback ? evaluateMorphism(ast.fallback, ctx) : null;
}

function evaluateGuard(ast: GuardNode, ctx: InterpreterContext): unknown {
  return evaluateRestrict(
    {
      op: "restrict",
      predicate: { $capabilityCheck: { requires: ast.requires, requiresAny: ast.requiresAny } },
      f: ast.f,
      ...(ast.fallback ? { fallback: ast.fallback } : {}),
      _derivedFromGuard: { requires: ast.requires, requiresAny: ast.requiresAny },
    },
    ctx,
  );
}

function resolvePredicate(predicate: unknown, ctx: InterpreterContext): boolean {
  return truthy(resolveBinding(predicate, ctx));
}

function resolveBinding(spec: unknown, ctx: InterpreterContext): unknown {
  return new BindingResolver(toRenderContext(ctx)).resolve(spec);
}

function resolveDemandOrBinding(spec: unknown, ctx: InterpreterContext): unknown {
  if (isProjectionBinding(spec)) {
    const base = resolveDemandOrBinding(spec.$projectionSource, ctx);
    return walkPath(base, spec.$projectionPath);
  }
  return ctx.resolveDemand ? ctx.resolveDemand(spec) : resolveBinding(spec, ctx);
}

function toRenderContext(ctx: InterpreterContext): RenderContext {
  return {
    pageName: "",
    route: ctx.route,
    currentUser: ctx.currentUser,
    bindings: ctx.bindings,
    props: ctx.props,
    iteration: ctx.iteration,
    nodeIdCounter: { n: 0 },
    session: undefined,
  };
}

function truthy(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value === "string") return value.length > 0;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value).length > 0;
  return true;
}

function isCapabilityCheck(value: unknown): value is CapabilityCheckSentinel {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const sentinel = (value as Record<string, unknown>).$capabilityCheck;
  return !!sentinel && typeof sentinel === "object" && !Array.isArray(sentinel);
}

function isProjectionSugar(value: Record<string, unknown>): boolean {
  return hasOwn(value, "source") && hasOwn(value, "projections") && !hasOwn(value, "op");
}

function isProjectionBinding(value: unknown): value is ProjectionBindingSentinel {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return hasOwn(candidate, "$projectionSource") && Array.isArray(candidate.$projectionPath);
}

function isProjectedSourceSentinel(value: unknown): value is ProjectedSourceSentinel {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return (value as Record<string, unknown>).$projectedSource === true;
}

function expectProjectionEntries(value: unknown, path: string): ProjectionEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Expected non-empty projections[] at ${path}: ${preview(value)}`);
  }

  return value.map((entry, index) => {
    const projection = expectRecord(entry, `${path}[${index}]`);
    return {
      path: expectString(
        requireField(projection, "path", `${path}[${index}]`),
        `${path}[${index}].path`,
      ),
      ...(hasOwn(projection, "requires")
        ? { requires: expectStringArray(projection.requires, `${path}[${index}].requires`) }
        : {}),
      ...(hasOwn(projection, "requiresAny")
        ? {
            requiresAny: expectStringArray(projection.requiresAny, `${path}[${index}].requiresAny`),
          }
        : {}),
      ...(hasOwn(projection, "fallback") ? { fallback: projection.fallback } : {}),
    };
  });
}

function walkPath(value: unknown, segments: string[]): unknown {
  let current = value;
  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function expectRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Expected object at ${path}: ${preview(value)}`);
  }
  return value as Record<string, unknown>;
}

function expectString(value: unknown, path: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Expected non-empty string at ${path}: ${preview(value)}`);
  }
  return value;
}

function expectStringArray(value: unknown, path: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((item) => typeof item !== "string" || item.length === 0)
  ) {
    throw new Error(`Expected string[] at ${path}: ${preview(value)}`);
  }
  return [...value];
}

function requireField(record: Record<string, unknown>, field: string, path: string): unknown {
  if (!hasOwn(record, field)) {
    throw new Error(`Missing required field ${path}.${field}: ${preview(record)}`);
  }
  return record[field];
}

function requireNestedField(
  record: Record<string, unknown>,
  keys: [string, string],
  path: string,
): unknown {
  const parent = expectRecord(record[keys[0]], path.replace(/\.[^.]+$/, ""));
  if (!hasOwn(parent, keys[1])) {
    throw new Error(`Missing required field ${path}: ${preview(record)}`);
  }
  return parent[keys[1]];
}

function readPath(record: Record<string, unknown>, keys: [string, string]): unknown {
  const parent = record[keys[0]];
  if (!parent || typeof parent !== "object" || Array.isArray(parent)) return undefined;
  return (parent as Record<string, unknown>)[keys[1]];
}

function hasOwn(record: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}

function preview(value: unknown): string {
  if (isProjectedSourceSentinel(value)) {
    return JSON.stringify(resolveProjectedSourcePlaceholder());
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function resolveProjectedSourcePlaceholder(): ProjectedSourceSentinel {
  return { $projectedSource: true };
}
