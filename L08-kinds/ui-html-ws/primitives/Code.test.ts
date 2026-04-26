import { describe, expect, test } from "bun:test";

import render from "./Code.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };
const node = (props: Record<string, unknown> = {}) =>
  ({ component: "Code", props, children: [] }) as never;

describe("Code primitive", () => {
  test("defaults to inline truncation with full title", () =>
    expect(render(node({ value: "1234567890abcdef" }), ctx)).toBe(
      '<code class="code code-inline" title="1234567890abcdef">12345678…cdef</code>',
    ));
  test("truncate false renders the full value", () =>
    expect(render(node({ value: "1234567890abcdef", truncate: false }), ctx)).toContain(
      ">1234567890abcdef</code>",
    ));
  test("values at the 14-char threshold are not truncated", () =>
    expect(render(node({ value: "12345678901234" }), ctx)).toContain(">12345678901234</code>"));
  test("block true wraps pre and code nodes", () =>
    expect(render(node({ value: "1234567890abcdef", block: true }), ctx)).toBe(
      '<pre class="code code-block"><code title="1234567890abcdef">12345678…cdef</code></pre>',
    ));
  test("special characters are escaped in rendered text but preserved in title", () =>
    expect(render(node({ value: '<tag attr="x">&' }), ctx)).toBe(
      '<code class="code code-inline" title="&lt;tag attr=&quot;x&quot;>&amp;">&lt;tag att…x"&gt;&amp;</code>',
    ));
});
