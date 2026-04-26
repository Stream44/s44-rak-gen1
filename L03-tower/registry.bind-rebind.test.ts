import { describe, expect, test } from "bun:test";
import { MetaLevel, TypeRegistry } from "../L13-facade/index.ts";
import type { RegistryEvent, TypeDef } from "../L13-facade/index.ts";

const define = (registry: TypeRegistry, id: string): { cid: string; typeDef: TypeDef } => {
  const typeDef: TypeDef = {
    id,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    schema: { type: "object", properties: {} },
    name: id.split("/").at(-2),
  };
  return { cid: registry.defineType(typeDef), typeDef };
};

describe("Layer 7: TypeRegistry bind/rebind", () => {
  test("bind with unknown CID throws", () => {
    expect(() => new TypeRegistry().bind("Person", "cid:sha256:missing")).toThrow(
      "Registry.bind: unknown cid cid:sha256:missing",
    );
  });

  test("bind with known CID sets name mapping", () => {
    const registry = new TypeRegistry();
    const entry = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0");
    registry.bind("Person", entry.cid);
    expect(registry.resolveByName("Person")?.cid).toBe(entry.cid);
  });

  test("resolveByName returns cid and typeDef", () => {
    const registry = new TypeRegistry();
    const entry = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Order/1.0");
    registry.bind("Order", entry.cid);
    expect(registry.resolveByName("Order")).toEqual(entry);
  });

  test("resolveByName returns null for unknown name", () => {
    expect(new TypeRegistry().resolveByName("Missing")).toBeNull();
  });

  test("bind same name and cid again is a no-op", () => {
    const registry = new TypeRegistry();
    const entry = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0");
    const events: RegistryEvent[] = [];
    let rebinds = 0;
    registry.on((event) => events.push(event));
    registry.onRebind(() => (rebinds += 1));
    registry.bind("Person", entry.cid);
    registry.bind("Person", entry.cid);
    expect(events.filter((event) => event.kind === "registry:rebound")).toHaveLength(1);
    expect(rebinds).toBe(1);
  });

  test("bind different cid under same name emits rebound event", () => {
    const registry = new TypeRegistry();
    const person = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0");
    const personV2 = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Person/2.0");
    const events: RegistryEvent[] = [];
    registry.on((event) => events.push(event));
    registry.bind("Person", person.cid);
    registry.bind("Person", personV2.cid);
    expect(events.filter((event) => event.kind === "registry:rebound")).toEqual([
      { kind: "registry:rebound", name: "Person", oldCid: null, newCid: person.cid },
      { kind: "registry:rebound", name: "Person", oldCid: person.cid, newCid: personV2.cid },
    ]);
  });

  test("rebind is an alias for bind", () => {
    const registry = new TypeRegistry();
    const first = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Invoice/1.0");
    const second = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Invoice/2.0");
    registry.bind("Invoice", first.cid);
    registry.rebind("Invoice", second.cid);
    expect(registry.resolveByName("Invoice")).toEqual({ cid: second.cid, typeDef: second.typeDef });
  });

  test("onRebind unsubscribes", () => {
    const registry = new TypeRegistry();
    const first = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Asset/1.0");
    const second = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Asset/2.0");
    const seen: string[] = [];
    const off = registry.onRebind((event) => seen.push(event.newCid));
    registry.bind("Asset", first.cid);
    off();
    registry.bind("Asset", second.cid);
    expect(seen).toEqual([first.cid]);
  });

  test("rebind event propagates through existing registry listeners", () => {
    const registry = new TypeRegistry();
    const entry = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Report/1.0");
    const events: RegistryEvent[] = [];
    registry.on((event) => events.push(event));
    registry.bind("Report", entry.cid);
    expect(events[0]).toEqual({
      kind: "registry:rebound",
      name: "Report",
      oldCid: null,
      newCid: entry.cid,
    });
  });

  test("bind followed by resolveByName returns the new cid consistently", () => {
    const registry = new TypeRegistry();
    const first = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Case/1.0");
    const second = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Case/2.0");
    registry.bind("Case", first.cid);
    registry.bind("Case", second.cid);
    expect(registry.resolveByName("Case")?.cid).toBe(second.cid);
  });

  test("first bind emits oldCid null for unseen names", () => {
    const registry = new TypeRegistry();
    const entry = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Event/1.0");
    const seen: Array<string | null> = [];
    registry.onRebind((event) => seen.push(event.oldCid));
    registry.bind("Event", entry.cid);
    expect(seen).toEqual([null]);
  });
});
