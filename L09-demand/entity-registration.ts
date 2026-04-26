import type { JsonSchema, TypeDef, TypeRef } from "../L01-foundation/types.ts";
import { MetaLevel } from "../L01-foundation/types.ts";
import { ADK_ORIGIN, buildTypeUri } from "../L01-foundation/utils.ts";
import type { StateMachineDef, Transition } from "../L06-process/engine.ts";
import type { AlgebraicKernel } from "../L13-facade/kernel.export.ts";
import type {
  ContractDef,
  EntityDef,
  LifecycleDef,
  ModelDocument,
  RelationDef,
} from "./model-types.ts";
import { compileAttributeType, parseClaim } from "./type-compilers.ts";

export function buildEntitySchema(
  entity: EntityDef,
  origin: string,
  version: string,
  resolver: (ref: string) => string,
): JsonSchema {
  const properties: Record<string, JsonSchema> = {};
  const requiredFields: string[] = [];

  for (const [attrName, attr] of Object.entries(entity.attributes)) {
    properties[attrName] = compileAttributeType(attr, origin, version, resolver);
    if (attr.required) requiredFields.push(attrName);
  }

  for (const field of entity.required ?? []) {
    if (!requiredFields.includes(field)) requiredFields.push(field);
  }

  return requiredFields.length > 0
    ? { type: "object", properties, required: requiredFields }
    : { type: "object", properties };
}

export function compileEntity(
  kernel: AlgebraicKernel,
  name: string,
  entity: EntityDef,
  origin: string,
  version: string,
  resolver: (ref: string) => string,
): TypeRef {
  const typeUri = buildTypeUri(origin, name, version);
  const typeDef: TypeDef = {
    id: typeUri,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    schema: buildEntitySchema(entity, origin, version, resolver),
    name,
    version,
    description: entity.description,
  };
  kernel.defineType(typeDef);
  return typeUri;
}

export function registerEntityTypes(
  model: ModelDocument,
  kernel: AlgebraicKernel,
  origin: string,
  version: string,
  resolver: (ref: string) => string,
): TypeRef[] {
  return Object.entries(model.entities ?? {}).map(([name, entity]) =>
    compileEntity(kernel, name, entity, origin, version, resolver),
  );
}

export function compileRelation(
  kernel: AlgebraicKernel,
  name: string,
  relation: RelationDef,
  origin: string,
  version: string,
  resolver: (ref: string) => string,
): TypeRef {
  const properties: Record<string, JsonSchema> = Object.fromEntries(
    Object.entries(relation.roles).map(([roleName, roleType]) => [
      roleName,
      { type: "string", $typeRef: resolver(roleType) },
    ]),
  );
  const typeUri = buildTypeUri(origin, name, version);
  const typeDef: TypeDef = {
    id: typeUri,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    schema: { type: "object", properties, required: Object.keys(relation.roles) },
    name,
    version,
    description: relation.description,
  };
  kernel.defineType(typeDef);
  return typeUri;
}

export function compileLifecycle(
  kernel: AlgebraicKernel,
  modelName: string,
  lifecycle: LifecycleDef,
  origin: string,
  version: string,
): string {
  const smId = `sm://${origin}/${modelName}/lifecycle/${version}`;
  const stateTypeRef = buildTypeUri(origin, `${modelName}State`, version);
  kernel.defineType({
    id: stateTypeRef,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    schema: {
      type: "object",
      properties: { status: { type: "string", enum: lifecycle.states } },
      required: ["status"],
    },
    name: `${modelName}State`,
    version,
  });

  const eventTypeRef = buildTypeUri(origin, `${modelName}Event`, version);
  kernel.defineType({
    id: eventTypeRef,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    schema: {
      type: "object",
      properties: { verb: { type: "string", enum: lifecycle.transitions.map((t) => t.verb) } },
      required: ["verb"],
    },
    name: `${modelName}Event`,
    version,
  });

  const transitions: Transition[] = lifecycle.transitions.map((transition) => ({
    from: { kind: "record", fields: { status: { kind: "const", value: transition.from } } },
    event: { kind: "record", fields: { verb: { kind: "const", value: transition.verb } } },
    to: { op: "record", fields: { status: { op: "const", value: transition.to } } },
    label: `${transition.from} --${transition.verb}--> ${transition.to}`,
  }));

  const smDef: StateMachineDef = {
    id: smId,
    name: `${modelName} lifecycle`,
    stateType: stateTypeRef,
    eventType: eventTypeRef,
    initialState: { status: lifecycle.initial },
    transitions,
  };
  kernel.defineStateMachine(smDef);
  return smId;
}

export function compileContract(
  kernel: AlgebraicKernel,
  name: string,
  contract: ContractDef,
  _origin: string,
): string | null {
  const expr = parseClaim(contract.claim);
  if (!expr) return null;
  return kernel.defineProposition(name, expr, {}).id;
}

export function registerEnumTypes(
  model: ModelDocument,
  kernel: AlgebraicKernel,
  version: string,
): TypeRef[] {
  return Object.entries(model.enums ?? {}).map(([name, enumDef]) => {
    const enumUri = buildTypeUri(ADK_ORIGIN, name, version);
    kernel.defineEnum(name, version, enumDef.values, {
      type: "string",
      description: enumDef.description,
    });
    return enumUri;
  });
}
