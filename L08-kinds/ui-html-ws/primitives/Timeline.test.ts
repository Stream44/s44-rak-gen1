import { describe, expect, test } from "bun:test";

import render from "./Timeline.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };
const node = (props: Record<string, unknown> = {}) =>
  ({ component: "Timeline", props, children: [] }) as never;

describe("Timeline primitive", () => {
  test("empty events render the empty timeline class", () =>
    expect(render(node(), ctx)).toBe('<ol class="timeline timeline-empty"></ol>'));
  test("event rows render timestamp, label, tone, and detail", () =>
    expect(
      render(
        node({
          events: [
            { ts: "2026-04-22T10:00:00Z", label: "loaded", tone: "ok", detail: "kernel ready" },
          ],
        }),
        ctx,
      ),
    ).toContain('data-tone="ok"'));
  test("groupBy day inserts one header per day", () =>
    expect(
      render(
        node({
          groupBy: "day",
          events: [
            { ts: "2026-04-22T10:00:00Z", label: "a" },
            { ts: "2026-04-22T12:00:00Z", label: "b" },
            { ts: "2026-04-23T09:00:00Z", label: "c" },
          ],
        }),
        ctx,
      ).match(/timeline-group-label/g)?.length ?? 0,
    ).toBe(2));
  test("reverseOrder flips the rendered event order", () => {
    const html = render(
      node({
        reverseOrder: true,
        events: [
          { ts: "2026-04-22T10:00:00Z", label: "first" },
          { ts: "2026-04-22T11:00:00Z", label: "second" },
        ],
      }),
      ctx,
    );
    expect(html.indexOf("second")).toBeLessThan(html.indexOf("first"));
  });
  test("legacy rows are normalized with derived tone mapping", () =>
    expect(
      render(
        node({ rows: [{ timestamp: "2026-04-22T10:00:00Z", op: "warn:drift", subject: "cache" }] }),
        ctx,
      ),
    ).toContain('data-tone="warn"'));
  test("labels and detail are HTML-escaped", () =>
    expect(
      render(
        node({
          events: [{ ts: "2026-04-22T10:00:00Z", label: '<load & "sync">', detail: "<detail>" }],
        }),
        ctx,
      ),
    ).toContain('&lt;load &amp; "sync"&gt;'));
});
