import { describe, expect, test } from "bun:test";

import render from "./Inspector.ts";

const ctx = { renderChildren: () => "<article>Legacy</article>", renderListChildren: () => "" };
const node = (props: Record<string, unknown> = {}, children: Array<Record<string, unknown>> = []) =>
  ({ component: "Inspector", props, children }) as never;
const sections = [
  { heading: "Facts", kind: "keyvalue", items: [{ label: "Name", value: "Order" }] },
  {
    heading: "Fields",
    kind: "table",
    columns: ["id", "name"],
    rows: [{ id: "ord-1", name: "Order" }],
  },
  { heading: "Chain", kind: "chain", items: ["Kernel", "Types", "Order"] },
  { heading: "List", kind: "list", items: ["a", "b"] },
  { heading: "Text", kind: "text", text: "hello" },
  { heading: "Code", kind: "code", text: "const x = 1;" },
  { heading: "Empty", kind: "empty", emptyMessage: "none" },
] as const;

describe("Inspector primitive", () => {
  test("renders empty state when selected is null", () =>
    expect(render(node({ selected: null, emptyState: "Pick one" }), ctx)).toContain("Pick one"));
  test("renders all section kinds", () => {
    const html = render(
      node({
        kind: "type",
        title: "Order",
        subtitle: "type://adk/Order/1.0",
        selected: { id: 1 },
        sections,
      }),
      ctx,
    );
    expect(html).toContain("<dl>");
    expect(html).toContain("<table><thead>");
    expect(html).toContain("Kernel ▸ Types ▸ Order");
    expect(html).toContain("<ul><li>a</li><li>b</li></ul>");
    expect(html).toContain("<p>hello</p>");
    expect(html).toContain("<pre><code>const x = 1;</code></pre>");
    expect(html).toContain('class="inspector-empty"');
  });
  test("respects hidden sections", () =>
    expect(
      render(
        node({
          selected: { id: 1 },
          sections: [
            { heading: "Shown", kind: "text", text: "yes" },
            { heading: "Hidden", kind: "text", text: "no", hidden: true },
          ],
        }),
        ctx,
      ),
    ).not.toContain("Hidden"));
  test("renders data-inspector-kind", () =>
    expect(render(node({ kind: "action", selected: { id: 1 } }), ctx)).toContain(
      'data-inspector-kind="action"',
    ));
  test("unknown section kinds fall back to JSON text", () =>
    expect(
      render(
        node({ selected: { id: 1 }, sections: [{ heading: "Odd", kind: "weird", text: "x" }] }),
        ctx,
      ),
    ).toContain('"kind":"weird"'));
  test("table sections use thead markup", () =>
    expect(
      render(
        node({
          selected: { id: 1 },
          sections: [{ heading: "Rows", kind: "table", columns: ["id"], rows: [{ id: "ord-1" }] }],
        }),
        ctx,
      ),
    ).toContain("<thead><tr><th>id</th></tr></thead>"));
  test("renders legacy child content when no sections are provided", () =>
    expect(
      render(node({ selected: { id: 1 } }, [{ component: "Text", props: {}, children: [] }]), ctx),
    ).toContain("<article>Legacy</article>"));
});
