import { describe, expect, test } from "bun:test";

import render from "./Table.ts";

const ctx = {
  renderChildren: () => "",
  renderListChildren: (node: { children: Array<{ props?: { html?: string } }> }) =>
    node.children.map((child) => child.props?.html ?? "").join(""),
};
const node = (props: Record<string, unknown> = {}, children: Array<Record<string, unknown>> = []) =>
  ({ component: "Table", props, children }) as never;

describe("Table primitive", () => {
  test("empty table renders head and body containers", () =>
    expect(render(node(), ctx)).toBe(
      '<table class="table"><thead><tr></tr></thead><tbody></tbody></table>',
    ));
  test("column child nodes build the header and are excluded from tbody", () =>
    expect(
      render(
        node({}, [
          { component: "TableColumn", props: { label: "Name" }, children: [] },
          { component: "TableRow", props: { html: "<tr><td>Ada</td></tr>" }, children: [] },
        ]),
        ctx,
      ),
    ).toContain("<thead><tr><th>Name</th></tr></thead><tbody><tr><td>Ada</td></tr></tbody>"));
  test("columns prop supports many columns and data attributes", () =>
    expect(
      render(node({ columns: ["A", "B", "C"], sortable: true, filterable: true }), ctx),
    ).toContain('data-sortable="true" data-filterable="true"'));
  test("id and class props pass through alongside the base class", () =>
    expect(render(node({ id: "orders", class: "compact" }), ctx)).toContain(
      'class="table compact" id="orders"',
    ));
  test("header labels are HTML-escaped", () =>
    expect(render(node({ columns: ['A & <B>"'] }), ctx)).toContain('<th>A &amp; &lt;B&gt;"</th>'));
});
