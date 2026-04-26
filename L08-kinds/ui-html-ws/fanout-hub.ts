import type { ServerWebSocket } from "bun";
import type { SplitArtefact } from "./split-pass.ts";
import { LastNFrameBuffer } from "./frame-buffer.ts";
import { WireFrameEmitter } from "./wire-emitter.ts";
import type { ClientFrame, ServerFrame } from "./wire-protocol.ts";

export interface FanoutClient {
  socket: ServerWebSocket<unknown>;
  version: number;
  subscriptionScope: string | string[];
  sentAt: number;
}
export interface ProjectionRegistration {
  projectionId: string;
  version: number;
  artefact: SplitArtefact;
  emitter: WireFrameEmitter;
  buffer: LastNFrameBuffer;
}

type RoutedClient = FanoutClient & {
  lastSeq: number;
  replayFromSeq?: number;
  replayToSeq?: number;
};
type TaggedFrame = ServerFrame & { scope?: string | string[] };
type ReplayState = {
  projectionId: string;
  version: number;
  subscriptionScope: string | string[];
  lastSeq: number;
};

const now = () => Date.now();
const listify = (scope: string | string[] | undefined) =>
  scope === "*" ? ["*"] : scope === undefined ? [] : Array.isArray(scope) ? scope : [scope];
const scopeKey = (scope: string | string[]) => JSON.stringify(scope);
const replayKey = (projectionId: string, version: number, scope: string | string[]) =>
  `${projectionId}:${version}:${scopeKey(scope)}`;
const allowed = (scope: string | string[], frame: TaggedFrame) => {
  const clientScopes = listify(scope);
  if (clientScopes.includes("*")) return true;
  const frameScopes = listify(frame.scope);
  return frameScopes.length === 0 || clientScopes.some((token) => frameScopes.includes(token));
};

export class FanoutHub {
  private readonly projections = new Map<string, ProjectionRegistration>();
  private readonly clients = new Map<string, Set<RoutedClient>>();
  private readonly sockets = new Map<
    ServerWebSocket<unknown>,
    { projectionId: string; client: RoutedClient }
  >();
  private readonly replay = new Map<string, ReplayState>();

  registerProjection(reg: ProjectionRegistration): void {
    this.projections.set(reg.projectionId, reg);
    this.clients.set(reg.projectionId, this.clients.get(reg.projectionId) ?? new Set());
  }

  unregisterProjection(projectionId: string): void {
    this.projections.delete(projectionId);
    for (const client of this.clients.get(projectionId) ?? []) this.sockets.delete(client.socket);
    this.clients.delete(projectionId);
    for (const [key, state] of this.replay.entries())
      if (state.projectionId === projectionId) this.replay.delete(key);
  }

  addClient(projectionId: string, client: Omit<FanoutClient, "sentAt">): void {
    const projection = this.projections.get(projectionId);
    if (!projection) return;
    const prior = this.replay.get(
      replayKey(projectionId, client.version, client.subscriptionScope),
    );
    const routed: RoutedClient = {
      ...client,
      sentAt: now(),
      lastSeq: projection.buffer.latestSeq(),
      ...(prior?.version === projection.version
        ? { replayFromSeq: prior.lastSeq, replayToSeq: projection.buffer.latestSeq() }
        : {}),
    };
    (
      this.clients.get(projectionId) ?? this.clients.set(projectionId, new Set()).get(projectionId)!
    ).add(routed);
    this.sockets.set(client.socket, { projectionId, client: routed });
    const skeleton = projection.emitter.skeletonFrame();
    projection.buffer.push(projection.version, skeleton);
    this.send(routed, skeleton, new Map(), 0, projection.buffer.latestSeq());
  }

  removeClient(socket: ServerWebSocket<unknown>): void {
    const entry = this.sockets.get(socket);
    if (!entry) return;
    this.clients.get(entry.projectionId)?.delete(entry.client);
    this.sockets.delete(socket);
    this.replay.set(
      replayKey(entry.projectionId, entry.client.version, entry.client.subscriptionScope),
      {
        projectionId: entry.projectionId,
        version: entry.client.version,
        subscriptionScope: entry.client.subscriptionScope,
        lastSeq: entry.client.lastSeq,
      },
    );
  }

  onStateChange(projectionId: string, changedPaths: string[]): void {
    const projection = this.projections.get(projectionId);
    if (!projection) return;
    const frames = projection.emitter.emit(changedPaths) as TaggedFrame[];
    if (frames.length === 0) return;
    const cache = new Map<string, string>();
    for (const frame of frames) projection.buffer.push(projection.version, frame);
    const firstSeq = projection.buffer.latestSeq() - frames.length + 1;
    for (const client of this.clients.get(projectionId) ?? []) {
      for (const [index, frame] of frames.entries()) {
        if (!allowed(client.subscriptionScope, frame)) continue;
        this.send(client, frame, cache, index, firstSeq + index);
      }
    }
  }

  onClientFrame(
    socket: ServerWebSocket<unknown>,
    frame: ClientFrame,
  ): { handled: boolean; passthrough?: ClientFrame } {
    const entry = this.sockets.get(socket);
    if (!entry) return { handled: false, passthrough: frame };
    if (frame.type === "ui-set")
      return frame.path === "activeTab"
        ? { handled: true }
        : { handled: false, passthrough: frame };
    if (frame.type === "custom" || frame.type === "action")
      return { handled: false, passthrough: frame };
    const projection = this.projections.get(entry.projectionId);
    if (!projection) return { handled: true };
    const key = replayKey(entry.projectionId, entry.client.version, entry.client.subscriptionScope);
    if (frame.seen < projection.version || frame.seen > projection.version) {
      this.replay.delete(key);
      this.send(entry.client, projection.emitter.skeletonFrame(), new Map(), 0);
      return { handled: true };
    }
    const replay =
      entry.client.replayFromSeq === undefined
        ? projection.buffer.sliceSince(frame.seen, projection.version)
        : projection.buffer.replay(
            projection.version,
            entry.client.replayFromSeq,
            entry.client.replayToSeq,
          );
    this.replay.delete(key);
    entry.client.replayFromSeq = undefined;
    entry.client.replayToSeq = undefined;
    for (const serverFrame of replay as TaggedFrame[])
      if (allowed(entry.client.subscriptionScope, serverFrame))
        this.send(entry.client, serverFrame, new Map(), 0);
    return { handled: true };
  }

  private send(
    client: RoutedClient,
    frame: ServerFrame,
    cache: Map<string, string>,
    index: number,
    seq?: number,
  ): void {
    const cacheKey = `${client.version}:${scopeKey(client.subscriptionScope)}:${index}`;
    const json = cache.get(cacheKey) ?? JSON.stringify(frame);
    cache.set(cacheKey, json);
    try {
      client.socket.send(json);
    } catch {}
    client.sentAt = now();
    if (seq !== undefined) client.lastSeq = seq;
  }
}
