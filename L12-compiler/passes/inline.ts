import type { BuiltinFn } from "../../L04-expression/evaluator.ts";
import type { TaggedAstNode } from "../ir/ast-tagged.ts";

type Node = TaggedAstNode & Record<string, unknown>;
type Morphism = {
  id: string;
  name?: string;
  operator?: boolean;
  isOperator?: boolean;
  kind?: string;
  impl?: { kind: string; ast?: TaggedAstNode };
} & Record<string, unknown>;
type Program = { morphisms: Record<string, Morphism> | Morphism[] } & Record<string, unknown>;
export type InlineProgram = Program & {
  entryId: string;
  pureBuiltins?: ReadonlySet<string>;
  referenceMorphismIds?: ReadonlySet<string>;
};

export const INLINE_PURE_BUILTINS = new Set<BuiltinFn>([
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
]);
export const INLINE_PURITY_PREDICATE =
  "Pure iff the callee AST contains no `CALL_MODULE`, no `ref`, and no `call` to a builtin outside `INLINE_PURE_BUILTINS`.";

const kids = (node: Node): Node[] =>
  node.op === "CALL_MORPHISM"
    ? ([(node.arg ?? node.input ?? node.value) as Node].filter(Boolean) as Node[])
    : node.op === "CALL_MODULE"
      ? ((node.args as Node[] | undefined) ?? [])
      : node.op === "call"
        ? ((node.args as Node[] | undefined) ?? [])
        : node.op === "if"
          ? ([node.cond, node.then, node.else].filter(Boolean) as Node[])
          : node.op === "let"
            ? ([node.value, node.body].filter(Boolean) as Node[])
            : node.op === "apply"
              ? ([node.fn, node.arg].filter(Boolean) as Node[])
              : node.op === "match"
                ? ([
                    node.scrutinee,
                    ...((node.cases as Array<{ body: Node }> | undefined) ?? []).map(
                      (entry) => entry.body,
                    ),
                  ].filter(Boolean) as Node[])
                : node.op === "record"
                  ? Object.values((node.fields as Record<string, Node> | undefined) ?? {})
                  : node.op === "array"
                    ? ((node.elements as Node[] | undefined) ?? [])
                    : node.op === "lambda" && node.body
                      ? [node.body as Node]
                      : Array.isArray(node.children)
                        ? (node.children as Node[])
                        : [];

const morphismIds = (program: Program) =>
  new Set(
    Object.keys(
      Array.isArray(program.morphisms)
        ? Object.fromEntries(program.morphisms.map((m) => [m.id, m]))
        : program.morphisms,
    ),
  );
const callRef = (node: Node, ids: Set<string>) => {
  if (node.op === "CALL_MORPHISM")
    return {
      callee: String(node.calleeId ?? node.callee ?? node.id),
      arg: (node.arg ?? node.input ?? node.value) as Node,
    };
  if (node.op === "call" && node.fn === "CALL_MORPHISM") {
    const args = (node.args as Node[] | undefined) ?? [];
    const calleeNode = (args[1] ?? args[0]) as Node | undefined;
    const argNode = (args[2] ?? args[1]) as Node | undefined;
    if (
      calleeNode?.op === "const" &&
      typeof calleeNode.value === "string" &&
      ids.has(calleeNode.value as string)
    ) {
      return { callee: calleeNode.value as string, arg: argNode };
    }
  }
  if (node.op === "apply" && (node.fn as Node | undefined)?.op === "var") {
    const callee = String((node.fn as Node).name ?? "");
    if (ids.has(callee)) return { callee, arg: node.arg as Node };
  }
  if (node.op === "call" && typeof node.calleeId === "string" && ids.has(node.calleeId))
    return { callee: node.calleeId, arg: ((node.args as Node[] | undefined) ?? [])[0] as Node };
  return null;
};

const countNodes = (node: Node): number =>
  1 + kids(node).reduce((sum, child) => sum + countNodes(child), 0);
const maxNodeId = (node: Node): number =>
  Math.max(node.nodeId ?? 0, ...kids(node).map(maxNodeId), 0);

/** Pure iff AST has no CALL_MODULE, no ref, and every `call` targets a whitelisted builtin or morphism reference. */
export function isPureInlineAst(
  ast: TaggedAstNode,
  ids: Set<string> = new Set(),
  pureBuiltins: ReadonlySet<string> = INLINE_PURE_BUILTINS,
): boolean {
  const node = ast as Node;
  if (node.op === "CALL_MODULE" || node.op === "ref") return false;
  if (node.op === "call" && node.fn === "CALL_MODULE") return false;
  if (
    node.op === "call" &&
    typeof node.fn === "string" &&
    node.fn !== "CALL_MORPHISM" &&
    !pureBuiltins.has(node.fn) &&
    !ids.has(node.fn)
  )
    return false;
  return kids(node).every((child) => isPureInlineAst(child, ids, pureBuiltins));
}

