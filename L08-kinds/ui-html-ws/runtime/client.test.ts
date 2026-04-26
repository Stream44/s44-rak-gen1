import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";

import init from "./client.ts";

const original = {
  window: globalThis.window,
  document: globalThis.document,
  navigator: globalThis.navigator,
  WebSocket: globalThis.WebSocket,
  HTMLElement: globalThis.HTMLElement,
  Event: globalThis.Event,
  KeyboardEvent: globalThis.KeyboardEvent,
  FocusEvent: globalThis.FocusEvent,
  requestAnimationFrame: globalThis.requestAnimationFrame,
  cancelAnimationFrame: globalThis.cancelAnimationFrame,
};

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

const installDom = (html: string, url = "http://example.test/") => {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`, { url });
  globalThis.window = dom.window as never;
  globalThis.document = dom.window.document as never;
  globalThis.navigator = dom.window.navigator as never;
  globalThis.HTMLElement = dom.window.HTMLElement as never;
  globalThis.Event = dom.window.Event as never;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent as never;
  globalThis.FocusEvent = dom.window.FocusEvent as never;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  }) as never;
  globalThis.cancelAnimationFrame = (() => {}) as never;
  return dom;
};

const latestActionFrame = () => {
  const ws = MockWebSocket.instances.at(-1);
  expect(ws).toBeDefined();
  const frame = ws!.sent
    .map((entry) => JSON.parse(entry))
    .findLast((entry) => entry.type === "action");
  expect(frame).toBeDefined();
  return frame;
};

const latestUiSetFrame = () => {
  const ws = MockWebSocket.instances.at(-1);
  expect(ws).toBeDefined();
  const frame = ws!.sent
    .map((entry) => JSON.parse(entry))
    .findLast((entry) => entry.type === "ui-set");
  expect(frame).toBeDefined();
  return frame;
};

beforeEach(() => {
  MockWebSocket.instances = [];
  globalThis.WebSocket = MockWebSocket as never;
});

afterEach(() => {
  globalThis.window = original.window;
  globalThis.document = original.document;
  globalThis.navigator = original.navigator;
  globalThis.WebSocket = original.WebSocket;
  globalThis.HTMLElement = original.HTMLElement;
  globalThis.Event = original.Event;
  globalThis.KeyboardEvent = original.KeyboardEvent;
  globalThis.FocusEvent = original.FocusEvent;
  globalThis.requestAnimationFrame = original.requestAnimationFrame;
  globalThis.cancelAnimationFrame = original.cancelAnimationFrame;
});

describe("runtime input submit actions", () => {
  test("Enter dispatches the submit action and clears the input when opted in", () => {
    installDom(`
      <div id="root"></div>
      <input
        id="todo"
        value="Ship it"
        data-submit-action="AddTodo"
        data-submit-payload-key="title"
        data-clear-on-submit="true"
      />
    `);
    init();
    const ws = MockWebSocket.instances[0]!;
    ws.readyState = 1;
    ws.onopen?.();

    const input = document.getElementById("todo") as HTMLInputElement;
    input.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );

    expect(latestActionFrame()).toEqual({
      type: "action",
      ref: "AddTodo",
      target: "AddTodo",
      payload: { title: "Ship it" },
      ctxPath: "page",
    });
    expect(input.value).toBe("");
  });

  test("Escape reverts the value for blur-submit inputs", () => {
    installDom(`
      <div id="root"></div>
      <input
        id="todo"
        value="Original"
        data-submit-action="SaveTodo"
        data-submit-on-blur="true"
      />
    `);
    init();
    const input = document.getElementById("todo") as HTMLInputElement;
    input.value = "Edited";

    input.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );

    expect(input.value).toBe("Original");
  });

  test("Blur dispatches the submit action when opted in", () => {
    installDom(`
      <div id="root"></div>
      <input
        id="todo"
        value="Rename me"
        data-submit-action="SaveTodo"
        data-submit-on-blur="true"
        data-submit-payload-key="title"
        data-ctx-path="todoItem"
      />
    `);
    init();
    const ws = MockWebSocket.instances[0]!;
    ws.readyState = 1;
    ws.onopen?.();

    const input = document.getElementById("todo") as HTMLInputElement;
    input.dispatchEvent(new window.FocusEvent("blur", { bubbles: false }));

    expect(latestActionFrame()).toEqual({
      type: "action",
      ref: "SaveTodo",
      target: "SaveTodo",
      payload: { title: "Rename me" },
      ctxPath: "todoItem",
    });
  });
});

describe("runtime url hash pathStyle", () => {
  test("parseHash handles #/value&k=v and sends canonical ui-set frames", async () => {
    installDom(
      `
        <script type="application/json" id="adk-url-sync">[
          {"key":"filter","scope":"page","pathStyle":true,"defaultValue":"all"},
          {"key":"activeTab","alias":"t","scope":"page"}
        ]</script>
        <div id="root"></div>
      `,
      "http://example.test/#/active&t=runtime",
    );
    init();
    const ws = MockWebSocket.instances[0]!;
    ws.readyState = 1;
    ws.onopen?.();

    await new Promise((resolve) => setTimeout(resolve, 0));

    const uiSetFrames = ws.sent
      .map((entry) => JSON.parse(entry))
      .filter((entry) => entry.type === "ui-set");
    expect(uiSetFrames).toEqual([
      { type: "ui-set", ctxPath: "page", path: "filter", value: "active" },
      { type: "ui-set", ctxPath: "page", path: "activeTab", value: "runtime" },
    ]);
  });

  test("default value is applied on empty hash and omitted from the written path segment", async () => {
    installDom(`
      <script type="application/json" id="adk-url-sync">[
        {"key":"filter","scope":"page","pathStyle":true,"defaultValue":"all"}
      ]</script>
      <div id="root"></div>
      <button
        id="all"
        data-action-ref="ui.set"
        data-ctx-path="page"
        data-ui-set-path="filter"
        data-value="all"
      >All</button>
    `);
    init();
    const ws = MockWebSocket.instances[0]!;
    ws.readyState = 1;
    ws.onopen?.();

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(latestUiSetFrame()).toEqual({
      type: "ui-set",
      ctxPath: "page",
      path: "filter",
      value: "all",
    });

    const button = document.getElementById("all") as HTMLButtonElement;
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(window.location.hash).toBe("");
  });

  test("writeHash emits #/value and preserves key=value entries for other aliases", () => {
    installDom(
      `
        <script type="application/json" id="adk-url-sync">[
          {"key":"filter","scope":"page","pathStyle":true,"defaultValue":"all"},
          {"key":"activeTab","alias":"t","scope":"page"}
        ]</script>
        <div id="root"></div>
        <button
          id="active"
          data-action-ref="ui.set"
          data-ctx-path="page"
          data-ui-set-path="filter"
          data-value="active"
        >Active</button>
      `,
      "http://example.test/#t=runtime",
    );
    init();
    const ws = MockWebSocket.instances[0]!;
    ws.readyState = 1;
    ws.onopen?.();

    const button = document.getElementById("active") as HTMLButtonElement;
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));

    expect(window.location.hash).toBe("#/active&t=runtime");
  });

  test("multiple pathStyle entries are rejected at config parse", () => {
    installDom(`
      <script type="application/json" id="adk-url-sync">[
        {"key":"filter","scope":"page","pathStyle":true,"defaultValue":"all"},
        {"key":"status","scope":"page","pathStyle":true,"defaultValue":"open"}
      ]</script>
      <div id="root"></div>
    `);

    expect(() => init()).toThrow("Only one pathStyle entry is allowed in adk-url-sync");
  });
});
