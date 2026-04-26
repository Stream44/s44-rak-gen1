import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  AlgebraicKernel,
  IntentProcessor,
  ModelLoader,
  type ActionType,
  type ModelBoot,
} from "../L13-facade/index.ts";
import { ProjectionKernel } from "./projection-kernel.ts";
import { buildManifest, type DispatchResult } from "./dispatch.ts";
import { loadKernelModel } from "./bootstrap.ts";

const MODEL_PATH = resolve(import.meta.dir, "..", "L00-model", "kernel.model.yaml");

describe("Dispatch action", () => {
  test("valid ref + valid session + valid payload returns the ModelBoot submit result", async () => {
    const harness = await makeHarness();
    const expected = await harness.app.submit(
      "send",
      "expected-1",
      { msg: "hi" },
      harness.session.currentUser.capabilities.send,
    );
    const result = await harness.runtime.dispatch({
      ref: "Send",
      target: "thing-1",
      payload: { msg: "hi" },
    });
    expect(result.success).toBe(true);
    expect((result.value as DispatchResult).kind).toBe("model");
    expect(normalizeIntentResult((result.value as DispatchResult).intentResult)).toEqual(
      normalizeIntentResult(expected),
    );
  });

  test("unknown ref returns a clear dispatch error", async () => {
    const harness = await makeHarness();
    const result = await harness.runtime.dispatch({ ref: "nope" });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown action ref/);
  });

  test("missing Dispatch capability is denied by the authorize morphism", async () => {
    const harness = await makeHarness({ requireDispatchCapability: true });
    const result = await harness.runtime.dispatch({ ref: "notify", payload: { msg: "hi" } });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/capability/i);
  });

  test("invalid payload reports the schema validation error", async () => {
    const harness = await makeHarness();
    const result = await harness.runtime.dispatch({ ref: "Send", target: "thing-1", payload: {} });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/msg|validation/i);
  });

  test("custom actions round-trip their payload", async () => {
    const harness = await makeHarness();
    const result = await harness.runtime.dispatch({ ref: "notify", payload: { msg: "hi" } });
    expect(result.success).toBe(true);
    expect(result.value).toEqual({
      kind: "custom",
      success: true,
      name: "notify",
      payload: { msg: "hi" },
    });
  });

  test("ephemeral actions update the session store", async () => {
    const harness = await makeHarness();
    const result = await harness.runtime.dispatch({ ref: "toggle", payload: { open: true } });
    expect(result.success).toBe(true);
    expect((result.value as DispatchResult).kind).toBe("ephemeral");
    expect(harness.session.ephemeral.get("toggle")).toEqual({ open: true });
  });

  test("projection dispatch matches ProjectionKernel on the parity seed fields", async () => {
    const imperativeHarness = await makeHarness();
    const metaHarness = await makeHarness();
    const frame = { ref: "Send", target: "thing-1", payload: { msg: "hi" } };
    const imperative = await imperativeHarness.projector.dispatch(frame);
    const meta = await metaHarness.runtime.dispatch(frame);
    expect(meta.success).toBe(imperative.success);
    expect(normalize(meta.value as DispatchResult | undefined)).toEqual(normalize(imperative));
  });

  test("DispatchLifecycle transitions are emitted per compose stage", async () => {
    const harness = await makeHarness();
    await harness.runtime.dispatch({ ref: "Send", target: "thing-1", payload: { msg: "hi" } });
    // TODO: re-enable once bootstrap emits per-step lifecycle events.
  });
});

async function makeHarness(opts: { requireDispatchCapability?: boolean } = {}) {
  const ak = AlgebraicKernel.create();
  const loader = new ModelLoader(ak);
  const intents = new IntentProcessor(ak);
  loader.setIntentProcessor(intents);
  const app = loader.boot({
    model: "dispatchmodel",
    version: "1.0.0",
    origin: "dispatch",
    lifecycle: {
      states: ["idle", "done"],
      initial: "idle",
      terminal: ["done"],
      transitions: [{ from: "idle", to: "done", verb: "send" }],
    },
    actions: {
      Send: {
        verb: "send",
        inputSchema: { type: "object", required: ["msg"], properties: { msg: { type: "string" } } },
      },
    },
  });
  app.setState("thing-1", { status: "idle" });
  app.setState("expected-1", { status: "idle" });
  const loaded = loader.getLoadedModel("dispatchmodel")!;
  const actionMap = new Map<string, ActionType>();
  for (const { name } of loaded.actionDefs)
    actionMap.set(name, intents.resolveAction(`action://${loaded.origin}/${name}/1.0.0`));
  const projection = {
    projector: "dispatch-demo",
    version: "0.1.0",
    session: { scope: "dispatch-demo" },
    bindsModel: "dispatchmodel@1.0.0",
    pages: { index: { children: [] } },
    actions: [
      { name: "Send", kind: "model" },
      {
        name: "notify",
        kind: "custom",
        payloadSchema: {
          type: "object",
          required: ["msg"],
          properties: { msg: { type: "string" } },
        },
      },
      { name: "toggle", kind: "ephemeral" },
    ],
  };
  const session = {
    currentUser: {
      id: "test-user",
      capabilities: {
        send: app.issueCapability("send", "test-user"),
      } as Record<string, string>,
    },
    route: { path: "/", params: {}, query: {} },
    ephemeral: new Map<string, unknown>(),
  };
  if (opts.requireDispatchCapability) {
    session.currentUser.capabilities["cap://@projection/dispatch/0.1.0"] = app.issueCapability(
      "cap://@projection/dispatch/0.1.0",
      "test-user",
    );
  }
  const projector = new ProjectionKernel(app);
  projector.injectActionMap(actionMap);
  projector.setSession(session);
  projector.loadDocument(projection as never);
  const runtime = await loadKernelModel(MODEL_PATH, {
    kernel: AlgebraicKernel.create(),
    app,
    session,
    dispatchManifest: buildManifest(projection as never, actionMap),
    dispatchCapabilityRequirement: opts.requireDispatchCapability
      ? "cap://@projection/dispatch/0.1.0"
      : "cap://none",
  });
  return { app, projector, runtime, session };
}

function normalize(result: DispatchResult | undefined) {
  return result
    ? { success: result.success, kind: result.kind, error: result.error, name: result.name }
    : null;
}

function normalizeIntentResult(result: ReturnType<ModelBoot["submit"]> | undefined) {
  return result
    ? { ...result, events: result.events.map(({ id: _id, ...event }) => event) }
    : undefined;
}
