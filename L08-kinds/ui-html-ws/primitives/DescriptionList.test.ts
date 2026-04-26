import { describe, expect, test } from "bun:test";

import render from "./DescriptionList.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };
const node = (props: Record<string, unknown> = {}, children: Array<Record<string, unknown>> = []) =>
  ({ component: "DescriptionList", props, children }) as never;

describe("DescriptionList primitive", () => {
  test("empty description list renders an empty dl", () =>
    expect(render(node(), ctx)).toBe('<dl class="description-list"></dl>'));
  test("items prop renders many rows", () =>
    expect(
      render(
        node({
          items: [
            { term: "A", detail: "1" },
            { term: "B", detail: "2" },
          ],
        }),
        ctx,
      ),
    ).toContain("<dt>A</dt><dd>1</dd><dt>B</dt><dd>2</dd>"));
  test("DescriptionRow child nodes render when items are absent", () =>
    expect(
      render(
        node({}, [
          { component: "DescriptionRow", props: { term: "State", detail: "Ready" }, children: [] },
        ]),
        ctx,
      ),
    ).toContain("<dt>State</dt><dd>Ready</dd>"));
  test("id and class props pass through", () =>
    expect(render(node({ id: "details", class: "wide" }), ctx)).toContain(
      'class="description-list wide" id="details"',
    ));
  test("terms and details are HTML-escaped", () =>
    expect(render(node({ items: [{ term: "<term>", detail: "A & B" }] }), ctx)).toContain(
      "<dt>&lt;term&gt;</dt><dd>A &amp; B</dd>",
    ));
});
