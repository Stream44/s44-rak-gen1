import { existsSync, readFileSync, statSync } from "fs";
import { dirname, join, resolve as resolvePath } from "path";
import type { ServerWebSocket } from "bun";
import { AlgebraicKernel, IntentProcessor, ModelLoader } from "../../L13-facade/index.ts";
import { dispatchAction } from "../../L07-agency/action-dispatch.ts";
import type { ModelBoot, ModelDocument } from "../../L09-demand/model-loader.ts";
import type { ActionType } from "../../L13-facade/index.ts";
import {
  createMetaProjectionKernel,
  type MetaProjectionKernel,
} from "../../L11-projection/bootstrap.ts";
import { buildRuntimeBundle } from "../../L08-kinds/ui-html-ws/runtime-bundle.ts";
import { bootNode, type NodeRuntime } from "../projection-runtime/index.ts";

export interface ViewerProjectionConfig {
  mount: string;
  projectorPath: string;
  modelPaths?: string[];
  seedFn?: (app: ModelBoot) => void;
  kind?: string;
  bindingsFn?: (projector: ProjectorHandle, app: ModelBoot | null) => void;
  customHandler?: CustomHandler;
}
export type CustomHandler = (
  ws: ServerWebSocket<unknown>,
  frame: Record<string, unknown>,
  ctx: {
    app?: ModelBoot;
    projector: ProjectorHandle;
    broadcast: (data: unknown) => void;
    mount: string;
  },
) => boolean | Promise<boolean>;
export interface ViewerConfig {
  port: number;
  projections: ViewerProjectionConfig[];
}
export interface ViewerHandle {
  server: ReturnType<typeof Bun.serve>;
  stop: (opts?: { drain?: boolean }) => Promise<void>;
}

type ProjectorHandle = MetaProjectionKernel;
type ReadySocket = ServerWebSocket<unknown> & { ready?: Promise<void> };
type MountedProjection = {
  normalizedMount: string;
  cfg: ViewerProjectionConfig;
  projector: ProjectorHandle;
  app?: ModelBoot;
  ip?: IntentProcessor;
  clients: Set<ReadySocket>;
  assetsDir: string | null;
  dispose?: () => void;
};

export function chainOnSocket<TSocket extends object, TResult>(
  socketQueues: WeakMap<TSocket, Promise<unknown>>,
  ws: TSocket,
  work: () => Promise<TResult>,
): Promise<TResult> {
  const prev = socketQueues.get(ws) ?? Promise.resolve();
  const next = prev.then(() => work());
  // Swallow at the chain boundary so one handler error doesn't poison
  // subsequent frames on the same socket (spec §3.3).
  socketQueues.set(
    ws,
    next.catch(() => undefined),
  );
  return next;
}

