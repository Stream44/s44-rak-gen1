import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";

import init from "../runtime/client.ts";
import render from "./EditableText.ts";

const ctx = { renderChildren: () => "", renderListChildren: () => "" };

const original = {
  window: globalThis.window,
  document: globalThis.document,
  navigator: globalThis.navigator,
  WebSocket: globalThis.WebSocket,
  HTMLElement: globalThis.HTMLElement,
  Event: globalThis.Event,
  MouseEvent: globalThis.MouseEvent,
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

const installDom = (html: string) => {
  const dom = new JSDOM(`<!doctype html><html><body><div id="root"></div>${html}</body></html>`, {
    url: "http://example.test/",
  });
  globalThis.window = dom.window as never;
  globalThis.document = dom.window.document as never;
  globalThis.navigator = dom.window.navigator as never;
  globalThis.HTMLElement = dom.window.HTMLElement as never;
  globalThis.Event = dom.window.Event as never;
  globalThis.MouseEvent = dom.window.MouseEvent as never;
  globalThis.KeyboardEvent = dom.window.KeyboardEvent as never;
  globalThis.FocusEvent = dom.window.FocusEvent as never;
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 1;
  }) as never;
  globalThis.cancelAnimationFrame = (() => {}) as never;
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
  globalThis.MouseEvent = original.MouseEvent;
  globalThis.KeyboardEvent = original.KeyboardEvent;
  globalThis.FocusEvent = original.FocusEvent;
  globalThis.requestAnimationFrame = original.requestAnimationFrame;
  globalThis.cancelAnimationFrame = original.cancelAnimationFrame;
});

describe("EditableText primitive", () => {
  test("renders a span when editing is false", () => {
    const html = render(
      {
        component: "EditableText",
        props: { value: "Ship it", editing: false, id: "todo-1" },
        children: [],
      } as never,
      ctx,
    );
    expect(html).toContain("<span");
    expect(html).toContain(">Ship it</span>");
  });

  test("renders an input with the bound value when editing is true", () => {
    const html = render(
      {
        component: "EditableText",
        props: { value: "Ship it", editing: true, id: "todo-1", placeholder: "Rename" },
        children: [],
      } as never,
      ctx,
    );
    expect(html).toContain('<input type="text"');
    expect(html).toContain('class="edit"');
    expect(html).toContain('value="Ship it"');
    expect(html).toContain("autofocus");
  });

  test("renders onEditEnd attributes when present", () => {
    const html = render(
      {
        component: "EditableText",
        props: {
          value: "Ship it",
          editing: true,
          id: "todo-1",
          onEditEnd: { action: "ui.set", payload: { path: "editingId", value: "" } },
        },
        children: [],
      } as never,
      ctx,
    );
    expect(html).toContain('data-editable-end="ui.set"');
    expect(html).toContain(
      'data-editable-end-payload="{&quot;path&quot;:&quot;editingId&quot;,&quot;value&quot;:&quot;&quot;}"',
    );
  });

  test("does not render onEditEnd attributes when absent", () => {
    const html = render(
      {
        component: "EditableText",
        props: { value: "Ship it", editing: true, id: "todo-1" },
        children: [],
      } as never,
      ctx,
    );
    expect(html).not.toContain("data-editable-end=");
    expect(html).not.toContain("data-editable-end-payload=");
  });

  test("double-click on the span emits the start action frame", () => {
    const html = render(
      {
        component: "EditableText",
        props: {
          "value": "Ship it",
          "editing": false,
          "id": "todo-1",
          "data-ctx-path": "todoItem",
          "onEditStart": { action: "ui.set", payload: { path: "editingId", value: "todo-1" } },
        },
        children: [],
      } as never,
      ctx,
    );
    installDom(html);
    init();
    const ws = MockWebSocket.instances[0]!;
    ws.readyState = 1;
    ws.onopen?.();

    document
      .querySelector("span")!
      .dispatchEvent(new window.MouseEvent("dblclick", { bubbles: true, cancelable: true }));

    expect(latestActionFrame()).toEqual({
      type: "action",
      ref: "ui.set",
      target: "ui.set",
      payload: { path: "editingId", value: "todo-1" },
      ctxPath: "todoItem",
    });
  });

  test("Enter on the input emits the commit action with id and value", () => {
    const html = render(
      {
        component: "EditableText",
        props: {
          value: "Ship it",
          editing: true,
          id: "todo-1",
          onEditCommit: { action: "EditTodo", payload: { mode: "rename" } },
        },
        children: [],
      } as never,
      ctx,
    );
    installDom(html);
    init();
    const ws = MockWebSocket.instances[0]!;
    ws.readyState = 1;
    ws.onopen?.();

    const input = document.querySelector("input") as HTMLInputElement;
    input.value = "Ship it now";
    input.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }),
    );

    expect(latestActionFrame()).toEqual({
      type: "action",
      ref: "EditTodo",
      target: "todo-1",
      payload: { mode: "rename", id: "todo-1", value: "Ship it now" },
      ctxPath: "page",
    });
  });

  test("Escape on the input emits the cancel action with id", () => {
    const html = render(
      {
        component: "EditableText",
        props: {
          value: "Ship it",
          editing: true,
          id: "todo-1",
          onEditCommit: { action: "EditTodo" },
          onEditCancel: { action: "CancelEdit" },
        },
        children: [],
      } as never,
      ctx,
    );
    installDom(html);
    init();
    const ws = MockWebSocket.instances[0]!;
    ws.readyState = 1;
    ws.onopen?.();

    const input = document.querySelector("input") as HTMLInputElement;
    input.value = "Changed";
    input.dispatchEvent(
      new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }),
    );

    expect(latestActionFrame()).toEqual({
      type: "action",
      ref: "CancelEdit",
      target: "todo-1",
      payload: { id: "todo-1" },
      ctxPath: "page",
    });
  });

  test("blur on the input emits the commit action with the latest value", () => {
    const html = render(
      {
        component: "EditableText",
        props: {
          "value": "Ship it",
          "editing": true,
          "id": "todo-1",
          "data-ctx-path": "todoItem",
          "onEditCommit": { action: "EditTodo" },
        },
        children: [],
      } as never,
      ctx,
    );
    installDom(html);
    init();
    const ws = MockWebSocket.instances[0]!;
    ws.readyState = 1;
    ws.onopen?.();

    const input = document.querySelector("input") as HTMLInputElement;
    input.value = "Blur save";
    input.dispatchEvent(new window.FocusEvent("blur", { bubbles: false }));

    expect(latestActionFrame()).toEqual({
      type: "action",
      ref: "EditTodo",
      target: "todo-1",
      payload: { id: "todo-1", value: "Blur save" },
      ctxPath: "todoItem",
    });
  });
});
