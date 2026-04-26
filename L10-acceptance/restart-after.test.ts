import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  AcceptanceEngine,
  AlgebraicKernel,
  IntentProcessor,
  ModelLoader,
  type ModelBoot,
} from "../L13-facade/index.ts";
import { bootNode } from "../L14-hosts/projection-runtime/index.ts";

const TODO_MODEL = `model: restartable-todos
version: 1.0.0
origin: https://github.com/Stream44/s44-rak-gen1@1.0/tests/restartable-todos
entities:
  Todo:
    attributes:
      id: { type: string, required: true }
      title: { type: string, required: true }
      completed: { type: boolean, required: true }
actions:
  AddTodo:
    verb: add
    kind: create
    defaults: { completed: false }
    inputSchema:
      type: object
      required: [title]
      properties:
        title: { type: string, minLength: 1 }
`;

const TODO_SDS = `name: restartable-todos
version: 1.0.0
origin: https://github.com/Stream44/s44-rak-gen1@1.0/tests/restartable-todos-node
models:
  - path: ./todos.model.yaml
    initialBinding: true
storageSpaces:
  - name: todos-fs
    kind: filesystem
    path: ./data/todos.json
    format: json
    debounceMs: 0
bindings:
  - name: todo-records
    space: todos-fs
    aspect:
      kind: entityCollection
      entity: Todo
      keyField: id
    shape:
      stored: [title, completed]
      derived: { id: "$key" }
`;

const RESTART_SUITE = `id: restart-suite
name: Restart Suite
model: restartable-todos
version: 1.0.0
personas:
  - id: user
    name: User
    role: tester
    verbs: [add]
useCases:
  - id: uc-persistence
    name: Persistence
    scenarios:
      - id: sc-restart-after-add
        name: Restart after add
        restartAfter: [1]
        trace:
          - persona: user
            verb: add
            payload: { title: "stick" }
          - persona: user
            assertions:
              - kind: state
                key: "$lastCreated"
                expression: "state.title == 'stick' && state.completed == false"
              - kind: count
                entity: Todo
                equals: 1
`;

const TODOMVC_MODEL = resolve(import.meta.dir, "../examples/todomvc/models/todos.model.yaml");
const TODOMVC_SUITE = resolve(
  import.meta.dir,
  "../examples/todomvc/acceptance/todomvc.acceptance.yaml",
);

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

function wrapRestart(app: ModelBoot, onRestart: (nextApp: ModelBoot) => void): ModelBoot {
  const originalRestart = app.restart?.bind(app);
  if (!originalRestart) return app;
  app.restart = async () => {
    const nextApp = wrapRestart(await originalRestart(), onRestart);
    onRestart(nextApp);
    return nextApp;
  };
  return app;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true });
  }
});

describe("AcceptanceEngine restartAfter", () => {
  test("disposes and rebootstraps the app between named steps", async () => {
    const dir = makeTempDir("acceptance-restart-after-");
    writeFileSync(join(dir, "todos.model.yaml"), TODO_MODEL, "utf8");
    writeFileSync(join(dir, "sds.yaml"), TODO_SDS, "utf8");
    writeFileSync(join(dir, "suite.yaml"), RESTART_SUITE, "utf8");

    let restartCount = 0;
    let activeApp = wrapRestart(bootNode(dir).app, (nextApp) => {
      restartCount += 1;
      activeApp = nextApp;
    });

    try {
      const engine = new AcceptanceEngine(activeApp);
      engine.loadSuite(join(dir, "suite.yaml"));

      const result = await engine.run();
      expect(result.passed).toBe(true);
      expect(restartCount).toBe(1);

      const scenario = result.useCases[0]!.scenarios[0]!;
      expect(scenario.passed).toBe(true);
      expect(scenario.traces[0]!.steps[1]!.passed).toBe(true);

      const persisted = activeApp.listInstances();
      expect(persisted).toHaveLength(1);
      expect(persisted[0]!.state).toEqual(
        expect.objectContaining({ title: "stick", completed: false }),
      );
    } finally {
      await activeApp.flush?.();
      await activeApp.dispose?.();
    }
  });

  test("scenarios without restartAfter behave unchanged", async () => {
    const kernel = AlgebraicKernel.create();
    const loader = new ModelLoader(kernel);
    loader.setIntentProcessor(new IntentProcessor(kernel));
    const engine = new AcceptanceEngine(loader.bootYamlFile(TODOMVC_MODEL));

    engine.loadSuite(TODOMVC_SUITE);
    const result = await engine.run();

    expect(result.passed).toBe(true);
    expect(engine.getSuite()?.useCases.flatMap((useCase) => useCase.scenarios)).toHaveLength(7);
  });
});
