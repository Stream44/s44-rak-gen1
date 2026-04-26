import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import init from "../client.ts";

const original = {
  window: globalThis.window,
  document: globalThis.document,
  WebSocket: globalThis.WebSocket,
  setTimeout: globalThis.setTimeout,
};
const slot = {
  textContent: "",
  getAttribute: () => "s1",
  closest: () => null,
  setAttribute() {},
  removeAttribute() {},
};
const root = { innerHTML: "", querySelectorAll: () => [slot] };
const listeners: Record<string, (event: any) => void> = {};
const body = {
  addEventListener: (name: string, fn: (event: any) => void) => {
    listeners[name] = fn;
  },
};
const documentMock = {
  body,
  querySelector: (selector: string) =>
    selector === "#root" ? root : selector === '[data-slot-id="s1"]' ? slot : null,
  activeElement: null,
  getElementById: () => null,
};

class MockWebSocket {
  static last: MockWebSocket | null = null;
  readyState = 1;
  sent: string[] = [];
  onopen?: () => void;
  onmessage?: (event: { data: string }) => void;
  onclose?: () => void;
  constructor(_url: string) {
    MockWebSocket.last = this;
  }
  send(frame: string) {
    this.sent.push(frame);
  }
}

beforeEach(() => {
  globalThis.document = documentMock as never;
  globalThis.window = {
    location: { origin: "http://example.test" },
    getSelection: () => ({ rangeCount: 0 }),
  } as never;
  globalThis.WebSocket = MockWebSocket as never;
  globalThis.setTimeout = ((fn: () => void) => {
    fn();
    return 0;
  }) as never;
});

afterEach(() => {
  globalThis.window = original.window;
  globalThis.document = original.document;
  globalThis.WebSocket = original.WebSocket;
  globalThis.setTimeout = original.setTimeout;
});

describe("runtime integration", () => {
  test("hydrates, patches, dispatches standard and acceptance actions, reconnects, and re-acks", () => {
    init();
    const ws = MockWebSocket.last!;
    ws.onopen?.();
    ws.onmessage?.({
      data: JSON.stringify({
        type: "skeleton",
        version: 1,
        html: '<div data-slot-id="s1">old</div>',
        slots: [{ id: "s1", path: "$ws.label", kind: "text" }],
      }),
    });
    ws.onmessage?.({
      data: JSON.stringify({
        type: "patch",
        version: 1,
        updates: [{ slotId: "s1", value: "new" }],
      }),
    });
    expect(slot.textContent).toBe("new");
    const actionNode = {
      closest: () => actionNode,
      getAttribute: (name: string) =>
        (
          ({
            "data-action": "demo.click",
            "data-action-ref": "demo.click",
            "data-action-target": "btn",
            "data-action-payload": '{"id":1}',
            "data-ctx-path": "$ui.page",
          }) as Record<string, string>
        )[name] ?? null,
    };
    listeners.click?.({ target: actionNode });
    const acceptanceNode = {
      closest: () => acceptanceNode,
      getAttribute: (name: string) =>
        (
          ({
            "data-action": "acceptance.play",
            "data-action-ref": "acceptance.play",
            "data-action-target": "acceptance.play",
            "data-action-payload": '{"scenarioId":"sc-cancel-pending","traceIndex":0}',
            "data-ctx-path": "$ui.page",
          }) as Record<string, string>
        )[name] ?? null,
    };
    listeners.click?.({ target: acceptanceNode });
    expect(
      ws.sent
        .filter((frame) => JSON.parse(frame).type === "action")
        .map((frame) => JSON.parse(frame)),
    ).toEqual([
      { type: "action", ref: "demo.click", target: "btn", payload: { id: 1 }, ctxPath: "$ui.page" },
      {
        type: "action",
        ref: "acceptance.play",
        target: "acceptance.play",
        payload: { scenarioId: "sc-cancel-pending", traceIndex: 0 },
        ctxPath: "$ui.page",
      },
    ]);
    ws.onclose?.();
    const ws2 = MockWebSocket.last!;
    ws2.onopen?.();
    expect(JSON.parse(ws2.sent[0])).toEqual({ type: "ack", seen: 1 });
  });
});
