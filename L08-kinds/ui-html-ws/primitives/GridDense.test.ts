import { describe, expect, test } from "bun:test";

import render from "./GridDense.ts";

const ctx = { renderChildren: () => "<span>A</span><span>B</span>", renderListChildren: () => "" };
const node = (props: Record<string, unknown> = {}) =>
  ({ component: "GridDense", props, children: [] }) as never;

describe("GridDense primitive", () => {
  test("default cols is 4", () =>
    expect(render(node(), ctx)).toContain(
      "--cols: 4; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr))",
    ));
  test("cols clamps low values to 1", () =>
    expect(render(node({ cols: 0 }), ctx)).toContain("--cols: 1;"));
  test("cols clamps high values to 12", () =>
    expect(render(node({ cols: 99 }), ctx)).toContain("--cols: 12;"));
  test("id class and style props pass through", () =>
    expect(render(node({ id: "dense", class: "compact", style: "gap: 8px" }), ctx)).toContain(
      'class="grid-dense compact" style="--cols: 4; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr)); gap: 8px" id="dense"',
    ));
  test("children render inside the dense grid", () =>
    expect(render(node(), ctx)).toContain("<span>A</span><span>B</span>"));
});
