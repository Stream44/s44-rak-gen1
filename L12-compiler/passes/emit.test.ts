import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { JsonEncoder } from "../../L01-foundation/encoder.ts";
import { parseKernelModel } from "../../L11-projection/metamodel.ts";
import { deserializeBundle, serializeBundle } from "../cache/serialize.ts";
import { Opcode } from "../ir/opcodes.ts";
import { allocate } from "./allocate.ts";
import { emit } from "./emit.ts";
import { fold } from "./fold.ts";
import { inline } from "./inline.ts";
import { lower } from "./lower.ts";
import { normalize } from "./normalize.ts";

type Expr = Record<string, any>;
const encoder = new JsonEncoder();
const ops = new Set([
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
]);
const builtins = new Set([
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
  "eval",
]);
const norm = (expr: Expr) => normalize(expr as never, { validOps: ops, validBuiltins: builtins });
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
        Object.keys(out.fields ?? {}).map((k, i) => [k, out.children[i]]),
      );
    if (out.op === "array") out.elements = out.children;
    if (out.op === "lambda") [out.body] = out.children;
    return out;
  };
  return walk(expr);
};
const run = (expr: Expr, v = 1) => emit(lower(allocate(fold(norm(expr)))), v);
const raw = (expr: Expr, v = 1) => emit(lower(allocate(tag(expr))), v);
const model = () =>
  parseKernelModel(
    readFileSync(resolve(import.meta.dir, "..", "..", "L00-model", "kernel.model.yaml"), "utf-8"),
  ) as any;
const authorize = (v = 1) => {
  const doc = model(),
    morphisms = Object.fromEntries(
      Object.entries(doc.morphisms).map(([id, m]: [string, any]) => [
        id,
        m?.impl?.kind === "algebra"
          ? { ...m, impl: { ...m.impl, ast: fold(norm(m.impl.ast)) } }
          : m,
      ]),
    );
  return emit(lower(allocate(inline({ ...doc, morphisms }).morphisms.authorize.impl.ast)), v);
};

