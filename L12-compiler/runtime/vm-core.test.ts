import { describe, expect, test } from "bun:test";
import { JsonEncoder } from "../../L01-foundation/encoder.ts";
import type { Bundle } from "../ir/bytecode.ts";
import { Opcode } from "../ir/opcodes.ts";
import { allocate } from "../passes/allocate.ts";
import { emit } from "../passes/emit.ts";
import { fold } from "../passes/fold.ts";
import { lower } from "../passes/lower.ts";
import { normalize } from "../passes/normalize.ts";
import { KernelVmError, OpcodeKernelVm } from "./kernel-vm.ts";

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
  "cond",
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
]);
const withCid = (bundle: Bundle): Bundle => ({
  ...bundle,
  cid: encoder.encodeAndHashWithExclusion(
    {
      cid: bundle.cid,
      code: bundle.code,
      constants: bundle.constants,
      registerCount: bundle.registerCount,
      moduleTable: bundle.moduleTable,
      closureTable: bundle.closureTable,
      compilerVersion: bundle.compilerVersion,
    },
    ["cid"],
  ).cid,
});
const mk = (code: number[], constants: unknown[] = [], registerCount = 4): Bundle =>
  withCid({
    cid: "",
    compilerVersion: 1,
    code: new Uint32Array(code),
    constants,
    registerCount,
    entryPoint: 0,
    moduleTable: [],
    calleeTable: [],
    closureTable: [],
    sourceMap: {},
  });
const run = (bundle: Bundle, input?: unknown) =>
  new OpcodeKernelVm({
    registry: new Map([[bundle.cid, bundle]]) as unknown as { get(cid: string): Bundle | null },
  }).run(bundle.cid, input);
const pipe = (expr: Expr) =>
  emit(
    lower(allocate(fold(normalize(expr as never, { validOps: ops, validBuiltins: builtins })))),
    1,
  );

