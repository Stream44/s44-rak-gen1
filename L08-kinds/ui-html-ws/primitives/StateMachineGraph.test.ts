import { describe, expect, test } from "bun:test";

import render from "./StateMachineGraph.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };
const node = (props: Record<string, unknown> = {}) =>
  ({ component: "StateMachineGraph", props, children: [] }) as never;

describe("StateMachineGraph primitive", () => {
  test("renders a matrix table with caption and axis header", () =>
    expect(
      render(node({ title: "OrderFlow", states: ["idle", "paid"], transitions: [] }), ctx),
    ).toContain(
      "<caption>OrderFlow</caption><thead><tr><th>from ⟶ to</th><th>idle</th><th>paid</th></tr></thead>",
    ));
  test("fills matching cells with transition verbs", () =>
    expect(
      render(
        node({
          states: ["idle", "paid"],
          transitions: [{ from: "idle", to: "paid", verb: "pay" }],
        }),
        ctx,
      ),
    ).toContain("<tr><th>idle</th><td></td><td>pay</td></tr>"));
  test("active states mark their row with data-has-instance", () =>
    expect(
      render(
        node({ states: ["idle", "paid"], transitions: [], currentStates: { paid: { id: 1 } } }),
        ctx,
      ),
    ).toContain('<tr data-has-instance="true"><th>paid</th>'));
  test("missing transitions render blank cells", () =>
    expect(render(node({ states: ["idle"], transitions: [] }), ctx)).toContain(
      "<tbody><tr><th>idle</th><td></td></tr></tbody>",
    ));
  test("state names and verbs are HTML-escaped", () =>
    expect(
      render(
        node({ states: ["i<dle"], transitions: [{ from: "i<dle", to: "i<dle", verb: "<go>" }] }),
        ctx,
      ),
    ).toContain("<th>i&lt;dle</th><td>&lt;go&gt;</td>"));
});
