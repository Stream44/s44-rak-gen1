import { buildTypeUri } from "../../L01-foundation/utils.ts";
import {
  compileAttributeType,
  type AttributeDef,
  type JsonSchema,
  type ModelLoadResult,
} from "../../L13-facade/index.ts";
import type {
  AspectDef,
  SdsDoc,
  ShapeExpr,
  StorageBindingDef,
  StorageSpaceDef,
} from "./sds-schema.ts";

export interface ValidateInput {
  doc: SdsDoc;
  models: Map<string, ModelLoadResult>;
}

const EVENT_JOURNAL_FIELDS = new Set([
  "verb",
  "payload",
  "beforeState",
  "afterState",
  "at",
  "causationKey",
  "aggregateKey",
]);

const STATE_MACHINE_SYNTHETIC_FIELDS = new Set([
  "currentState",
  "transitionCount",
  "lastTransitionAt",
]);

export function validateStorageDeclarations(input: ValidateInput): void {
  const { doc, models } = input;
  const spaces = doc.storageSpaces ?? [];
  const bindings = doc.bindings ?? [];

  assertUniqueByName(spaces, "storageSpaces");
  assertUniqueByName(bindings, "bindings");

  for (const binding of bindings) {
    if (!spaces.some((space) => space.name === binding.space)) {
      throw new Error(`sds: binding "${binding.name}" references unknown space "${binding.space}"`);
    }
  }

  for (const binding of bindings) {
    validateAspectRef(binding, models);
  }

  for (const binding of bindings) {
    validateShapeFields(binding, models);
  }

  assertNoDuplicateAspect(bindings);
}

export function validateAspectRef(
  binding: StorageBindingDef,
  models: Map<string, ModelLoadResult>,
): void {
  switch (binding.aspect.kind) {
    case "entityCollection":
      if (!findModelForEntity(binding.aspect.entity, models)) {
        throw new Error(
          `sds: binding "${binding.name}" references unknown entity "${binding.aspect.entity}"`,
        );
      }
      return;
    case "stateMachineAggregate":
      if (!findModelForMachine(binding.aspect.machine, models)) {
        throw new Error(
          `sds: binding "${binding.name}" references unknown machine "${binding.aspect.machine}"`,
        );
      }
      return;
    case "eventJournal":
      if (binding.aspect.entity && !findModelForEntity(binding.aspect.entity, models)) {
        throw new Error(
          `sds: binding "${binding.name}" references unknown entity "${binding.aspect.entity}"`,
        );
      }
      if (binding.aspect.machine && !findModelForMachine(binding.aspect.machine, models)) {
        throw new Error(
          `sds: binding "${binding.name}" references unknown machine "${binding.aspect.machine}"`,
        );
      }
      return;
  }
}

export function validateShapeFields(
  binding: StorageBindingDef,
  models: Map<string, ModelLoadResult>,
): void {
  const target = resolveValidationTarget(binding.aspect, models);
  if (!target) {
    return;
  }

  walkShape(binding.shape.stored, `binding "${binding.name}" shape.stored`, target);
  if (binding.shape.derived !== undefined) {
    walkShape(binding.shape.derived, `binding "${binding.name}" shape.derived`, target);
  }
}

export function assertNoDuplicateAspect(bindings: StorageBindingDef[]): void {
  const seen = new Map<string, string>();
  for (const binding of bindings) {
    const subject =
      binding.aspect.kind === "eventJournal"
        ? (binding.aspect.machine ?? binding.aspect.entity ?? "*")
        : "entity" in binding.aspect
          ? binding.aspect.entity
          : binding.aspect.machine;
    const key = `${binding.aspect.kind}:${subject}`;
    const previous = seen.get(key);
    if (previous) {
      throw new Error(
        `sds: duplicate binding for (${binding.aspect.kind}, ${subject}): "${previous}" and "${binding.name}". V1 allows one binding per (subject, aspect-kind).`,
      );
    }
    seen.set(key, binding.name);
  }
}

function assertUniqueByName<T extends { name: string }>(
  entries: T[],
  collectionName: "storageSpaces" | "bindings",
): void {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (seen.has(entry.name)) {
      throw new Error(`sds: ${collectionName} contains duplicate name "${entry.name}"`);
    }
    seen.add(entry.name);
  }
}

interface ValidationTarget {
  label: string;
  validFields: Set<string>;
}

function resolveValidationTarget(
  aspect: AspectDef,
  models: Map<string, ModelLoadResult>,
): ValidationTarget | undefined {
  switch (aspect.kind) {
    case "entityCollection": {
      const model = findModelForEntity(aspect.entity, models);
      const entity = model?.document.entities?.[aspect.entity];
      if (!model || !entity) {
        return undefined;
      }
      return {
        label: `entity "${aspect.entity}"`,
        validFields: collectEntityFields(model, aspect.entity),
      };
    }
    case "stateMachineAggregate": {
      const model = findModelForMachine(aspect.machine, models);
      if (!model) {
        return undefined;
      }
      const validFields = new Set<string>([
        ...STATE_MACHINE_SYNTHETIC_FIELDS,
        ...collectLifecycleStateFields(model),
        aspect.keyField,
      ]);
      return {
        label: `machine "${aspect.machine}"`,
        validFields,
      };
    }
    case "eventJournal":
      return {
        label: bindingLabelForEventJournal(aspect),
        validFields: new Set(EVENT_JOURNAL_FIELDS),
      };
  }
}

function bindingLabelForEventJournal(aspect: Extract<AspectDef, { kind: "eventJournal" }>): string {
  if (aspect.machine) {
    return `machine "${aspect.machine}"`;
  }
  if (aspect.entity) {
    return `entity "${aspect.entity}"`;
  }
  return "event journal";
}

