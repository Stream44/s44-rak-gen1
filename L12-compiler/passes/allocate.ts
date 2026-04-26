import type { AllocatedAst, AllocatedAstNode, TaggedAstNode } from "../ir/ast-tagged.ts";

type Node = TaggedAstNode & Record<string, any>;
type Source = { kind: "input"; name: string } | { kind: "node"; id: number };
type InputMeta = { name: string; death: number };
type Scope = {
  inputs: InputMeta[];
  byName: Map<string, number>;
  captures: Map<string, { source: Source; slot: number }>;
  externals: Set<string>;
  intervals: Map<number, { birth: number; death: number }>;
  nested: Map<number, Scope>;
};
const needsSiblingLiveness = new Set([
  "call",
  "apply",
  "if",
  "cond",
  "record",
  "array",
  "match",
  "iter",
]);

const kids = (node: Node): Node[] =>
  node.op === "call"
    ? ((node.args as Node[] | undefined) ?? [])
    : node.op === "if"
      ? ([node.cond, node.then, node.else].filter(Boolean) as Node[])
      : node.op === "let"
        ? ([node.value, node.body].filter(Boolean) as Node[])
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
                : node.op === "apply"
                  ? ([node.fn, node.arg].filter(Boolean) as Node[])
                  : Array.isArray(node.children)
                    ? (node.children as Node[])
                    : [];

const producer = (node: Node) => node.op !== "var" && node.op !== "let";
const copy = (
  node: Node,
  patch: Record<string, unknown>,
  children: AllocatedAstNode[],
): AllocatedAstNode => ({ ...node, ...patch, children }) as unknown as AllocatedAstNode;
const tail = (node: Node): number => Math.max(node.nodeId, ...kids(node).map(tail), node.nodeId);
const freeVars = (node: Node, bound = new Set<string>()): Set<string> => {
  if (node.op === "var")
    return bound.has(String(node.name)) ? new Set() : new Set([String(node.name)]);
  if (node.op === "lambda")
    return freeVars(node.body as Node, new Set([...bound, String(node.param)]));
  if (node.op === "let") {
    const vars = freeVars(node.value as Node, bound);
    for (const name of freeVars(node.body as Node, new Set([...bound, String(node.name)])))
      vars.add(name);
    return vars;
  }
  return kids(node).reduce((vars, child) => {
    for (const name of freeVars(child, bound)) vars.add(name);
    return vars;
  }, new Set<string>());
};

function analyze(root: Node, outer = new Map<string, Source>(), params: string[] = []): Scope {
  const scope: Scope = {
    inputs: [],
    byName: new Map(),
    captures: new Map(),
    externals: new Set(),
    intervals: new Map(),
    nested: new Map(),
  };
  const input = (name: string) => {
    const idx = scope.byName.get(name);
    if (idx !== undefined) return { kind: "input", name } as Source;
    scope.byName.set(name, scope.inputs.length);
    scope.inputs.push({ name, death: -1 });
    return { kind: "input", name } as Source;
  };
  const mark = (src: Source, death: number) => {
    if (src.kind === "input") {
      input(src.name);
      const idx = scope.byName.get(src.name)!;
      scope.inputs[idx].death = Math.max(scope.inputs[idx].death, death);
      return;
    }
    scope.intervals.set(src.id, {
      birth: scope.intervals.get(src.id)?.birth ?? src.id,
      death: Math.max(scope.intervals.get(src.id)?.death ?? src.id, death),
    });
  };
  const stretch = (node: Node, death: number) => {
    if (producer(node)) mark({ kind: "node", id: node.nodeId }, death);
    if (node.op === "let" || node.op === "lambda") return;
    for (const child of kids(node)) stretch(child, death);
  };
  for (const name of params) input(name);
  const visit = (node: Node, local = new Map<string, Source>()): Source => {
    if (producer(node))
      scope.intervals.set(node.nodeId, { birth: node.nodeId, death: node.nodeId });
    switch (node.op) {
      case "var": {
        if (local.has(node.name)) return local.get(node.name)!;
        if (scope.byName.has(node.name)) return { kind: "input", name: node.name };
        if (outer.has(node.name)) {
          const cap = scope.captures.get(node.name) ?? {
            source: outer.get(node.name)!,
            slot: scope.inputs.length,
          };
          if (!scope.captures.has(node.name)) {
            scope.captures.set(node.name, cap);
            input(node.name);
          }
          return { kind: "input", name: node.name };
        }
        scope.externals.add(String(node.name));
        return input(node.name);
      }
      case "let": {
        const value = visit(node.value as Node, local);
        const body = visit(node.body as Node, new Map(local).set(String(node.name), value));
        return body;
      }
      case "lambda": {
        const env = [
          ...outer.entries(),
          ...local.entries(),
          ...scope.inputs.map(
            (entry) =>
              [entry.name, { kind: "input", name: entry.name } as Source] as [string, Source],
          ),
        ];
        const inner = analyze(node.body as Node, new Map<string, Source>(env), [
          String(node.param),
        ]);
        scope.nested.set(node.nodeId, inner);
        for (const { source } of inner.captures.values()) mark(source, node.nodeId);
        return { kind: "node", id: node.nodeId };
      }
      default: {
        const death = tail(node);
        for (const child of kids(node)) {
          const childDeath = needsSiblingLiveness.has(String(node.op)) ? death : tail(child);
          mark(visit(child, local), childDeath);
          stretch(child, childDeath);
        }
        if (producer(node)) mark({ kind: "node", id: node.nodeId }, tail(node));
        return producer(node) ? { kind: "node", id: node.nodeId } : input(`$tmp:${node.nodeId}`);
      }
    }
  };
  visit(root, new Map());
  return scope;
}

