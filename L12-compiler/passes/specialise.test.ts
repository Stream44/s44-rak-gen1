import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { M3_META } from "../../L03-tower/bootstrap.ts";
import { parseKernelModel } from "../../L11-projection/metamodel.ts";
import type { Cir } from "../ir/cir.ts";
import { allocate } from "./allocate.ts";
import { fold } from "./fold.ts";
import { lower } from "./lower.ts";
import { specialise } from "./specialise.ts";
import { SPECIALISATION_RULE_METAMODEL } from "../../L02-metamodels/specialisation-rule.ts";

const tag = (expr: Record<string, any>, ids = { value: 0 }): any => {
  const walk = (node: Record<string, any>): any => {
    const out = { ...node, nodeId: ids.value++, children: [] as any[] };
    out.children =
      node.op === "call"
        ? (node.args ?? []).map(walk)
        : node.op === "apply"
          ? [walk(node.fn), walk(node.arg)]
          : node.op === "if" || node.op === "cond"
            ? [walk(node.cond ?? node.if), walk(node.then), walk(node.else)]
            : node.op === "let"
              ? [walk(node.value), walk(node.body)]
              : node.op === "record"
                ? Object.values(node.fields ?? {}).map((v: any) => walk(v))
                : node.op === "array"
                  ? (node.elements ?? []).map(walk)
                  : node.op === "lambda"
                    ? [walk(node.body)]
                    : node.op === "match"
                      ? [walk(node.scrutinee), ...(node.cases ?? []).map((c: any) => walk(c.body))]
                      : [];
    if (node.op === "call") out.args = out.children;
    if (node.op === "apply") [out.fn, out.arg] = out.children;
    if (node.op === "if") [out.cond, out.then, out.else] = out.children;
    if (node.op === "cond") [out.if, out.then, out.else] = out.children;
    if (node.op === "let") [out.value, out.body] = out.children;
    if (node.op === "record")
      out.fields = Object.fromEntries(
        Object.keys(node.fields ?? {}).map((k, i) => [k, out.children[i]]),
      );
    if (node.op === "array") out.elements = out.children;
    if (node.op === "lambda") [out.body] = out.children;
    if (node.op === "match") {
      const [scrutinee, ...bodies] = out.children;
      out.scrutinee = scrutinee;
      out.cases = (node.cases ?? []).map((c: any, i: number) => ({ ...c, body: bodies[i] }));
    }
    return out;
  };
  return walk(expr);
};
const compile = (expr: Record<string, any>, inputSchema?: Record<string, unknown>) =>
  specialise(lower(allocate(fold(tag(expr)))), inputSchema ? { inputSchema } : undefined);
const run = (cir: Cir, inputSchema?: Record<string, unknown>) =>
  specialise(cir, inputSchema ? { inputSchema } : undefined);
const model = () =>
  parseKernelModel(
    readFileSync(resolve(import.meta.dir, "..", "..", "L00-model", "kernel.model.yaml"), "utf-8"),
  ) as any;
const hasSpecialisation = (cir: Cir): boolean =>
  cir.instructions.some((ins: any) => ins.specialisedBy) ||
  cir.closures.some((closure) => hasSpecialisation(closure.body));
