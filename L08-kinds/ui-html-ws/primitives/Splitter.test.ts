import { describe, expect, test } from "bun:test";

import render from "./Splitter.ts";

const ctx = {
  renderChildren: (node: { children: Array<{ props?: { html?: string } }> }) =>
    node.children.map((child) => child.props?.html ?? "").join(""),
  renderListChildren: () => "",
};
const child = (html: string) => ({ component: "Pane", props: { html }, children: [] });
const node = (props: Record<string, unknown> = {}, children: Array<Record<string, unknown>> = []) =>
  ({ component: "Splitter", props, children }) as never;

describe("Splitter primitive", () => {
  test("renders horizontal orientation and default initial percent", () =>
    expect(render(node({}, [child("<aside>L</aside>"), child("<main>R</main>")]), ctx)).toContain(
      'data-orientation="horizontal" data-initial="50"',
    ));
  test("renders vertical orientation and custom initial percent", () =>
    expect(
      render(node({ orientation: "vertical", initial: 35 }, [child("A"), child("B")]), ctx),
    ).toContain('data-orientation="vertical" data-initial="35"'));
  test("keeps pane ordering with the separator between them", () =>
    expect(render(node({}, [child("<aside>L</aside>"), child("<main>R</main>")]), ctx)).toContain(
      '<div class="splitter-pane splitter-pane-a"><aside>L</aside></div><div class="splitter-handle" role="separator" tabindex="0"></div><div class="splitter-pane splitter-pane-b"><main>R</main></div>',
    ));
  test("surfaces an error shape for zero children", () =>
    expect(render(node(), ctx)).toContain("splitter-error"));
  test("surfaces an error shape for one child", () =>
    expect(render(node({}, [child("A")]), ctx)).toContain("expected exactly 2 children"));
  test("surfaces an error shape for more than two children", () =>
    expect(render(node({}, [child("A"), child("B"), child("C")]), ctx)).toContain(
      "expected exactly 2 children",
    ));
  test("id, class, and escaped attributes pass through", () =>
    expect(
      render(
        node({ id: "main-split", class: "wide", title: 'A "quote" <x>' }, [child("A"), child("B")]),
        ctx,
      ),
    ).toContain(
      'class="splitter wide" data-orientation="horizontal" data-initial="50" id="main-split" title="A &quot;quote&quot; &lt;x>"',
    ));
});
