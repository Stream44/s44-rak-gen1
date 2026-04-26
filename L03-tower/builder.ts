/**
 * Layer 8: RecordSchemaBuilder — fluent API for constructing object schemas.
 */

import type { JsonSchema, TypeRef } from "../L01-foundation/types.ts";

export class RecordSchemaBuilder {
  private properties: Record<string, JsonSchema> = {};
  private requiredFields: string[] = [];
  private additionalPropsValue: boolean | JsonSchema | undefined;

  string(
    name: string,
    opts?: {
      required?: boolean;
      minLength?: number;
      maxLength?: number;
      pattern?: string;
      format?: string;
      enum?: string[];
      description?: string;
      default?: string;
    },
  ): this {
    const schema: JsonSchema = { type: "string" };
    if (opts?.minLength !== undefined) schema.minLength = opts.minLength;
    if (opts?.maxLength !== undefined) schema.maxLength = opts.maxLength;
    if (opts?.pattern) schema.pattern = opts.pattern;
    if (opts?.format) schema.format = opts.format;
    if (opts?.enum) schema.enum = opts.enum;
    if (opts?.description) schema.description = opts.description;
    if (opts?.default !== undefined) schema.default = opts.default;
    this.properties[name] = schema;
    if (opts?.required) this.requiredFields.push(name);
    return this;
  }

  number(
    name: string,
    opts?: {
      required?: boolean;
      minimum?: number;
      maximum?: number;
      exclusiveMinimum?: number;
      exclusiveMaximum?: number;
      multipleOf?: number;
      description?: string;
      default?: number;
    },
  ): this {
    const schema: JsonSchema = { type: "number" };
    if (opts?.minimum !== undefined) schema.minimum = opts.minimum;
    if (opts?.maximum !== undefined) schema.maximum = opts.maximum;
    if (opts?.exclusiveMinimum !== undefined) schema.exclusiveMinimum = opts.exclusiveMinimum;
    if (opts?.exclusiveMaximum !== undefined) schema.exclusiveMaximum = opts.exclusiveMaximum;
    if (opts?.multipleOf !== undefined) schema.multipleOf = opts.multipleOf;
    if (opts?.description) schema.description = opts.description;
    if (opts?.default !== undefined) schema.default = opts.default;
    this.properties[name] = schema;
    if (opts?.required) this.requiredFields.push(name);
    return this;
  }

  integer(
    name: string,
    opts?: {
      required?: boolean;
      minimum?: number;
      maximum?: number;
      description?: string;
      default?: number;
    },
  ): this {
    const schema: JsonSchema = { type: "integer" };
    if (opts?.minimum !== undefined) schema.minimum = opts.minimum;
    if (opts?.maximum !== undefined) schema.maximum = opts.maximum;
    if (opts?.description) schema.description = opts.description;
    if (opts?.default !== undefined) schema.default = opts.default;
    this.properties[name] = schema;
    if (opts?.required) this.requiredFields.push(name);
    return this;
  }

  boolean(
    name: string,
    opts?: {
      required?: boolean;
      description?: string;
      default?: boolean;
    },
  ): this {
    const schema: JsonSchema = { type: "boolean" };
    if (opts?.description) schema.description = opts.description;
    if (opts?.default !== undefined) schema.default = opts.default;
    this.properties[name] = schema;
    if (opts?.required) this.requiredFields.push(name);
    return this;
  }

  array(
    name: string,
    items: JsonSchema,
    opts?: {
      required?: boolean;
      minItems?: number;
      maxItems?: number;
      uniqueItems?: boolean;
      description?: string;
    },
  ): this {
    const schema: JsonSchema = { type: "array", items };
    if (opts?.minItems !== undefined) schema.minItems = opts.minItems;
    if (opts?.maxItems !== undefined) schema.maxItems = opts.maxItems;
    if (opts?.uniqueItems !== undefined) schema.uniqueItems = opts.uniqueItems;
    if (opts?.description) schema.description = opts.description;
    this.properties[name] = schema;
    if (opts?.required) this.requiredFields.push(name);
    return this;
  }

  object(
    name: string,
    build: (nested: RecordSchemaBuilder) => void,
    opts?: { required?: boolean; description?: string },
  ): this {
    const nested = new RecordSchemaBuilder();
    build(nested);
    const schema = nested.build();
    if (opts?.description) schema.description = opts.description;
    this.properties[name] = schema;
    if (opts?.required) this.requiredFields.push(name);
    return this;
  }

  typeRef(
    name: string,
    targetType: TypeRef,
    opts?: { required?: boolean; description?: string },
  ): this {
    const schema: JsonSchema = { type: "string", $typeRef: targetType };
    if (opts?.description) schema.description = opts.description;
    this.properties[name] = schema;
    if (opts?.required) this.requiredFields.push(name);
    return this;
  }

  enum(name: string, values: unknown[], opts?: { required?: boolean; description?: string }): this {
    const schema: JsonSchema = { enum: values };
    if (opts?.description) schema.description = opts.description;
    this.properties[name] = schema;
    if (opts?.required) this.requiredFields.push(name);
    return this;
  }

  raw(name: string, schema: JsonSchema, opts?: { required?: boolean }): this {
    this.properties[name] = schema;
    if (opts?.required) this.requiredFields.push(name);
    return this;
  }

  additionalProperties(value: boolean | JsonSchema): this {
    this.additionalPropsValue = value;
    return this;
  }

  build(): JsonSchema {
    const schema: JsonSchema = {
      type: "object",
      properties: { ...this.properties },
    };
    if (this.requiredFields.length > 0) {
      schema.required = [...this.requiredFields];
    }
    if (this.additionalPropsValue !== undefined) {
      schema.additionalProperties = this.additionalPropsValue;
    }
    return schema;
  }
}
