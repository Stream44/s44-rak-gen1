import { describe, expect, test } from "bun:test";

import render from "./Icon.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };
const node = (props: Record<string, unknown> = {}) =>
  ({ component: "Icon", props, children: [] }) as never;

describe("Icon primitive", () => {
  test("glyph-only renders escaped glyph content", () =>
    expect(render(node({ glyph: "<" }), ctx)).toBe(
      '<span class="icon" aria-hidden="true">&lt;</span>',
    ));
  test("svg-only renders trusted markup", () =>
    expect(render(node({ svg: '<svg viewBox="0 0 1 1"></svg>' }), ctx)).toBe(
      '<span class="icon" aria-hidden="true"><svg viewBox="0 0 1 1"></svg></span>',
    ));
  test("both glyph and svg render the exact error shape", () =>
    expect(render(node({ glyph: "x", svg: "<svg/>" }), ctx)).toBe(
      '<span class="icon icon-error" title="Icon: expected exactly one of glyph|svg">?</span>',
    ));
  test("neither glyph nor svg renders the exact error shape", () =>
    expect(render(node(), ctx)).toBe(
      '<span class="icon icon-error" title="Icon: expected exactly one of glyph|svg">?</span>',
    ));
  test("label switches to img semantics", () =>
    expect(render(node({ glyph: "▸", label: "Open <panel>" }), ctx)).toBe(
      '<span class="icon" role="img" aria-label="Open &lt;panel>">▸</span>',
    ));
});
