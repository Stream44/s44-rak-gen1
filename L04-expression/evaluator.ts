/**
 * Layer 9: KernelExpression evaluator — deterministic, total, pure.
 *
 * A stack-based virtual machine with fuel/gas budgeting.
 * Expressions are JSON-serializable ASTs.
 */

import { canonicalize as canonicalizeValue } from "../L01-foundation/utils.ts";

// ── Expression AST ────────────────────────────────────────────────────

export type KernelExpression =
  | { op: "const"; value: unknown }
  | { op: "var"; name: string }
  | { op: "get"; path: string }
  | { op: "call"; fn: BuiltinFn; args: KernelExpression[] }
  | { op: "lambda"; param: string; body: KernelExpression }
  | { op: "apply"; fn: KernelExpression; arg: KernelExpression }
  | { op: "let"; name: string; value: KernelExpression; body: KernelExpression }
  | { op: "if"; cond: KernelExpression; then: KernelExpression; else: KernelExpression }
  | { op: "match"; scrutinee: KernelExpression; cases: MatchCase[] }
  | { op: "record"; fields: Record<string, KernelExpression> }
  | { op: "array"; elements: KernelExpression[] };

export interface MatchCase {
  pattern: Pattern;
  body: KernelExpression;
}

export type Pattern =
  | { kind: "wildcard" }
  | { kind: "var"; name: string }
  | { kind: "const"; value: unknown }
  | { kind: "record"; fields: Record<string, Pattern> };

export type BuiltinFn =
  | "add"
  | "sub"
  | "mul"
  | "div"
  | "mod"
  | "neg"
  | "abs"
  | "eq"
  | "neq"
  | "lt"
  | "lte"
  | "gt"
  | "gte"
  | "and"
  | "or"
  | "not"
  | "concat"
  | "arrayConcat"
  | "length"
  | "substr"
  | "head"
  | "tail"
  | "map"
  | "filter"
  | "fold"
  | "keys"
  | "values"
  | "has"
  | "merge"
  | "matches"
  | "canonicalize"
  | "eval";

// ── Evaluation Result ─────────────────────────────────────────────────

export interface EvaluationResult {
  value?: unknown;
  error?: string;
  steps: number;
}

// ── Closure (for lambdas) ─────────────────────────────────────────────

interface Closure {
  __closure: true;
  param: string;
  body: KernelExpression;
  env: Map<string, unknown>;
}

function isClosure(v: unknown): v is Closure {
  return typeof v === "object" && v !== null && "__closure" in v;
}

// ── Evaluator ─────────────────────────────────────────────────────────

export class ExpressionEvaluator {
  private maxGas: number;

  constructor(opts?: { maxGas?: number }) {
    this.maxGas = opts?.maxGas ?? 100_000;
  }

  evaluate(expr: KernelExpression, context?: Record<string, unknown>): EvaluationResult {
    let gas = this.maxGas;
    const env = new Map<string, unknown>(Object.entries(context ?? {}));

    try {
      const value = this.eval(expr, env, { gas });
      return { value, steps: this.maxGas - gas };
    } catch (e) {
      if (e instanceof GasExhaustedError) {
        return { error: "OutOfGas", steps: this.maxGas };
      }
      return {
        error: (e as Error).message,
        steps: this.maxGas - gas,
      };
    }

    // Gas is tracked via the mutable ref object
  }

