import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { resolve } from "node:path";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import { ModelLoader, type ActionDef, type ModelBoot } from "../L09-demand/model-loader.ts";
import { IntentProcessor } from "./intent.ts";
import { __resetActionDispatchWarnings, dispatchAction } from "./action-dispatch.ts";

type Call = { verb: string; target: string; payload?: Record<string, unknown> };

function appFor(actions: Record<string, ActionDef>) {
  const submits: Call[] = [];
  const removals: string[] = [];
  const batches: Call[][] = [];
  const app = {
    getActionDef(ref: string) {
      return actions[ref];
    },
    async submit(verb: string, target: string, payload?: Record<string, unknown>) {
      submits.push({ verb, target, payload });
      return { success: true, events: [] };
    },
    async batch(calls: Call[]) {
      batches.push(calls);
    },
    removeInstance(target: string) {
      removals.push(target);
    },
  } as unknown as ModelBoot;
  return { app, submits, removals, batches };
}

function bootItemCollection(): ModelBoot {
  const kernel = AlgebraicKernel.create();
  const loader = new ModelLoader(kernel);
  loader.setIntentProcessor(new IntentProcessor(kernel));
  return loader.bootYamlFile(
    resolve(import.meta.dir, "../tests/kernel-fixtures/entity-collection.model.yaml"),
  );
}

const ctx = {
  bindings: new Map<string, unknown>(),
  session: { currentUser: { id: "viewer", capabilities: {} } },
  route: { path: "/", params: {}, query: {} },
};

describe("dispatchAction", () => {
  beforeEach(() => {
    __resetActionDispatchWarnings();
  });

  test("mutate dispatches with target from targetField", async () => {
    const { app, submits } = appFor({
      ConfirmTodo: { verb: "confirm", kind: "mutate", targetField: "todoId" },
    });

    await expect(
      dispatchAction(app, { ref: "ConfirmTodo", payload: { todoId: "todo-1", done: true } }, ctx),
    ).resolves.toEqual({ handled: true });
    expect(submits).toEqual([
      { verb: "confirm", target: "todo-1", payload: { todoId: "todo-1", done: true } },
    ]);
  });

  test("create action does not embed key field into state (DC7)", async () => {
    const { app, submits } = appFor({
      CreateTodo: {
        verb: "add",
        kind: "create",
        keyField: "id",
        keyStrategy: "uuid",
        defaults: { done: false },
      },
    });

    await dispatchAction(app, { ref: "CreateTodo", payload: { title: "Ship router boot" } }, ctx);

    expect(submits).toHaveLength(1);
    expect(submits[0]?.verb).toBe("add");
    expect(submits[0]?.target).toMatch(/^[0-9a-f-]{36}$/i);
    expect(submits[0]?.payload).toEqual({
      done: false,
      title: "Ship router boot",
    });
  });

  test("deprecation warning fires for legacy keyField on action", async () => {
    const spy = spyOn(console, "warn").mockImplementation(() => {});
    const { app } = appFor({
      LegacyAddTodo: {
        verb: "add",
        kind: "create",
        keyField: "id",
        keyStrategy: "uuid",
        defaults: { done: false },
      },
    });

    await dispatchAction(
      app,
      { ref: "LegacyAddTodo", payload: { title: "Ship storage update" } },
      ctx,
    );
    await dispatchAction(
      app,
      { ref: "LegacyAddTodo", payload: { title: "Ship storage update again" } },
      ctx,
    );

    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith(expect.stringContaining("deprecated"));
    spy.mockRestore();
  });

  test("remove calls app.removeInstance with the resolved target", async () => {
    const { app, removals } = appFor({
      DeleteTodo: { verb: "delete", kind: "remove", targetField: "todoId" },
    });

    await expect(
      dispatchAction(app, { ref: "DeleteTodo", payload: { todoId: "todo-2" } }, ctx),
    ).resolves.toEqual({ handled: true });
    expect(removals).toEqual(["todo-2"]);
  });

  test("batch resolves selector and submit against $item and $payload, then calls app.batch", async () => {
    const { app, batches } = appFor({
      ToggleVisible: {
        verb: "toggleVisible",
        kind: "batch",
        selector: { op: "filter", of: "$bind.instances", where: { eq: ["$item.visible", true] } },
        submit: {
          verb: "toggle",
          target: "$item.id",
          payload: { id: "$item.id", done: "$payload.done" },
        },
      },
    });
    const batchCtx = {
      ...ctx,
      bindings: new Map<string, unknown>([
        [
          "instances",
          [
            { id: "a", visible: true },
            { id: "b", visible: false },
            { id: "c", visible: true },
          ],
        ],
      ]),
    };

    await expect(
      dispatchAction(app, { ref: "ToggleVisible", payload: { done: true } }, batchCtx),
    ).resolves.toEqual({ handled: true });
    expect(batches).toEqual([
      [
        { verb: "toggle", target: "a", payload: { id: "a", done: true } },
        { verb: "toggle", target: "c", payload: { id: "c", done: true } },
      ],
    ]);
  });

  test("custom returns handled false", async () => {
    const { app } = appFor({
      OpenComposer: { verb: "openComposer", kind: "custom" },
    });

    await expect(
      dispatchAction(app, { ref: "OpenComposer", payload: { mode: "inline" } }, ctx),
    ).resolves.toEqual({ handled: false });
  });

  test("unknown actions return handled false", async () => {
    const { app } = appFor({});

    await expect(dispatchAction(app, { ref: "MissingAction" }, ctx)).resolves.toEqual({
      handled: false,
    });
  });

  test("end-to-end create action writes 2-field state and a well-keyed map entry", async () => {
    const app = bootItemCollection();
    const beforeKeys = app.listInstances().length;

    await dispatchAction(app, { ref: "AddItem", payload: { title: "persist-me" } }, ctx);

    const after = app.listInstances();
    expect(after.length).toBe(beforeKeys + 1);
    const entry = after[after.length - 1];
    expect(entry?.state).toMatchObject({ title: "persist-me", completed: false });
    expect((entry?.state as { id?: string } | undefined)?.id).toBeUndefined();
    expect((entry?.state as { targetKey?: string } | undefined)?.targetKey).toBeUndefined();
    expect(entry?.key.length ?? 0).toBeGreaterThan(0);
  });
});
