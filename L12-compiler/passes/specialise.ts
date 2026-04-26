import { Opcode } from "../ir/opcodes.ts";
import type { Cir, CirInstruction } from "../ir/cir.ts";
import type { JsonSchema } from "../../L01-foundation/types.ts";
import {
  listSpecialisationRules,
  type SpecialiseContext,
  type TypeInfo,
} from "../../L02-metamodels/specialisation-rule.ts";
import "../specialisations/index.ts";

export interface SpecialiseOptions {
  inputSchema?: JsonSchema;
  outputSchema?: JsonSchema;
}
type Instr = CirInstruction & Record<string, unknown>;
type State = { constantPool: unknown[]; seen: Map<string, number>; types: Map<number, TypeInfo> };
const supported = new Set(Object.keys(Opcode).filter((key) => Number.isNaN(Number(key))));
const stable = (v: unknown): string =>
  v && typeof v === "object"
    ? Array.isArray(v)
      ? `[${v.map(stable).join(",")}]`
      : `{${Object.keys(v as Record<string, unknown>)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
          .join(",")}}`
    : JSON.stringify(v);
const fieldInfo = (info?: TypeInfo, name?: string) =>
  info?.fields?.find(([key]) => key === name)?.[1];
const kindOf = (value: unknown): TypeInfo =>
  Array.isArray(value)
    ? { kind: "Array", item: value.length ? kindOf(value[0]) : { kind: "Unknown" } }
    : Number.isInteger(value)
      ? { kind: "Int" }
      : typeof value === "string"
        ? { kind: "Str" }
        : typeof value === "boolean"
          ? { kind: "Bool" }
          : value && typeof value === "object"
            ? {
                kind: "Record",
                fields: Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
                  key,
                  kindOf(entry),
                ]),
              }
            : { kind: "Unknown" };
const fromSchema = (schema?: JsonSchema): TypeInfo =>
  !schema
    ? { kind: "Unknown" }
    : schema.enum
      ? { kind: "Enum", enumValues: schema.enum, schema }
      : schema.type === "integer"
        ? { kind: "Int", schema }
        : schema.type === "string"
          ? { kind: "Str", schema }
          : schema.type === "boolean"
            ? { kind: "Bool", schema }
            : schema.type === "array"
              ? { kind: "Array", item: fromSchema(schema.items as JsonSchema | undefined), schema }
              : schema.type === "object"
                ? {
                    kind: "Record",
                    fields: Object.entries(schema.properties ?? {}).map(([key, entry]) => [
                      key,
                      fromSchema(entry as JsonSchema),
                    ]),
                    schema,
                  }
                : { kind: "Unknown", schema };

function learn(ins: Instr, s: State, input?: JsonSchema): void {
  const src = (index: number) => s.types.get(ins.operands[index] as number);
  const set = (type?: TypeInfo) => ins.dst !== undefined && type && s.types.set(ins.dst, type);
  if (ins.op === "LOAD_CONST") return void set(kindOf(s.constantPool[ins.operands[0] as number]));
  if (ins.op === "LOAD_INPUT")
    return void set(!ins.operands.length ? fromSchema(input) : { kind: "Unknown" });
  if (ins.op === "MOVE") return void set(src(0));
  if (ins.op === "GET_FIELD")
    return void set(
      fieldInfo(src(0), s.constantPool[ins.operands[1] as number] as string | undefined),
    );
  if (ins.op === "GET_FIELD_KNOWN")
    return void set(src(0)?.fields?.[ins.operands[1] as number]?.[1]);
  if (ins.op === "MAKE_RECORD") {
    const keys = ((ins.operands[0] as number[]) ?? [])
      .map((entry) => s.constantPool[entry])
      .filter((entry): entry is string => typeof entry === "string");
    return void set({
      kind: "Record",
      fields: keys.map((key, index) => [
        key,
        s.types.get(ins.operands[index + 1] as number) ?? { kind: "Unknown" },
      ]),
    });
  }
  if (ins.op === "MAKE_ARRAY")
    return void set({
      kind: "Array",
      item: s.types.get(ins.operands[0] as number) ?? { kind: "Unknown" },
    });
  if (ins.op === "KEYS") return void set({ kind: "Array", item: { kind: "Str" } });
  if (ins.op === "VALUES") return void set({ kind: "Array", item: { kind: "Unknown" } });
  if (ins.op === "CONCAT") return void set(src(0)?.kind === "Array" ? src(0) : src(1));
  if (
    ins.op === "FILTER" ||
    ins.op === "FILTER_RECORD_KNOWN_FIELD" ||
    ins.op === "MAP" ||
    ins.op === "MAP_INT_INT"
  )
    return void set(src(0)?.kind === "Array" ? src(0) : undefined);
  if (["LEN", "LEN_ARR", "ADD", "ADD_INT", "SUB", "SUB_INT", "MUL", "MUL_INT"].includes(ins.op))
    return void set({ kind: "Int" });
  if (
    ["EQ", "EQ_INT", "EQ_STR", "LT", "LT_INT", "GT", "GTE", "LTE", "AND", "OR", "NOT"].includes(
      ins.op,
    )
  )
    set({ kind: "Bool" });
}

