import { describe, expect, test } from "bun:test";

import render from "./TabBar.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };

describe("TabBar primitive", () => {
  test("renders a tablist wrapper", () =>
    expect(
      render({ component: "TabBar", props: { tabs: ["structure"] }, children: [] } as never, ctx),
    ).toContain('role="tablist"'));
  test("renders one button per tab", () =>
    expect(
      (
        render(
          {
            component: "TabBar",
            props: { tabs: ["structure", "dynamics", "agency"] },
            children: [],
          } as never,
          ctx,
        ).match(/<button/g) ?? []
      ).length,
    ).toBe(3));
  test("active tab gets aria-selected true", () =>
    expect(
      render(
        {
          component: "TabBar",
          props: { tabs: ["structure", "dynamics"], active: "dynamics" },
          children: [],
        } as never,
        ctx,
      ),
    ).toContain('aria-selected="true">Dynamics</button>'));
  test("inactive tab gets aria-selected false", () =>
    expect(
      render(
        {
          component: "TabBar",
          props: { tabs: ["structure", "dynamics"], active: "dynamics" },
          children: [],
        } as never,
        ctx,
      ),
    ).toContain('aria-selected="false">Structure</button>'));
  test("buttons dispatch through ui.set metadata", () =>
    expect(
      render({ component: "TabBar", props: { tabs: ["structure"] }, children: [] } as never, ctx),
    ).toContain('data-action-ref="ui.set"'));
  test("tab value metadata preserves the tab name", () =>
    expect(
      render({ component: "TabBar", props: { tabs: ["modelWorld"] }, children: [] } as never, ctx),
    ).toContain('data-value="modelWorld"'));
  test("camelCase tab labels are title-cased for display", () =>
    expect(
      render({ component: "TabBar", props: { tabs: ["modelWorld"] }, children: [] } as never, ctx),
    ).toContain(">Model World</button>"));
  test("kebab-case tab labels are normalized for display", () =>
    expect(
      render(
        { component: "TabBar", props: { tabs: ["recent-events"] }, children: [] } as never,
        ctx,
      ),
    ).toContain(">Recent events</button>"));
  test("custom ctxPath metadata is preserved on tab buttons", () =>
    expect(
      render(
        {
          component: "TabBar",
          props: { tabs: ["structure"], ctxPath: "$ctx.panel" },
          children: [],
        } as never,
        ctx,
      ),
    ).toContain('data-ctx-path="$ctx.panel"'));
  test("custom ui path metadata is preserved on tab buttons", () =>
    expect(
      render(
        {
          component: "TabBar",
          props: { tabs: ["structure"], path: "selectedTab" },
          children: [],
        } as never,
        ctx,
      ),
    ).toContain('data-ui-set-path="selectedTab"'));
  test("inactive tabs remain unselected when no active prop matches", () =>
    expect(
      render(
        {
          component: "TabBar",
          props: { tabs: ["structure", "dynamics"], active: "agency" },
          children: [],
        } as never,
        ctx,
      ).match(/aria-selected="true"/g) ?? [],
    ).toHaveLength(0));
});
