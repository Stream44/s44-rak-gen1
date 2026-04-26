import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseKernelModel } from "../../L11-projection/metamodel.ts";
import { allocate } from "./allocate.ts";
import { fold } from "./fold.ts";

type Expr = Record<string, any>;

const tag = (expr: Expr, ids = { value: 0 }): any => {
  const visit = (node: Expr): any => {
    const next = { ...node, nodeId: ids.value++, children: [] as any[] };
    next.children =
      next.op === "call"
        ? (next.args ?? []).map(visit)
        : next.op === "apply"
          ? [visit(next.fn), visit(next.arg)]
          : next.op === "if"
            ? [visit(next.cond), visit(next.then), visit(next.else)]
            : next.op === "let"
              ? [visit(next.value), visit(next.body)]
              : next.op === "match"
                ? [
                    visit(next.scrutinee),
                    ...(next.cases ?? []).map((entry: any) => visit(entry.body)),
                  ]
                : next.op === "record"
                  ? Object.values(next.fields ?? {}).map((child: any) => visit(child))
                  : next.op === "array"
                    ? (next.elements ?? []).map(visit)
                    : next.op === "lambda"
                      ? [visit(next.body)]
                      : [];
    if (next.op === "call") next.args = next.children;
    if (next.op === "apply") [next.fn, next.arg] = next.children;
    if (next.op === "if") [next.cond, next.then, next.else] = next.children;
    if (next.op === "let") [next.value, next.body] = next.children;
    if (next.op === "match") {
      const [scrutinee, ...bodies] = next.children;
      next.scrutinee = scrutinee;
      next.cases = (next.cases ?? []).map((entry: any, index: number) => ({
        ...entry,
        body: bodies[index],
      }));
    }
    if (next.op === "record")
      next.fields = Object.fromEntries(
        Object.keys(next.fields ?? {}).map((key, index) => [key, next.children[index]]),
      );
    if (next.op === "array") next.elements = next.children;
    if (next.op === "lambda") [next.body] = next.children;
    return next;
  };
  return visit(expr);
};

const regs = (node: any, out: number[] = []): number[] => {
  if (!node || typeof node !== "object") return out;
  out.push(node.reg);
  for (const child of node.children ?? []) regs(child, out);
  return out;
};

const authorizeAst = () =>
  fold(
    tag(
      (
        parseKernelModel(
          readFileSync(
            resolve(import.meta.dir, "..", "..", "L00-model", "kernel.model.yaml"),
            "utf-8",
          ),
        ) as any
      ).morphisms.authorize.impl.ast,
    ),
  );
const chain = (count: number) =>
  Array.from({ length: count - 1 }).reduceRight(
    (body, _entry, index) => ({
      op: "let",
      name: `$t${index}`,
      value: { op: "const", value: index + 1 },
      body,
    }),
    { op: "const", value: 0 } as Expr,
  );

describe("allocate", () => {
  test("single const uses reg 0", () => {
    const out = allocate(tag({ op: "const", value: 42 }));
    expect(out.root.reg).toBe(0);
    expect(out.registerCount).toBe(1);
  });
  test("addition uses three regs", () => {
    expect(
      allocate(
        tag({
          op: "call",
          fn: "add",
          args: [
            { op: "const", value: 1 },
            { op: "const", value: 2 },
          ],
        }),
      ).registerCount,
    ).toBe(3);
  });
  test("dead constant stays within two regs", () => {
    expect(
      allocate(
        tag({
          op: "let",
          name: "x",
          value: { op: "const", value: 1 },
          body: { op: "const", value: 2 },
        }),
      ).registerCount,
    ).toBe(2);
  });
  test("nested add uses five regs", () => {
    expect(
      allocate(
        tag({
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
      ).registerCount,
    ).toBe(5);
  });
  test("linear reuse stays within three regs", () => {
    const ast = tag({
      op: "let",
      name: "a",
      value: { op: "const", value: 1 },
      body: {
        op: "let",
        name: "b",
        value: { op: "const", value: 2 },
        body: {
          op: "call",
          fn: "add",
          args: [
            { op: "var", name: "a" },
            { op: "var", name: "b" },
          ],
        },
      },
    });
    expect(allocate(ast).registerCount).toBeLessThanOrEqual(3);
  });
  test("closure without capture keeps captures empty", () => {
    const out = allocate(
      tag({
        op: "lambda",
        param: "x",
        body: {
          op: "call",
          fn: "add",
          args: [
            { op: "var", name: "x" },
            { op: "const", value: 10 },
          ],
        },
      }),
    );
    expect(out.root.captures).toEqual([]);
    expect(out.root.body.reg).toBeLessThanOrEqual(1);
  });
  test("closure capture records the outer register", () => {
    const out = allocate(
      tag({
        op: "let",
        name: "outer",
        value: { op: "const", value: 42 },
        body: {
          op: "lambda",
          param: "x",
          body: {
            op: "call",
            fn: "add",
            args: [
              { op: "var", name: "x" },
              { op: "var", name: "outer" },
            ],
          },
        },
      }),
    );
    expect(out.root.body.captures).toEqual([out.root.value.reg]);
  });
  test("30-node chain stays within sixteen regs", () =>
    expect(allocate(tag(chain(30))).registerCount).toBeLessThanOrEqual(16));
  test("authorize fixture stays within eleven regs", () =>
    expect(allocate(tag(authorizeAst())).registerCount).toBeLessThanOrEqual(11));
  test("allocate is deterministic", () => {
    const ast = tag(authorizeAst());
    expect(allocate(ast)).toEqual(allocate(ast));
  });
  test("registerCount matches max reg plus one", () => {
    const out = allocate(
      tag({
        op: "record",
        fields: {
          a: { op: "const", value: 1 },
          b: {
            op: "call",
            fn: "add",
            args: [
              { op: "const", value: 2 },
              { op: "const", value: 3 },
            ],
          },
        },
      }),
    );
    expect(out.registerCount).toBe(Math.max(...regs(out.root)) + 1);
  });
  test("empty closure uses only the param slot", () => {
    const out = allocate(tag({ op: "lambda", param: "x", body: { op: "var", name: "x" } }));
    expect(out.root.captures).toEqual([]);
    expect(Math.max(...regs(out.root.body))).toBe(0);
  });
});
