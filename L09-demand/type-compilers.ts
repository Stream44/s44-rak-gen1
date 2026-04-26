import { buildTypeUri } from "../L01-foundation/utils.ts";
import type { KernelExpression } from "../L04-expression/evaluator.ts";
import type { JsonSchema } from "../L01-foundation/types.ts";
import type { AttributeDef } from "./model-types.ts";

export function compileAttributeType(
  attr: AttributeDef,
  origin: string,
  version: string,
  resolver: (ref: string) => string,
): JsonSchema {
  const base = attr.type;
  if (["string", "number", "integer", "boolean"].includes(base)) {
    const schema: JsonSchema = { type: base as "string" | "number" | "integer" | "boolean" };
    if (attr.minimum !== undefined) schema.minimum = attr.minimum;
    if (attr.maximum !== undefined) schema.maximum = attr.maximum;
    if (attr.minLength !== undefined) schema.minLength = attr.minLength;
    if (attr.maxLength !== undefined) schema.maxLength = attr.maxLength;
    if (attr.pattern) schema.pattern = attr.pattern;
    if (attr.enum) schema.enum = attr.enum;
    if (attr.default !== undefined) schema.default = attr.default;
    return schema;
  }

  const listMatch = base.match(/^list<(.+)>$/);
  if (listMatch) {
    return {
      type: "array" as const,
      items: compileInnerType(listMatch[1], origin, version, resolver),
    } satisfies JsonSchema;
  }

  if (base.startsWith("map<")) return { type: "object" };
  if (base === "object") return { type: "object" };
  if (base === "array") return { type: "array" };
  if (base === "unknown") return {};
  if (base.includes(":")) return { type: "string", $typeRef: resolver(base) };
  return { type: "string", $typeRef: buildTypeUri(origin, base, version) };
}

export function compileInnerType(
  typeStr: string,
  origin: string,
  version: string,
  resolver: (ref: string) => string,
): JsonSchema {
  if (["string", "number", "integer", "boolean"].includes(typeStr)) {
    return { type: typeStr as "string" | "number" | "integer" | "boolean" };
  }
  if (typeStr.includes(":")) return { type: "string", $typeRef: resolver(typeStr) };
  return { type: "string", $typeRef: buildTypeUri(origin, typeStr, version) };
}

function fieldToExpr(field: string): KernelExpression {
  const parts = field.split(".");
  return { op: "var", name: parts.length > 1 ? parts[parts.length - 1] : parts[0] };
}

function parseClaimValue(raw: string): unknown {
  const value = raw.trim();
  if (value === "true") return true;
  if (value === "false") return false;
  if (value === "null") return null;
  if (/^".*"$/.test(value) || /^'.*'$/.test(value)) return value.slice(1, -1);
  const number = Number(value);
  return Number.isNaN(number) ? value : number;
}

export function parseClaim(claim: string): KernelExpression | null {
  const input = claim.trim();
  const fnMap: Record<string, string> = {
    ">=": "gte",
    ">": "gt",
    "<=": "lte",
    "<": "lt",
    "==": "eq",
    "!=": "neq",
  };

  const lengthMatch = input.match(/^length\((\w+(?:\.\w+)*)\)\s*(>=|>|<=|<|==|!=)\s*(.+)$/);
  if (lengthMatch) {
    const [, field, op, rawValue] = lengthMatch;
    const fn = fnMap[op];
    if (!fn) return null;
    return {
      op: "call",
      fn: fn as any,
      args: [
        { op: "call", fn: "length", args: [fieldToExpr(field)] },
        { op: "const", value: parseClaimValue(rawValue) },
      ],
    };
  }

  const fieldMatch = input.match(/^(\w+(?:\.\w+)*)\s*(>=|>|<=|<|==|!=)\s*(.+)$/);
  if (!fieldMatch) return null;
  const [, field, op, rawValue] = fieldMatch;
  const fn = fnMap[op];
  if (!fn) return null;
  return {
    op: "call",
    fn: fn as any,
    args: [fieldToExpr(field), { op: "const", value: parseClaimValue(rawValue) }],
  };
}
