import { describe, expect, test } from "bun:test";
import { MetaLevel, TypeRegistry } from "../L13-facade/index.ts";
import type { TypeDef } from "../L13-facade/index.ts";

const define = (registry: TypeRegistry, id: string) => {
  const typeDef: TypeDef = {
    id,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    schema: { type: "object", properties: {} },
    name: id.split("/").at(-2),
  };
  return { cid: registry.defineType(typeDef), typeDef };
};

describe("Layer 7: TypeRegistry audit log", () => {
  test("fresh registry history is empty", () => {
    expect(new TypeRegistry().history()).toEqual([]);
  });

  test("defineType records a type:defined event", () => {
    const registry = new TypeRegistry();
    const entry = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Person/1.0");
    const [event] = registry.history();
    expect(event?.op).toBe("type:defined");
    expect(event?.cid).toBe(entry.cid);
    expect(event?.name).toBeUndefined();
  });

  test("multiple defineType calls append in order", () => {
    const registry = new TypeRegistry();
    const x = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/X/1.0");
    const y = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Y/1.0");
    expect(registry.history().map((event) => event.cid)).toEqual([x.cid, y.cid]);
  });

  test("bind appends registry:rebound after type:defined", () => {
    const registry = new TypeRegistry();
    const x = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Foo/1.0");
    registry.bind("foo", x.cid);
    expect(registry.history().map((event) => event.op)).toEqual([
      "type:defined",
      "registry:rebound",
    ]);
  });

  test("rebind records oldCid on the later entry", () => {
    const registry = new TypeRegistry();
    const x = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Foo/1.0");
    const y = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Foo/2.0");
    registry.bind("foo", x.cid);
    registry.bind("foo", y.cid);
    const event = registry.history().at(-1);
    expect(event?.op).toBe("registry:rebound");
    expect(event?.cid).toBe(y.cid);
    expect(event?.oldCid).toBe(x.cid);
    expect(event?.name).toBe("foo");
  });

  test("history filters by name", () => {
    const registry = new TypeRegistry();
    const x = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Foo/1.0");
    const y = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Bar/1.0");
    registry.bind("foo", x.cid);
    registry.bind("bar", y.cid);
    expect(registry.history({ name: "foo" })).toEqual([{ ...registry.history()[2] }]);
  });

  test("history filters by cid", () => {
    const registry = new TypeRegistry();
    const x = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Foo/1.0");
    const y = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Bar/1.0");
    registry.bind("foo", x.cid);
    registry.bind("bar", y.cid);
    expect(registry.history({ cid: x.cid }).map((event) => event.op)).toEqual([
      "type:defined",
      "registry:rebound",
    ]);
  });

  test("timestamps are monotonically non-decreasing", () => {
    const registry = new TypeRegistry();
    const x = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Foo/1.0");
    registry.bind("foo", x.cid);
    const events = registry.history();
    expect(events.every((event, index) => index === 0 || events[index - 1]!.ts <= event.ts)).toBe(
      true,
    );
  });

  test("history returns detached copies", () => {
    const registry = new TypeRegistry();
    const x = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Foo/1.0");
    const history = registry.history();
    history.push({ ts: -1, op: "type:defined", cid: "cid:sha256:fake" });
    history[0]!.cid = "cid:sha256:mutated";
    registry.bind("foo", x.cid);
    expect(registry.history().map((event) => event.cid)).toEqual([x.cid, x.cid]);
  });

  test("rebound events carry name while type:defined does not", () => {
    const registry = new TypeRegistry();
    const x = define(registry, "type://github.com/Stream44/s44-rak-gen1@1.0/Foo/1.0");
    registry.bind("foo", x.cid);
    const [defined, rebound] = registry.history();
    expect(defined?.name).toBeUndefined();
    expect(rebound?.name).toBe("foo");
  });
});
