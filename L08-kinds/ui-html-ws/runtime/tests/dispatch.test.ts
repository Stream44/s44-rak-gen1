import { describe, expect, test } from "bun:test";

import { Dispatcher } from "../dispatch.ts";

describe("Dispatcher", () => {
  test("sendAction serialises a ClientFrame when the socket is open", () => {
    const sent: string[] = [];
    const dispatcher = new Dispatcher(
      () => ({ readyState: 1, send: (frame: string) => sent.push(frame) }),
      () => 7,
    );
    dispatcher.sendAction("morphism://x", { ok: true }, "button", "$ui.page");
    expect(JSON.parse(sent[0])).toEqual({
      type: "action",
      ref: "morphism://x",
      payload: { ok: true },
      target: "button",
      ctxPath: "$ui.page",
    });
  });

  test("offline queue drains in FIFO order after ack release", () => {
    const sent: string[] = [];
    let socket: { readyState: number; send: (frame: string) => void } | null = null;
    const dispatcher = new Dispatcher(
      () => socket,
      () => 0,
    );
    dispatcher.sendAction("first");
    dispatcher.sendCustom("second");
    socket = { readyState: 1, send: (frame) => sent.push(frame) };
    dispatcher.sendAck(0);
    dispatcher.release();
    expect(sent.map((frame) => JSON.parse(frame).type)).toEqual(["ack", "action", "custom"]);
  });
});
