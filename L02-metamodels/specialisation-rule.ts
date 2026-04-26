import type { Cir, CirInstruction } from "../L12-compiler/ir/cir.ts";
import type { JsonSchema, MetaLevel, TypeDef } from "../L01-foundation/types.ts";

export interface SpecialisationRuleM1 extends TypeDef {
  name: string;
  matchOp: string;
  produceOp: string;
  precondition: string;
}

export interface TypeInfo {
  kind: string;
  item?: TypeInfo;
  fields?: Array<[string, TypeInfo]>;
  enumValues?: unknown[];
  input?: TypeInfo;
  output?: TypeInfo;
  schema?: JsonSchema;
}
export interface SpecialiseResult {
  instructions: Array<CirInstruction & Record<string, unknown>>;
  skip?: number;
}
export interface SpecialiseContext {
  at: number;
  cir: Cir;
  instruction: CirInstruction & Record<string, unknown>;
  constant(index: number): unknown;
  intern(value: unknown): number;
  regType(reg: number): TypeInfo | undefined;
  isKind(reg: number, kind: string): boolean;
  fieldOffset(reg: number, field: string): number | null;
  rewrite(
    patch?: Partial<CirInstruction> & Record<string, unknown>,
    extras?: Record<string, unknown>,
  ): CirInstruction & Record<string, unknown>;
}

export interface RuntimeSpecialisationRule {
  model: SpecialisationRuleM1;
  apply(ctx: SpecialiseContext): SpecialiseResult | null;
}
type Globals = typeof globalThis & {
  __adkSpecialisationRules?: RuntimeSpecialisationRule[];
};
const rules = () => ((globalThis as Globals).__adkSpecialisationRules ??= []);

export const SPECIALISATION_RULE_METAMODEL: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/SpecialisationRule/1.0",
  level: 2 as MetaLevel,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
  name: "SpecialisationRule",
  version: "1.0",
  schema: {
    type: "object",
    required: ["id", "name", "matchOp", "produceOp", "precondition"],
    properties: {
      id: { type: "string" },
      name: { type: "string" },
      matchOp: { type: "string" },
      produceOp: { type: "string" },
      precondition: { type: "string" },
    },
  },
};

export function defineSpecialisationRule(
  model: SpecialisationRuleM1,
  apply: RuntimeSpecialisationRule["apply"],
): SpecialisationRuleM1 {
  if (!rules().some((entry) => entry.model.id === model.id)) rules().push({ model, apply });
  return model;
}

export function listSpecialisationRules(): RuntimeSpecialisationRule[] {
  return [...rules()];
}
