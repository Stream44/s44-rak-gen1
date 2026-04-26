import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseKernelModel } from "../../L11-projection/metamodel.ts";
import { fold } from "./fold.ts";

type Expr = Record<string, any>;
const strip = (node: any): any =>
  !node || typeof node !== "object"
    ? node
    : Array.isArray(node)
      ? node.map(strip)
      : Object.fromEntries(
          Object.entries(node)
            .filter(([k]) => !["children", "nodeId", "id", "path"].includes(k))
            .map(([k, v]) => [k, strip(v)]),
        );
const tag = (node: Expr, ids = { value: 0 }): any => {
  const visit = (expr: Expr): any => {
    const next = { ...expr, nodeId: ids.value++, children: [] as any[] };
    next.children =
      next.op === "call"
        ? (next.args ?? []).map(visit)
        : next.op === "if"
          ? [visit(next.cond), visit(next.then), visit(next.else)]
          : next.op === "cond"
            ? [visit(next.cond ?? next.if), visit(next.then), visit(next.else)]
            : next.op === "let"
              ? [visit(next.value), visit(next.body)]
              : next.op === "match"
                ? [visit(next.scrutinee), ...(next.cases ?? []).map((c: any) => visit(c.body))]
                : next.op === "record"
                  ? Object.values(next.fields ?? {}).map((v: any) => visit(v))
                  : next.op === "array"
                    ? (next.elements ?? []).map(visit)
                    : next.op === "lambda"
                      ? [visit(next.body)]
                      : next.op === "apply"
                        ? [visit(next.fn), visit(next.arg)]
                        : [];
    if (next.op === "call") next.args = next.children;
    if (next.op === "if") [next.cond, next.then, next.else] = next.children;
    if (next.op === "cond") [next.if, next.then, next.else] = next.children;
    if (next.op === "let") [next.value, next.body] = next.children;
    if (next.op === "match") {
      const [scrutinee, ...bodies] = next.children;
      next.scrutinee = scrutinee;
      next.cases = (next.cases ?? []).map((c: any, i: number) => ({ ...c, body: bodies[i] }));
    }
    if (next.op === "record")
      next.fields = Object.fromEntries(
        Object.keys(next.fields ?? {}).map((k, i) => [k, next.children[i]]),
      );
    if (next.op === "array") next.elements = next.children;
    if (next.op === "lambda") [next.body] = next.children;
    if (next.op === "apply") [next.fn, next.arg] = next.children;
    return next;
  };
  return visit(node);
};
const run = (expr: Expr) => strip(fold(tag(expr)));
const realFixtures = () =>
  Object.values(
    (
      parseKernelModel(
        readFileSync(
          resolve(import.meta.dir, "..", "..", "L00-model", "kernel.model.yaml"),
          "utf-8",
        ),
      ) as any
    ).morphisms ?? {},
  )
    .filter((m: any) => m?.impl?.kind === "algebra" && m.impl.ast)
    .slice(0, 10)
    .map((m: any) => m.impl.ast);

describe("fold", () => {
  test("folds add", () =>
    expect(
      run({
        op: "call",
        fn: "add",
        args: [
          { op: "const", value: 1 },
          { op: "const", value: 2 },
        ],
      }),
    ).toEqual({ op: "const", value: 3 }));
  test("folds sub", () =>
    expect(
      run({
        op: "call",
        fn: "sub",
        args: [
          { op: "const", value: 5 },
          { op: "const", value: 3 },
        ],
      }),
    ).toEqual({ op: "const", value: 2 }));
  test("folds and", () =>
    expect(
      run({
        op: "call",
        fn: "and",
        args: [
          { op: "const", value: true },
          { op: "const", value: false },
        ],
      }),
    ).toEqual({ op: "const", value: false }));
  test("folds cond true", () =>
    expect(
      run({
        op: "cond",
        if: { op: "const", value: true },
        then: { op: "const", value: "T" },
        else: { op: "const", value: "E" },
      }),
    ).toEqual({ op: "const", value: "T" }));
  test("folds cond false", () =>
    expect(
      run({
        op: "cond",
        if: { op: "const", value: false },
        then: { op: "const", value: "T" },
        else: { op: "const", value: "E" },
      }),
    ).toEqual({ op: "const", value: "E" }));
  test("folds all-const records", () =>
    expect(
      run({
        op: "record",
        fields: { foo: { op: "const", value: 1 }, bar: { op: "const", value: "x" } },
      }),
    ).toEqual({ op: "const", value: { foo: 1, bar: "x" } }));
  test("keeps mixed records", () =>
    expect(
      run({
        op: "record",
        fields: { foo: { op: "const", value: 1 }, bar: { op: "var", name: "x" } },
      }),
    ).toEqual({
      op: "record",
      fields: { foo: { op: "const", value: 1 }, bar: { op: "var", name: "x" } },
    }));
  test("drops dead lets", () =>
    expect(
      run({
        op: "let",
        name: "x",
        value: { op: "const", value: 1 },
        body: { op: "const", value: 2 },
      }),
    ).toEqual({ op: "const", value: 2 }));
  test("keeps live lets", () =>
    expect(
      run({
        op: "let",
        name: "x",
        value: { op: "const", value: 1 },
        body: {
          op: "call",
          fn: "add",
          args: [
            { op: "var", name: "x" },
            { op: "const", value: 2 },
          ],
        },
      }),
    ).toEqual({
      op: "let",
      name: "x",
      value: { op: "const", value: 1 },
      body: {
        op: "call",
        fn: "add",
        args: [
          { op: "var", name: "x" },
          { op: "const", value: 2 },
        ],
      },
    }));
  test("folds first matching const pattern", () =>
    expect(
      run({
        op: "match",
        scrutinee: { op: "const", value: 5 },
        cases: [
          { pat: { kind: "const", value: 5 }, body: { op: "const", value: "B1" } },
          { pat: { kind: "wildcard" }, body: { op: "const", value: "B2" } },
        ],
      }),
    ).toEqual({ op: "const", value: "B1" }));
  test("is idempotent on a complex fixture", () => {
    const once = fold(
      tag({
        op: "let",
        name: "x",
        value: {
          op: "call",
          fn: "add",
          args: [
            { op: "const", value: 1 },
            { op: "const", value: 2 },
          ],
        },
        body: {
          op: "record",
          fields: {
            sum: { op: "var", name: "x" },
            arr: {
              op: "array",
              elements: [
                { op: "const", value: 1 },
                { op: "const", value: 2 },
              ],
            },
          },
        },
      }),
    );
    expect(fold(once)).toEqual(once);
  });
  test("rejects division by zero", () => {
    const expr = {
      op: "call",
      fn: "div",
      args: [
        { op: "const", value: 1 },
        { op: "const", value: 0 },
      ],
    };
    expect(run(expr)).toEqual(expr);
  });
  test("cascades nested add in one pass", () =>
    expect(
      run({
        op: "call",
        fn: "add",
        args: [
          {
            op: "call",
            fn: "add",
            args: [
              { op: "const", value: 1 },
              { op: "const", value: 2 },
            ],
          },
          { op: "const", value: 3 },
        ],
      }),
    ).toEqual({ op: "const", value: 6 }));
  test("folds all-const arrays", () =>
    expect(
      run({
        op: "array",
        elements: [
          { op: "const", value: 1 },
          { op: "const", value: 2 },
        ],
      }),
    ).toEqual({ op: "const", value: [1, 2] }));
  test("ten real morphism fixtures fold without error", () => {
    for (const fixture of realFixtures()) expect(() => fold(tag(fixture))).not.toThrow();
  });
});
