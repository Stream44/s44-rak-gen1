import { resolve } from "node:path";
import { AcceptanceEngine, type AcceptanceSuite } from "../../L10-acceptance/acceptance.ts";
import type { NodeRuntime } from "../../L14-hosts/projection-runtime/index.ts";
import type { ViewerProjectionConfig } from "../../L14-hosts/viewer/viewer.ts";
import { selectModelWorldModel } from "./custom-handler.ts";
import { createPlaybackActions } from "./playback-actions.ts";
import type { EventData } from "./protocol.ts";
import { createBindings, refreshBindings, type ProjectorBindings } from "./runtime-bindings.ts";

const defaultSuite = (runtime: NodeRuntime) =>
  runtime.suiteRegistry.find((suite) => suite.default) ?? runtime.suiteRegistry[0];
const loadSuite = (runtime: NodeRuntime): AcceptanceSuite => {
  const suite = defaultSuite(runtime);
  if (!suite) throw new Error("Observatory runtime requires at least one acceptance suite.");
  const engine = new AcceptanceEngine(runtime.app);
  return engine.loadSuite(suite.path);
};

export async function buildObsViewerConfig(opts: {
  mount?: string;
  runtime: NodeRuntime;
}): Promise<ViewerProjectionConfig> {
  const { mount = "/", runtime } = opts,
    suite = loadSuite(runtime),
    recentEvents: EventData[] = [],
    bindings = await createBindings(runtime, suite);
  let activeProjector: ProjectorBindings | null = null,
    activeBroadcast: ((data: unknown) => void) | null = null;
  const refresh = (projector: ProjectorBindings) => {
    activeProjector = projector;
    refreshBindings(runtime, suite, recentEvents, bindings, projector, playback);
  };
  const playback = createPlaybackActions({
    kernel: runtime.kernel,
    loader: runtime.loader,
    app: runtime.app,
    suite,
    suites: runtime.suiteRegistry,
    initialSuiteId: defaultSuite(runtime)?.id,
    onSessionChange() {
      if (!activeProjector || !activeBroadcast) return;
      refresh(activeProjector);
      const out = activeProjector.renderHtml(activeProjector.defaultPageName() ?? "");
      activeBroadcast({ type: "rerender", html: out.html, handlersJs: out.handlersJs });
    },
    resetSeeds() {
      for (const seed of runtime.seedList) runtime.app.setState(seed.targetKey, seed.state);
    },
    clearEventBuffer() {
      recentEvents.length = 0;
    },
  });
  for (const app of runtime.apps.values())
    app.onEvent((event) => {
      const events = event.kind === "transactionCommitted" ? (event.events ?? []) : [event];
      for (const entry of events)
        recentEvents.push({
          id: entry.id,
          action: entry.action,
          targetKey: entry.targetKey,
          previousState: entry.previousState,
          newState: entry.newState,
          timestamp: new Date().toISOString(),
        });
      while (recentEvents.length > 50) recentEvents.shift();
    });
  return {
    mount,
    projectorPath: resolve(import.meta.dir, "projection/projection.yaml"),
    bindingsFn(projector) {
      refresh(projector);
    },
    customHandler: async (_ws, frame, ctx) => {
      activeProjector = ctx.projector;
      activeBroadcast = ctx.broadcast;
      if (frame.type === "action" && frame.ref === "model.select") {
        const selectedModelId = String(
          (frame.payload as { modelId?: unknown } | undefined)?.modelId ?? "",
        );
        const selectedModel = selectedModelId
          ? await selectModelWorldModel(runtime.loader, selectedModelId)
          : undefined;
        bindings.selectedModelId = selectedModel?.summary.modelId ?? null;
        bindings.selectedModelView = selectedModel?.view ?? null;
        refresh(ctx.projector);
        const out = ctx.projector.renderHtml(ctx.projector.defaultPageName() ?? "");
        ctx.broadcast({ type: "rerender", html: out.html, handlersJs: out.handlersJs });
        return true;
      }
      if (
        frame.type === "action" &&
        typeof frame.ref === "string" &&
        frame.ref.startsWith("acceptance.")
      ) {
        const handled = await playback.handle(
          frame.ref,
          frame.payload as Record<string, unknown> | undefined,
        );
        if (handled) refresh(ctx.projector);
        return handled;
      }
      refresh(ctx.projector);
      return false;
    },
  };
}
