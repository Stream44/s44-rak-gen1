import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};
type SchemaProp = {
  type: string;
  enum?: unknown[];
  description?: string;
  properties?: Record<string, SchemaProp>;
  required?: string[];
};
type Schema = { type: "object"; required?: string[]; properties: Record<string, SchemaProp> };

const pathValue = (value: Record<string, unknown> | undefined, name: string) => value?.[name];

function renderField(
  name: string,
  schema: SchemaProp,
  value: unknown,
  readOnly: boolean,
  required: boolean,
  path: string,
): string {
  const disabled = readOnly ? " disabled" : "",
    requiredAttr = required ? ' data-required="true"' : "";
  const description = schema.description
    ? `<div class="schema-form-description">${escapeText(schema.description)}</div>`
    : "";
  if (schema.type === "object") {
    const nestedSchema: Schema = {
      type: "object",
      properties: schema.properties ?? {},
      required: schema.required,
    };
    return `<div class="schema-form-field schema-form-field-object"${requiredAttr}><div class="schema-form-label">${escapeText(name)}</div>${description}<div class="schema-form-object">${renderFields(nestedSchema, typeof value === "object" && value ? (value as Record<string, unknown>) : {}, readOnly, path)}</div></div>`;
  }
  if (schema.type === "boolean") {
    return `<label class="schema-form-field"${requiredAttr}><span class="schema-form-label">${escapeText(name)}</span><input type="checkbox" name="${escapeAttr(path)}"${value ? " checked" : ""}${disabled}/>${description}</label>`;
  }
  if (schema.type === "string" && Array.isArray(schema.enum)) {
    const options = [
      `<option value=""></option>`,
      ...schema.enum.map((item) => {
        const selected = value === item ? " selected" : "";
        return `<option value="${escapeAttr(String(item))}"${selected}>${escapeText(item)}</option>`;
      }),
    ].join("");
    return `<label class="schema-form-field"${requiredAttr}><span class="schema-form-label">${escapeText(name)}</span><select name="${escapeAttr(path)}"${disabled}>${options}</select>${description}</label>`;
  }
  const type = schema.type === "number" || schema.type === "integer" ? "number" : "text";
  const inputValue = value == null ? "" : ` value="${escapeAttr(String(value))}"`;
  return `<label class="schema-form-field"${requiredAttr}><span class="schema-form-label">${escapeText(name)}</span><input type="${type}" name="${escapeAttr(path)}"${inputValue}${disabled}/>${description}</label>`;
}

function renderFields(
  schema: Schema,
  value: Record<string, unknown> | undefined,
  readOnly: boolean,
  prefix = "",
): string {
  const required = new Set(schema.required ?? []);
  return Object.entries(schema.properties ?? {})
    .map(([name, propSchema]) =>
      renderField(
        name,
        propSchema,
        pathValue(value, name),
        readOnly,
        required.has(name),
        prefix ? `${prefix}.${name}` : name,
      ),
    )
    .join("");
}

export default function render(node: ProjectionNode, _ctx: Ctx): string {
  const p = node.props ?? {},
    schema = p.schema as Schema | undefined,
    readOnly = p.readOnly !== false,
    value = typeof p.value === "object" && p.value ? (p.value as Record<string, unknown>) : {};
  const title =
    p.title == null ? "" : `<div class="schema-form-title">${escapeText(p.title)}</div>`;
  const fields = schema?.type === "object" ? renderFields(schema, value, readOnly) : "";
  return `<form${buildAttrs(node, { baseClass: "schema-form" })}>${title}${fields}</form>`;
}
