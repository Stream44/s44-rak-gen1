import { describe, expect, test } from "bun:test";
import { Opcode } from "./ir/opcodes.ts";
import { allocate } from "./passes/allocate";
import { emit } from "./passes/emit";
import { fold } from "./passes/fold";
import { inline } from "./passes/inline";
import { lower } from "./passes/lower";
import { normalize } from "./passes/normalize";
import { specialise } from "./passes/specialise";

describe("27C compiler pass stubs", () => {
  test("normalize is no longer a stub", () => {
    expect(
      normalize({ op: "const", value: 1 } as never, {
        validOps: new Set(),
        validBuiltins: new Set(),
      }).nodeId,
    ).toBe(0);
  });

  test("fold is no longer a stub", () => {
    expect(fold({ op: "const", value: 1, nodeId: 0, children: [] } as never)).toEqual({
      op: "const",
      value: 1,
      nodeId: 0,
      children: [],
    });
  });

  test("inline is no longer a stub", () => {
    const out = inline({
      morphisms: {
        main: {
          id: "main",
          impl: {
            kind: "algebra",
            ast: {
              op: "CALL_MORPHISM",
              calleeId: "tiny",
              arg: { op: "const", value: 1, nodeId: 1, children: [] },
              nodeId: 0,
              children: [{ op: "const", value: 1, nodeId: 1, children: [] }],
            },
          },
        },
        tiny: {
          id: "tiny",
          impl: {
            kind: "algebra",
            ast: {
              op: "call",
              fn: "add",
              args: [
                { op: "var", name: "$input", nodeId: 5, children: [] },
                { op: "const", value: 1, nodeId: 6, children: [] },
              ],
              nodeId: 4,
              children: [],
            },
          },
        },
      },
    });
    expect((out.morphisms.main.impl?.ast as { op: string }).op).toBe("let");
  });

  test("allocate is no longer a stub", () => {
    expect(
      allocate({ op: "const", value: 1, nodeId: 0, children: [] } as never).registerCount,
    ).toBe(1);
  });

  test("lower is no longer a stub", () => {
    expect(
      lower({
        root: { op: "const", value: 1, nodeId: 0, reg: 0, children: [] },
        registerCount: 1,
      } as never).instructions[0]?.op,
    ).toBe("LOAD_CONST");
  });

  test("emit is no longer a stub", () => {
    expect(
      emit(
        {
          instructions: [{ op: "RET", operands: [0] }],
          constantPool: [],
          registerCount: 1,
          moduleRefs: [],
          morphismRefs: [],
          closures: [],
        } as never,
        1,
      ).code,
    ).toEqual(new Uint32Array([Opcode.RET, 0]));
  });

  test("specialise is no longer a stub", () => {
    expect(
      specialise({
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
      } as never).instructions.at(-1),
    ).toMatchObject({ op: "ADD_INT" });
  });
});
