import { describe, expect, test } from "bun:test";

import render from "./EmptyState.ts";

const ctx = (action = "") => ({ renderChildren: () => action, renderListChildren: () => "" });
const node = (props: Record<string, unknown> = {}, children: Array<Record<string, unknown>> = []) =>
  ({ component: "EmptyState", props, children }) as never;

describe("EmptyState primitive", () => {
  test("renders the message wrapper", () =>
    expect(render(node({ message: "No rows" }), ctx())).toBe(
      '<div class="empty-state"><div class="empty-state-message">No rows</div></div>',
    ));
  test("renders the action wrapper when children produce content", () =>
    expect(
      render(
        node({ message: "No rows" }, [{ component: "Button", props: {}, children: [] }]),
        ctx("<button>Retry</button>"),
      ),
    ).toBe(
      '<div class="empty-state"><div class="empty-state-message">No rows</div><div class="empty-state-action"><button>Retry</button></div></div>',
    ));
  test("omits the action wrapper when children render nothing", () =>
    expect(
      render(
        node({ message: "Still empty" }, [{ component: "Button", props: {}, children: [] }]),
        ctx(),
      ),
    ).not.toContain("empty-state-action"));
  test("escapes the message text", () =>
    expect(render(node({ message: 'Missing <rows> & "cells"' }), ctx())).toContain(
      'Missing &lt;rows&gt; &amp; "cells"',
    ));
});
