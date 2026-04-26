import { describe, expect, test } from "bun:test";

import render from "./Toolbar.ts";

const ctx = {
  renderChildren: (node: { children: Array<{ props?: { html?: string } }> }) =>
    node.children.map((child) => child.props?.html ?? "").join(""),
  renderListChildren: () => "",
};
const node = (props: Record<string, unknown> = {}, children: Array<Record<string, unknown>> = []) =>
  ({ component: "Toolbar", props, children }) as never;

describe("Toolbar primitive", () => {
  test("renders a toolbar wrapper and passes through children", () =>
    expect(
      render(node({}, [{ props: { html: "<button>A</button><button>B</button>" } }]), ctx),
    ).toBe('<div class="toolbar" role="toolbar"><button>A</button><button>B</button></div>'));
  test("align prop becomes a data-align attribute", () =>
    expect(render(node({ align: "between" }), ctx)).toContain('data-align="between"'));
  test("id and class props pass through alongside the base class", () =>
    expect(render(node({ id: "main-tools", class: "compact" }), ctx)).toContain(
      'class="toolbar compact" role="toolbar" id="main-tools"',
    ));
  test("attribute values are escaped", () =>
    expect(render(node({ title: 'A "quote" <x>' }), ctx)).toContain(
      'title="A &quot;quote&quot; &lt;x>"',
    ));
});
