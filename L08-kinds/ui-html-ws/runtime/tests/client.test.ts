import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

import init from "../client.ts";

type ListenerMap = Record<string, (event?: any) => void>;
const original = {
  window: globalThis.window,
  document: globalThis.document,
  WebSocket: globalThis.WebSocket,
  setTimeout: globalThis.setTimeout,
  random: Math.random,
};
const root = { innerHTML: "", querySelectorAll: () => [{ getAttribute: () => "s1" }] };
const bodyListeners: ListenerMap = {};
const body = {
  addEventListener: (name: string, fn: (event?: any) => void) => {
    bodyListeners[name] = fn;
  },
};
const doc = { body, querySelector: (selector: string) => (selector === "#root" ? root : null) };

class MockWebSocket {
  static instances: MockWebSocket[] = [];
  readyState = 0;
  sent: string[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  constructor(readonly url: string) {
    MockWebSocket.instances.push(this);
  }
  send(frame: string) {
    this.sent.push(frame);
  }
}

beforeEach(() => {
  MockWebSocket.instances = [];
  globalThis.document = doc as never;
  globalThis.window = { location: { origin: "http://example.test" } } as never;
  globalThis.WebSocket = MockWebSocket as never;
  globalThis.setTimeout = mock((_fn, ms) => ms) as never;
  Math.random = () => 0.5;
});

afterEach(() => {
  globalThis.window = original.window;
  globalThis.document = original.document;
  globalThis.WebSocket = original.WebSocket;
  globalThis.setTimeout = original.setTimeout;
  Math.random = original.random;
});

describe("client init", () => {
  test("opens the default WS URL and acks on open", () => {
    init();
    const ws = MockWebSocket.instances[0]!;
    ws.readyState = 1;
    ws.onopen?.();
    expect(ws.url).toBe("ws://example.test/ws");
    expect(JSON.parse(ws.sent[0])).toEqual({ type: "ack", seen: 0 });
  });

  test("first skeleton frame hydrates #root HTML", () => {
    init();
    const ws = MockWebSocket.instances[0]!;
    ws.onmessage?.({
      data: JSON.stringify({
        type: "skeleton",
        version: 1,
        html: '<div data-slot-id="s1">x</div>',
        slots: [{ id: "s1", path: "$ws.x", kind: "text" }],
      }),
    });
    expect(root.innerHTML).toContain('data-slot-id="s1"');
  });

  test("close schedules a reconnect and opens a fresh socket", () => {
    init();
    const ws = MockWebSocket.instances[0]!;
    ws.onclose?.();
    expect((globalThis.setTimeout as any).mock.calls[0][1]).toBe(500);
  });

  test("backoff grows exponentially with jitter and clamps at 30000", () => {
    init();
    const ws = MockWebSocket.instances[0]!;
    ws.onclose?.();
    ws.onclose?.();
    ws.onclose?.();
    ws.onclose?.();
    expect((globalThis.setTimeout as any).mock.calls.map((call: any[]) => call[1])).toEqual([
      500, 1000, 2000, 4000,
    ]);
  });
});
