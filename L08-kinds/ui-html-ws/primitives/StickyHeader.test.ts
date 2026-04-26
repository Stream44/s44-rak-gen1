import { describe, expect, test } from "bun:test";

import render from "./StickyHeader.ts";

const ctx = {
  renderChildren: (node: { children: Array<{ props?: { html?: string } }> }) =>
    node.children.map((child) => child.props?.html ?? "").join(""),
  renderListChildren: () => "",
};
const node = (props: Record<string, unknown> = {}, children: Array<Record<string, unknown>> = []) =>
  ({ component: "StickyHeader", props, children }) as never;

describe("StickyHeader primitive", () => {
  test("wraps children in a sticky-header container", () =>
    expect(render(node({}, [{ props: { html: "<h1>Observatory</h1>" } }]), ctx)).toBe(
      '<div class="sticky-header"><h1>Observatory</h1></div>',
    ));
  test("renders an empty wrapper when there are no children", () =>
    expect(render(node(), ctx)).toBe('<div class="sticky-header"></div>'));
  test("id and class props pass through alongside the base class", () =>
    expect(render(node({ id: "top", class: "dense" }), ctx)).toContain(
      'class="sticky-header dense" id="top"',
    ));
  test("attribute values are escaped", () =>
    expect(render(node({ title: 'A "quote" <x>' }), ctx)).toContain(
      'title="A &quot;quote&quot; &lt;x>"',
    ));
});
