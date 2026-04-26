import { describe, expect, test } from "bun:test";

import { getCurrentCtxStack, type ScopeFrame, ContextResolver } from "../context.ts";
import { StateBag } from "../state-bag.ts";

type Scope = {
  scopePath: string;
  scope: string;
  initial?: Record<string, unknown>;
  mirror?: string[];
  key?: unknown;
};

const setup = (scopes: Scope[] = []) => {
  const sent: Array<{ type: "ui-set"; ctxPath: string; path: string; value: unknown }> = [];
  const resolver = new ContextResolver({
    sendUiSet: (ctxPath, path, value) => sent.push({ type: "ui-set", ctxPath, path, value }),
  } as never);
  resolver.loadFromSkeleton(scopes);
  const bag = new StateBag();
  bag.setCtxResolver(resolver);
  return { resolver, bag, sent };
};

const rowScopes = (ids: number[]) =>
  ids.map((id) => ({
    scopePath: `page/ordersPanel/row-${id}`,
    scope: "row",
    initial: { expanded: false },
    key: `row-${id}`,
  }));

describe("ContextResolver", () => {
  test("simple scope resolves $ctx.foo for a child", () => {
    const { bag } = setup([{ scopePath: "page/panel", scope: "panel", initial: { foo: 1 } }]);
    expect(bag.get("$ctx.foo", "page/panel")).toBe(1);
  });

  test("initial fallback returns the seed value before mutation", () => {
    const { resolver } = setup([{ scopePath: "page/panel", scope: "panel", initial: { foo: 7 } }]);
    expect(resolver.resolve("$ctx.foo", "page/panel")).toBe(7);
  });

  test("mutation updates subsequent reads", () => {
    const { bag } = setup([{ scopePath: "page/panel", scope: "panel", initial: { foo: 1 } }]);
    bag.setUi("page/panel", "foo", 42);
    expect(bag.get("$ctx.foo", "page/panel")).toBe(42);
  });

  test("nested scopes shadow on the same key", () => {
    const { resolver } = setup([
      { scopePath: "page/outer", scope: "outer", initial: { foo: 1 } },
      { scopePath: "page/outer/inner", scope: "inner", initial: { foo: 2 } },
    ]);
    expect(resolver.resolve("$ctx.foo", "page/outer/inner")).toBe(2);
    expect(resolver.resolve("$ctx.foo", "page/outer")).toBe(1);
  });

  test("long-form addresses outer and inner scopes directly", () => {
    const { bag } = setup([
      { scopePath: "page/outer", scope: "outer", initial: { foo: 1 } },
      { scopePath: "page/outer/inner", scope: "inner", initial: { foo: 2 } },
    ]);
    expect(bag.get("$ui.outer.foo", "page/outer/inner")).toBe(1);
    expect(bag.get("$ui.inner.foo", "page/outer")).toBe(2);
  });

  test("row-keyed reorder keeps values attached to row identity", () => {
    const { resolver } = setup([
      { scopePath: "page/ordersPanel", scope: "ordersPanel" },
      ...rowScopes([1, 2, 3, 4, 5, 42, 6, 7, 8, 9]),
    ]);
    resolver.setUi("page/ordersPanel/row-42", "expanded", true);
    resolver.loadFromSkeleton([
      { scopePath: "page/ordersPanel", scope: "ordersPanel" },
      ...rowScopes([42, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
    ]);
    expect(resolver.resolve("$ctx.expanded", "page/ordersPanel/row-42")).toBe(true);
  });

  test("a removed row id that returns later gets fresh initial state", () => {
    const { resolver } = setup([
      { scopePath: "page/ordersPanel", scope: "ordersPanel" },
      ...rowScopes([42]),
    ]);
    resolver.setUi("page/ordersPanel/row-42", "expanded", true);
    resolver.loadFromSkeleton([{ scopePath: "page/ordersPanel", scope: "ordersPanel" }]);
    resolver.loadFromSkeleton([
      { scopePath: "page/ordersPanel", scope: "ordersPanel" },
      ...rowScopes([42, 99]),
    ]);
    expect(resolver.resolve("$ctx.expanded", "page/ordersPanel/row-42")).toBe(false);
    expect(resolver.resolve("$ctx.expanded", "page/ordersPanel/row-99")).toBe(false);
  });

  test("field-scoped subscriptions only fire for the changed key", () => {
    const { resolver } = setup([
      { scopePath: "page/panel", scope: "panel", initial: { foo: 1, bar: 2 } },
    ]);
    resolver.subscribeSlot("page/panel", "foo", "S1");
    resolver.subscribeSlot("page/panel", "bar", "S2");
    resolver.setUi("page/panel", "foo", 9);
    expect([...resolver.affectedSlots]).toEqual(["S1"]);
  });

  test("field-scoped subscriptions stay isolated across sibling scopes", () => {
    const { resolver } = setup([
      { scopePath: "page/ordersPanel", scope: "ordersPanel", initial: { expanded: false } },
      { scopePath: "page/analyticsPanel", scope: "analyticsPanel", initial: { expanded: false } },
    ]);
    resolver.subscribeSlot("page/ordersPanel", "expanded", "orders");
    resolver.subscribeSlot("page/analyticsPanel", "expanded", "analytics");
    resolver.setUi("page/ordersPanel", "expanded", true);
    expect([...resolver.affectedSlots]).toEqual(["orders"]);
  });

  test("mirror roundtrip dispatches a ui-set frame for mirrored keys", () => {
    const { resolver, sent } = setup([
      { scopePath: "page/panel", scope: "panel", mirror: ["selectedId"] },
    ]);
    resolver.setUi("page/panel", "selectedId", "ord-1");
    expect(sent).toEqual([
      { type: "ui-set", ctxPath: "page/panel", path: "selectedId", value: "ord-1" },
    ]);
  });

  test("non-mirrored keys stay client-local", () => {
    const { resolver, sent } = setup([{ scopePath: "page/panel", scope: "panel", mirror: [] }]);
    resolver.setUi("page/panel", "foo", 1);
    expect(sent).toEqual([]);
  });

  test("default page scope is always present", () => {
    const { bag } = setup();
    expect(bag.get("$ui.page.anything")).toBeUndefined();
    bag.setUi("page", "x", 1);
    expect(bag.get("$ui.page.x")).toBe(1);
  });

  test("StateBag.setUi emits exactly one ui-set frame through the resolver", () => {
    const { bag, sent } = setup([{ scopePath: "page/panel", scope: "panel", mirror: ["foo"] }]);
    bag.setUi("page/panel", "foo", 1);
    expect(sent).toEqual([{ type: "ui-set", ctxPath: "page/panel", path: "foo", value: 1 }]);
  });

  test("unknown scope get is undefined and setUi throws a clear error", () => {
    const { resolver } = setup();
    expect(resolver.resolve("$ctx.foo", "page/missing")).toBeUndefined();
    expect(() => resolver.setUi("page/missing", "foo", 1)).toThrow(
      /Unknown context scopePath: page\/missing/,
    );
  });

  test("getCurrentCtxStack walks from leaf scope back to page", () => {
    const { resolver } = setup([
      { scopePath: "page/panel", scope: "panel" },
      { scopePath: "page/panel/row-42", scope: "row", key: "row-42" },
    ]);
    const stack = getCurrentCtxStack(
      (resolver as unknown as { frames: Map<string, ScopeFrame> }).frames,
      "page/panel/row-42",
    ).map((frame) => frame.scopePath);
    expect(stack).toEqual(["page/panel/row-42", "page/panel", "page"]);
  });
});