  private eval(expr: KernelExpression, env: Map<string, unknown>, gas: { gas: number }): unknown {
    if (gas.gas-- <= 0) throw new GasExhaustedError();

    switch (expr.op) {
      case "const":
        return expr.value;

      case "var": {
        const val = env.get(expr.name);
        if (val === undefined && !env.has(expr.name)) {
          throw new Error(`Unbound variable: ${expr.name}`);
        }
        return val;
      }

      case "get": {
        const parts = expr.path.split("/").filter(Boolean);
        const [head, ...rest] = parts;
        let current: unknown;
        let remaining: string[];
        if (head !== undefined && env.has(head)) {
          current = env.get(head);
          remaining = rest;
        } else {
          current = env.get("$self");
          remaining = parts;
        }
        for (const part of remaining) {
          if (current == null || typeof current !== "object") {
            throw new Error(`Cannot get "${part}" from ${typeof current}`);
          }
          current = (current as Record<string, unknown>)[part];
        }
        return current;
      }

      case "call":
        return this.evalCall(expr.fn, expr.args, env, gas);

      case "lambda":
        return {
          __closure: true,
          param: expr.param,
          body: expr.body,
          env: new Map(env),
        } as Closure;

      case "apply": {
        const fn = this.eval(expr.fn, env, gas);
        const arg = this.eval(expr.arg, env, gas);
        if (typeof fn === "function") {
          return fn(arg);
        }
        if (!isClosure(fn)) throw new Error("Cannot apply non-function");
        const newEnv = new Map(fn.env);
        newEnv.set(fn.param, arg);
        return this.eval(fn.body, newEnv, gas);
      }

      case "let": {
        const val = this.eval(expr.value, env, gas);
        const newEnv = new Map(env);
        newEnv.set(expr.name, val);
        return this.eval(expr.body, newEnv, gas);
      }

      case "if": {
        const cond = this.eval(expr.cond, env, gas);
        if (cond) {
          return this.eval(expr.then, env, gas);
        } else {
          return this.eval(expr.else, env, gas);
        }
      }

      case "match": {
        const scrutinee = this.eval(expr.scrutinee, env, gas);
        for (const c of expr.cases) {
          const bindings = this.matchPattern(c.pattern, scrutinee);
          if (bindings !== null) {
            const newEnv = new Map(env);
            for (const [k, v] of bindings) {
              newEnv.set(k, v);
            }
            return this.eval(c.body, newEnv, gas);
          }
        }
        throw new Error("Match exhaustion: no case matched");
      }

      case "record": {
        const result: Record<string, unknown> = {};
        for (const [key, valExpr] of Object.entries(expr.fields)) {
          result[key] = this.eval(valExpr, env, gas);
        }
        return result;
      }

      case "array":
        return expr.elements.map((e) => this.eval(e, env, gas));

      default:
        throw new Error(`Unknown expression op: ${(expr as any).op}`);
    }
  }

