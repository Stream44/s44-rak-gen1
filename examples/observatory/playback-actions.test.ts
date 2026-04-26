import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { AcceptanceEngine, type AcceptanceSuite } from "../../L10-acceptance/acceptance.ts";
import { bootNode } from "../../L14-hosts/projection-runtime/index.ts";
import { createPlaybackActions, type PlaybackSession } from "./playback-actions.ts";
import type { EventData } from "./protocol.ts";

const OBSERVATORY_SUITE_YAML = resolve(
  import.meta.dir,
  "../model-world/acceptance/ecommerce.acceptance.yaml",
);
const FIXTURE = resolve(import.meta.dir, "fixtures/boot-sds");

function createHarness(opts?: { autoPlayDelayMs?: number; suite?: AcceptanceSuite }) {
  const meta = bootNode(FIXTURE);
  const suite =
    opts?.suite ??
    (() => {
      const engine = new AcceptanceEngine(meta.app);
      return engine.loadSuite(OBSERVATORY_SUITE_YAML);
    })();
  const events: EventData[] = [];
  const rerenderSignal: PlaybackSession[] = [];
  let clearEventBufferCalls = 0;

  meta.app.onEvent((event) => {
    events.push({
      id: event.id,
      action: event.action,
      targetKey: event.targetKey,
      previousState: event.previousState,
      newState: event.newState,
      timestamp: new Date().toISOString(),
    });
  });

  const playback = createPlaybackActions({
    kernel: meta.kernel,
    loader: meta.loader,
    app: meta.app,
    suite,
    suites: meta.suiteRegistry,
    onSessionChange: (session) => rerenderSignal.push(structuredClone(session)),
    resetSeeds: () => {
      for (const seed of meta.seedList) meta.app.setState(seed.targetKey, seed.state);
    },
    clearEventBuffer: () => {
      clearEventBufferCalls += 1;
      events.length = 0;
    },
    autoPlayDelayMs: opts?.autoPlayDelayMs ?? 0,
  });

  return {
    meta,
    suite,
    playback,
    events,
    rerenderSignal,
    getClearEventBufferCalls: () => clearEventBufferCalls,
  };
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolveWait) => setTimeout(resolveWait, ms));
}

