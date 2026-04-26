import { describe, expect, test } from "bun:test";
import { ExpressionEvaluator } from "../../L04-expression/evaluator.ts";
import type { InlineProgram } from "./inline.ts";
import { inline } from "./inline.ts";

type Expr = Record<string, any>;
const ev = new ExpressionEvaluator();
const t = (expr: Expr, ids = { value: 0 }): any => {
  const visit = (node: Expr): any => {
    const next = { ...node, nodeId: ids.value++, children: [] as any[] };
    next.children =
      next.op === "call"
        ? (next.args ?? []).map(visit)
        : next.op === "let"
          ? [visit(next.value), visit(next.body)]
          : next.op === "if"
            ? [visit(next.cond), visit(next.then), visit(next.else)]
            : next.op === "record"
              ? Object.values(next.fields ?? {}).map((v: any) => visit(v))
              : next.op === "array"
                ? (next.elements ?? []).map(visit)
                : [];
    if (next.op === "call") next.args = next.children;
    if (next.op === "let") [next.value, next.body] = next.children;
    if (next.op === "if") [next.cond, next.then, next.else] = next.children;
    if (next.op === "record")
      next.fields = Object.fromEntries(
        Object.keys(next.fields ?? {}).map((k, i) => [k, next.children[i]]),
      );
    if (next.op === "array") next.elements = next.children;
    return next;
  };
  return visit(expr);
};
const callM = (id: string, arg: Expr) => ({
  op: "call",
  fn: "CALL_MORPHISM",
  args: [{ op: "const", value: "$tmp" }, { op: "const", value: id }, arg],
});
const program = (
  defs: Record<string, Expr>,
  entryId = "main",
  extra: Partial<InlineProgram> = {},
): InlineProgram => ({
  entryId,
  pureBuiltins: new Set(["add", "eq"]),
  morphisms: Object.fromEntries(
    Object.entries(defs).map(([id, ast]) => [
      id,
      { id, name: id, impl: { kind: "algebra", ast: t(ast) } },
    ]),
  ),
  ...extra,
});
const countCalls = (node: any): number =>
  (node.op === "call" && node.fn === "CALL_MORPHISM" ? 1 : 0) +
  (node.children ?? []).reduce((n: number, c: any) => n + countCalls(c), 0);
const ids = (node: any): number[] => [node.nodeId, ...(node.children ?? []).flatMap(ids)];
const regs = (node: any): number =>
  node.op === "call" && node.fn === "CALL_MORPHISM"
    ? 2
    : Math.max(node.op === "let" ? 1 : 0, ...(node.children ?? []).map(regs));
const run = async (defs: Record<string, any>, id: string, input: unknown): Promise<unknown> => {
  const visit = async (expr: any, scope: Record<string, unknown>): Promise<unknown> => {
    if (expr.op === "const") return expr.value;
    if (expr.op === "var") return scope[expr.name];
    if (expr.op === "let")
      return visit(expr.body, { ...scope, [expr.name]: await visit(expr.value, scope) });
    if (expr.op === "if")
      return visit((await visit(expr.cond, scope)) ? expr.then : expr.else, scope);
    if (expr.op === "record")
      return Object.fromEntries(
        await Promise.all(
          Object.entries(expr.fields ?? {}).map(async ([k, v]) => [k, await visit(v, scope)]),
        ),
      );
    if (expr.op === "array")
      return Promise.all((expr.elements ?? []).map((v: any) => visit(v, scope)));
    if (expr.op === "call" && expr.fn === "CALL_MORPHISM")
      return visit(defs[expr.args[1].value], {
        ...scope,
        $input: await visit(expr.args[2], scope),
      });
    const args = await Promise.all((expr.args ?? []).map((a: any) => visit(a, scope)));
    const out = ev.evaluate({ ...expr, args: args.map((value) => ({ op: "const", value })) }, {});
    if (out.error) throw new Error(out.error);
    return out.value;
  };
  return visit(defs[id], { $input: input });
};

