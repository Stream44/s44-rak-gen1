import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ModelBoot } from "../../L09-demand/model-loader.ts";
import { createFsModelStore } from "./fs-model-store.ts";
import { resolvePersistencePath } from "./path-resolver.ts";

type EventRecord = {
  id: string;
  action: string;
  targetKey: string;
  previousState: unknown;
  newState: unknown;
};

class StubModelBoot implements Pick<ModelBoot, "setState" | "listInstances" | "onEvent"> {
  private stateByKey = new Map<string, unknown>();

  private handlers = new Set<(event: EventRecord) => void>();

  setState(targetKey: string, state: unknown): void {
    this.stateByKey.set(targetKey, state);
  }

  listInstances(): Array<{ key: string; state: unknown }> {
    return [...this.stateByKey.entries()].map(([key, state]) => ({ key, state }));
  }

  onEvent(handler: (event: EventRecord) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  emit(targetKey: string, nextState: unknown): void {
    const previousState = this.stateByKey.get(targetKey);
    this.stateByKey.set(targetKey, nextState);
    const event = {
      id: `${this.handlers.size}:${String(targetKey)}`,
      action: "test:update",
      targetKey,
      previousState,
      newState: nextState,
    };
    for (const handler of this.handlers) handler(event);
  }

  getState(targetKey: string): unknown {
    return this.stateByKey.get(targetKey);
  }
}

function withTmpDir(run: (dir: string) => Promise<void> | void): Promise<void> | void {
  const dir = mkdtempSync(join(tmpdir(), "fs-model-store-"));
  try {
    return run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe("fs-model-store kind", () => {
  test("resolvePersistencePath uses override relative to sds.yaml", () => {
    const actual = resolvePersistencePath({
      sdsPath: "/workspace/node/sds.yaml",
      origin: "https://github.com/Stream44/s44-rak-gen1@1.0",
      structKind: "model",
      modelId: "catalog",
      override: "./state/custom.json",
    });

    expect(actual).toBe(resolve("/workspace/node", "./state/custom.json"));
  });

  test("resolvePersistencePath uses origin hostname and DC3 default path", () => {
    const actual = resolvePersistencePath({
      sdsPath: "/workspace/node/sds.yaml",
      origin: "https://github.com/Stream44/s44-rak-gen1@1.0/models/catalog",
      structKind: "model",
      modelId: "catalog",
    });

    expect(actual).toBe(
      resolve(
        "/workspace/node",
        ".o",
        "github.com/Stream44/s44-rak-gen1@1.0",
        "model",
        "catalog.state.json",
      ),
    );
  });

  test("hydrate loads pre-existing JSON into app state", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "state.json");
      writeFileSync(
        path,
        JSON.stringify({ todo1: { done: false }, todo2: { done: true } }, null, 2),
        "utf8",
      );

      const app = new StubModelBoot();
      await createFsModelStore({ path }).hydrate(app as ModelBoot);

      expect(app.getState("todo1")).toEqual({ done: false });
      expect(app.getState("todo2")).toEqual({ done: true });
    });
  });

  test("hydrate is a no-op when the file is missing", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "missing.json");
      const app = new StubModelBoot();

      await expect(createFsModelStore({ path }).hydrate(app as ModelBoot)).resolves.toBeUndefined();
      expect(app.listInstances()).toEqual([]);
    });
  });

  test("subscribe writes debounced state snapshots after events", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "nested", "state.json");
      const app = new StubModelBoot();
      const unsubscribe = createFsModelStore({ path, debounceMs: 20 }).subscribe(app as ModelBoot);

      app.emit("todo1", { done: false });
      app.emit("todo1", { done: true });
      app.emit("todo2", { done: false });

      expect(existsSync(path)).toBe(false);
      await Bun.sleep(50);

      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
        todo1: { done: true },
        todo2: { done: false },
      });

      unsubscribe();
    });
  });

  test("unsubscribe flushes pending writes immediately", async () => {
    await withTmpDir(async (dir) => {
      const path = join(dir, "state.json");
      const app = new StubModelBoot();
      const unsubscribe = createFsModelStore({ path, debounceMs: 1_000 }).subscribe(
        app as ModelBoot,
      );

      app.emit("todo1", { done: true });
      unsubscribe();

      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({
        todo1: { done: true },
      });
    });
  });
});