export async function createViewer(config: ViewerConfig): Promise<ViewerHandle> {
  // Viewer serves /assets/* from each projection asset directory and does not expose path-named endpoints.
  const runtimeJs = await buildRuntimeBundle();
  const kernels = new Map<string, ReturnType<typeof bootModel>>(),
    mounted: MountedProjection[] = [];
  for (const cfg of config.projections) {
    const normalizedMount = normalizeMount(cfg.mount),
      modelSlug = cfg.modelPaths?.length ? cfg.modelPaths.join("|") : "";
    assertUiHtmlWs(cfg.kind ?? "ui.html.ws", cfg.mount);
    let appEntry = modelSlug ? kernels.get(modelSlug) : undefined;
    if (modelSlug && !appEntry) kernels.set(modelSlug, (appEntry = bootModel(cfg.modelPaths!)));
    const runtimeEntry = !appEntry ? bootProjectionRuntime(cfg.projectorPath) : undefined;
    const liveApp = appEntry?.app ?? runtimeEntry?.runtime.app ?? null;
    const projector = await createUiHtmlProjector(liveApp, cfg);
    if (appEntry) projector.injectActionMap(buildActionMap(appEntry.ip, appEntry.app));
    else if (runtimeEntry)
      projector.injectActionMap(
        buildActionMap(runtimeEntry.runtime.kernel.intents, runtimeEntry.runtime.app),
      );
    const doc = projector.loadYamlFile(cfg.projectorPath);
    assertUiHtmlWs(doc.conformsToKind ?? "ui.html.ws", cfg.mount);
    if (appEntry?.app) cfg.seedFn?.(appEntry.app);
    if (liveApp) {
      cfg.bindingsFn?.(projector, liveApp);
      const caps = Object.fromEntries(
        Object.keys(liveApp.actions).map((verb) => [verb, liveApp.issueCapability(verb, "viewer")]),
      );
      projector.setSession({
        currentUser: { id: "viewer", capabilities: caps },
        route: { path: "/", params: {}, query: {} },
        ephemeral: new Map(),
      });
    } else cfg.bindingsFn?.(projector, null);
    mounted.push({
      normalizedMount,
      cfg,
      projector,
      app: liveApp ?? undefined,
      ip: appEntry?.ip,
      clients: new Set(),
      assetsDir: projector.getAssetsDir(),
      dispose: runtimeEntry?.runtime.dispose,
    });
  }
  mounted.sort((a, b) => b.normalizedMount.length - a.normalizedMount.length);
  for (const entry of mounted) {
    entry.app?.onEvent((event) => {
      if (entry.ip?.transaction.active) return;
      if (event.kind === "transactionCommitted") {
        broadcastRerender(entry);
        return;
      }
      broadcastRerender(entry);
    });
  }

  async function handleMessage(
    ws: ServerWebSocket<{ mount: string }>,
    msg: string | Buffer,
  ): Promise<void> {
    const mp = matchSocketMount(mounted, ws.data);
    if (!mp) return;
    let frame: Record<string, unknown>;
    try {
      frame = JSON.parse(String(msg));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "invalid JSON frame" }));
      return;
    }
    const broadcast = (data: unknown) => {
      const json = JSON.stringify(data);
      for (const client of mp.clients)
        try {
          client.send(json);
        } catch {}
    };
    if (frame.type === "ui-set") {
      if (
        mp.cfg.customHandler &&
        (await mp.cfg.customHandler(ws, frame, {
          app: mp.app,
          projector: mp.projector,
          broadcast,
          mount: mp.normalizedMount,
        }))
      )
        return;
      const ctxPath = String(frame.ctxPath ?? "page"),
        path = String(frame.path ?? ""),
        value = frame.value;
      mp.projector.setUiContext(ctxPath, path, value);
      broadcastRerender(mp);
      return;
    }
    if (frame.type === "action") {
      if (mp.app) {
        const result = await dispatchAction(
          mp.app,
          {
            ref: String(frame.ref ?? ""),
            payload: (frame.payload as Record<string, unknown> | undefined) ?? {},
            target: frame.target !== undefined ? String(frame.target) : undefined,
          },
          {
            bindings: mp.projector.getBindings(),
            session: mp.projector.getSession(),
            route: mp.projector.getSession().route,
          },
        );
        if (result.handled) {
          broadcastRerender(mp);
          return;
        }
      }
      if (
        mp.cfg.customHandler &&
        (await mp.cfg.customHandler(ws, frame, {
          app: mp.app,
          projector: mp.projector,
          broadcast,
          mount: mp.normalizedMount,
        }))
      )
        return;
      if (!mp.app) {
        const ref = String(frame.ref ?? ""),
          payload = (frame.payload as Record<string, unknown> | undefined) ?? {},
          target = frame.target !== undefined ? String(frame.target) : undefined;
        const result = await mp.projector.dispatch({ ref, target, payload });
        if (!result.success)
          ws.send(JSON.stringify({ type: "error", message: result.error ?? "dispatch failed" }));
        else if (!("kind" in result) || result.kind !== "custom") broadcastRerender(mp);
      }
      return;
    }
    if (
      mp.cfg.customHandler &&
      (await mp.cfg.customHandler(ws, frame, {
        app: mp.app,
        projector: mp.projector,
        broadcast,
        mount: mp.normalizedMount,
      }))
    )
      return;
  }

  const socketQueues = new WeakMap<ServerWebSocket<unknown>, Promise<unknown>>();

  const server = Bun.serve<{ mount: string }>({
    port: config.port,
    fetch(req, server) {
      const pathname = new URL(req.url).pathname;
      if (pathname === "/runtime.js")
        return new Response(runtimeJs, { headers: { "Content-Type": "application/javascript" } });
      const mp = matchMount(mounted, pathname);
      if (!mp) return new Response("Not Found", { status: 404 });
      const subpath = stripMount(mp.normalizedMount, pathname);
      if (subpath === "/ws")
        return server.upgrade(req, { data: { mount: mp.normalizedMount } })
          ? (undefined as unknown as Response)
          : new Response("WS upgrade failed", { status: 400 });
      if (subpath.startsWith("/assets/") && mp.assetsDir) {
        const rel = subpath.slice("/assets/".length);
        if (rel.includes("..")) return new Response("Forbidden", { status: 403 });
        const filePath = join(mp.assetsDir, rel);
        if (existsSync(filePath) && statSync(filePath).isFile())
          return new Response(readFileSync(filePath), {
            headers: { "Content-Type": guessContentType(filePath) },
          });
        return new Response("Asset Not Found", { status: 404 });
      }
      if (subpath === "/api/body") {
        mp.cfg.bindingsFn?.(mp.projector, mp.app ?? null);
        return new Response(mp.projector.renderHtml(mp.projector.defaultPageName() ?? "").html, {
          headers: { "Content-Type": "text/html" },
        });
      }
      if (subpath === "" || subpath === "/" || subpath === "/index.html") {
        mp.cfg.bindingsFn?.(mp.projector, mp.app ?? null);
        return new Response(
          mp.projector.renderShell(
            { pageName: mp.projector.defaultPageName() ?? "" },
            { mount: mp.normalizedMount },
          ),
          { headers: { "Content-Type": "text/html" } },
        );
      }
      return new Response("Not Found", { status: 404 });
    },
    websocket: {
      open(ws) {
        matchSocketMount(mounted, ws.data)?.clients.add(ws as ReadySocket);
      },
      message(ws, msg) {
        return chainOnSocket(socketQueues, ws, () => handleMessage(ws, msg));
      },
      close(ws) {
        socketQueues.delete(ws);
        matchSocketMount(mounted, ws.data)?.clients.delete(ws);
      },
    },
  });
  return {
    server,
    stop: async (opts?: { drain?: boolean }): Promise<void> => {
      if (opts?.drain)
        await Promise.all(
          mounted.flatMap((mp) =>
            [...mp.clients].map(
              (ws) =>
                (ws as ServerWebSocket<unknown> & { ready?: Promise<void> }).ready ??
                Promise.resolve(),
            ),
          ),
        );
      await server.stop(false);
      for (const mp of mounted) mp.dispose?.();
    },
  };
}

