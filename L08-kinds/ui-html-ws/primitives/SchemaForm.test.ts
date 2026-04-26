import { describe, expect, test } from "bun:test";

import render from "./SchemaForm.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };
const schema = {
  type: "object" as const,
  required: ["name", "enabled"],
  properties: {
    name: { type: "string", description: "Display name" },
    mode: { type: "string", enum: ["auto", "manual"] },
    count: { type: "integer" },
    enabled: { type: "boolean" },
    meta: { type: "object", properties: { note: { type: "string" } } },
  },
};
const node = (props: Record<string, unknown> = {}) =>
  ({ component: "SchemaForm", props: { schema, ...props }, children: [] }) as never;

describe("SchemaForm primitive", () => {
  test("renders a disabled text input for plain strings by default", () =>
    expect(render(node(), ctx)).toContain('<input type="text" name="name" disabled/>'));
  test("required fields carry data-required", () =>
    expect(render(node(), ctx).match(/data-required="true"/g)?.length ?? 0).toBe(2));
  test("enum, number, and boolean properties map to select, number, and checkbox controls", () => {
    const html = render(node({ value: { mode: "manual", count: 3, enabled: true } }), ctx);
    expect(html).toContain(
      '<select name="mode" disabled><option value=""></option><option value="auto">auto</option><option value="manual" selected>manual</option></select>',
    );
    expect(html).toContain('<input type="number" name="count" value="3" disabled/>');
    expect(html).toContain('<input type="checkbox" name="enabled" checked disabled/>');
  });
  test("nested object properties render an indented sub-form", () =>
    expect(render(node({ value: { meta: { note: "hi" } } }), ctx)).toContain(
      '<div class="schema-form-object"><label class="schema-form-field"><span class="schema-form-label">note</span><input type="text" name="meta.note" value="hi" disabled/></label></div>',
    ));
  test("readOnly false leaves controls enabled", () =>
    expect(render(node({ readOnly: false })).includes("disabled")).toBe(false));
  test("title and descriptions are rendered with escaped text", () =>
    expect(render(node({ title: "<Config>" }), ctx)).toContain(
      '<div class="schema-form-title">&lt;Config&gt;</div>',
    ));
});
