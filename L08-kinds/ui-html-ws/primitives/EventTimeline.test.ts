import { describe, expect, test } from "bun:test";

import render from "./EventTimeline.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };
const node = (props: Record<string, unknown> = {}) =>
  ({ component: "EventTimeline", props, children: [] }) as never;
const events = [
  {
    ts: "2026-04-22T14:02:03Z",
    label: "cancel ord-001",
    tone: "ok",
    detail: "done",
    cid: "bafy-1",
  },
  { ts: "2026-04-22T15:00:00Z", label: "rebind ord-001", tone: "warn", cid: "bafy-2" },
] as const;

describe("EventTimeline primitive", () => {
  test("renders one event per item", () =>
    expect(render(node({ events }), ctx).match(/timeline-event/g)?.length ?? 0).toBe(2));
  test("respects emptyMessage when events are empty", () =>
    expect(render(node({ events: [], emptyMessage: "No audit" }), ctx)).toContain("No audit"));
  test("groups by day", () =>
    expect(render(node({ events, groupBy: "day" }), ctx)).toContain("<h4>2026-04-22</h4>"));
  test("clickable mode emits ui.set actions", () =>
    expect(
      render(
        node({
          events,
          clickable: true,
          onClickSelect: { path: "selection.auditId", valueField: "cid" },
        }),
        ctx,
      ),
    ).toContain('data-action-ref="ui.set"'));
  test("reverseOrder flips rendered events", () => {
    const html = render(node({ events, reverseOrder: true }), ctx);
    expect(html.indexOf("rebind ord-001")).toBeLessThan(html.indexOf("cancel ord-001"));
  });
});
