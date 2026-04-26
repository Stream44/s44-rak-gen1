import { describe, expect, test } from "bun:test";

import { ContextResolver } from "../runtime/context.ts";
import render from "./Tree.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };
const node = (props: Record<string, unknown>) => ({ component: "Tree", props, children: [] });

describe("Tree primitive", () => {
  test("leaf render omits chevron", () =>
    expect(
      render(node({ node: { label: "Leaf" }, expandable: false }) as never, ctx),
    ).not.toContain("data-tree-toggle"));
  test("label falls back to name when label is absent", () =>
    expect(render(node({ node: { name: "Named" }, expandable: false }) as never, ctx)).toContain(
      "<span>Named</span>",
    ));
  test("label falls back to title when label and name are absent", () =>
    expect(render(node({ node: { title: "Titled" }, expandable: false }) as never, ctx)).toContain(
      "<span>Titled</span>",
    ));
  test("label falls back to id when no display fields are present", () =>
    expect(render(node({ node: { id: "node-1" }, expandable: false }) as never, ctx)).toContain(
      "<span>node-1</span>",
    ));
  test("collapsed tree renders chevron only", () => {
    const html = render(
      node({
        node: { label: "Root", children: [{ label: "Child" }] },
        expandable: true,
        expanded: false,
      }) as never,
      ctx,
    );
    expect(html).toContain("▸");
    expect(html).not.toContain("<ul>");
  });
  test("expanded tree renders children", () =>
    expect(
      render(
        node({
          node: { label: "Root", children: [{ label: "Child" }] },
          expandable: true,
          expanded: true,
        }) as never,
        ctx,
      ),
    ).toContain('<li><button type="button" data-tree-leaf="Child">Child</button></li>'));
  test("childrenData overrides node.children when provided", () =>
    expect(
      render(
        node({
          node: { label: "Root", children: [{ label: "Ignored" }] },
          childrenData: [{ label: "Override" }],
          expandable: true,
          expanded: true,
        }) as never,
        ctx,
      ),
    ).toContain('data-tree-leaf="Override"'));
  test("missing fetchChildren omits lazy-load metadata", () =>
    expect(
      render(node({ node: { label: "Root" }, expandable: true, expanded: false }) as never, ctx),
    ).not.toContain("data-fetch-children"));
  test("lazy expand exposes fetchChildren metadata", () =>
    expect(
      render(
        node({
          node: { label: "Root" },
          expandable: true,
          expanded: false,
          fetchChildren: "morphism://adk/fetch-children/1.0",
        }) as never,
        ctx,
      ),
    ).toContain('data-fetch-children="morphism://adk/fetch-children/1.0"'));
  test("row-keyed contexts keep sibling expanded state isolated", () => {
    const resolver = new ContextResolver({ sendUiSet() {} } as never);
    resolver.loadFromSkeleton([
      { scopePath: "page/tree", scope: "tree" },
      { scopePath: "page/tree/row-a", scope: "row", initial: { expanded: false }, key: "a" },
      { scopePath: "page/tree/row-b", scope: "row", initial: { expanded: false }, key: "b" },
    ]);
    resolver.setUi("page/tree/row-a", "expanded", true);
    expect(resolver.resolve("$ctx.expanded", "page/tree/row-a")).toBe(true);
    expect(resolver.resolve("$ctx.expanded", "page/tree/row-b")).toBe(false);
  });
});
