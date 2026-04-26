import type { AttributeDef, ModelDocument } from "./model-loader.ts";
import { compileAttributeType } from "./model-loader.ts";

export interface EmittedSchema {
  contextUri: string;
  schemaVersion: string;
  jsonSchema: JsonSchemaObject;
}

export interface JsonSchemaObject {
  $schema?: string;
  $id?: string;
  type: "object";
  title?: string;
  description?: string;
  properties: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

export interface ValidationOk {
  ok: true;
}
export interface ValidationErr {
  ok: false;
  errors: string[];
}
export type ValidationResult = ValidationOk | ValidationErr;

const DEFAULT_ORIGIN = "https://github.com/Stream44/s44-rak-gen1@1.0";
const DEFAULT_VERSION = "1.0";

let warnedMissingVersion = false;
let warnedSchemaOrigin = false;

/** Exported for tests only. Resets the schema-emitter warning gates. */
export function __resetSchemaEmitterWarnings(): void {
  warnedMissingVersion = false;
  warnedSchemaOrigin = false;
}

export function emitContextUri(modelDoc: ModelDocument): string {
  const origin = modelDoc.origin ?? DEFAULT_ORIGIN;
  const version = resolveVersion(modelDoc);
  const normalizedOrigin = stripTrailingSlash(origin);
  if (normalizedOrigin.includes("/schema/")) {
    warnSchemaOriginOnce();
    return normalizedOrigin;
  }
  return `${normalizedOrigin}/schema/${version}`;
}

export function emitSchemaVersion(modelDoc: ModelDocument, entity: string): string {
  const origin = modelDoc.origin ?? DEFAULT_ORIGIN;
  const hostname = extractHostname(origin);
  const version = resolveVersion(modelDoc);
  return `type://${hostname}/${entity}/${version}`;
}

export function emitSchema(modelDoc: ModelDocument, entity: string): EmittedSchema {
  const entityDef = modelDoc.entities?.[entity];
  if (!entityDef) {
    throw new Error(`SchemaEmitter: entity "${entity}" not found in model ${modelDoc.model}`);
  }

  const origin = modelDoc.origin ?? DEFAULT_ORIGIN;
  const version = resolveVersion(modelDoc);
  const resolver = buildPrefixResolver(modelDoc);
  const properties: Record<string, unknown> = {};
  const requiredFromAttrs: string[] = [];

  for (const [attrName, attrDef] of Object.entries(entityDef.attributes)) {
    properties[attrName] = compileAttributeType(attrDef as AttributeDef, origin, version, resolver);
    if ((attrDef as AttributeDef).required === true) requiredFromAttrs.push(attrName);
  }

  const finalRequired =
    entityDef.required ?? (requiredFromAttrs.length ? requiredFromAttrs : undefined);
  const schemaVersion = emitSchemaVersion(modelDoc, entity);
  const contextUri = emitContextUri(modelDoc);

  const jsonSchema: JsonSchemaObject = {
    $schema: "http://json-schema.org/draft-07/schema#",
    $id: schemaVersion,
    type: "object",
    title: entity,
    description: entityDef.description,
    properties,
    ...(finalRequired?.length ? { required: finalRequired } : {}),
    additionalProperties: true,
  };

  return { contextUri, schemaVersion, jsonSchema };
}

export function validateAgainstSchema(value: unknown, schema: JsonSchemaObject): ValidationResult {
  const errors: string[] = [];
  validateNode(value, schema, "$", errors);
  return errors.length === 0 ? { ok: true } : { ok: false, errors };
}

function validateNode(value: unknown, schema: any, path: string, errors: string[]): void {
  if (schema == null) return;

  if (schema.type === "object") {
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      errors.push(`${path}: expected object, got ${describeType(value)}`);
      return;
    }
    const obj = value as Record<string, unknown>;
    for (const req of schema.required ?? []) {
      if (!(req in obj)) errors.push(`${path}.${req}: required field missing`);
    }
    for (const [key, subSchema] of Object.entries(schema.properties ?? {})) {
      if (key in obj) validateNode(obj[key], subSchema, `${path}.${key}`, errors);
    }
    return;
  }

  if (schema.type === "array") {
    if (!Array.isArray(value)) {
      errors.push(`${path}: expected array, got ${describeType(value)}`);
      return;
    }
    if (schema.items) {
      for (let index = 0; index < value.length; index += 1) {
        validateNode(value[index], schema.items, `${path}[${index}]`, errors);
      }
    }
    return;
  }

  if (!["string", "number", "integer", "boolean"].includes(schema.type)) return;
  if (!matchesPrimitive(value, schema.type)) {
    errors.push(`${path}: expected ${schema.type}, got ${describeType(value)}`);
    return;
  }
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value "${String(value)}" not in enum ${JSON.stringify(schema.enum)}`);
  }
  if (schema.type === "string") {
    if (typeof schema.minLength === "number" && (value as string).length < schema.minLength) {
      errors.push(`${path}: minLength ${schema.minLength} violated`);
    }
    if (typeof schema.maxLength === "number" && (value as string).length > schema.maxLength) {
      errors.push(`${path}: maxLength ${schema.maxLength} violated`);
    }
    if (schema.pattern && !new RegExp(schema.pattern).test(value as string)) {
      errors.push(`${path}: pattern ${schema.pattern} not matched`);
    }
    return;
  }
  if (typeof schema.minimum === "number" && (value as number) < schema.minimum) {
    errors.push(`${path}: minimum ${schema.minimum} violated`);
  }
  if (typeof schema.maximum === "number" && (value as number) > schema.maximum) {
    errors.push(`${path}: maximum ${schema.maximum} violated`);
  }
  if (schema.type === "integer" && !Number.isInteger(value)) {
    errors.push(`${path}: expected integer, got non-integer number`);
  }
}

function buildPrefixResolver(doc: ModelDocument): (ref: string) => string {
  return (ref: string) => {
    const [, name] = ref.includes(":") ? ref.split(":") : [undefined, ref];
    const origin = doc.origin ?? DEFAULT_ORIGIN;
    const hostname = extractHostname(origin);
    return `type://${hostname}/${name ?? ref}/${resolveVersion(doc)}`;
  };
}

function resolveVersion(modelDoc: ModelDocument): string {
  if (modelDoc.version) return modelDoc.version;
  if (!warnedMissingVersion) {
    console.warn("[schema-emitter] modelDoc.version missing; defaulting to 1.0");
    warnedMissingVersion = true;
  }
  return DEFAULT_VERSION;
}

function warnSchemaOriginOnce(): void {
  if (warnedSchemaOrigin) return;
  console.warn(
    "[schema-emitter] origin already contains /schema/; not appending version path twice",
  );
  warnedSchemaOrigin = true;
}

function stripTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function extractHostname(origin: string): string {
  try {
    return new URL(origin).hostname;
  } catch {
    const stripped = origin.replace(/^https?:\/\//, "").split(/[?#]/, 1)[0] ?? origin;
    return stripped.split("/")[0] ?? origin;
  }
}

function matchesPrimitive(value: unknown, type: string): boolean {
  if (type === "string") return typeof value === "string";
  if (type === "number" || type === "integer") return typeof value === "number";
  if (type === "boolean") return typeof value === "boolean";
  return false;
}

function describeType(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  return typeof value;
}
