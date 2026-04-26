import { describe, expect, test } from "bun:test";

import render from "./Breadcrumb.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };
const node = (props: Record<string, unknown> = {}) =>
  ({ component: "Breadcrumb", props, children: [] }) as never;
const trail = [
  { label: "Kernel", onClick: { action: "ui.clear", payload: { path: "selection.typeId" } } },
  { label: "Types" },
  { label: "type://adk/Order/1.0", current: true },
] as const;

describe("Breadcrumb primitive", () => {
  test("renders one segment per trail entry", () =>
    expect(render(node({ trail }), ctx).match(/breadcrumb-segment/g)?.length ?? 0).toBe(3));
  test("marks current entries", () =>
    expect(render(node({ trail }), ctx)).toContain('data-current="true"'));
  test("renders separators between segments", () =>
    expect(render(node({ trail }), ctx).match(/breadcrumb-separator/g)?.length ?? 0).toBe(2));
  test("emits action metadata for clickable segments", () =>
    expect(render(node({ trail }), ctx)).toContain('data-action-ref="ui.clear"'));
  test("supports legacy stack props", () =>
    expect(render(node({ stack: [{ label: "Root" }, { label: "Leaf" }] }), ctx)).toContain(
      'data-action-ref="ctx.pop-to"',
    ));
});
