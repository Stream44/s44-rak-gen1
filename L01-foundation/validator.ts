/**
 * Layer 2: SchemaValidator — JSON Schema validation and structural subtyping.
 */

import type {
  JsonSchema,
  JsonSchemaType,
  ValidationResult,
  ValidationError,
  SubtypeResult,
  TypeRef,
  TypeDef,
} from "./types.ts";
import { deepEqual } from "./equality.ts";

function jsonTypeOf(value: unknown): JsonSchemaType | "null" {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value as JsonSchemaType;
}

function typeMatches(actual: JsonSchemaType, expected: JsonSchemaType): boolean {
  if (actual === expected) return true;
  // integer is also a number
  if (expected === "number" && actual === "integer") return true;
  return false;
}

export class SchemaValidator {
  /**
   * Validate data against a JSON Schema.
   */
  validate(data: unknown, schema: JsonSchema): ValidationResult {
    const errors: ValidationError[] = [];
    this.validateNode(data, schema, "", errors);
    return { valid: errors.length === 0, errors };
  }

  /**
   * Validate data with $typeRef resolution.
   */
  validateDeep(
    data: unknown,
    schema: JsonSchema,
    resolver: (ref: TypeRef) => TypeDef | undefined,
  ): ValidationResult {
    const errors: ValidationError[] = [];
    this.validateNodeDeep(data, schema, "", errors, resolver);
    return { valid: errors.length === 0, errors };
  }

  /**
   * Structural subtype check: child ≤ parent.
   * Conservative: may return false negatives but never false positives.
   */
  isSubtype(child: JsonSchema, parent: JsonSchema): SubtypeResult {
    const reasons: string[] = [];
    const result = this.checkSubtype(child, parent, "", reasons);
    return { isSubtype: result, reasons };
  }

  // ── Private validation ──────────────────────────────────────────────────

  private validateNode(
    value: unknown,
    schema: JsonSchema,
    path: string,
    errors: ValidationError[],
  ): void {
    if (!schema || typeof schema !== "object") return;

    // const check
    if (schema.const !== undefined) {
      if (!deepEqual(value, schema.const)) {
        errors.push({
          path,
          message: `Expected constant ${JSON.stringify(schema.const)}, got ${JSON.stringify(value)}`,
          keyword: "const",
          params: { allowedValue: schema.const },
        });
      }
      return;
    }

    // enum check
    if (schema.enum !== undefined) {
      if (!schema.enum.some((e) => deepEqual(value, e))) {
        errors.push({
          path,
          message: `Value must be one of: ${JSON.stringify(schema.enum)}`,
          keyword: "enum",
          params: { allowedValues: schema.enum },
        });
      }
      return;
    }

    // type check
    if (schema.type) {
      const types = Array.isArray(schema.type) ? schema.type : [schema.type];
      const actual = jsonTypeOf(value);
      if (!types.some((t) => typeMatches(actual, t))) {
        errors.push({
          path,
          message: `Expected ${types.join("|")}, got ${actual}`,
          keyword: "type",
          params: { expected: schema.type, actual },
        });
        return;
      }
    }

    // Numeric constraints
    if (typeof value === "number") {
      if (schema.minimum !== undefined && value < schema.minimum) {
        errors.push({
          path,
          message: `${value} < minimum ${schema.minimum}`,
          keyword: "minimum",
          params: { limit: schema.minimum },
        });
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        errors.push({
          path,
          message: `${value} > maximum ${schema.maximum}`,
          keyword: "maximum",
          params: { limit: schema.maximum },
        });
      }
      if (schema.exclusiveMinimum !== undefined && value <= schema.exclusiveMinimum) {
        errors.push({
          path,
          message: `${value} <= exclusiveMinimum ${schema.exclusiveMinimum}`,
          keyword: "exclusiveMinimum",
          params: { limit: schema.exclusiveMinimum },
        });
      }
      if (schema.exclusiveMaximum !== undefined && value >= schema.exclusiveMaximum) {
        errors.push({
          path,
          message: `${value} >= exclusiveMaximum ${schema.exclusiveMaximum}`,
          keyword: "exclusiveMaximum",
          params: { limit: schema.exclusiveMaximum },
        });
      }
      if (schema.multipleOf !== undefined && value % schema.multipleOf !== 0) {
        errors.push({
          path,
          message: `${value} is not a multiple of ${schema.multipleOf}`,
          keyword: "multipleOf",
          params: { multipleOf: schema.multipleOf },
        });
      }
    }

    // String constraints
    if (typeof value === "string") {
      if (schema.minLength !== undefined && value.length < schema.minLength) {
        errors.push({
          path,
          message: `String length ${value.length} < minLength ${schema.minLength}`,
          keyword: "minLength",
          params: { limit: schema.minLength },
        });
      }
      if (schema.maxLength !== undefined && value.length > schema.maxLength) {
        errors.push({
          path,
          message: `String length ${value.length} > maxLength ${schema.maxLength}`,
          keyword: "maxLength",
          params: { limit: schema.maxLength },
        });
      }
      if (schema.pattern) {
        if (!new RegExp(schema.pattern).test(value)) {
          errors.push({
            path,
            message: `String does not match pattern ${schema.pattern}`,
            keyword: "pattern",
            params: { pattern: schema.pattern },
          });
        }
      }
    }

    // Array constraints
    if (Array.isArray(value)) {
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        errors.push({
          path,
          message: `Array length ${value.length} < minItems ${schema.minItems}`,
          keyword: "minItems",
          params: { limit: schema.minItems },
        });
      }
      if (schema.maxItems !== undefined && value.length > schema.maxItems) {
        errors.push({
          path,
          message: `Array length ${value.length} > maxItems ${schema.maxItems}`,
          keyword: "maxItems",
          params: { limit: schema.maxItems },
        });
      }
      if (schema.uniqueItems) {
        const seen = new Set<string>();
        for (let i = 0; i < value.length; i++) {
          const key = JSON.stringify(value[i]);
          if (seen.has(key)) {
            errors.push({
              path: `${path}/${i}`,
              message: `Duplicate item at index ${i}`,
              keyword: "uniqueItems",
              params: {},
            });
          }
          seen.add(key);
        }
      }
      if (schema.items && typeof schema.items === "object") {
        for (let i = 0; i < value.length; i++) {
          this.validateNode(value[i], schema.items as JsonSchema, `${path}/${i}`, errors);
        }
      }
    }