const cases: Array<[string, Cir, string]> = [
  [
    "add-int",
    {
      instructions: [
        { op: "LOAD_CONST", dst: 0, operands: [0] },
        { op: "LOAD_CONST", dst: 1, operands: [1] },
        { op: "ADD", dst: 2, operands: [0, 1] },
      ],
      constantPool: [1, 2],
      registerCount: 3,
      moduleRefs: [],
      morphismRefs: [],
      closures: [],
    },
    "ADD_INT",
  ],
  [
    "sub-int",
    {
      instructions: [
        { op: "LOAD_CONST", dst: 0, operands: [0] },
        { op: "LOAD_CONST", dst: 1, operands: [1] },
        { op: "SUB", dst: 2, operands: [0, 1] },
      ],
      constantPool: [1, 2],
      registerCount: 3,
      moduleRefs: [],
      morphismRefs: [],
      closures: [],
    },
    "SUB_INT",
  ],
  [
    "mul-int",
    {
      instructions: [
        { op: "LOAD_CONST", dst: 0, operands: [0] },
        { op: "LOAD_CONST", dst: 1, operands: [1] },
        { op: "MUL", dst: 2, operands: [0, 1] },
      ],
      constantPool: [2, 3],
      registerCount: 3,
      moduleRefs: [],
      morphismRefs: [],
      closures: [],
    },
    "MUL_INT",
  ],
  [
    "eq-int",
    {
      instructions: [
        { op: "LOAD_CONST", dst: 0, operands: [0] },
        { op: "LOAD_CONST", dst: 1, operands: [1] },
        { op: "EQ", dst: 2, operands: [0, 1] },
      ],
      constantPool: [1, 1],
      registerCount: 3,
      moduleRefs: [],
      morphismRefs: [],
      closures: [],
    },
    "EQ_INT",
  ],
  [
    "eq-str",
    {
      instructions: [
        { op: "LOAD_CONST", dst: 0, operands: [0] },
        { op: "LOAD_CONST", dst: 1, operands: [1] },
        { op: "EQ", dst: 2, operands: [0, 1] },
      ],
      constantPool: ["a", "b"],
      registerCount: 3,
      moduleRefs: [],
      morphismRefs: [],
      closures: [],
    },
    "EQ_STR",
  ],
  [
    "lt-int",
    {
      instructions: [
        { op: "LOAD_CONST", dst: 0, operands: [0] },
        { op: "LOAD_CONST", dst: 1, operands: [1] },
        { op: "LT", dst: 2, operands: [0, 1] },
      ],
      constantPool: [1, 2],
      registerCount: 3,
      moduleRefs: [],
      morphismRefs: [],
      closures: [],
    },
    "LT_INT",
  ],
  [
    "len-arr",
    {
      instructions: [
        { op: "LOAD_CONST", dst: 0, operands: [0] },
        { op: "LEN", dst: 1, operands: [0] },
      ],
      constantPool: [[1, 2]],
      registerCount: 2,
      moduleRefs: [],
      morphismRefs: [],
      closures: [],
    },
    "LEN_ARR",
  ],
  [
    "switch-str",
    {
      instructions: [
        { op: "LOAD_INPUT", dst: 0, operands: [] },
        { op: "LOAD_CONST", dst: 1, operands: [0] },
        { op: "LOAD_CONST", dst: 2, operands: [1] },
        { op: "EQ_STR", dst: 3, operands: [0, 1] },
        { op: "JUMP_IF_FALSE", operands: [3, 9] },
        { op: "EQ_STR", dst: 4, operands: [0, 2] },
        { op: "JUMP_IF_FALSE", operands: [4, 12] },
      ],
      constantPool: ["a", "b"],
      registerCount: 5,
      moduleRefs: [],
      morphismRefs: [],
      closures: [],
    },
    "SWITCH_STR",
  ],
  [
    "match-known",
    {
      instructions: [
        { op: "LOAD_INPUT", dst: 0, operands: [] },
        {
          op: "MATCH",
          dst: 1,
          operands: [
            0,
            [
              { value: "a", target: 1 },
              { value: "b", target: 2 },
            ],
          ],
        },
      ],
      constantPool: [],
      registerCount: 2,
      moduleRefs: [],
      morphismRefs: [],
      closures: [],
    },
    "MATCH_KNOWN",
  ],
  [
    "map-int-int",
    {
      instructions: [
        { op: "LOAD_CONST", dst: 0, operands: [0] },
        { op: "MAP", dst: 1, operands: [0, 9], calleeType: { input: "Int", output: "Int" } } as any,
      ],
      constantPool: [[1, 2]],
      registerCount: 2,
      moduleRefs: [],
      morphismRefs: [],
      closures: [],
    },
    "MAP_INT_INT",
  ],
  [
    "filter-record-known-field",
    {
      instructions: [
        { op: "LOAD_CONST", dst: 0, operands: [0] },
        { op: "FILTER", dst: 1, operands: [0, 9], predicateField: "status" } as any,
      ],
      constantPool: [[{ status: "open" }]],
      registerCount: 2,
      moduleRefs: [],
      morphismRefs: [],
      closures: [],
    },
    "FILTER_RECORD_KNOWN_FIELD",
  ],
];

describe("specialise", () => {
  test("SPECIALISATION_RULE_METAMODEL conforms to M3", () => {
    expect(SPECIALISATION_RULE_METAMODEL.conformsTo).toBe(M3_META.id);
  });

  for (const [name, cir, op] of cases) {
    test(`${name} fires on its canonical fixture`, () => {
      const inputSchema =
        name === "switch-str"
          ? { type: "string" }
          : name === "match-known"
            ? { type: "string", enum: ["a", "b"] }
            : undefined;
      const out = run(cir, inputSchema);
      const hit = out.instructions.find((entry: any) => entry.specialisedBy === name)! as any;
      expect(hit.op).toBe(op);
      if (name === "filter-record-known-field") expect(out.constantPool.at(-1)).toBe("status");
    });
  }

  test("get-field-known fires on its canonical fixture", () => {
    const out = compile(
      { op: "get", path: "$input/name" },
      { type: "object", properties: { name: { type: "string" } } },
    );
    expect(out.instructions.at(-1)).toMatchObject({
      op: "GET_FIELD_KNOWN",
      operands: [0, 0],
      specialisedBy: "get-field-known",
    });
  });

  test("coverage across kernel.model.yaml still specialises a narrowed real subset", () => {
    const doc = model(),
      algebra = Object.values(doc.morphisms).filter((m: any) => m.impl.kind === "algebra");
    const hits = algebra.filter((m: any) =>
      hasSpecialisation(compile(m.impl.ast, doc.types[m.input]?.jsonSchema)),
    ).length;
    expect((hits / algebra.length) * 100).toBeGreaterThanOrEqual(20);
  });
});
