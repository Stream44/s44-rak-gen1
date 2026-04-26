import { registerBootstrapType } from "../L03-tower/bootstrap.ts";
import { MetaLevel, type TypeDef } from "../L01-foundation/types.ts";

export const PLUGGABLE_INTERFACE_M2: TypeDef = {
  id: "type://github.com/Stream44/s44-rak-gen1@1.0/pluggable-interface/1.0",
  level: MetaLevel.Metamodel,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
  name: "PluggableInterface",
  version: "1.0",
  schema: {
    type: "object",
    required: ["id", "level", "conformsTo", "schema"],
    properties: {
      id: { type: "string", minLength: 1 },
      level: { type: "integer", const: MetaLevel.Model },
      conformsTo: {
        type: "string",
        const: "type://github.com/Stream44/s44-rak-gen1@1.0/pluggable-interface/1.0",
      },
      schema: {
        type: "object",
        required: ["methods", "implModuleRef", "bootstrapHookName"],
        properties: {
          methods: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "inputShape", "outputShape"],
              properties: {
                name: { type: "string" },
                inputShape: { type: "object" },
                outputShape: { type: "object" },
              },
            },
          },
          implModuleRef: { type: "string", pattern: "^module://" },
          bootstrapHookName: { type: "string", minLength: 1 },
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

export const M2_PLUGGABLE_INTERFACE = PLUGGABLE_INTERFACE_M2;

export function registerPluggableInterfaceMetamodel(registry: {
  defineType(typeDef: TypeDef): unknown;
}): void {
  registry.defineType(PLUGGABLE_INTERFACE_M2);
}

registerBootstrapType(PLUGGABLE_INTERFACE_M2);
