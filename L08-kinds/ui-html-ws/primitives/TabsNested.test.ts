import { describe, expect, test } from "bun:test";

import render from "./TabsNested.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };
const groups = [
  {
    id: "kernel",
    label: "Kernel",
    children: [
      { id: "types", label: "Types" },
      { id: "morphisms", label: "Morphisms" },
    ],
  },
  { id: "runtime", label: "Runtime", children: [{ id: "machines", label: "Machines" }] },
];
const node = (props: Record<string, unknown> = {}) =>
  ({ component: "TabsNested", props, children: [] }) as never;

describe("TabsNested primitive", () => {
  test("renders empty parent and child rows when no groups are provided", () =>
    expect(render(node(), ctx)).toBe(
      '<div class="tabs-nested" data-parent="" data-child=""><div class="tabs-row tabs-row-parent"></div><div class="tabs-row tabs-row-child"></div></div>',
    ));
  test("iterates parent and active child groups", () =>
    expect(
      render(node({ groups, activeParent: "kernel", activeChild: "types" }), ctx).match(
        /<button class="tab"/g,
      ) ?? [],
    ).toHaveLength(4));
  test("marks exactly one active parent and one active child tab", () =>
    expect(
      render(node({ groups, activeParent: "kernel", activeChild: "types" }), ctx).match(
        /aria-selected="true"/g,
      ) ?? [],
    ).toHaveLength(2));
  test("omits child tabs when the active parent is missing", () =>
    expect(render(node({ groups, activeParent: "meta" }), ctx)).toContain(
      '<div class="tabs-row tabs-row-child"></div>',
    ));
  test("escapes labels, ids, and root data attributes", () =>
    expect(
      render(
        node({
          groups: [{ id: 'k"<', label: "K & <", children: [{ id: 'c"<', label: "C & <" }] }],
          activeParent: 'k"<',
          activeChild: 'c"<',
          id: "nested",
        }),
        ctx,
      ),
    ).toContain('data-parent="k&quot;&lt;" data-child="c&quot;&lt;" id="nested"'));
  test("renders escaped button labels and tab ids", () =>
    expect(
      render(
        node({
          groups: [{ id: 'k"<', label: "K & <", children: [{ id: 'c"<', label: "C & <" }] }],
          activeParent: 'k"<',
          activeChild: 'c"<',
        }),
        ctx,
      ),
    ).toContain('data-tab-id="c&quot;&lt;" aria-selected="true">C &amp; &lt;</button>'));
});