export function specialise(ast: unknown): never;
export function specialise(cir: Cir, options?: SpecialiseOptions): Cir;
export function specialise(ast: unknown, options?: SpecialiseOptions): Cir {
  if (!ast || typeof ast !== "object" || !("instructions" in ast) || !("constantPool" in ast))
    throw new Error("NOT_IMPLEMENTED: specialise");
  const input = ast as Cir,
    state: State = {
      constantPool: [...input.constantPool],
      seen: new Map(input.constantPool.map((value, index) => [stable(value), index])),
      types: new Map(),
    },
    out: Instr[] = [];
  const intern = (value: unknown) => {
    const key = stable(value),
      hit = state.seen.get(key);
    if (hit !== undefined) return hit;
    state.constantPool.push(value);
    state.seen.set(key, state.constantPool.length - 1);
    return state.constantPool.length - 1;
  };
  for (let i = 0; i < input.instructions.length; i++) {
    const instruction = input.instructions[i] as Instr;
    const ctx: SpecialiseContext = {
      at: i,
      cir: { ...input, constantPool: state.constantPool, instructions: input.instructions },
      instruction,
      constant: (index) => state.constantPool[index],
      intern,
      regType: (reg) => state.types.get(reg),
      isKind: (reg, kind) => {
        const info = state.types.get(reg);
        return info?.kind === kind || (kind === "Str" && info?.kind === "Enum");
      },
      fieldOffset: (reg, field) =>
        state.types.get(reg)?.fields?.findIndex(([key]) => key === field) ?? -1,
      rewrite: (patch = {}, extras = {}) => ({
        ...instruction,
        ...patch,
        op:
          supported.has((patch.op as string | undefined) ?? instruction.op) &&
          supported.has((instruction.requestedOp as string | undefined) ?? instruction.op)
            ? ((patch.op as string | undefined) ?? instruction.op)
            : supported.has((patch.op as string | undefined) ?? instruction.op)
              ? ((patch.op as string | undefined) ?? instruction.op)
              : instruction.op,
        ...extras,
        specialisedBy: instruction.specialisedBy ?? undefined,
      }),
    };
    let applied: { instructions: Instr[]; skip?: number } | null = null;
    for (const rule of listSpecialisationRules()) {
      if (rule.model.matchOp !== instruction.op) continue;
      const rewrite = rule.apply({
        ...ctx,
        rewrite: (patch = {}, extras = {}) => ({
          ...instruction,
          ...patch,
          op: supported.has(rule.model.produceOp) ? rule.model.produceOp : instruction.op,
          requestedOp: rule.model.produceOp,
          ...extras,
          specialisedBy: rule.model.name,
        }),
      });
      if (rewrite) {
        applied = rewrite as { instructions: Instr[]; skip?: number };
        break;
      }
    }
    const next = applied?.instructions ?? [instruction];
    out.push(...next);
    for (const entry of next) learn(entry, state, options?.inputSchema);
    i += applied?.skip ?? 0;
  }
  const closures = input.closures.map((closure) => ({
    ...closure,
    body: specialise(closure.body, options),
  }));
  return { ...input, instructions: out, constantPool: state.constantPool, closures };
}