async function waitFor(check: () => boolean, timeoutMs = 500): Promise<void> {
  const startedAt = Date.now();
  while (!check()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out after ${timeoutMs}ms`);
    }
    await wait(5);
  }
}

describe("createPlaybackActions", () => {
  test("T1 — Initial state is idle", () => {
    const { playback } = createHarness();
    const session = playback.getSession();

    expect(session.status).toBe("idle");
    expect(session.steps).toHaveLength(0);
    expect(session.scenarioId).toBe("");
  });

  test("T2 — Play reseeds + builds step list", async () => {
    const { meta, playback, rerenderSignal, getClearEventBufferCalls } = createHarness({
      autoPlayDelayMs: 50,
    });

    meta.app.setState("ord-001", { status: "delivered" });
    const handled = await playback.handle("acceptance.play", {
      scenarioId: "sc-cancel-pending",
      traceIndex: 0,
    });
    const session = playback.getSession();

    expect(handled).toBe(true);
    expect(session.status).toBe("playing");
    expect(session.steps).toHaveLength(1);
    expect(session.steps.every((step) => step.status === "pending")).toBe(true);
    expect(meta.app.getState("ord-001")).toEqual({ status: "pending" });
    expect(getClearEventBufferCalls()).toBe(1);
    expect(rerenderSignal.length).toBeGreaterThan(0);
  });

  test("T3 — stepForward on cancel-pending passes all assertions", async () => {
    const { meta, playback } = createHarness({ autoPlayDelayMs: 50 });

    await playback.handle("acceptance.play", { scenarioId: "sc-cancel-pending", traceIndex: 0 });
    await playback.handle("acceptance.stepForward", {});

    const session = playback.getSession();
    expect(session.steps[0]?.status).toBe("passed");
    expect(session.status).toBe("ended");
    expect(session.sessionPassed).toBe(true);
    expect(meta.app.getState("ord-001")).toEqual({ status: "cancelled" });
    expect(session.steps[0]?.assertionResults?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(session.steps[0]?.assertionResults?.every((result) => result.passed)).toBe(true);
  });

  test("T4 — Full happy-path lifecycle", async () => {
    const { meta, playback } = createHarness({ autoPlayDelayMs: 50 });

    await playback.handle("acceptance.play", { scenarioId: "sc-full-lifecycle", traceIndex: 0 });

    await playback.handle("acceptance.stepForward", {});
    expect(playback.getSession().steps[0]?.status).toBe("passed");
    expect(meta.app.getState("ord-001")).toEqual({ status: "confirmed" });

    await playback.handle("acceptance.stepForward", {});
    expect(playback.getSession().steps[1]?.status).toBe("passed");
    expect(meta.app.getState("ord-001")).toEqual({ status: "paid" });

    await playback.handle("acceptance.stepForward", {});
    expect(playback.getSession().steps[2]?.status).toBe("passed");
    expect(meta.app.getState("ord-001")).toEqual({ status: "shipped" });

    await playback.handle("acceptance.stepForward", {});
    const session = playback.getSession();
    expect(session.steps[3]?.status).toBe("passed");
    expect(meta.app.getState("ord-001")).toEqual({ status: "delivered" });
    expect(session.status).toBe("ended");
    expect(session.sessionPassed).toBe(true);
  });

  test("T5 — Assertion failure path", async () => {
    const { playback, meta, suite } = createHarness({ autoPlayDelayMs: 50 });
    const scenario = suite.useCases
      .flatMap((useCase) => useCase.scenarios)
      .find((entry) => entry.id === "sc-cancel-pending");
    if (!scenario) {
      throw new Error("Scenario sc-cancel-pending not found");
    }
    scenario.root.assertions = [
      { kind: "state-equals", targetKey: "ord-001", expected: { status: "confirmed" } },
      { kind: "event-emitted", targetKey: "ord-001", newStateFields: { status: "cancelled" } },
    ];

    await playback.handle("acceptance.play", { scenarioId: "sc-cancel-pending", traceIndex: 0 });
    await playback.handle("acceptance.stepForward", {});

    const session = playback.getSession();
    expect(session.steps[0]?.status).toBe("failed");
    expect(session.status).toBe("stepFailed");
    expect(session.sessionPassed).toBe(false);
    expect(meta.app.getState("ord-001")).toEqual({ status: "cancelled" });
    expect(session.steps[0]?.assertionResults?.some((result) => result.passed === false)).toBe(
      true,
    );
    expect(session.steps[0]?.error).toBeUndefined();
  });

  test("T6 — Persona-denied -> error status (DC7)", async () => {
    const { playback, meta, suite } = createHarness({ autoPlayDelayMs: 50 });
    const alice = suite.personas.find((persona) => persona.id === "alice");
    if (!alice) {
      throw new Error("Persona alice not found");
    }
    delete alice.capabilities.cancel;

    await playback.handle("acceptance.play", { scenarioId: "sc-cancel-pending", traceIndex: 0 });
    await playback.handle("acceptance.stepForward", {});

    const session = playback.getSession();
    expect(session.steps[0]?.status).toBe("error");
    expect(session.status).toBe("stepError");
    expect(session.sessionPassed).toBe(false);
    expect(session.steps[0]?.error).toContain("Authorization denied");
    expect(meta.app.getState("ord-001")).toEqual({ status: "pending" });
  });

  test("T7 — Auto-play runs through a passing trace", async () => {
    const { playback, rerenderSignal } = createHarness({ autoPlayDelayMs: 0 });

    await playback.handle("acceptance.play", { scenarioId: "sc-full-lifecycle", traceIndex: 0 });
    await waitFor(() => playback.getSession().status === "ended");

    const session = playback.getSession();
    expect(rerenderSignal.length).toBeGreaterThanOrEqual(4);
    expect(session.status).toBe("ended");
    expect(session.steps.every((step) => step.status === "passed")).toBe(true);
  });

  test("T8 — Pause stops auto-play mid-trace", async () => {
    const { playback } = createHarness({ autoPlayDelayMs: 50 });

    await playback.handle("acceptance.play", { scenarioId: "sc-full-lifecycle", traceIndex: 0 });
    await waitFor(() => playback.getSession().currentStepIndex >= 1);
    await playback.handle("acceptance.pause", {});
    await wait(200);

    const session = playback.getSession();
    expect(session.playing).toBe(false);
    expect(session.currentStepIndex).toBe(1);
    expect(session.steps[0]?.status).toBe("passed");
    expect(session.steps[1]?.status).toBe("pending");
  });

  test("T9 — Resume continues auto-play after pause", async () => {
    const { playback } = createHarness({ autoPlayDelayMs: 20 });

    await playback.handle("acceptance.play", { scenarioId: "sc-full-lifecycle", traceIndex: 0 });
    await waitFor(() => playback.getSession().currentStepIndex >= 1);
    await playback.handle("acceptance.pause", {});

    expect(playback.getSession().playing).toBe(false);

    await playback.handle("acceptance.resume", {});
    await waitFor(() => playback.getSession().status === "ended");

    const session = playback.getSession();
    expect(session.status).toBe("ended");
    expect(session.sessionPassed).toBe(true);
    expect(session.steps.every((step) => step.status === "passed")).toBe(true);
  });

  test("T10 — stepBack preserves prior verdicts (DC3)", async () => {
    const { playback, meta } = createHarness({ autoPlayDelayMs: 50 });

    await playback.handle("acceptance.play", { scenarioId: "sc-full-lifecycle", traceIndex: 0 });
    await playback.handle("acceptance.stepForward", {});
    await playback.handle("acceptance.stepForward", {});
    await playback.handle("acceptance.stepBack", {});

    const session = playback.getSession();
    expect(session.currentStepIndex).toBe(1);
    expect(session.steps[0]?.status).toBe("passed");
    expect(session.steps[1]?.status).toBe("pending");
    expect(meta.app.getState("ord-001")).toEqual({ status: "confirmed" });
  });

  test("T11 — Reset clears session + event buffer (DC6)", async () => {
    const { playback, events, getClearEventBufferCalls } = createHarness({ autoPlayDelayMs: 50 });

    await playback.handle("acceptance.play", { scenarioId: "sc-cancel-pending", traceIndex: 0 });
    await playback.handle("acceptance.stepForward", {});
    expect(events.length).toBeGreaterThan(0);

    await playback.handle("acceptance.reset", {});

    const session = playback.getSession();
    expect(session.status).toBe("idle");
    expect(session.steps).toHaveLength(0);
    expect(session.scenarioId).toBe("");
    expect(events).toHaveLength(0);
    expect(getClearEventBufferCalls()).toBeGreaterThanOrEqual(2);
  });

  test("T12 — Seek jumps to a step", async () => {
    const { playback, meta } = createHarness({ autoPlayDelayMs: 50 });

    await playback.handle("acceptance.play", { scenarioId: "sc-full-lifecycle", traceIndex: 0 });
    await playback.handle("acceptance.seek", {
      scenarioId: "sc-full-lifecycle",
      traceIndex: 0,
      stepId: "step-ship",
    });

    const session = playback.getSession();
    expect(session.currentStepIndex).toBe(2);
    expect(session.steps[0]?.status).toBe("pending");
    expect(session.steps[1]?.status).toBe("pending");
    expect(meta.app.getState("ord-001")).toEqual({ status: "pending" });
  });

  test("T13 — Session state is preserved across repeated reads", async () => {
    const { playback } = createHarness({ autoPlayDelayMs: 50 });

    await playback.handle("acceptance.play", { scenarioId: "sc-cancel-pending", traceIndex: 0 });
    const firstRead = playback.getSession();
    const secondRead = playback.getSession();

    expect(secondRead).toEqual(firstRead);
    expect(secondRead.scenarioId).toBe("sc-cancel-pending");
    expect(secondRead.steps).toHaveLength(1);
  });

  test('T14 — loadSuite("ecommerce") is a no-op when already active', () => {
    const { playback } = createHarness();
    const before = Bun.hash(JSON.stringify(playback.getSuite()));

    const handled = playback.loadSuite("ecommerce");

    expect(handled).toBe(true);
    expect(playback.getSession().status).toBe("idle");
    expect(Bun.hash(JSON.stringify(playback.getSuite()))).toBe(before);
    expect(playback.getSuites().find((entry) => entry.id === "ecommerce")?.active).toBe(true);
  });

  test('T15 — loadSuite("ecommerce-api") replaces the suite view and clears the session', async () => {
    const { playback } = createHarness({ autoPlayDelayMs: 50 });

    await playback.handle("acceptance.play", { scenarioId: "sc-cancel-pending", traceIndex: 0 });
    const handled = playback.loadSuite("ecommerce-api");
    const session = playback.getSession();

    expect(handled).toBe(true);
    expect(playback.getSuite().name).toBe("E-Commerce API Acceptance Suite");
    expect(session.status).toBe("idle");
    expect(session.scenarioId).toBe("");
    expect(playback.getSuites().find((entry) => entry.id === "ecommerce-api")?.active).toBe(true);
  });

  test('T16 — loadSuite("nonexistent") returns false and leaves the session untouched', async () => {
    const { playback } = createHarness({ autoPlayDelayMs: 50 });

    await playback.handle("acceptance.play", { scenarioId: "sc-cancel-pending", traceIndex: 0 });
    const before = playback.getSession();
    const handled = playback.loadSuite("nonexistent");

    expect(handled).toBe(false);
    expect(playback.getSession()).toEqual(before);
    expect(playback.getSuite().name).toBe("E-Commerce Acceptance Suite v1");
  });

  test("T17 — ecommerce-api suite keeps supported verbs but fails API assertions without a projector session", async () => {
    const { playback } = createHarness({ autoPlayDelayMs: 50 });

    expect(playback.loadSuite("ecommerce-api")).toBe(true);
    await playback.handle("acceptance.play", {
      scenarioId: "sc-alice-confirms-full",
      traceIndex: 0,
    });
    await playback.handle("acceptance.stepForward", {});

    const session = playback.getSession();
    expect(session.steps[0]?.verb).toBe("confirm");
    expect(session.steps[0]?.status).toBe("failed");
    expect(session.steps[0]?.assertionResults?.[1]?.kind).toBe("api-response");
    expect(session.steps[0]?.assertionResults?.[1]?.actual).toContain(
      "no projectorSession attached to step",
    );
    expect(session.status).toBe("stepFailed");
    expect(session.sessionPassed).toBe(false);
  });
});