const clone = (node: Node): Node => {
  const copy = { ...node } as Node;
  if (node.op === "CALL_MORPHISM" && (node.arg ?? node.input ?? node.value))
    copy.arg = clone((node.arg ?? node.input ?? node.value) as Node);
  if (node.op === "CALL_MODULE") copy.args = ((node.args as Node[] | undefined) ?? []).map(clone);
  if (node.op === "call") copy.args = ((node.args as Node[] | undefined) ?? []).map(clone);
  if (node.op === "if") {
    copy.cond = clone(node.cond as Node);
    copy.then = clone(node.then as Node);
    copy.else = clone(node.else as Node);
  }
  if (node.op === "let") {
    copy.value = clone(node.value as Node);
    copy.body = clone(node.body as Node);
  }
  if (node.op === "apply") {
    copy.fn = clone(node.fn as Node);
    copy.arg = clone(node.arg as Node);
  }
  if (node.op === "match")
    copy.cases = ((node.cases as Array<Record<string, unknown>> | undefined) ?? []).map(
      (entry) => ({ ...entry, body: clone(entry.body as Node) }),
    );
  if (node.op === "record")
    copy.fields = Object.fromEntries(
      Object.entries((node.fields as Record<string, Node> | undefined) ?? {}).map(([k, v]) => [
        k,
        clone(v),
      ]),
    );
  if (node.op === "array") copy.elements = ((node.elements as Node[] | undefined) ?? []).map(clone);
  if (node.op === "lambda" && node.body) copy.body = clone(node.body as Node);
  copy.children = kids(copy);
  return copy;
};

const retag = (node: Node, next: { value: number }): Node => {
  const out = clone(node);
  out.nodeId = next.value++;
  if (out.op === "CALL_MORPHISM" && out.arg) out.arg = retag(out.arg as Node, next);
  if (out.op === "CALL_MODULE") out.args = (out.args as Node[]).map((child) => retag(child, next));
  if (out.op === "call") out.args = (out.args as Node[]).map((child) => retag(child, next));
  if (out.op === "if") {
    out.cond = retag(out.cond as Node, next);
    out.then = retag(out.then as Node, next);
    out.else = retag(out.else as Node, next);
  }
  if (out.op === "let") {
    out.value = retag(out.value as Node, next);
    out.body = retag(out.body as Node, next);
  }
  if (out.op === "apply") {
    out.fn = retag(out.fn as Node, next);
    out.arg = retag(out.arg as Node, next);
  }
  if (out.op === "match")
    out.cases = (out.cases as Array<Record<string, unknown>>).map((entry) => ({
      ...entry,
      body: retag(entry.body as Node, next),
    }));
  if (out.op === "record")
    out.fields = Object.fromEntries(
      Object.entries(out.fields as Record<string, Node>).map(([k, v]) => [k, retag(v, next)]),
    );
  if (out.op === "array")
    out.elements = (out.elements as Node[]).map((child) => retag(child, next));
  if (out.op === "lambda" && out.body) out.body = retag(out.body as Node, next);
  out.children = kids(out);
  return out;
};

