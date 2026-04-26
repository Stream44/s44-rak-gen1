import { describe, expect, test } from "bun:test";

import render from "./Text.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };

describe("Text primitive", () => {
  test("renders a span by default", () => {
    const html = render({ component: "Text", props: { text: "hi" }, children: [] } as never, ctx);
    expect(html).toContain("<span");
    expect(html).toContain(">hi</span>");
  });

  test("renders a label when as: label is set", () => {
    const html = render(
      { component: "Text", props: { as: "label", text: "hi" }, children: [] } as never,
      ctx,
    );
    expect(html).toContain("<label");
    expect(html).toContain(">hi</label>");
    expect(html).not.toContain("<span");
  });

  test("escapes text content", () => {
    const html = render(
      { component: "Text", props: { text: "<script>" }, children: [] } as never,
      ctx,
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });
});
