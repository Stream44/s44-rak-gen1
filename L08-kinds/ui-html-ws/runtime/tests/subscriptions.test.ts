import { describe, expect, test } from "bun:test";

import { SubscriptionGraph } from "../subscriptions.ts";

describe("SubscriptionGraph", () => {
  test("loadFromSkeleton populates the inverse index", () => {
    const graph = new SubscriptionGraph();
    graph.loadFromSkeleton({ "$ws.x": ["s1", "s2"] });
    expect([...graph.fireAffectedSlots("$ws.x")]).toEqual(["s1", "s2"]);
  });

  test("fan-out fires both parent and exact subscriptions", () => {
    const graph = new SubscriptionGraph();
    graph.loadFromSkeleton({ "$ws.orders": ["s1"], "$ws.orders.0.status": ["s2"] });
    expect(new Set(graph.fireAffectedSlots("$ws.orders.0.status"))).toEqual(new Set(["s1", "s2"]));
  });
});
