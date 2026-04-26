import { MetaLevel, type TypeDef } from "../L01-foundation/types.ts";

export const MORPHISM_DOCUMENT_ID =
  "type://github.com/Stream44/s44-rak-gen1@1.0/adk/MorphismDocument/1.0" as const;

export const MORPHISM_DOCUMENT_M2: TypeDef = {
  id: MORPHISM_DOCUMENT_ID,
  level: MetaLevel.Metamodel,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
  name: "MorphismDocument",
  version: "1.0",
  description: "Shared super-metamodel for morphism-AST-shaped M1 documents.",
  schema: {
    type: "object",
    required: ["id", "level", "conformsTo", "schema", "discriminator", "morphisms"],
    properties: {
      id: { type: "string", minLength: 1 },
      level: { type: "integer", const: MetaLevel.Model },
      conformsTo: { type: "string", const: MORPHISM_DOCUMENT_ID },
      schema: { type: "object" },
      discriminator: { type: "string", minLength: 1 },
      morphisms: {
        type: "object",
        additionalProperties: {
          type: "object",
          required: ["id", "input", "output", "impl"],
          properties: {
            id: { type: "string", minLength: 1 },
            input: { type: "string", minLength: 1 },
            output: { type: "string", minLength: 1 },
            category: { type: "string", enum: ["pure", "stateful"] },
            impl: {
              oneOf: [
                {
                  type: "object",
                  required: ["kind", "ast"],
                  properties: {
                    kind: { type: "string", const: "algebra" },
                    ast: { type: "object" },
                  },
                },
                {
                  type: "object",
                  required: ["kind", "uri", "export"],
                  properties: {
                    kind: { type: "string", const: "module" },
                    uri: { type: "string", pattern: "^module://" },
                    export: { type: "string", minLength: 1 },
                  },
                },
              ],
            },
          },
        },
      },
      name: { type: "string" },
      version: { type: "string" },
      description: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      refs: { type: "array" },
    },
  },
};
