import type { KernelExpression } from "../../L04-expression/evaluator.ts";
import type { TaggedAstNode } from "../ir/ast-tagged.ts";

// These AST primitives are intrinsic to the KernelExpression language and do
// not require an M1 AlgebraOperator registration to normalize successfully.
const ALGEBRA_PRIMITIVES = new Set<string>([
  "const",
  "var",
  "get",
  "call",
  "lambda",
  "apply",
  "let",
  "if",
  "match",
  "record",
  "array",
  "literal",
]);

export interface NormalizeContext {
  validOps: Set<string>;
  validBuiltins: Set<string>;
}

export class NormalizeError extends Error {
  constructor(
    message: string,
    readonly node: KernelExpression,
  ) {
    super(message);
    this.name = "NormalizeError";
  }
}

export function isAlgebraPrimitive(op: string): boolean {
  return ALGEBRA_PRIMITIVES.has(op);
}

export function normalize(ast: KernelExpression): never;
export function normalize(ast: KernelExpression, ctx: NormalizeContext): TaggedAstNode;
export function normalize(ast: KernelExpression, ctx?: NormalizeContext): TaggedAstNode {
  if (!ctx) throw new Error("NOT_IMPLEMENTED: normalize");
  let nodeId = 0;
  const walk = (node: KernelExpression, parentOp?: string): TaggedAstNode => {
    const currentId = nodeId++;
    const context = parentOp ? ` under "${parentOp}"` : "";
    if (!ctx.validOps.has(node.op) && !isAlgebraPrimitive(node.op)) {
      throw new NormalizeError(`unknown op "${node.op}" at node ${currentId}${context}`, node);
    }
    if (node.op === "call" && !ctx.validBuiltins.has(node.fn)) {
      throw new NormalizeError(`unknown builtin "${node.fn}" at node ${currentId}${context}`, node);
    }
    switch (node.op) {
      case "call": {
        const args = node.args.map((child) => walk(child, node.op));
        return { ...node, args, nodeId: currentId, children: args };
      }
      case "lambda": {
        const body = walk(node.body, node.op);
        return { ...node, body, nodeId: currentId, children: [body] };
      }
      case "apply": {
        const fn = walk(node.fn, node.op);
        const arg = walk(node.arg, node.op);
        return { ...node, fn, arg, nodeId: currentId, children: [fn, arg] };
      }
      case "let": {
        const value = walk(node.value, node.op);
        const body = walk(node.body, node.op);
        return { ...node, value, body, nodeId: currentId, children: [value, body] };
      }
      case "if": {
        const cond = walk(node.cond, node.op);
        const then = walk(node.then, node.op);
        const otherwise = walk(node.else, node.op);
        return {
          ...node,
          cond,
          then,
          else: otherwise,
          nodeId: currentId,
          children: [cond, then, otherwise],
        };
      }
      case "match": {
        const scrutinee = walk(node.scrutinee, node.op);
        const cases = node.cases.map((entry) => ({ ...entry, body: walk(entry.body, node.op) }));
        return {
          ...node,
          scrutinee,
          cases,
          nodeId: currentId,
          children: [scrutinee, ...cases.map((entry) => entry.body)],
        };
      }
      case "record": {
        const fields = Object.fromEntries(
          Object.entries(node.fields).map(([key, child]) => [key, walk(child, node.op)]),
        );
        return { ...node, fields, nodeId: currentId, children: Object.values(fields) };
      }
      case "array": {
        const elements = node.elements.map((child) => walk(child, node.op));
        return { ...node, elements, nodeId: currentId, children: elements };
      }
      default:
        return { ...node, nodeId: currentId, children: [] };
    }
  };
  return walk(ast);
}
