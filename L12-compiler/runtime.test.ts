import { describe, expect, test } from "bun:test";
import { JsonEncoder } from "../L01-foundation/encoder.ts";
import type { Bundle } from "./ir/bytecode.ts";
import { Opcode } from "./ir/opcodes.ts";
import { OpcodeKernelVm } from "./runtime/kernel-vm.ts";

const encoder = new JsonEncoder();
const bundle = (code: number[], constants: unknown[] = []): Bundle => {
  const out: Bundle = {
    cid: "",
    compilerVersion: 1,
    code: new Uint32Array(code),
    constants,
    registerCount: 1,
    entryPoint: 0,
    moduleTable: [],
    calleeTable: [],
    closureTable: [],
    sourceMap: {},
  };
  out.cid = encoder.encodeAndHashWithExclusion(
    {
      cid: out.cid,
      code: out.code,
      constants: out.constants,
      registerCount: out.registerCount,
      moduleTable: out.moduleTable,
      closureTable: out.closureTable,
      compilerVersion: out.compilerVersion,
    },
    ["cid"],
  ).cid;
  return out;
};

describe("27C compiler runtime", () => {
  test("OpcodeKernelVm constructor works", () => {
    const vm = new OpcodeKernelVm();
    expect(vm).toBeInstanceOf(OpcodeKernelVm);
  });

  test("OpcodeKernelVm.run executes a minimal bundle", async () => {
    const compiled = bundle([Opcode.LOAD_CONST, 0, 0, Opcode.RET, 0], [42]);
    const out = await new OpcodeKernelVm({
      registry: new Map([[compiled.cid, compiled]]) as unknown as {
        get(cid: string): Bundle | null;
      },
    }).run(compiled.cid);
    expect(out).toBe(42);
  });

  test("opcode enum exposes at least 42 numeric entries", () => {
    expect(Object.values(Opcode).filter((value) => typeof value === "number")).toHaveLength(55);
  });
});
