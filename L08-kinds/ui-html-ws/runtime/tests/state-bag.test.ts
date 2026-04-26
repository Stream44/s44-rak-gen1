import { describe, expect, test } from "bun:test";

import { StateBag } from "../state-bag.ts";

describe("StateBag", () => {
  test("four namespaces isolate values", () => {
    const bag = new StateBag();
    bag.set("$ws.x", 1);
    expect(bag.get("$ws.x")).toBe(1);
    expect(bag.get("$ui.x")).toBeUndefined();
  });

  test("path-prefix subscription fires on nested mutation", () => {
    const bag = new StateBag();
    const hits: string[] = [];
    bag.subscribe("$ws.orders", (_value, path) => hits.push(path));
    bag.set("$ws.orders.0.status", "open");
    expect(hits).toEqual(["$ws.orders.0.status"]);
  });

  test("versioned entries increment and latest value is returned", () => {
    const bag = new StateBag();
    bag.set("$ui.counter", 1);
    bag.set("$ui.counter", 2);
    expect(bag.version("$ui.counter")).toBe(2);
    expect(bag.get("$ui.counter")).toBe(2);
  });
});
