import type { TaggedAstNode } from "../ir/ast-tagged.ts";

type Node = TaggedAstNode & Record<string, unknown>;
type MatchEntry = { pattern?: unknown; pat?: unknown; body: TaggedAstNode } & Record<
  string,
  unknown
>;

export const PURE_BUILTINS = new Set([
  "add",
  "sub",
  "mul",
  "div",
  "mod",
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
  "len",
  "length",
  "substr",
  "upperCase",
  "lowerCase",
  "round",
  "floor",
  "abs",
  "neg",
]);

const meta = (node: Node) =>
  Object.fromEntries(
    Object.entries(node).filter(([key]) => key === "nodeId" || key === "id" || key === "path"),
  );

const build = (node: Node, next: Record<string, unknown>): Node => {
  const out = { ...meta(node), ...next } as Node;
  out.children = collectChildren(out);
  return out;
};

const collectChildren = (node: Node): TaggedAstNode[] => {
  switch (node.op) {
    case "call":
      return Array.isArray(node.args) ? (node.args as TaggedAstNode[]) : [];
    case "if":
      return [node.cond, node.then, node.else].filter(Boolean) as TaggedAstNode[];
    case "cond":
      return [node.cond ?? node.if, node.then, node.else].filter(Boolean) as TaggedAstNode[];
    case "let":
      return [node.value, node.body].filter(Boolean) as TaggedAstNode[];
    case "match":
      return [
        node.scrutinee,
        ...((node.cases as MatchEntry[] | undefined) ?? []).map((c) => c.body).filter(Boolean),
      ] as TaggedAstNode[];
    case "record":
      return Object.values((node.fields as Record<string, TaggedAstNode> | undefined) ?? {});
    case "array":
      return (node.elements as TaggedAstNode[]) ?? [];
    case "lambda":
      return node.body ? [node.body as TaggedAstNode] : [];
    case "apply":
      return [node.fn, node.arg].filter(Boolean) as TaggedAstNode[];
    default:
      return [];
  }
};

const isConst = (node: unknown): node is Node =>
  !!node && typeof node === "object" && (node as Node).op === "const";
const matchPattern = (pattern: any, value: unknown): boolean =>
  pattern?.kind === "wildcard" ||
  pattern?.kind === "var" ||
  (pattern?.kind === "const" && deepEq(pattern.value, value)) ||
  (pattern?.kind === "record" &&
    !!value &&
    typeof value === "object" &&
    Object.entries(pattern.fields ?? {}).every(([k, p]) =>
      matchPattern(p, (value as Record<string, unknown>)[k]),
    ));
const patternBinds = (pattern: any, name: string): boolean =>
  pattern?.kind === "var"
    ? pattern.name === name
    : pattern?.kind === "record"
      ? Object.values(pattern.fields ?? {}).some((p) => patternBinds(p, name))
      : false;
const constNode = (node: Node, value: unknown): TaggedAstNode =>
  build(node, { op: "const", value });

const references = (node: Node, name: string): boolean => {
  switch (node.op) {
    case "var":
      return node.name === name;
    case "get": {
      const [head] = String(node.path ?? "")
        .split("/")
        .filter(Boolean);
      return head === name;
    }
    case "let":
      return (
        references(node.value as Node, name) ||
        (node.name === name ? false : references(node.body as Node, name))
      );
    case "lambda":
      return node.param === name ? false : references(node.body as Node, name);
    case "match":
      return (
        references(node.scrutinee as Node, name) ||
        ((node.cases as MatchEntry[] | undefined) ?? []).some(
          (c) =>
            !patternBinds((c.pattern ?? c.pat) as any, name) && references(c.body as Node, name),
        )
      );
    case "call":
      return ((node.args as Node[] | undefined) ?? []).some((arg) => references(arg, name));
    case "if":
      return (
        references(node.cond as Node, name) ||
        references(node.then as Node, name) ||
        references(node.else as Node, name)
      );
    case "cond":
      return (
        references((node.cond ?? node.if) as Node, name) ||
        references(node.then as Node, name) ||
        references(node.else as Node, name)
      );
    case "record":
      return Object.values((node.fields as Record<string, Node> | undefined) ?? {}).some((child) =>
        references(child, name),
      );
    case "array":
      return ((node.elements as Node[] | undefined) ?? []).some((child) => references(child, name));
    case "apply":
      return references(node.fn as Node, name) || references(node.arg as Node, name);
    default:
      return false;
  }
};

const rejectFold = Symbol("rejectFold");