describe("OpcodeKernelVm core opcodes", () => {
  const cases: Array<[string, Bundle, unknown?, unknown?]> = [
    [
      "LOAD_CONST loads a constant",
      mk([Opcode.LOAD_CONST, 0, 0, Opcode.RET, 0], [42]),
      undefined,
      42,
    ],
    [
      "MOVE copies a register",
      mk([Opcode.LOAD_CONST, 0, 0, Opcode.MOVE, 1, 0, Opcode.RET, 1], [9]),
      undefined,
      9,
    ],
    ["LOAD_INPUT loads the VM input", mk([Opcode.LOAD_INPUT, 0, Opcode.RET, 0]), "in", "in"],
    [
      "ADD sums two numbers",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.ADD, 2, 0, 1, Opcode.RET, 2],
        [1, 2],
      ),
      undefined,
      3,
    ],
    [
      "SUB subtracts two numbers",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.SUB, 2, 0, 1, Opcode.RET, 2],
        [7, 2],
      ),
      undefined,
      5,
    ],
    [
      "SUB_INT subtracts integers",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.SUB_INT, 2, 0, 1, Opcode.RET, 2],
        [7, 2],
      ),
      undefined,
      5,
    ],
    [
      "MUL multiplies two numbers",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.MUL, 2, 0, 1, Opcode.RET, 2],
        [3, 4],
      ),
      undefined,
      12,
    ],
    [
      "MUL_INT multiplies integers",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.MUL_INT, 2, 0, 1, Opcode.RET, 2],
        [3, 4],
      ),
      undefined,
      12,
    ],
    [
      "DIV divides two numbers",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.DIV, 2, 0, 1, Opcode.RET, 2],
        [8, 2],
      ),
      undefined,
      4,
    ],
    [
      "MOD computes remainder",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.MOD, 2, 0, 1, Opcode.RET, 2],
        [8, 3],
      ),
      undefined,
      2,
    ],
    [
      "NEG negates a number",
      mk([Opcode.LOAD_CONST, 0, 0, Opcode.NEG, 1, 0, Opcode.RET, 1], [8]),
      undefined,
      -8,
    ],
    [
      "ABS returns absolute value",
      mk([Opcode.LOAD_CONST, 0, 0, Opcode.ABS, 1, 0, Opcode.RET, 1], [-8]),
      undefined,
      8,
    ],
    [
      "ADD_INT sums integers",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.ADD_INT, 2, 0, 1, Opcode.RET, 2],
        [5, 6],
      ),
      undefined,
      11,
    ],
    [
      "EQ compares strict equality",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.EQ, 2, 0, 1, Opcode.RET, 2],
        [4, 4],
      ),
      undefined,
      true,
    ],
    [
      "NEQ compares inequality",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.NEQ, 2, 0, 1, Opcode.RET, 2],
        [4, 5],
      ),
      undefined,
      true,
    ],
    [
      "LT compares less-than",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.LT, 2, 0, 1, Opcode.RET, 2],
        [3, 5],
      ),
      undefined,
      true,
    ],
    [
      "LT_INT compares integer less-than",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.LT_INT, 2, 0, 1, Opcode.RET, 2],
        [3, 5],
      ),
      undefined,
      true,
    ],
    [
      "LTE compares less-than-or-equal",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.LTE, 2, 0, 1, Opcode.RET, 2],
        [5, 5],
      ),
      undefined,
      true,
    ],
    [
      "GT compares greater-than",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.GT, 2, 0, 1, Opcode.RET, 2],
        [7, 5],
      ),
      undefined,
      true,
    ],
    [
      "GTE compares greater-than-or-equal",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.GTE, 2, 0, 1, Opcode.RET, 2],
        [5, 5],
      ),
      undefined,
      true,
    ],
    [
      "AND combines booleans",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.AND, 2, 0, 1, Opcode.RET, 2],
        [true, false],
      ),
      undefined,
      false,
    ],
    [
      "OR combines booleans",
      mk(
        [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.OR, 2, 0, 1, Opcode.RET, 2],
        [true, false],
      ),
      undefined,
      true,
    ],
    [
      "NOT negates a boolean",
      mk([Opcode.LOAD_CONST, 0, 0, Opcode.NOT, 1, 0, Opcode.RET, 1], [false]),
      undefined,
      true,
    ],
    [
      "JUMP skips over intermediate instructions",
      mk(
        [
          Opcode.JUMP,
          8,
          Opcode.LOAD_CONST,
          0,
          0,
          Opcode.LOAD_CONST,
          0,
          1,
          Opcode.LOAD_CONST,
          1,
          2,
          Opcode.RET,
          1,
        ],
        [1, 2, 3],
      ),
      undefined,
      3,
    ],
    [
      "JUMP_IF_TRUE branches on truthy input",
      mk(
        [
          Opcode.LOAD_CONST,
          0,
          0,
          Opcode.JUMP_IF_TRUE,
          0,
          11,
          Opcode.LOAD_CONST,
          1,
          1,
          Opcode.RET,
          1,
          Opcode.LOAD_CONST,
          1,
          2,
          Opcode.RET,
          1,
        ],
        [true, "no", "yes"],
      ),
      undefined,
      "yes",
    ],
    [
      "JUMP_IF_FALSE branches on falsey input",
      mk(
        [
          Opcode.LOAD_CONST,
          0,
          0,
          Opcode.JUMP_IF_FALSE,
          0,
          11,
          Opcode.LOAD_CONST,
          1,
          1,
          Opcode.RET,
          1,
          Opcode.LOAD_CONST,
          1,
          2,
          Opcode.RET,
          1,
        ],
        [false, "no", "yes"],
      ),
      undefined,
      "yes",
    ],
    [
      "RET returns the selected register",
      mk([Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.RET, 1], ["ignored", "done"]),
      undefined,
      "done",
    ],
  ];

  for (const [name, bundle, input, expected] of cases)
    test(name, async () => expect(await run(bundle, input)).toEqual(expected));

  test("full pipeline add(const 1, const 2) returns 3", async () =>
    expect(
      await run(
        pipe({
          op: "call",
          fn: "add",
          args: [
            { op: "const", value: 1 },
            { op: "const", value: 2 },
          ],
        }),
      ),
    ).toBe(3));
  test("RET without a register value throws a clear error", async () =>
    expect(run(mk([Opcode.RET, 0], [], 1))).rejects.toThrow("RET requires a value in r0"));
  test("JUMP out of bounds throws KernelVmError", async () =>
    expect(run(mk([Opcode.JUMP, 99], [], 1))).rejects.toThrow(KernelVmError));
  test("DIV by zero surfaces the source-evaluator runtime error", async () =>
    expect(
      run(
        mk(
          [Opcode.LOAD_CONST, 0, 0, Opcode.LOAD_CONST, 1, 1, Opcode.DIV, 2, 0, 1, Opcode.RET, 2],
          [9, 0],
        ),
      ),
    ).rejects.toThrow("Division by zero"));
});
