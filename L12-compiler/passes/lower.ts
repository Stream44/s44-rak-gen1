import type { AllocatedAst, AllocatedAstNode } from "../ir/ast-tagged.ts";
import type { Cir, CirInstruction } from "../ir/cir.ts";

type Node = AllocatedAstNode & Record<string, unknown>;
type State = {
  instructions: CirInstruction[];
  constantPool: unknown[];
  moduleRefs: string[];
  morphismRefs: string[];
  closures: Cir["closures"];
  seen: Map<string, number>;
};

const stable = (v: unknown): string =>
  v && typeof v === "object"
    ? Array.isArray(v)
      ? `[${v.map(stable).join(",")}]`
      : `{${Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
          .join(",")}}`
    : JSON.stringify(v);
const push = (list: string[], value: string) =>
  list.includes(value) ? list.indexOf(value) : list.push(value) - 1;
const pool = (s: State, value: unknown) => {
  const key = stable(value),
    hit = s.seen.get(key);
  if (hit !== undefined) return hit;
  s.constantPool.push(value);
  s.seen.set(key, s.constantPool.length - 1);
  return s.constantPool.length - 1;
};
const emit = (
  s: State,
  op: string,
  dst: number | undefined,
  operands: CirInstruction["operands"],
  sourceNodeId?: number,
) =>
  s.instructions.push({
    op,
    ...(dst === undefined ? {} : { dst }),
    operands,
    ...(sourceNodeId === undefined ? {} : { sourceNodeId }),
  });
const nextInput = (env: Map<string, number>) => (env.size ? Math.max(...env.values()) + 1 : 0);
const opName = (fn: string) =>
  ({
    add: "ADD",
    arrayConcat: "CONCAT",
    concat: "CONCAT",
    length: "LEN",
    map: "MAP",
    filter: "FILTER",
    fold: "FOLD",
  })[fn] ?? fn.toUpperCase();
const infer = (node: Node, env = new Map<string, number>()): Map<string, number> => {
  if (node.op === "var" && typeof node.name === "string") env.set(node.name, node.reg);
  for (const child of (node.children ?? []) as Node[]) infer(child, env);
  return env;
};
const resolve = (name: string, env: Map<string, number>) => {
  if (env.has(name)) return env.get(name)!;
  if (name === "$input" && env.size === 0) return 0;
  const reg = nextInput(env);
  env.set(name, reg);
  return reg;
};