    // Object constraints
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      const obj = value as Record<string, unknown>;

      // Required fields
      if (schema.required) {
        for (const key of schema.required) {
          if (!(key in obj)) {
            errors.push({
              path: `${path}/${key}`,
              message: `Required field missing: ${key}`,
              keyword: "required",
              params: { missingProperty: key },
            });
          }
        }
      }

      // Validate properties (skip undefined — not present in JSON semantics)
      if (schema.properties) {
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          if (key in obj && obj[key] !== undefined) {
            this.validateNode(obj[key], propSchema as JsonSchema, `${path}/${key}`, errors);
          }
        }
      }

      // additionalProperties
      if (schema.additionalProperties !== undefined) {
        const allowed = new Set(Object.keys(schema.properties ?? {}));
        for (const key of Object.keys(obj)) {
          if (allowed.has(key) || obj[key] === undefined) continue;
          if (schema.additionalProperties === false) {
            errors.push({
              path: `${path}/${key}`,
              message: `Additional property not allowed: ${key}`,
              keyword: "additionalProperties",
              params: { additionalProperty: key },
            });
            continue;
          }
          if (typeof schema.additionalProperties === "object") {
            this.validateNode(obj[key], schema.additionalProperties, `${path}/${key}`, errors);
          }
        }
      }
    }

    // Composition keywords
    if (schema.allOf) {
      for (const sub of schema.allOf) {
        this.validateNode(value, sub, path, errors);
      }
    }

    if (schema.anyOf) {
      const anyValid = schema.anyOf.some((sub) => {
        const subErrors: ValidationError[] = [];
        this.validateNode(value, sub, path, subErrors);
        return subErrors.length === 0;
      });
      if (!anyValid) {
        errors.push({
          path,
          message: "Value does not match any of the schemas in anyOf",
          keyword: "anyOf",
          params: {},
        });
      }
    }

    if (schema.oneOf) {
      const matchCount = schema.oneOf.filter((sub) => {
        const subErrors: ValidationError[] = [];
        this.validateNode(value, sub, path, subErrors);
        return subErrors.length === 0;
      }).length;
      if (matchCount !== 1) {
        errors.push({
          path,
          message: `Value must match exactly one schema in oneOf, matched ${matchCount}`,
          keyword: "oneOf",
          params: { matchCount },
        });
      }
    }

    if (schema.not) {
      const notErrors: ValidationError[] = [];
      this.validateNode(value, schema.not, path, notErrors);
      if (notErrors.length === 0) {
        errors.push({
          path,
          message: "Value must NOT match the schema in not",
          keyword: "not",
          params: {},
        });
      }
    }
  }

  private validateNodeDeep(
    value: unknown,
    schema: JsonSchema,
    path: string,
    errors: ValidationError[],
    resolver: (ref: TypeRef) => TypeDef | undefined,
  ): void {
    // First do standard validation
    this.validateNode(value, schema, path, errors);

    // Then resolve $typeRef
    if (schema.$typeRef && typeof value === "string") {
      const refType = resolver(schema.$typeRef);
      if (!refType) {
        errors.push({
          path,
          message: `Cannot resolve $typeRef: ${schema.$typeRef}`,
          keyword: "$typeRef",
          params: { ref: schema.$typeRef },
        });
      }
    }

    // Recurse into object properties for deep validation
    if (typeof value === "object" && value !== null && !Array.isArray(value) && schema.properties) {
      const obj = value as Record<string, unknown>;
      for (const [key, propSchema] of Object.entries(schema.properties)) {
        if (key in obj) {
          this.validateNodeDeep(
            obj[key],
            propSchema as JsonSchema,
            `${path}/${key}`,
            errors,
            resolver,
          );
        }
      }
    }
  }

  // ── Subtype checking ──────────────────────────────────────────────────

  private checkSubtype(
    child: JsonSchema,
    parent: JsonSchema,
    path: string,
    reasons: string[],
  ): boolean {
    // Empty parent accepts everything
    if (!parent || Object.keys(parent).length === 0) return true;

    // Type compatibility
    if (parent.type && child.type) {
      const parentTypes = Array.isArray(parent.type) ? parent.type : [parent.type];
      const childTypes = Array.isArray(child.type) ? child.type : [child.type];
      // Every child type must be in parent types
      for (const ct of childTypes) {
        if (!parentTypes.some((pt) => typeMatches(ct, pt))) {
          reasons.push(`${path}: type ${ct} not in parent types ${parentTypes}`);
          return false;
        }
      }
    }

    // Numeric: child's range must be within parent's
    if (parent.minimum !== undefined) {
      if (child.minimum === undefined || child.minimum < parent.minimum) {
        reasons.push(`${path}: child minimum ${child.minimum} < parent minimum ${parent.minimum}`);
        return false;
      }
    }
    if (parent.maximum !== undefined) {
      if (child.maximum === undefined || child.maximum > parent.maximum) {
        reasons.push(`${path}: child maximum ${child.maximum} > parent maximum ${parent.maximum}`);
        return false;
      }
    }

    // String: child constraints at least as tight
    if (parent.minLength !== undefined) {
      if (child.minLength === undefined || child.minLength < parent.minLength) {
        reasons.push(`${path}: child minLength weaker than parent`);
        return false;
      }
    }
    if (parent.maxLength !== undefined) {
      if (child.maxLength === undefined || child.maxLength > parent.maxLength) {
        reasons.push(`${path}: child maxLength weaker than parent`);
        return false;
      }
    }

    // Object: child must have all parent's required fields
    if (parent.type === "object" && parent.required) {
      const childRequired = new Set(child.required ?? []);
      for (const key of parent.required) {
        if (!childRequired.has(key)) {
          reasons.push(`${path}: parent requires "${key}" but child does not`);
          return false;
        }
      }
    }

    // Property depth subtyping
    if (parent.properties && child.properties) {
      for (const [key, parentProp] of Object.entries(parent.properties)) {
        if (child.properties[key]) {
          if (
            !this.checkSubtype(
              child.properties[key] as JsonSchema,
              parentProp as JsonSchema,
              `${path}/${key}`,
              reasons,
            )
          ) {
            return false;
          }
        }
      }
    }

    return true;
  }
}
