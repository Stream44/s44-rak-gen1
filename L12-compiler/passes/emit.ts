import { JsonEncoder } from "../../L01-foundation/encoder.ts";
import type { Bundle } from "../ir/bytecode.ts";
import type { Cir, CirInstruction } from "../ir/cir.ts";
import { Opcode } from "../ir/opcodes.ts";

const encoder = new JsonEncoder();
const op = Opcode as Record<string, number | string>;
const branch = new Set(["JUMP", "JUMP_IF_TRUE", "JUMP_IF_FALSE"]);
const flat = (values: CirInstruction["operands"]): number[] =>
  values.flatMap((value) => (Array.isArray(value) ? value.map(Number) : [Number(value ?? 0)]));

const encode = (inst: CirInstruction): number[] => {
  const { dst, operands } = inst;
  switch (inst.op) {
    case "MAKE_ARRAY": {
      const args = flat(operands);
      return [Number(op[inst.op]), dst ?? 0, args.length, ...args];
    }
    case "MAKE_RECORD": {
      const [keys = [], ...vals] = operands as [number[]?, ...number[]];
      return [
        Number(op[inst.op]),
        dst ?? 0,
        (keys as number[]).length,
        ...flat([keys as number[]]),
        ...flat(vals),
      ];
    }
    case "MAKE_CLOSURE": {
      const [closureIdx = 0, ...captures] = flat(operands);
      return [Number(op[inst.op]), dst ?? 0, closureIdx, captures.length, captures[0] ?? 0];
    }
    case "CALL_MODULE":
    case "CALL_MORPHISM":
    case "MATCH_KNOWN":
      return [Number(op[inst.op]), dst ?? 0, ...flat(operands)];
    default:
      return [Number(op[inst.op]), ...(dst === undefined ? [] : [dst]), ...flat(operands)];
  }
};

export function emit(cir: unknown): never;
export function emit(cir: Cir, compilerVersion: number): Bundle;
export function emit(cir: unknown, compilerVersion?: number): Bundle {
  if (
    !cir ||
    typeof cir !== "object" ||
    !Array.isArray((cir as Cir).instructions) ||
    typeof compilerVersion !== "number"
  ) {
    throw new Error("NOT_IMPLEMENTED: emit");
  }
  const input = cir as Cir,
    codeOffsetByInstruction = new Map<number, number>(),
    sourceMap: Record<number, number> = {},
    raw: number[] = [];
  const patches: Array<{ at: number; target: number }> = [];
  for (const [idx, inst] of input.instructions.entries()) {
    codeOffsetByInstruction.set(idx, raw.length);
    if (inst.sourceNodeId !== undefined) sourceMap[raw.length] = inst.sourceNodeId;
    const words = encode(inst);
    if (branch.has(inst.op))
      patches.push({
        at: raw.length + words.length - 1,
        target: Number(inst.operands.at(-1) ?? 0),
      });
    if (branch.has(inst.op)) words[words.length - 1] = 0;
    raw.push(...words);
  }
  const code = new Uint32Array(raw);
  for (const { at, target } of patches)
    code[at] =
      target < 0
        ? code.length
        : (codeOffsetByInstruction.get(target) ??
          (target === input.instructions.length ? code.length : target));
  const bundle: Bundle = {
    cid: "",
    compilerVersion,
    code,
    constants: input.constantPool,
    registerCount: input.registerCount,
    entryPoint: 0,
    moduleTable: input.moduleRefs,
    calleeTable: input.morphismRefs,
    closureTable: input.closures.map(({ body, captures }) => {
      const nested = emit(body, compilerVersion);
      return {
        bodyOffset: nested.entryPoint,
        registerCount: nested.registerCount,
        captureCount: captures.length,
        bundle: nested,
      };
    }),
    sourceMap,
  };
  bundle.cid = encoder.encodeAndHashWithExclusion(
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
  ).cid;
  return bundle;
}