describe("inline", () => {
  test("tiny callee with one caller is inlined", () =>
    expect(
      (
        inline(
          program({
            tiny: {
              op: "call",
              fn: "add",
              args: [
                { op: "var", name: "$input" },
                { op: "const", value: 1 },
              ],
            },
            main: callM("tiny", { op: "const", value: 2 }),
          }),
        ).morphisms.main.impl!.ast as any
      ).op,
    ).toBe("let"));
  test("same callee with four callers is not inlined", () => {
    const out = inline(
      program(
        {
          tiny: {
            op: "call",
            fn: "add",
            args: [
              { op: "var", name: "$input" },
              { op: "const", value: 1 },
            ],
          },
          a: callM("tiny", { op: "const", value: 1 }),
          b: callM("tiny", { op: "const", value: 2 }),
          c: callM("tiny", { op: "const", value: 3 }),
          d: callM("tiny", { op: "const", value: 4 }),
        },
        "a",
      ),
    );
    expect((out.morphisms.a.impl!.ast as any).op).toBe("call");
  });
  test("large callee is not inlined", () =>
    expect(
      (
        inline(
          program({
            large: {
              op: "call",
              fn: "add",
              args: Array.from({ length: 15 }, (_, i) => ({ op: "const", value: i })),
            },
            main: callM("large", { op: "const", value: 1 }),
          }),
        ).morphisms.main.impl!.ast as any
      ).op,
    ).toBe("call"));
  test("CALL_MODULE callee is not inlined", () =>
    expect(
      (
        inline(
          program({
            impure: { op: "call", fn: "CALL_MODULE", args: [{ op: "const", value: "m" }] },
            main: callM("impure", { op: "const", value: 1 }),
          }),
        ).morphisms.main.impl!.ast as any
      ).op,
    ).toBe("call"));
  test("identity morphism is not inlined", () => {
    const out = inline({
      ...program({
        main: callM("identity", { op: "const", value: 4 }),
        identity: { op: "var", name: "$input" },
      }),
      referenceMorphismIds: new Set(["identity"]),
    });
    expect((out.morphisms.main.impl!.ast as any).op).toBe("call");
  });
  test("semantics are preserved across five inputs", async () => {
    const defs = {
      inc: {
        op: "call",
        fn: "add",
        args: [
          { op: "var", name: "$input" },
          { op: "const", value: 1 },
        ],
      },
      main: {
        op: "call",
        fn: "add",
        args: [callM("inc", { op: "var", name: "$input" }), { op: "const", value: 2 }],
      },
    };
    const out = inline(program(defs));
    for (const input of [0, 1, 2, 7, 11])
      expect(await run(defs, "main", input)).toEqual(
        await run(
          Object.fromEntries(Object.entries(out.morphisms).map(([id, m]) => [id, m.impl!.ast])),
          "main",
          input,
        ),
      );
  });
  test("recursive morphism is not inlined", () =>
    expect(
      (
        inline(
          program({
            loop: callM("loop", { op: "var", name: "$input" }),
            main: callM("loop", { op: "const", value: 1 }),
          }),
        ).morphisms.main.impl!.ast as any
      ).op,
    ).toBe("call"));
  test("chain of inlines removes CALL_MORPHISM nodes", () => {
    const out = inline(
      program(
        {
          c: {
            op: "call",
            fn: "add",
            args: [
              { op: "var", name: "$input" },
              { op: "const", value: 1 },
            ],
          },
          b: callM("c", { op: "var", name: "$input" }),
          a: callM("b", { op: "const", value: 1 }),
        },
        "a",
      ),
    );
    expect(countCalls(out.morphisms.a.impl!.ast)).toBe(0);
  });
  test("after inline nodeIds stay monotonic", () => {
    const tagged = inline(
      program({
        tiny: {
          op: "call",
          fn: "add",
          args: [
            { op: "var", name: "$input" },
            { op: "const", value: 1 },
          ],
        },
        main: {
          op: "record",
          fields: { x: callM("tiny", { op: "const", value: 2 }), y: { op: "const", value: 3 } },
        },
      }),
    ).morphisms.main.impl!.ast as any;
    expect(ids(tagged)).toEqual([...ids(tagged)].sort((a, b) => a - b));
  });
  test("register heuristic does not worsen after inlining", () => {
    const src = program({
      tiny: {
        op: "call",
        fn: "add",
        args: [
          { op: "var", name: "$input" },
          { op: "const", value: 1 },
        ],
      },
      main: {
        op: "let",
        name: "x",
        value: callM("tiny", { op: "const", value: 2 }),
        body: {
          op: "call",
          fn: "add",
          args: [
            { op: "var", name: "x" },
            { op: "const", value: 3 },
          ],
        },
      },
    });
    const out = inline(src);
    expect(regs(out.morphisms.main.impl!.ast)).toBeLessThanOrEqual(
      regs(src.morphisms.main.impl!.ast),
    );
  });
});