function collectEntityFields(model: ModelLoadResult, entityName: string): Set<string> {
  const attributes = model.document.entities?.[entityName]?.attributes ?? {};
  const validFields = new Set<string>();
  for (const [name, attribute] of Object.entries(attributes)) {
    // Reuse the existing attribute compiler to keep validation aligned with the model loader.
    compileAttributeType(attribute as AttributeDef, model.origin, model.version, (ref) =>
      modelRefResolver(model, ref),
    );
    validFields.add(name);
  }
  return validFields;
}

function collectLifecycleStateFields(model: ModelLoadResult): Set<string> {
  const lifecycle = model.document.lifecycle as
    | ({ state?: Record<string, AttributeDef> } & Record<string, unknown>)
    | undefined;
  const fields = new Set<string>();
  const state = lifecycle?.state;
  if (state && typeof state === "object") {
    for (const [name, attribute] of Object.entries(state)) {
      compileAttributeType(attribute as AttributeDef, model.origin, model.version, (ref) =>
        modelRefResolver(model, ref),
      );
      fields.add(name);
    }
  }
  return fields;
}

function modelRefResolver(model: ModelLoadResult, ref: string): string {
  const [prefix, name] = ref.includes(":") ? ref.split(":", 2) : [undefined, ref];
  return buildTypeUri(
    prefix ? prefix.replace(/^https?:\/\//, "") : model.origin,
    name,
    model.version,
  );
}

function walkShape(shape: ShapeExpr, path: string, target: ValidationTarget): void {
  if (typeof shape === "string") {
    return;
  }
  if (Array.isArray(shape)) {
    for (const field of shape) {
      assertKnownField(field, `${path}.fields`, target);
    }
    return;
  }
  walkShapeObject(shape, path, target);
}

function walkShapeObject(
  value: Record<string, unknown>,
  path: string,
  target: ValidationTarget,
): void {
  const op = typeof value.op === "string" ? value.op : undefined;
  if (op === "pick" || op === "omit") {
    const fields = value.fields;
    if (Array.isArray(fields)) {
      for (const field of fields) {
        if (typeof field === "string") {
          assertKnownField(field, `${path}.fields`, target);
        }
      }
    }
  }

  if (!("op" in value)) {
    for (const [key, nested] of Object.entries(value)) {
      assertKnownField(key, `${path}.${key}`, target);
      if (nested && typeof nested === "object" && !Array.isArray(nested)) {
        walkShapeObject(nested as Record<string, unknown>, `${path}.${key}`, target);
      } else if (Array.isArray(nested)) {
        walkShapeArray(nested, `${path}.${key}`, target);
      }
    }
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (key === "fields" || typeof nested === "string") {
      continue;
    }
    if (Array.isArray(nested)) {
      walkShapeArray(nested, `${path}.${key}`, target);
      continue;
    }
    if (nested && typeof nested === "object") {
      walkShapeObject(nested as Record<string, unknown>, `${path}.${key}`, target);
    }
  }
}

function walkShapeArray(value: unknown[], path: string, target: ValidationTarget): void {
  for (let index = 0; index < value.length; index += 1) {
    const entry = value[index];
    if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      walkShapeObject(entry as Record<string, unknown>, `${path}[${index}]`, target);
    }
  }
}

function assertKnownField(field: string, path: string, target: ValidationTarget): void {
  if (isContextRef(field) || target.validFields.has(field)) {
    return;
  }

  const suggestion = nearestField(field, target.validFields);
  const hint = suggestion ? ` (did you mean "${suggestion}"?)` : "";
  throw new Error(`sds: ${path} references unknown attribute "${field}" on ${target.label}${hint}`);
}

function isContextRef(field: string): boolean {
  return (
    field === "$key" ||
    field === "$now" ||
    field === "$self" ||
    field === "$stored" ||
    field.startsWith("$model.")
  );
}

function nearestField(field: string, validFields: Set<string>): string | undefined {
  let best: { name: string; distance: number } | undefined;
  for (const candidate of validFields) {
    const distance = levenshtein(field, candidate);
    if (!best || distance < best.distance) {
      best = { name: candidate, distance };
    }
  }
  if (!best) {
    return undefined;
  }
  return best.distance <= 3 ? best.name : undefined;
}

function levenshtein(left: string, right: string): number {
  const rows = Array.from({ length: left.length + 1 }, (_, index) => index);
  for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
    let previous = rows[0];
    rows[0] = rightIndex;
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      const current = rows[leftIndex];
      rows[leftIndex] = Math.min(
        rows[leftIndex] + 1,
        rows[leftIndex - 1] + 1,
        previous + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
      previous = current;
    }
  }
  return rows[left.length];
}

function findModelForEntity(
  entityName: string,
  models: Map<string, ModelLoadResult>,
): ModelLoadResult | undefined {
  for (const model of models.values()) {
    if (model.document.entities?.[entityName]) {
      return model;
    }
  }
  return undefined;
}

function findModelForMachine(
  machineName: string,
  models: Map<string, ModelLoadResult>,
): ModelLoadResult | undefined {
  for (const model of models.values()) {
    const lifecycle = model.document.lifecycle as
      | ({ machine?: string } & Record<string, unknown>)
      | undefined;
    if (!lifecycle) {
      continue;
    }
    if (
      lifecycle.machine === machineName ||
      model.modelId === machineName ||
      model.statemachineId === machineName
    ) {
      return model;
    }
  }
  return undefined;
}
