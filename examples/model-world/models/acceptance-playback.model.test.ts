import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  AlgebraicKernel,
  IntentProcessor,
  ModelLoader,
  type ModelDocument,
} from "../../../L13-facade/index.ts";

const MODEL_PATH = resolve(import.meta.dir, "acceptance-playback.model.yaml");

function bootPlaybackApp() {
  const kernel = AlgebraicKernel.create();
  const loader = new ModelLoader(kernel);
  loader.setIntentProcessor(new IntentProcessor(kernel));
  return loader.bootYamlFile(MODEL_PATH);
}

describe("acceptance-playback.model.yaml", () => {
  test("loads from disk with morphism ids and module URIs intact", () => {
    const raw = Bun.YAML.parse(readFileSync(MODEL_PATH, "utf-8")) as ModelDocument & {
      morphisms: Record<string, { id: string; impl: { kind: string; uri: string } }>;
    };

    expect(raw.model).toBe("acceptance-playback");
    expect(raw.lifecycle?.states).toEqual(["idle", "playing", "stepPassed", "stepFailed", "ended"]);
    expect(raw.morphisms.PlaybackExecuteStep.id).toBe(
      "morphism://adk.example/acceptance/playbackExecuteStep/1.0",
    );
    expect(raw.morphisms.PlaybackBuildView.impl.uri).toBe(
      "module://./../observatory/morphisms/playback/playback-build-view.ts",
    );
  });

  test("boots through ModelLoader with the expected action verbs", () => {
    const app = bootPlaybackApp();

    expect(app.stateMachineId).toBeDefined();
    expect(Object.keys(app.actions).sort()).toEqual([
      "play",
      "reset",
      "seek",
      "stepBack",
      "stepForward",
    ]);
  });

  test("supports the play -> stepForward -> stepBack -> seek -> reset cycle", async () => {
    const app = bootPlaybackApp();
    const key = "playback-1";

    app.setState(key, { status: "idle" });
    await expect(
      app.submit("play", key, { scenarioId: "happy-path", traceIndex: 0 }),
    ).resolves.toMatchObject({ success: true, newState: { status: "playing" } });
    await expect(app.submit("stepForward", key)).resolves.toMatchObject({
      success: true,
      newState: { status: "stepPassed" },
    });
    await expect(app.submit("stepBack", key)).resolves.toMatchObject({
      success: true,
      newState: { status: "stepPassed" },
    });
    await expect(
      app.submit("seek", key, { scenarioId: "happy-path", traceIndex: 0, stepId: "step-2" }),
    ).resolves.toMatchObject({ success: true, newState: { status: "playing" } });
    await expect(app.submit("reset", key)).resolves.toMatchObject({
      success: true,
      newState: { status: "idle" },
    });
  });

  test("every lifecycle transition declared in the YAML is reachable", async () => {
    const raw = Bun.YAML.parse(readFileSync(MODEL_PATH, "utf-8")) as ModelDocument;
    const app = bootPlaybackApp();
    const key = "playback-reachability";

    for (const transition of raw.lifecycle?.transitions ?? []) {
      app.setState(key, { status: transition.from });
      const result = await app.submit(transition.verb, key, {
        scenarioId: "happy-path",
        traceIndex: 0,
        stepId: "step-1",
      });
      expect(result.success).toBe(true);
      expect(result.newState).toEqual({ status: transition.to });
    }
  });
});