const normalizeMount = (mount: string) =>
  mount === "/" || mount === ""
    ? ""
    : `${mount.startsWith("/") ? mount : `/${mount}`}`.replace(/\/$/, "");
function matchMount(list: MountedProjection[], pathname: string): MountedProjection | null {
  for (const mp of list)
    if (
      mp.normalizedMount === "" ||
      pathname === mp.normalizedMount ||
      pathname.startsWith(mp.normalizedMount + "/")
    )
      return mp;
  return null;
}
const matchSocketMount = (list: MountedProjection[], data: unknown) =>
  list.find((m) => m.normalizedMount === ((data as { mount?: string } | undefined)?.mount ?? ""));
const stripMount = (mount: string, pathname: string) =>
  mount === ""
    ? pathname === "/"
      ? "/"
      : pathname
    : pathname === mount
      ? ""
      : pathname.startsWith(mount + "/")
        ? pathname.slice(mount.length)
        : pathname;

function bootModel(modelPaths: string[]) {
  const ak = AlgebraicKernel.create(),
    loader = new ModelLoader(ak),
    ip = new IntentProcessor(ak);
  loader.setIntentProcessor(ip);
  let app: ModelBoot | null = null;
  for (const [index, path] of modelPaths.entries()) {
    const doc = Bun.YAML.parse(readFileSync(path, "utf-8")) as ModelDocument;
    if (index < modelPaths.length - 1) loader.loadModel(doc);
    else app = loader.boot(doc);
  }
  if (!app) throw new Error("Viewer: modelPaths must include at least one bootable model.");
  return { app, loader, ip };
}

function buildActionMap(ip: IntentProcessor, app: ModelBoot): Map<string, ActionType> {
  const map = new Map<string, ActionType>();
  for (const id of Object.values(app.actions))
    try {
      const action = ip.resolveAction(id);
      map.set(action.name, action);
    } catch {}
  return map;
}

function bootProjectionRuntime(projectorPath: string): { runtime: NodeRuntime } | undefined {
  if (!projectionNeedsRuntime(projectorPath)) return undefined;
  const sdsPath = findNearestSds(dirname(resolvePath(projectorPath)));
  if (!sdsPath) return undefined;
  return { runtime: bootNode(sdsPath) };
}

function projectionNeedsRuntime(projectorPath: string): boolean {
  const document = Bun.YAML.parse(readFileSync(projectorPath, "utf-8")) as {
    bindsModel?: unknown;
    bindsModels?: unknown;
  };
  return (
    (typeof document.bindsModel === "string" && document.bindsModel.length > 0) ||
    (Array.isArray(document.bindsModels) && document.bindsModels.length > 0)
  );
}

function findNearestSds(startDir: string): string | undefined {
  let current = startDir;
  while (true) {
    const candidate = join(current, "sds.yaml");
    if (existsSync(candidate)) return candidate;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function broadcastRerender(mp: MountedProjection): void {
  if (mp.clients.size === 0) return;
  mp.cfg.bindingsFn?.(mp.projector, mp.app ?? null);
  const out = mp.projector.renderHtml(mp.projector.defaultPageName() ?? ""),
    frame = JSON.stringify({ type: "rerender", html: out.html, handlersJs: out.handlersJs });
  for (const ws of mp.clients)
    try {
      ws.send(frame);
    } catch {}
}

async function createUiHtmlProjector(
  app: ModelBoot | null,
  cfg: ViewerProjectionConfig,
): Promise<ProjectorHandle> {
  const yamlPath = resolvePath(import.meta.dir, "../../L00-model/kernel.model.yaml");
  return createMetaProjectionKernel(app, { yamlPath });
}

function assertUiHtmlWs(kind: string, mount: string): void {
  const ok = kind === "ui.html.ws" || kind === "kind://adk/ui.html.ws/1.0";
  if (!ok)
    throw new Error(`Viewer v1 only accepts ui.html.ws kinds, got "${kind}" for mount "${mount}".`);
}
function guessContentType(path: string): string {
  if (path.endsWith(".html")) return "text/html";
  if (path.endsWith(".css")) return "text/css";
  if (path.endsWith(".js")) return "application/javascript";
  if (path.endsWith(".json")) return "application/json";
  if (path.endsWith(".svg")) return "image/svg+xml";
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}
