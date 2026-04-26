import type { ClientFrame } from "../wire-protocol.ts";

type WsRef = () => Pick<WebSocket, "readyState" | "send"> | null;

export class Dispatcher {
  queue: ClientFrame[] = [];
  private ready = true;
  constructor(
    private readonly socketRef: WsRef,
    private readonly version: () => number,
  ) {}
  send(frame: ClientFrame): void {
    const socket = this.socketRef();
    if (!socket || socket.readyState !== 1 || !this.ready) return void this.queue.push(frame);
    socket.send(JSON.stringify(frame));
  }
  sendAction(ref: string, payload?: unknown, target?: string, ctxPath?: string): void {
    this.send({
      type: "action",
      ref,
      ...(target !== undefined ? { target } : {}),
      ...(payload !== undefined ? { payload } : {}),
      ...(ctxPath ? { ctxPath } : {}),
    });
  }
  sendCustom(name: string, payload?: unknown, ctxPath?: string): void {
    this.send({
      type: "custom",
      name,
      ...(payload !== undefined ? { payload } : {}),
      ...(ctxPath ? { ctxPath } : {}),
    });
  }
  sendUiSet(ctxPath: string, path: string, value: unknown): void {
    this.send({ type: "ui-set", ctxPath, path, value });
  }
  sendAck(seen: number): void {
    const socket = this.socketRef();
    if (socket?.readyState === 1)
      socket.send(JSON.stringify({ type: "ack", seen } satisfies ClientFrame));
  }
  release(): void {
    this.ready = true;
    this.drain();
  }
  drain(): void {
    if (!this.ready) return;
    while (this.queue.length) {
      const socket = this.socketRef();
      if (!socket || socket.readyState !== 1) return;
      socket.send(JSON.stringify(this.queue.shift()!));
    }
  }
  currentVersion(): number {
    return this.version();
  }
}
