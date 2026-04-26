import { describe, expect, test } from "bun:test";

import render from "./Pill.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };
const node = (props: Record<string, unknown> = {}) =>
  ({ component: "Pill", props, children: [] }) as never;

describe("Pill primitive", () => {
  test("renders all supported tones", () =>
    expect(
      ["info", "warning", "error", "success", "neutral"].map((tone) =>
        render(node({ label: tone, tone }), ctx),
      ),
    ).toEqual([
      '<span class="pill pill-info">info</span>',
      '<span class="pill pill-warning">warning</span>',
      '<span class="pill pill-error">error</span>',
      '<span class="pill pill-success">success</span>',
      '<span class="pill pill-neutral">neutral</span>',
    ]));
  test("unknown tones fall back to neutral and expose the original tone", () =>
    expect(render(node({ label: "Queued", tone: "pending" }), ctx)).toBe(
      '<span class="pill pill-neutral" data-tone-fallback="pending">Queued</span>',
    ));
  test("label text is escaped", () =>
    expect(render(node({ label: 'A&B<"', tone: "info" }), ctx)).toBe(
      '<span class="pill pill-info">A&amp;B&lt;"</span>',
    ));
  test("missing labels render an error shape", () =>
    expect(render(node({ tone: "info" }), ctx)).toBe(
      '<span class="pill pill-error" title="Pill: label is required">?</span>',
    ));
});