export function inline<T extends Program>(program: T): T {
  const table = Array.isArray(program.morphisms)
    ? Object.fromEntries(program.morphisms.map((m) => [m.id, m]))
    : { ...program.morphisms };
  const ids = morphismIds(program);
  const pureBuiltins = (program as InlineProgram).pureBuiltins ?? INLINE_PURE_BUILTINS;
  const calls = new Map<string, Set<string>>();
  const sites = new Map<string, number>();
  const edges = new Map<string, Set<string>>();
  for (const morphism of Object.values(table)) {
    const ast =
      morphism.impl?.kind === "algebra" ? (morphism.impl.ast as Node | undefined) : undefined;
    if (!ast) continue;
    const outgoing = new Set<string>();
    const walk = (node: Node) => {
      const ref = callRef(node, ids);
      if (ref) {
        outgoing.add(ref.callee);
        (calls.get(ref.callee) ?? calls.set(ref.callee, new Set()).get(ref.callee)!).add(
          morphism.id,
        );
        sites.set(ref.callee, (sites.get(ref.callee) ?? 0) + 1);
      }
      kids(node).forEach(walk);
    };
    walk(ast);
    edges.set(morphism.id, outgoing);
  }
  const recursive = new Set<string>();
  const seen = new Set<string>();
  const visitCycle = (id: string, stack: string[] = []) => {
    if (stack.includes(id)) {
      for (const entry of stack.slice(stack.indexOf(id))) recursive.add(entry);
      recursive.add(id);
      return;
    }
    if (seen.has(id)) return;
    seen.add(id);
    for (const next of edges.get(id) ?? []) visitCycle(next, [...stack, id]);
  };
  for (const id of ids) visitCycle(id);
  const cache = new Map<string, Node>();
  const candidate = (morphism: Morphism) => {
    const ast =
      morphism.impl?.kind === "algebra" ? (morphism.impl.ast as Node | undefined) : undefined;
    const refs = (program as InlineProgram).referenceMorphismIds;
    return (
      !!ast &&
      !morphism.operator &&
      !morphism.isOperator &&
      morphism.kind !== "operator" &&
      !recursive.has(morphism.id) &&
      !refs?.has(morphism.id) &&
      !refs?.has(morphism.name ?? "") &&
      (calls.get(morphism.id)?.size ?? 0) <= 3 &&
      (sites.get(morphism.id) ?? 0) <= 3 &&
      countNodes(ast) <= 12 &&
      isPureInlineAst(ast, ids, pureBuiltins)
    );
  };
  const rewrite = (owner: string, node: Node, stack: string[]): Node => {
    const ref = callRef(node, ids);
    if (ref) {
      const callee = table[ref.callee];
      if (
        callee &&
        ref.arg &&
        candidate(callee) &&
        ref.callee !== owner &&
        !stack.includes(ref.callee)
      ) {
        return {
          op: "let",
          name: "$input",
          nodeId: node.nodeId,
          value: rewrite(owner, ref.arg as Node, stack),
          body: clone(compile(ref.callee, [...stack, owner])),
          children: [],
        } as Node;
      }
    }
    const out = clone(node);
    if (out.op === "CALL_MORPHISM" && out.arg) out.arg = rewrite(owner, out.arg as Node, stack);
    if (out.op === "CALL_MODULE")
      out.args = (out.args as Node[]).map((child) => rewrite(owner, child, stack));
    if (out.op === "call")
      out.args = (out.args as Node[]).map((child) => rewrite(owner, child, stack));
    if (out.op === "if") {
      out.cond = rewrite(owner, out.cond as Node, stack);
      out.then = rewrite(owner, out.then as Node, stack);
      out.else = rewrite(owner, out.else as Node, stack);
    }
    if (out.op === "let") {
      out.value = rewrite(owner, out.value as Node, stack);
      out.body = rewrite(owner, out.body as Node, stack);
    }
    if (out.op === "apply") {
      out.fn = rewrite(owner, out.fn as Node, stack);
      out.arg = rewrite(owner, out.arg as Node, stack);
    }
    if (out.op === "match")
      out.cases = (out.cases as Array<Record<string, unknown>>).map((entry) => ({
        ...entry,
        body: rewrite(owner, entry.body as Node, stack),
      }));
    if (out.op === "record")
      out.fields = Object.fromEntries(
        Object.entries(out.fields as Record<string, Node>).map(([k, v]) => [
          k,
          rewrite(owner, v, stack),
        ]),
      );
    if (out.op === "array")
      out.elements = (out.elements as Node[]).map((child) => rewrite(owner, child, stack));
    if (out.op === "lambda" && out.body) out.body = rewrite(owner, out.body as Node, stack);
    out.children = kids(out);
    return out;
  };
  const compile = (id: string, stack: string[]): Node => {
    const cached = cache.get(id);
    if (cached) return cached;
    const source = table[id]?.impl?.ast as Node | undefined;
    if (!source) throw new Error(`inline: missing algebra AST for ${id}`);
    const next = { value: 0 };
    const result = retag(rewrite(id, source, stack), next);
    cache.set(id, result);
    return result;
  };
  const morphisms = Object.fromEntries(
    Object.entries(table).map(([id, morphism]) => [
      id,
      morphism.impl?.kind === "algebra"
        ? { ...morphism, impl: { ...morphism.impl, ast: compile(id, []) } }
        : morphism,
    ]),
  );
  return {
    ...program,
    morphisms: Array.isArray(program.morphisms) ? Object.values(morphisms) : morphisms,
  } as T;
}