describe("emit", () => {
  test("single LOAD_CONST emits three words", () =>
    expect(run({ op: "const", value: 42 }).code.length).toBe(3));
  test("same CIR emits the same CID twice", () =>
    expect(
      run({
        op: "call",
        fn: "add",
        args: [
          { op: "const", value: 1 },
          { op: "const", value: 2 },
        ],
      }).cid,
    ).toBe(
      run({
        op: "call",
        fn: "add",
        args: [
          { op: "const", value: 1 },
          { op: "const", value: 2 },
        ],
      }).cid,
    ));
  test("different CIR changes CID", () =>
    expect(run({ op: "const", value: 1 }).cid).not.toBe(run({ op: "const", value: 2 }).cid));
  test("authorize full pipeline emits a stable bundle CID", () => {
    const a = authorize(),
      b = authorize();
    expect(a.cid).toBe(b.cid);
    expect(a.code.length).toBeGreaterThan(0);
  });
  test("sourceMap keys code offsets to node ids", () => {
    const b = emit(
      {
        instructions: [
          { op: "LOAD_CONST", dst: 0, operands: [0], sourceNodeId: 10 },
          { op: "MOVE", dst: 1, operands: [0], sourceNodeId: 11 },
        ],
        constantPool: [42],
        registerCount: 2,
        moduleRefs: [],
        morphismRefs: [],
        closures: [],
      },
      1,
    );
    expect(b.sourceMap).toEqual({ 0: 10, 3: 11 });
  });
  test("branch patching resolves final absolute offsets", () => {
    const b = emit(
      {
        instructions: [
          { op: "JUMP_IF_FALSE", operands: [1, 3] },
          { op: "LOAD_CONST", dst: 0, operands: [0] },
          { op: "JUMP", operands: [4] },
          { op: "LOAD_CONST", dst: 0, operands: [1] },
        ],
        constantPool: [1, 2],
        registerCount: 2,
        moduleRefs: [],
        morphismRefs: [],
        closures: [],
      },
      1,
    );
    expect(b.code).toEqual(
      new Uint32Array([
        Opcode.JUMP_IF_FALSE,
        1,
        8,
        Opcode.LOAD_CONST,
        0,
        0,
        Opcode.JUMP,
        11,
        Opcode.LOAD_CONST,
        0,
        1,
      ]),
    );
  });
  test("nested closures emit separate closure bundles", () => {
    const cir = lower(
        allocate(
          tag({
            op: "lambda",
            param: "x",
            body: {
              op: "lambda",
              param: "y",
              body: {
                op: "call",
                fn: "add",
                args: [
                  { op: "var", name: "x" },
                  { op: "var", name: "y" },
                ],
              },
            },
          }),
        ),
      ),
      out = emit(cir, 1);
    expect(out.closureTable.length).toBe(1);
    expect(out.closureTable[0]!.bundle!.closureTable.length).toBe(1);
  });
  test("module refs populate moduleTable and code index", () => {
    const b = emit(
      {
        instructions: [{ op: "CALL_MODULE", dst: 1, operands: [0, 0] }],
        constantPool: [],
        registerCount: 2,
        moduleRefs: ["module://example/mod.ts"],
        morphismRefs: [],
        closures: [],
      },
      1,
    );
    expect(b.moduleTable).toEqual(["module://example/mod.ts"]);
    expect(b.code).toEqual(new Uint32Array([Opcode.CALL_MODULE, 1, 0, 0]));
  });
  test("callee refs populate calleeTable and code index", () => {
    const b = emit(
      {
        instructions: [{ op: "CALL_MORPHISM", dst: 1, operands: [0, 0] }],
        constantPool: [],
        registerCount: 2,
        moduleRefs: [],
        morphismRefs: ["morphism://example/m/1.0"],
        closures: [],
      },
      1,
    );
    expect(b.calleeTable).toEqual(["morphism://example/m/1.0"]);
    expect(b.code).toEqual(new Uint32Array([Opcode.CALL_MORPHISM, 1, 0, 0]));
  });
  test("new specialised opcodes encode with their enum values", () => {
    const b = emit(
      {
        instructions: [
          { op: "SUB_INT", dst: 2, operands: [0, 1] },
          { op: "MAP_INT_INT", dst: 3, operands: [4, 5] },
          { op: "FILTER_RECORD_KNOWN_FIELD", dst: 6, operands: [7, 8] },
        ],
        constantPool: [],
        registerCount: 9,
        moduleRefs: [],
        morphismRefs: [],
        closures: [],
      },
      1,
    );
    expect(b.code).toEqual(
      new Uint32Array([
        Opcode.SUB_INT,
        2,
        0,
        1,
        Opcode.MAP_INT_INT,
        3,
        4,
        5,
        Opcode.FILTER_RECORD_KNOWN_FIELD,
        6,
        7,
        8,
      ]),
    );
  });
  test("CID excludes the cid field itself", () => {
    const b = run({ op: "const", value: 9 }, 7);
    expect(b.cid).toBe(
      encoder.encodeAndHashWithExclusion(
        {
          cid: "cid:sha256:fake",
          code: b.code,
          constants: b.constants,
          registerCount: b.registerCount,
          moduleTable: b.moduleTable,
          closureTable: b.closureTable,
          compilerVersion: b.compilerVersion,
        },
        ["cid"],
      ).cid,
    );
  });
  test("registerCount is preserved from CIR", () =>
    expect(
      emit(
        {
          instructions: [{ op: "MOVE", dst: 3, operands: [1] }],
          constantPool: [],
          registerCount: 4,
          moduleRefs: [],
          morphismRefs: [],
          closures: [],
        },
        1,
      ).registerCount,
    ).toBe(4));
  test("large bundles serialize and deserialize losslessly", () => {
    const expr = Array.from({ length: 200 }).reduceRight(
      (body, _, i) => ({ op: "let", name: `$t${i}`, value: { op: "const", value: i }, body }),
      { op: "const", value: 200 } as Expr,
    );
    expect(deserializeBundle(serializeBundle(run(expr)))).toEqual(run(expr));
  });
});
