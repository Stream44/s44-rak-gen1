import { describe, expect, test } from "bun:test";

import { renderHtmlTree } from "./render-html.ts";
import type { ProjectionTree } from "../L01-foundation/projection-types.ts";

const tree = (root: unknown): ProjectionTree =>
  ({
    projector: "test",
    version: "1.0.0",
    origin: "https://test.local/render-html",
    title: "",
    body: null,
    root: root as ProjectionTree["root"],
    pages: [],
    routes: [],
    actionBindings: [],
    actionHandlers: [],
    contextDefaults: {},
    urlSyncEntries: [],
  }) as unknown as ProjectionTree;

describe("render-html renderListChildren", () => {
  test("mirrors top-level child class onto the <li> wrapper", () => {
    const out = renderHtmlTree(
      tree({
        component: "List",
        nodeId: "n1",
        props: { class: "todo-list" },
        children: [
          {
            component: "Text",
            nodeId: "n2",
            props: { class: "completed", text: "done" },
            children: [],
          },
          { component: "Text", nodeId: "n3", props: { class: "", text: "todo" }, children: [] },
        ],
      }),
    );

    expect(out.html).toContain('<li class="completed">');
    expect(out.html).toContain("<li>"); // second item has empty class -> plain <li>
  });

  test("keeps the class on the inner child as well (for nested selectors like 'li a.selected')", () => {
    const out = renderHtmlTree(
      tree({
        component: "List",
        nodeId: "n1",
        props: { class: "filters" },
        children: [
          {
            component: "Link",
            nodeId: "n2",
            props: { href: "#/", label: "All", class: "selected" },
            children: [],
          },
        ],
      }),
    );

    expect(out.html).toContain('<li class="selected">');
    expect(out.html).toContain('class="selected"'); // also on the inner <a>
    // Sanity: both should appear (class on li AND on a).
    const matches = (out.html.match(/class="selected"/g) ?? []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });
});