const evaluate = (fn: string, values: unknown[]): unknown => {
  switch (fn) {
    case "add":
      return Number(values[0]) + Number(values[1]);
    case "sub":
      return Number(values[0]) - Number(values[1]);
    case "mul":
      return Number(values[0]) * Number(values[1]);
    case "div":
      return values[1] === 0 ? rejectFold : Number(values[0]) / Number(values[1]);
    case "mod":
      return values[1] === 0 ? rejectFold : Number(values[0]) % Number(values[1]);
    case "eq":
      return deepEq(values[0], values[1]);
    case "neq":
      return !deepEq(values[0], values[1]);
    case "lt":
      return Number(values[0]) < Number(values[1]);
    case "lte":
      return Number(values[0]) <= Number(values[1]);
    case "gt":
      return Number(values[0]) > Number(values[1]);
    case "gte":
      return Number(values[0]) >= Number(values[1]);
    case "and":
      return Boolean(values[0]) && Boolean(values[1]);
    case "or":
      return Boolean(values[0]) || Boolean(values[1]);
    case "not":
      return !Boolean(values[0]);
    case "concat":
      return Array.isArray(values[0]) && Array.isArray(values[1])
        ? [...values[0], ...values[1]]
        : String(values[0]) + String(values[1]);
    case "len":
    case "length":
      return Array.isArray(values[0]) ? values[0].length : String(values[0]).length;
    case "substr":
      return String(values[0]).substring(Number(values[1]), Number(values[2]));
    case "upperCase":
      return String(values[0]).toUpperCase();
    case "lowerCase":
      return String(values[0]).toLowerCase();
    case "round":
      return Math.round(Number(values[0]));
    case "floor":
      return Math.floor(Number(values[0]));
    case "abs":
      return Math.abs(Number(values[0]));
    case "neg":
      return -Number(values[0]);
    default:
      return rejectFold;
  }
};

export function fold(ast: TaggedAstNode): TaggedAstNode {
  const node = ast as Node;
  switch (node.op) {
    case "call": {
      const args = ((node.args as Node[] | undefined) ?? []).map(fold);
      if (typeof node.fn === "string" && PURE_BUILTINS.has(node.fn) && args.every(isConst)) {
        const value = evaluate(
          node.fn,
          args.map((arg) => arg.value),
        );
        if (value !== rejectFold) return constNode(node, value);
      }
      return build(node, { op: node.op, fn: node.fn, args });
    }
    case "if":
    case "cond": {
      const testKey = node.op === "cond" && node.if ? "if" : "cond";
      const cond = fold(node[testKey] as TaggedAstNode),
        thenNode = fold(node.then as TaggedAstNode),
        elseNode = fold(node.else as TaggedAstNode);
      return isConst(cond) && typeof cond.value === "boolean"
        ? cond.value
          ? thenNode
          : elseNode
        : build(node, {
            op: node.op,
            [testKey]: cond,
            then: thenNode,
            ...(elseNode ? { else: elseNode } : {}),
          });
    }
    case "record": {
      const fields = Object.fromEntries(
        Object.entries((node.fields as Record<string, TaggedAstNode> | undefined) ?? {}).map(
          ([key, value]) => [key, fold(value)],
        ),
      );
      return Object.values(fields).every(isConst)
        ? constNode(
            node,
            Object.fromEntries(
              Object.entries(fields).map(([key, value]) => [key, (value as Node).value]),
            ),
          )
        : build(node, { op: node.op, fields });
    }
    case "array": {
      const elements = ((node.elements as TaggedAstNode[] | undefined) ?? []).map(fold);
      return elements.every(isConst)
        ? constNode(
            node,
            elements.map((element) => (element as Node).value),
          )
        : build(node, { op: node.op, elements });
    }
    case "let": {
      const value = fold(node.value as TaggedAstNode),
        body = fold(node.body as TaggedAstNode);
      return references(body as Node, String(node.name))
        ? build(node, { op: node.op, name: node.name, value, body })
        : body;
    }
    case "match": {
      const scrutinee = fold(node.scrutinee as TaggedAstNode);
      const cases = ((node.cases as MatchEntry[] | undefined) ?? []).map((entry) => ({
        ...entry,
        body: fold(entry.body as TaggedAstNode),
      }));
      if (isConst(scrutinee)) {
        const chosen = cases.find((entry) =>
          matchPattern((entry.pattern ?? entry.pat) as any, scrutinee.value),
        );
        if (chosen) return chosen.body as TaggedAstNode;
      }
      return build(node, { op: node.op, scrutinee, cases });
    }
    case "lambda":
      return build(node, {
        op: node.op,
        param: node.param,
        body: fold(node.body as TaggedAstNode),
      });
    case "apply":
      return build(node, {
        op: node.op,
        fn: fold(node.fn as TaggedAstNode),
        arg: fold(node.arg as TaggedAstNode),
      });
    default:
      return build(node, { ...node });
  }
}

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object") return false;
  if (Array.isArray(a) || Array.isArray(b))
    return (
      Array.isArray(a) &&
      Array.isArray(b) &&
      a.length === b.length &&
      a.every((value, index) => deepEq(value, b[index]))
    );
  const ak = Object.keys(a as object).sort(),
    bk = Object.keys(b as object).sort();
  return (
    ak.length === bk.length &&
    ak.every(
      (key, index) =>
        key === bk[index] &&
        deepEq((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]),
    )
  );
}
