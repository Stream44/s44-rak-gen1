import { describe, expect, test } from "bun:test";

import render from "./KeyValueList.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };
const node = (props: Record<string, unknown> = {}, children: Array<Record<string, unknown>> = []) =>
  ({ component: "KeyValueList", props, children }) as never;

describe("KeyValueList primitive", () => {
  test("empty key value list renders an empty dl", () =>
    expect(render(node(), ctx)).toBe('<dl class="kv-list"></dl>'));
  test("items prop renders many pairs", () =>
    expect(
      render(
        node({
          items: [
            { label: "CPU", value: "12%" },
            { label: "RAM", value: "42%" },
          ],
        }),
        ctx,
      ),
    ).toContain("<dt>CPU</dt><dd>12%</dd><dt>RAM</dt><dd>42%</dd>"));
  test("KV child nodes render when items are absent", () =>
    expect(
      render(
        node({}, [{ component: "KV", props: { label: "Mode", value: "Dense" }, children: [] }]),
        ctx,
      ),
    ).toContain("<dt>Mode</dt><dd>Dense</dd>"));
  test("id and class props pass through", () =>
    expect(render(node({ id: "stats", class: "tight" }), ctx)).toContain(
      'class="kv-list tight" id="stats"',
    ));
  test("labels and values are HTML-escaped", () =>
    expect(render(node({ items: [{ label: 'A & "B"', value: "<ok>" }] }), ctx)).toContain(
      '<dt>A &amp; "B"</dt><dd>&lt;ok&gt;</dd>',
    ));
});
