import { describe, expect, test } from "bun:test";

import render from "./SearchBox.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };

describe("SearchBox primitive", () => {
  test("bind path becomes ui-set path metadata", () =>
    expect(
      render({ component: "SearchBox", props: { bind: "$ctx.query" }, children: [] } as never, ctx),
    ).toContain('data-ui-set-path="query"'));
  test("placeholder and current value are rendered", () => {
    const html = render(
      {
        component: "SearchBox",
        props: { bind: "$ctx.query", placeholder: "Search", value: "hello" },
        children: [],
      } as never,
      ctx,
    );
    expect(html).toContain('placeholder="Search"');
    expect(html).toContain('value="hello"');
  });
  test("debounce metadata defaults to zero", () =>
    expect(
      render({ component: "SearchBox", props: { bind: "$ctx.query" }, children: [] } as never, ctx),
    ).toContain('data-debounce-ms="0"'));
  test("non-zero debounce is preserved in metadata", () =>
    expect(
      render(
        {
          component: "SearchBox",
          props: { bind: "$ctx.query", debounceMs: 150 },
          children: [],
        } as never,
        ctx,
      ),
    ).toContain('data-debounce-ms="150"'));
});