function lowerNode(node: Node, s: State, env: Map<string, number>): void {
  if (node.op === "let")
    return void (lowerNode(node.value as Node, s, env),
    lowerNode(node.body as Node, s, new Map(env).set(String(node.name), (node.value as Node).reg)));
  if (node.op === "lambda") {
    const bodyEnv = new Map(infer(node.body as Node));
    bodyEnv.set(String(node.param), 0);
    const body = lowerSub(node.body as Node, bodyEnv);
    return void emit(
      s,
      "MAKE_CLOSURE",
      node.reg,
      [
        s.closures.push({
          body,
          captures: ((node.captures as number[] | undefined) ?? []).slice(),
        }) - 1,
        ...((node.captures as number[] | undefined) ?? []).slice(),
      ],
      node.nodeId,
    );
  }
  if (node.op === "if" || node.op === "cond") {
    const test = (node.cond ?? node.if) as Node;
    lowerNode(test, s, env);
    const branchAt = s.instructions.length;
    emit(s, "JUMP_IF_FALSE", undefined, [test.reg, -1], node.nodeId);
    lowerNode(node.then as Node, s, env);
    if ((node.then as Node).reg !== node.reg)
      emit(s, "MOVE", node.reg, [(node.then as Node).reg], node.nodeId);
    const jumpAt = s.instructions.length;
    emit(s, "JUMP", undefined, [-1], node.nodeId);
    s.instructions[branchAt]!.operands[1] = s.instructions.length;
    lowerNode(node.else as Node, s, env);
    if ((node.else as Node).reg !== node.reg)
      emit(s, "MOVE", node.reg, [(node.else as Node).reg], node.nodeId);
    s.instructions[jumpAt]!.operands[0] = s.instructions.length;
    return;
  }
  if (node.op === "var") {
    if (node.name === "$input") emit(s, "LOAD_INPUT", node.reg, [], node.nodeId);
    else if (env.has(String(node.name)))
      emit(s, "MOVE", node.reg, [env.get(String(node.name))!], node.nodeId);
    else emit(s, "MOVE", node.reg, [resolve(String(node.name), env)], node.nodeId);
    return;
  }
  if (node.op === "const")
    return void emit(s, "LOAD_CONST", node.reg, [pool(s, node.value)], node.nodeId);
  if (node.op === "get") {
    const [head, ...tail] = String(node.path ?? "")
      .split("/")
      .filter(Boolean);
    let src = resolve(head ?? "$input", env);
    if (head === "$input" && !env.has("$input")) {
      emit(s, "LOAD_INPUT", node.reg, [], node.nodeId);
      src = node.reg;
    } else if (head?.startsWith("$") && env.has(head)) {
      emit(s, "MOVE", node.reg, [env.get(head)!], node.nodeId);
      src = node.reg;
    } else if (head?.startsWith("$")) {
      emit(s, "LOAD_INPUT", node.reg, [pool(s, head)], node.nodeId);
      src = node.reg;
    }
    for (const field of tail) {
      emit(s, "GET_FIELD", node.reg, [src, pool(s, field)], node.nodeId);
      src = node.reg;
    }
    return;
  }
  if (node.op === "record") {
    const fields = node.fields as Record<string, Node> | undefined;
    for (const child of Object.values(fields ?? {})) lowerNode(child, s, env);
    return void emit(
      s,
      "MAKE_RECORD",
      node.reg,
      [
        Object.keys(fields ?? {}).map((k) => pool(s, k)),
        ...Object.values(fields ?? {}).map((child) => child.reg),
      ],
      node.nodeId,
    );
  }
  if (node.op === "array") {
    const values = (node.elements as Node[] | undefined) ?? [];
    values.forEach((child) => lowerNode(child, s, env));
    return void emit(
      s,
      "MAKE_ARRAY",
      node.reg,
      values.map((child) => child.reg),
      node.nodeId,
    );
  }
  if (node.op === "iter") {
    lowerNode((node.source ?? node.array) as Node, s, env);
    lowerNode(node.lambda as Node, s, env);
    return void emit(
      s,
      "MAP",
      node.reg,
      [((node.source ?? node.array) as Node).reg, (node.lambda as Node).reg],
      node.nodeId,
    );
  }
  if (node.op === "apply") {
    const fn = node.fn as Node;
    if (fn.op === "ref") {
      lowerNode(node.arg as Node, s, env);
      const module = String(fn.uri ?? fn.moduleRef ?? ""),
        morphism = String(fn.morphismId ?? fn.id ?? fn.name ?? "");
      return void emit(
        s,
        module ? "CALL_MODULE" : "CALL_MORPHISM",
        node.reg,
        [push(module ? s.moduleRefs : s.morphismRefs, module || morphism), (node.arg as Node).reg],
        node.nodeId,
      );
    }
    lowerNode(fn, s, env);
    lowerNode(node.arg as Node, s, env);
    return void emit(s, "APPLY", node.reg, [fn.reg, (node.arg as Node).reg], node.nodeId);
  }
  if (node.op === "call") {
    const args = (node.args as Node[] | undefined) ?? [];
    args.forEach((child) => lowerNode(child, s, env));
    if (node.fn === "CALL_MODULE" || node.fn === "CALL_MORPHISM") {
      const ref = String(args[0]?.value ?? args[1]?.value ?? ""),
        start = args[0]?.op === "const" && typeof args[0].value === "string" ? 1 : 2;
      return void emit(
        s,
        String(node.fn),
        node.reg,
        [
          push(node.fn === "CALL_MODULE" ? s.moduleRefs : s.morphismRefs, ref),
          ...args.slice(start).map((arg) => arg.reg),
        ],
        node.nodeId,
      );
    }
    return void emit(
      s,
      opName(String(node.fn)),
      node.reg,
      args.map((arg) => arg.reg),
      node.nodeId,
    );
  }
  if (node.op === "match") {
    lowerNode(node.scrutinee as Node, s, env);
    for (const entry of (node.cases as Array<{ body: Node }> | undefined) ?? [])
      lowerNode(entry.body, s, env);
    return void emit(
      s,
      "MATCH_KNOWN",
      node.reg,
      [(node.scrutinee as Node).reg, pool(s, (node.cases as unknown[]) ?? [])],
      node.nodeId,
    );
  }
  if (node.op === "ref") return;
  throw new Error(`lower: unsupported op ${node.op}`);
}

function lowerSub(root: Node, env = new Map<string, number>()): Cir {
  const s: State = {
    instructions: [],
    constantPool: [],
    moduleRefs: [],
    morphismRefs: [],
    closures: [],
    seen: new Map(),
  };
  lowerNode(root, s, env);
  return {
    instructions: s.instructions,
    constantPool: s.constantPool,
    registerCount: Math.max(root.reg, ...s.instructions.map((i) => i.dst ?? -1), 0) + 1,
    moduleRefs: s.moduleRefs,
    morphismRefs: s.morphismRefs,
    closures: s.closures,
  };
}

export function lower(ast: unknown): never;
export function lower(ast: AllocatedAst): Cir;
export function lower(ast: unknown): Cir {
  if (!ast || typeof ast !== "object" || !("root" in ast) || !("registerCount" in ast))
    throw new Error("NOT_IMPLEMENTED: lower");
  const input = ast as AllocatedAst,
    cir = lowerSub(input.root as Node);
  return { ...cir, registerCount: input.registerCount };
}