function allocateScope(
  root: Node,
  scope: Scope,
  inherited = new Map<string, number>(),
): { node: AllocatedAstNode; registerCount: number } {
  const slots = scope.inputs.map((_, index) => index);
  const free: number[] = [];
  const active: Array<{ death: number; id: number; reg: number }> = [];
  const regs = new Map<string, number>(scope.inputs.map((entry, index) => [entry.name, index]));
  let next = slots.length;
  const intervals = [...scope.intervals.entries()].sort(
    (a, b) => a[1].birth - b[1].birth || a[0] - b[0],
  );
  for (const [id, range] of intervals) {
    for (let i = 0; i < active.length; ) {
      if (active[i].death < range.birth) {
        free.push(active[i].reg);
        active.splice(i, 1);
        continue;
      }
      i++;
    }
    free.sort((a, b) => a - b);
    const reg = free.shift() ?? next++;
    regs.set(String(id), reg);
    active.push({ death: range.death, id, reg });
    active.sort((a, b) => a.death - b.death || a.reg - b.reg);
  }
  const resolve = (src: Source) =>
    src.kind === "input"
      ? (regs.get(src.name) ?? inherited.get(src.name) ?? 0)
      : (regs.get(String(src.id)) ?? 0);
  const render = (node: Node, local = new Map<string, Source>()): AllocatedAstNode => {
    if (node.op === "var") {
      const src =
        local.get(node.name) ??
        (scope.byName.has(node.name)
          ? ({ kind: "input", name: node.name } as Source)
          : (scope.captures.get(node.name)?.source ??
            ({ kind: "input", name: node.name } as Source)));
      return copy(node, { reg: resolve(src) }, []);
    }
    if (node.op === "let") {
      const value = render(node.value as Node, local);
      const valueSrc: Source =
        local.get(node.name) ??
        ((node.value as Node).op === "var"
          ? (local.get((node.value as Node).name) ?? {
              kind: "input",
              name: String((node.value as Node).name),
            })
          : { kind: "node", id: (node.value as Node).nodeId });
      const body = render(node.body as Node, new Map(local).set(String(node.name), valueSrc));
      return copy(node, { reg: body.reg, value, body }, [value, body]);
    }
    if (node.op === "lambda") {
      const nested = scope.nested.get(node.nodeId)!;
      const bodyInputs = new Map<string, number>(
        nested.inputs.map((entry, index) => [entry.name, index]),
      );
      const body = allocateScope(node.body as Node, nested, bodyInputs).node;
      const captures = [...nested.captures.values()]
        .sort((a, b) => a.slot - b.slot)
        .map((entry) => resolve(entry.source));
      return copy(node, { reg: regs.get(String(node.nodeId)) ?? 0, body, captures }, [body]);
    }
    const children = kids(node).map((child) => render(child, local));
    const patch: Record<string, unknown> = { reg: regs.get(String(node.nodeId)) ?? 0 };
    if (node.op === "call") patch.args = children;
    if (node.op === "if") {
      [patch.cond, patch.then, patch.else] = children;
      if (children[1]?.reg === children[2]?.reg) patch.reg = children[1].reg;
    }
    if (node.op === "cond") {
      [patch.if, patch.then, patch.else] = children;
      if (children[1]?.reg === children[2]?.reg) patch.reg = children[1].reg;
    }
    if (node.op === "apply") [patch.fn, patch.arg] = children;
    if (node.op === "match") {
      const [scrutinee, ...bodies] = children;
      patch.scrutinee = scrutinee;
      patch.cases = ((node.cases as any[]) ?? []).map((entry, index) => ({
        ...entry,
        body: bodies[index],
      }));
    }
    if (node.op === "record")
      patch.fields = Object.fromEntries(
        Object.keys(node.fields ?? {}).map((key, index) => [key, children[index]]),
      );
    if (node.op === "array") patch.elements = children;
    return copy(node, patch, children);
  };
  const node = render(root);
  const walkMax = (entry: AllocatedAstNode): number =>
    Math.max(
      entry.reg,
      ...((entry.children as AllocatedAstNode[] | undefined) ?? []).map(walkMax),
      -1,
    );
  return { node, registerCount: Math.max(walkMax(node) + 1, root.op === "let" ? 2 : 0) };
}

export function allocate(ast: TaggedAstNode): AllocatedAst {
  const scope = analyze(ast as Node);
  const out = allocateScope(ast as Node, scope);
  return { root: out.node, registerCount: out.registerCount };
}
