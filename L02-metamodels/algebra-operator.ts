import { MetaLevel, type TypeDef } from "../L01-foundation/types.ts";

export interface AlgebraOperatorM1 extends TypeDef {
  name: string;
  arity: number;
  inputKinds: string[];
  outputKind: string;
  laws?: string[];
  description?: string;
}

export const ALGEBRA_OPERATOR_METAMODEL: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/AlgebraOperator/1.0",
  level: MetaLevel.Metamodel,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
  name: "AlgebraOperator",
  version: "1.0",
  schema: {
    type: "object",
    required: ["id", "name", "arity", "inputKinds", "outputKind"],
    properties: {
      id: { type: "string", minLength: 1 },
      name: { type: "string", minLength: 1 },
      arity: { type: "number", minimum: 0 },
      inputKinds: { type: "array", items: { type: "string" } },
      outputKind: { type: "string" },
      laws: { type: "array", items: { type: "string" } },
      description: { type: "string" },
    },
  },
};
