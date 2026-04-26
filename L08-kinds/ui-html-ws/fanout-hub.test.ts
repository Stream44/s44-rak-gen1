import { describe, expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import { LastNFrameBuffer } from "./frame-buffer.ts";
import { FanoutHub } from "./fanout-hub.ts";
import type { SplitArtefact } from "./split-pass.ts";
import type { ClientFrame, ServerFrame } from "./wire-protocol.ts";

type TaggedFrame = ServerFrame & { scope?: string | string[] };
type FakeSocket = ServerWebSocket<unknown> & {
  sent: string[];
  clear(): void;
  frames(): Array<Record<string, unknown>>;
};

const skeleton = (version = 1): ServerFrame => ({
  type: "skeleton",
  version,
  html: "<div>shell</div>",
  slots: [],
});
const patch = (slotId: string, value: unknown, scope?: string | string[]): TaggedFrame => ({
  type: "patch",
  version: 1,
  updates: [{ slotId, value }],
  ...(scope ? { scope } : {}),
});
const list = (slotId: string, key: string): ServerFrame => ({
  type: "list",
  version: 1,
  slotId,
  op: "append",
  rows: [{ key, html: `<li>${key}</li>` }],
});
const artefact = (): SplitArtefact => ({
  skeleton: "<div>shell</div>",
  slots: [],
  dependents: new Map([["$ws", new Set(["slot"])]]),
});
const socket = (): FakeSocket =>
  ({
    sent: [],
    send(data: string) {
      this.sent.push(data);
    },
    clear() {
      this.sent.length = 0;
    },
    frames() {
      return this.sent.map((entry) => JSON.parse(entry) as Record<string, unknown>);
    },
  }) as FakeSocket;

class FakeEmitter {
  emitCalls = 0;
  private queue: TaggedFrame[][] = [];
  push(...frames: TaggedFrame[]): void {
    this.queue.push(frames);
  }
  emit(): ServerFrame[] {
    this.emitCalls += 1;
    return this.queue.shift() ?? [];
  }
  skeletonFrame(): ServerFrame {
    return skeleton();
  }
}

function register(
  hub: FanoutHub,
  projectionId: string,
  emitter: FakeEmitter,
  buffer = new LastNFrameBuffer(32),
) {
  hub.registerProjection({
    projectionId,
    version: 1,
    artefact: artefact(),
    emitter: emitter as never,
    buffer,
  });
  return buffer;
}

describe("FanoutHub", () => {
  test("3-client multi-user fans a scoped frame to matching clients only", () => {
    const hub = new FanoutHub(),
      emitter = new FakeEmitter();
    register(hub, "P1", emitter);
    const a = socket(),
      b = socket(),
      c = socket();
    hub.addClient("P1", { socket: a, version: 1, subscriptionScope: ["user:1"] });
    hub.addClient("P1", { socket: b, version: 1, subscriptionScope: ["user:2"] });
    hub.addClient("P1", { socket: c, version: 1, subscriptionScope: "*" });
    a.clear();
    b.clear();
    c.clear();
    emitter.push(patch("slot", "alpha", "user:1"));
    hub.onStateChange("P1", ["$ws"]);
    expect(a.frames()).toEqual([patch("slot", "alpha", "user:1")]);
    expect(b.frames()).toEqual([]);
    expect(c.frames()).toEqual([patch("slot", "alpha", "user:1")]);
    expect(emitter.emitCalls).toBe(1);
  });

  test("addClient sends one skeleton to the new client only", () => {
    const hub = new FanoutHub(),
      emitter = new FakeEmitter();
    register(hub, "P1", emitter);
    const a = socket(),
      b = socket();
    hub.addClient("P1", { socket: a, version: 1, subscriptionScope: "*" });
    expect(a.frames()).toEqual([skeleton()]);
    hub.addClient("P1", { socket: b, version: 1, subscriptionScope: "*" });
    expect(a.frames()).toEqual([skeleton()]);
    expect(b.frames()).toEqual([skeleton()]);
  });

  test("reconnection replay returns exactly the missed frames in order", () => {
    const hub = new FanoutHub(),
      emitter = new FakeEmitter();
    register(hub, "P1", emitter);
    const c1 = socket();
    hub.addClient("P1", { socket: c1, version: 1, subscriptionScope: "*" });
    c1.clear();
    emitter.push(
      patch("slot", 1),
      patch("slot", 2),
      patch("slot", 3),
      patch("slot", 4),
      patch("slot", 5),
    );
    hub.onStateChange("P1", ["$ws"]);
    expect(
      c1.frames().map((frame) => (frame.updates as Array<{ value: number }>)[0]?.value),
    ).toEqual([1, 2, 3, 4, 5]);
    hub.removeClient(c1);
    emitter.push(patch("slot", 6), patch("slot", 7), patch("slot", 8));
    hub.onStateChange("P1", ["$ws"]);
    const c2 = socket();
    hub.addClient("P1", { socket: c2, version: 1, subscriptionScope: "*" });
    expect(c2.frames()).toEqual([skeleton()]);
    hub.onClientFrame(c2, { type: "ack", seen: 1 });
    expect(
      c2
        .frames()
        .slice(1)
        .map((frame) => (frame.updates as Array<{ value: number }>)[0]?.value),
    ).toEqual([6, 7, 8]);
  });

  test("stale ack returns a fresh skeleton instead of replay", () => {
    const hub = new FanoutHub(),
      emitter = new FakeEmitter();
    register(hub, "P1", emitter);
    const d = socket();
    hub.addClient("P1", { socket: d, version: 1, subscriptionScope: "*" });
    d.clear();
    emitter.push(patch("slot", "stale"));
    hub.onStateChange("P1", ["$ws"]);
    d.clear();
    hub.onClientFrame(d, { type: "ack", seen: 0 });
    expect(d.frames()).toEqual([skeleton()]);
  });

  test("ring buffer evicts FIFO when capacity is exceeded", () => {
    const buffer = new LastNFrameBuffer(4);
    for (let index = 1; index <= 5; index += 1) buffer.push(1, patch("slot", index));
    expect(
      buffer
        .sliceSince(0, 1)
        .map((frame) => (frame as Extract<ServerFrame, { type: "patch" }>).updates[0]?.value),
    ).toEqual([2, 3, 4, 5]);
  });

  test("multi-projection registrations isolate fan-out", () => {
    const hub = new FanoutHub(),
      emitter1 = new FakeEmitter(),
      emitter2 = new FakeEmitter();
    register(hub, "P1", emitter1);
    register(hub, "P2", emitter2);
    const a = socket(),
      b = socket();
    hub.addClient("P1", { socket: a, version: 1, subscriptionScope: "*" });
    hub.addClient("P2", { socket: b, version: 1, subscriptionScope: "*" });
    a.clear();
    b.clear();
    emitter1.push(patch("slot", "P1"));
    hub.onStateChange("P1", ["$ws"]);
    expect(a.frames()).toEqual([patch("slot", "P1")]);
    expect(b.frames()).toEqual([]);
  });

  test("frame order is preserved within one state-change emission", () => {
    const hub = new FanoutHub(),
      emitter = new FakeEmitter();
    register(hub, "P1", emitter);
    const a = socket(),
      b = socket();
    hub.addClient("P1", { socket: a, version: 1, subscriptionScope: "*" });
    hub.addClient("P1", { socket: b, version: 1, subscriptionScope: "*" });
    a.clear();
    b.clear();
    emitter.push(patch("title", "A"), list("rows", "r1"));
    hub.onStateChange("P1", ["$ws"]);
    expect(a.frames().map((frame) => frame.type)).toEqual(["patch", "list"]);
    expect(b.frames().map((frame) => frame.type)).toEqual(["patch", "list"]);
  });

  test("removeClient is idempotent and leaves other clients untouched", () => {
    const hub = new FanoutHub(),
      emitter = new FakeEmitter();
    register(hub, "P1", emitter);
    const a = socket(),
      b = socket();
    hub.addClient("P1", { socket: a, version: 1, subscriptionScope: "*" });
    hub.addClient("P1", { socket: b, version: 1, subscriptionScope: "*" });
    a.clear();
    b.clear();
    hub.removeClient(a);
    hub.removeClient(a);
    emitter.push(patch("slot", "still-here"));
    expect(() => hub.onStateChange("P1", ["$ws"])).not.toThrow();
    expect(a.frames()).toEqual([]);
    expect(b.frames()).toEqual([patch("slot", "still-here")]);
  });

  test("JSON serialization is deduplicated for clients sharing version and scope", () => {
    const hub = new FanoutHub(),
      emitter = new FakeEmitter();
    register(hub, "P1", emitter);
    const a = socket(),
      b = socket();
    hub.addClient("P1", { socket: a, version: 1, subscriptionScope: ["user:1"] });
    hub.addClient("P1", { socket: b, version: 1, subscriptionScope: ["user:1"] });
    a.clear();
    b.clear();
    const original = JSON.stringify;
    let patchSerializations = 0;
    JSON.stringify = ((
      value: Parameters<typeof JSON.stringify>[0],
      replacer?: Parameters<typeof JSON.stringify>[1],
      space?: Parameters<typeof JSON.stringify>[2],
    ) => {
      if (value && typeof value === "object" && "type" in value && value.type === "patch")
        patchSerializations += 1;
      return original(value, replacer, space);
    }) as typeof JSON.stringify;
    try {
      emitter.push(patch("slot", "shared", "user:1"));
      hub.onStateChange("P1", ["$ws"]);
    } finally {
      JSON.stringify = original;
    }
    expect(patchSerializations).toBe(1);
    expect(a.sent[0]).toBe(b.sent[0]);
  });

  test("action and custom frames pass through while ui-set is swallowed", () => {
    const hub = new FanoutHub(),
      emitter = new FakeEmitter();
    register(hub, "P1", emitter);
    const ws = socket();
    hub.addClient("P1", { socket: ws, version: 1, subscriptionScope: "*" });
    expect(hub.onClientFrame(ws, { type: "action", ref: "confirm", payload: { id: 1 } })).toEqual({
      handled: false,
      passthrough: { type: "action", ref: "confirm", payload: { id: 1 } },
    });
    expect(
      hub.onClientFrame(ws, { type: "custom", name: "tab.select", payload: { tab: "x" } }),
    ).toEqual({
      handled: false,
      passthrough: { type: "custom", name: "tab.select", payload: { tab: "x" } },
    });
    expect(
      hub.onClientFrame(ws, {
        type: "ui-set",
        ctxPath: "$ctx.page",
        path: "activeTab",
        value: "dynamics",
      }),
    ).toEqual({ handled: true });
  });
});
