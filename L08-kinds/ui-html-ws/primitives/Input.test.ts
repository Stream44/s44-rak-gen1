import { describe, expect, test } from "bun:test";

import render from "./Input.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };

describe("Input primitive", () => {
  test("passes submit metadata through as data attributes", () => {
    const html = render(
      {
        component: "Input",
        props: {
          "name": "todo",
          "data-submit-action": "AddTodo",
          "data-submit-payload-key": "title",
          "data-clear-on-submit": "true",
          "data-submit-on-blur": "true",
        },
        children: [],
      } as never,
      ctx,
    );
    expect(html).toContain('data-submit-action="AddTodo"');
    expect(html).toContain('data-submit-payload-key="title"');
    expect(html).toContain('data-clear-on-submit="true"');
    expect(html).toContain('data-submit-on-blur="true"');
  });

  test("renders checked attribute when props.checked is true", () => {
    const html = render(
      { component: "Input", props: { type: "checkbox", checked: true }, children: [] } as never,
      ctx,
    );
    expect(html).toContain(" checked");
  });

  test("omits checked attribute when props.checked is false/undefined", () => {
    const falseHtml = render(
      { component: "Input", props: { type: "checkbox", checked: false }, children: [] } as never,
      ctx,
    );
    expect(falseHtml).not.toContain(" checked");
    const undefHtml = render(
      { component: "Input", props: { type: "checkbox" }, children: [] } as never,
      ctx,
    );
    expect(undefHtml).not.toContain(" checked");
  });

  test("renders value attribute when provided", () => {
    const html = render(
      { component: "Input", props: { type: "text", value: "hello" }, children: [] } as never,
      ctx,
    );
    expect(html).toContain('value="hello"');
  });

  test("renders autofocus when props.autofocus is true", () => {
    const html = render(
      { component: "Input", props: { type: "text", autofocus: true }, children: [] } as never,
      ctx,
    );
    expect(html).toContain(" autofocus");
  });
});
