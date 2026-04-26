import { describe, expect, test } from "bun:test";
import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";

import render from "./Split.ts";

const ctx = {
  renderChildren: (node: ProjectionNode) =>
    node.children.length
      ? node.children.map((child) => String(child.props?.html ?? "")).join("")
      : "<aside>L</aside><main>R</main>",
  renderListChildren: () => "",
};

describe("Split primitive", () => {
  test("horizontal split renders a flex row", () =>
    expect(
      render({ component: "Split", props: { orientation: "h" }, children: [] } as never, ctx),
    ).toContain("flex-direction:row"));
  test("vertical split renders a flex column", () =>
    expect(
      render({ component: "Split", props: { orientation: "v" }, children: [] } as never, ctx),
    ).toContain("flex-direction:column"));
  test("split fills parent height", () =>
    expect(render({ component: "Split", props: {}, children: [] } as never, ctx)).toContain(
      "height:100%",
    ));
  test("split includes both sides via child rendering", () =>
    expect(render({ component: "Split", props: {}, children: [] } as never, ctx)).toContain(
      "<aside>L</aside><main>R</main>",
    ));
  test("ratio wraps children with flex values", () => {
    const html = render(
      {
        component: "Split",
        props: { ratio: "60 40" },
        children: [
          { component: "Card", props: { html: "<aside>L</aside>" }, children: [] },
          { component: "Card", props: { html: "<main>R</main>" }, children: [] },
        ],
      } as never,
      ctx,
    );
    expect(html).toContain(
      '<div style="flex:60 1 0"><aside>L</aside></div><div style="flex:40 1 0"><main>R</main></div>',
    );
  });
});