  private evalCall(
    fn: BuiltinFn,
    argExprs: KernelExpression[],
    env: Map<string, unknown>,
    gas: { gas: number },
  ): unknown {
    const args = argExprs.map((a) => this.eval(a, env, gas));

    switch (fn) {
      // Arithmetic
      case "add":
        return (args[0] as number) + (args[1] as number);
      case "sub":
        return (args[0] as number) - (args[1] as number);
      case "mul":
        return (args[0] as number) * (args[1] as number);
      case "div": {
        const divisor = args[1] as number;
        if (divisor === 0) throw new Error("Division by zero");
        return (args[0] as number) / divisor;
      }
      case "mod":
        return (args[0] as number) % (args[1] as number);
      case "neg":
        return -(args[0] as number);
      case "abs":
        return Math.abs(args[0] as number);

      // Comparison
      case "eq":
        return args[0] === args[1];
      case "neq":
        return args[0] !== args[1];
      case "lt":
        return (args[0] as number) < (args[1] as number);
      case "lte":
        return (args[0] as number) <= (args[1] as number);
      case "gt":
        return (args[0] as number) > (args[1] as number);
      case "gte":
        return (args[0] as number) >= (args[1] as number);

      // Boolean
      case "and":
        return (args[0] as boolean) && (args[1] as boolean);
      case "or":
        return (args[0] as boolean) || (args[1] as boolean);
      case "not":
        return !(args[0] as boolean);

      // String
      case "concat":
        if (Array.isArray(args[0]) && Array.isArray(args[1])) {
          return [...args[0], ...args[1]];
        }
        return String(args[0]) + String(args[1]);
      case "arrayConcat":
        if (!Array.isArray(args[0])) {
          throw new Error(
            `arrayConcat requires array left operand, got ${describeOperandType(args[0])}`,
          );
        }
        if (!Array.isArray(args[1])) {
          throw new Error(
            `arrayConcat requires array right operand, got ${describeOperandType(args[1])}`,
          );
        }
        return [...args[0], ...args[1]];
      case "length":
        if (Array.isArray(args[0])) return args[0].length;
        return String(args[0]).length;
      case "substr":
        return String(args[0]).substring(args[1] as number, args[2] as number);

      // Array
      case "head":
        return (args[0] as unknown[])[0];
      case "tail":
        return (args[0] as unknown[]).slice(1);
      case "map": {
        const arr = args[0] as unknown[];
        const mapFn = args[1] as Closure;
        if (!isClosure(mapFn)) throw new Error("map requires a function");
        return arr.map((item) => {
          const newEnv = new Map(mapFn.env);
          newEnv.set(mapFn.param, item);
          return this.eval(mapFn.body, newEnv, gas);
        });
      }
      case "filter": {
        const arr = args[0] as unknown[];
        const filterFn = args[1] as Closure;
        if (!isClosure(filterFn)) throw new Error("filter requires a function");
        return arr.filter((item) => {
          const newEnv = new Map(filterFn.env);
          newEnv.set(filterFn.param, item);
          return this.eval(filterFn.body, newEnv, gas);
        });
      }
      case "fold": {
        const arr = args[0] as unknown[];
        const init = args[1];
        const foldFn = args[2] as Closure;
        if (!isClosure(foldFn)) throw new Error("fold requires a function");
        let acc = init;
        for (const item of arr) {
          const newEnv = new Map(foldFn.env);
          newEnv.set(foldFn.param, acc);
          // Apply the closure partially to get another closure for item
          const innerResult = this.eval(foldFn.body, newEnv, gas);
          if (isClosure(innerResult)) {
            const innerEnv = new Map(innerResult.env);
            innerEnv.set(innerResult.param, item);
            acc = this.eval(innerResult.body, innerEnv, gas);
          } else {
            acc = innerResult;
          }
        }
        return acc;
      }

      // Record
      case "keys":
        return Object.keys(args[0] as object);
      case "values":
        return Object.values(args[0] as object);
      case "has":
        return (args[1] as string) in (args[0] as object);
      case "merge":
        return { ...(args[0] as object), ...(args[1] as object) };
      case "matches": {
        const value = args[0];
        const pattern = args[1] as Pattern;
        const bindings = this.matchPattern(pattern, value);
        if (bindings === null) {
          return { matched: false, bindings: {} };
        }
        const bindingsRecord: Record<string, unknown> = {};
        for (const [k, v] of bindings) bindingsRecord[k] = v;
        return { matched: true, bindings: bindingsRecord };
      }
      case "canonicalize": {
        // Cycle-safe wrapper: the 1-utils helper is stack-unsafe on self-referential
        // values. Layer 10 must throw cleanly rather than crash the host.
        const seen = new WeakSet<object>();
        function safe(v: unknown): string {
          if (v !== null && typeof v === "object") {
            if (seen.has(v as object)) {
              throw new Error("Cannot canonicalize cyclic value");
            }
            seen.add(v as object);
            if (Array.isArray(v)) {
              const parts = v.map((x) => safe(x));
              seen.delete(v as object);
              return "[" + parts.join(",") + "]";
            }
            const obj = v as Record<string, unknown>;
            const keys = Object.keys(obj).sort();
            const parts = keys
              .filter((k) => obj[k] !== undefined)
              .map((k) => JSON.stringify(k) + ":" + safe(obj[k]));
            seen.delete(v as object);
            return "{" + parts.join(",") + "}";
          }
          return canonicalizeValue(v);
        }
        return safe(args[0]);
      }
      case "eval": {
        const exprValue = args[0];
        if (!isKernelExpressionValue(exprValue)) {
          throw new Error(
            `eval requires a KernelExpression as first arg, got ${describeValueType(exprValue)}`,
          );
        }
        const contextValue = args[1];
        if (contextValue !== undefined && !isPlainObjectRecord(contextValue)) {
          throw new Error(
            `eval requires a plain object context as second arg, got ${describeValueType(contextValue)}`,
          );
        }
        const newEnv = new Map<string, unknown>(Object.entries(contextValue ?? {}));
        return this.eval(exprValue as KernelExpression, newEnv, gas);
      }

      default:
        throw new Error(`Unknown builtin: ${fn}`);
    }
  }

  private matchPattern(pattern: Pattern, value: unknown): Map<string, unknown> | null {
    switch (pattern.kind) {
      case "wildcard":
        return new Map();
      case "var":
        return new Map([[pattern.name, value]]);
      case "const":
        return deepEq(pattern.value, value) ? new Map() : null;
      case "record": {
        if (typeof value !== "object" || value === null) return null;
        const obj = value as Record<string, unknown>;
        const bindings = new Map<string, unknown>();
        for (const [key, subPattern] of Object.entries(pattern.fields)) {
          if (!(key in obj)) return null;
          const sub = this.matchPattern(subPattern, obj[key]);
          if (sub === null) return null;
          for (const [k, v] of sub) bindings.set(k, v);
        }
        return bindings;
      }
      default:
        return null;
    }
  }
}

class GasExhaustedError extends Error {
  constructor() {
    super("Gas exhausted");
    this.name = "GasExhaustedError";
  }
}

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((v, i) => deepEq(v, b[i]));
  }
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ak = Object.keys(a as object).sort();
  const bk = Object.keys(b as object).sort();
  if (ak.length !== bk.length) return false;
  return ak.every(
    (k, i) =>
      k === bk[i] && deepEq((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
  );
}

function isKernelExpressionValue(value: unknown): value is KernelExpression {
  return (
    typeof value === "object" &&
    value !== null &&
    "op" in value &&
    typeof (value as { op?: unknown }).op === "string"
  );
}

function isPlainObjectRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function describeValueType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}

function describeOperandType(value: unknown): string {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}
