import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseKernelModel } from "../../L11-projection/metamodel.ts";
import { allocate } from "./allocate.ts";
import { fold } from "./fold.ts";
import { lower } from "./lower";

type Expr = Record<string, any>;
const tag = (expr: Expr, ids = { value: 0 }): any => {
  const walk = (node: Expr): any => {
    const out = { ...node, nodeId: ids.value++, children: [] as any[] };
    out.children =
      out.op === "call"
        ? (out.args ?? []).map(walk)
        : out.op === "apply"
          ? [walk(out.fn), walk(out.arg)]
          : out.op === "if" || out.op === "cond"
            ? [walk(out.cond ?? out.if), walk(out.then), walk(out.else)]
            : out.op === "let"
              ? [walk(out.value), walk(out.body)]
              : out.op === "record"
                ? Object.values(out.fields ?? {}).map((v: any) => walk(v))
                : out.op === "array"
                  ? (out.elements ?? []).map(walk)
                  : out.op === "lambda"
                    ? [walk(out.body)]
                    : [];
    if (out.op === "call") out.args = out.children;
    if (out.op === "apply") [out.fn, out.arg] = out.children;
    if (out.op === "if") [out.cond, out.then, out.else] = out.children;
    if (out.op === "cond") [out.if, out.then, out.else] = out.children;
    if (out.op === "let") [out.value, out.body] = out.children;
    if (out.op === "record")
      out.fields = Object.fromEntries(
        Object.keys(out.fields ?? {}).map((key, index) => [key, out.children[index]]),
      );
    if (out.op === "array") out.elements = out.children;
    if (out.op === "lambda") [out.body] = out.children;
    return out;
  };
  return walk(expr);
};
const run = (expr: Expr) => lower(allocate(tag(expr)));
const model = () =>
  parseKernelModel(
    readFileSync(resolve(import.meta.dir, "..", "..", "L00-model", "kernel.model.yaml"), "utf-8"),
  ) as any;
const authorize = () => run(fold(tag(model().morphisms.authorize.impl.ast)));
const realNames = [
  "computeModulePreload",
  "concatRequirementArrays",
  "authorize",
  "surveyCapabilities",
  "jwtVerify",
  "mergeSessionScopes",
  "resolveAuth",
  "bindSession",
  "jwtSign",
  "deepMerge",
];

describe("lower", () => {
  test("single const emits one LOAD_CONST", () => {
    const cir = run({ op: "const", value: 42 });
    expect(cir.instructions).toHaveLength(1);
    expect(cir.instructions[0]).toMatchObject({ op: "LOAD_CONST", operands: [0] });
    expect(cir.constantPool).toEqual([42]);
  });
  test("add emits two loads plus ADD", () =>
    expect(
      run({
        op: "call",
        fn: "add",
        args: [
          { op: "const", value: 1 },
          { op: "const", value: 2 },
        ],
      }).instructions.map((i) => i.op),
    ).toEqual(["LOAD_CONST", "LOAD_CONST", "ADD"]));
  test("constant pool dedups repeated literals", () => {
    const cir = run({
      op: "call",
      fn: "add",
      args: [
        { op: "const", value: 1 },
        { op: "const", value: 1 },
      ],
    });
    expect(cir.instructions).toHaveLength(3);
    expect(cir.instructions.slice(0, 2).map((i) => i.operands[0])).toEqual([0, 0]);
    expect(cir.constantPool).toEqual([1]);
  });
  test("branch lowering includes JUMP_IF_FALSE and JUMP", () => {
    const ops = run({
      op: "cond",
      if: { op: "var", name: "x" },
      then: { op: "const", value: 1 },
      else: { op: "const", value: 2 },
    }).instructions.map((i) => i.op);
    expect(ops.length).toBeGreaterThanOrEqual(4);
    expect(ops).toContain("JUMP_IF_FALSE");
    expect(ops).toContain("JUMP");
  });
  test("closure emits MAKE_CLOSURE and nested body", () => {
    const cir = run({
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
    });
    expect(cir.instructions[0]?.op).toBe("MAKE_CLOSURE");
    expect(cir.closures[0]?.body.instructions.map((i) => i.op)).toContain("ADD");
  });
  test("authorize fixture lowers to twenty-one top-level instructions", () => {
    const cir = authorize();
    expect(cir.instructions).toHaveLength(21);
    expect(cir.instructions.map((i) => i.op)).toContain("FILTER");
  });
  test("CIR JSON round-trips cleanly", () => {
    const cir = authorize();
    expect(JSON.parse(JSON.stringify(cir))).toEqual(cir);
  });
  test("cross-morphism apply lowers to CALL_MORPHISM", () => {
    const cir = run({
      op: "apply",
      fn: { op: "ref", morphismId: "morphism://example/m/1.0" },
      arg: { op: "var", name: "$input" },
    });
    expect(cir.instructions.at(-1)).toMatchObject({ op: "CALL_MORPHISM", operands: [0, 0] });
    expect(cir.morphismRefs).toEqual(["morphism://example/m/1.0"]);
  });
  test("module apply lowers to CALL_MODULE", () => {
    const cir = run({
      op: "apply",
      fn: { op: "ref", uri: "module://example/mod.ts" },
      arg: { op: "var", name: "$input" },
    });
    expect(cir.instructions.at(-1)).toMatchObject({ op: "CALL_MODULE", operands: [0, 0] });
    expect(cir.moduleRefs).toEqual(["module://example/mod.ts"]);
  });
  test("record construction emits MAKE_RECORD", () => {
    const cir = run({
      op: "record",
      fields: { a: { op: "const", value: 1 }, b: { op: "const", value: 2 } },
    });
    expect(cir.instructions.at(-1)).toMatchObject({ op: "MAKE_RECORD" });
    expect(cir.constantPool).toContain("a");
    expect(cir.constantPool).toContain("b");
  });
  test("iter over an array lowers to MAP", () => {
    const cir = run({
      op: "call",
      fn: "map",
      args: [
        { op: "const", value: [1, 2, 3] },
        { op: "lambda", param: "x", body: { op: "var", name: "x" } },
      ],
    });
    expect(cir.instructions.map((i) => i.op)).toContain("MAP");
  });
  test("ten real morphisms lower without error", () => {
    const doc = model();
    for (const name of realNames)
      expect(() => run(fold(tag(doc.morphisms[name].impl.ast)))).not.toThrow();
  });
});
