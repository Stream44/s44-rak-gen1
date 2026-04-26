import { afterEach, expect, mock, test } from "bun:test";
import {
  AlgebraicKernel,
  ModelLoader,
  type ModelDocument,
  type ModelLoadResult,
} from "../../L13-facade/index.ts";
import { desugarLegacyPersistence } from "./boot-node.ts";
import { validateStorageDeclarations } from "./sds-storage-validate.ts";
import type { ComposedSds } from "./sds-schema.ts";

afterEach(() => {
  mock.restore();
});

test("validates a single storage space and binding", () => {
  const models = loadModels(todoModel());
  expect(() =>
    validateStorageDeclarations({
      doc: {
        name: "todo-app",
        version: "1.0.0",
        origin: "https://example.test/todo",
        models: [],
        storageSpaces: [{ name: "todos", kind: "filesystem", path: "./todos.json" }],
        bindings: [
          {
            name: "todo-records",
            space: "todos",
            aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
            shape: { stored: ["title", "completed"], derived: { id: "$key" } },
          },
        ],
      },
      models,
    }),
  ).not.toThrow();
});

test("validates multiple spaces with entity, aggregate, and journal bindings", () => {
  const models = loadModels(todoModel(), orderModel());
  expect(() =>
    validateStorageDeclarations({
      doc: {
        name: "orders-app",
        version: "1.0.0",
        origin: "https://example.test/orders",
        models: [],
        storageSpaces: [
          { name: "records", kind: "filesystem", path: "./records.json" },
          {
            name: "journal",
            kind: "filesystem-journal",
            path: "./orders.ndjson",
            format: "ndjson",
          },
        ],
        bindings: [
          {
            name: "todo-records",
            space: "records",
            aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
            shape: { stored: ["title", "completed"], derived: { id: "$key" } },
          },
          {
            name: "order-lifecycles",
            space: "records",
            aspect: {
              kind: "stateMachineAggregate",
              machine: "OrderLifecycle",
              keyField: "orderId",
              snapshotEvery: 10,
            },
            shape: {
              stored: ["currentState", "transitionCount", "lastTransitionAt"],
              derived: { orderId: "$key" },
            },
          },
          {
            name: "order-events",
            space: "journal",
            aspect: { kind: "eventJournal", machine: "OrderLifecycle" },
            shape: {
              stored: {
                op: "pick",
                of: "$self",
                fields: [
                  "verb",
                  "payload",
                  "beforeState",
                  "afterState",
                  "at",
                  "causationKey",
                  "aggregateKey",
                ],
              },
            },
          },
        ],
      },
      models,
    }),
  ).not.toThrow();
});

test("rejects bindings that reference unknown spaces", () => {
  const models = loadModels(todoModel());
  expect(() =>
    validateStorageDeclarations({
      doc: {
        name: "todo-app",
        version: "1.0.0",
        origin: "https://example.test/todo",
        models: [],
        storageSpaces: [{ name: "todos", kind: "filesystem" }],
        bindings: [
          {
            name: "todo-records",
            space: "missing-space",
            aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
            shape: { stored: "$self" },
          },
        ],
      },
      models,
    }),
  ).toThrow('sds: binding "todo-records" references unknown space "missing-space"');
});

test("rejects bindings that reference unknown entities", () => {
  const models = loadModels(todoModel());
  expect(() =>
    validateStorageDeclarations({
      doc: {
        name: "todo-app",
        version: "1.0.0",
        origin: "https://example.test/todo",
        models: [],
        storageSpaces: [{ name: "todos", kind: "filesystem" }],
        bindings: [
          {
            name: "ghost-records",
            space: "todos",
            aspect: { kind: "entityCollection", entity: "Ghost", keyField: "id" },
            shape: { stored: "$self" },
          },
        ],
      },
      models,
    }),
  ).toThrow('sds: binding "ghost-records" references unknown entity "Ghost"');
});

test("rejects bindings that reference unknown machines", () => {
  const models = loadModels(orderModel());
  expect(() =>
    validateStorageDeclarations({
      doc: {
        name: "orders-app",
        version: "1.0.0",
        origin: "https://example.test/orders",
        models: [],
        storageSpaces: [{ name: "records", kind: "filesystem" }],
        bindings: [
          {
            name: "ghost-machine",
            space: "records",
            aspect: {
              kind: "stateMachineAggregate",
              machine: "UnknownMachine",
              keyField: "orderId",
            },
            shape: { stored: ["currentState"] },
          },
        ],
      },
      models,
    }),
  ).toThrow('sds: binding "ghost-machine" references unknown machine "UnknownMachine"');
});

test("rejects unknown shape fields with a suggestion", () => {
  const models = loadModels(todoModel());
  expect(() =>
    validateStorageDeclarations({
      doc: {
        name: "todo-app",
        version: "1.0.0",
        origin: "https://example.test/todo",
        models: [],
        storageSpaces: [{ name: "todos", kind: "filesystem" }],
        bindings: [
          {
            name: "todo-records",
            space: "todos",
            aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
            shape: {
              stored: {
                op: "pick",
                of: "$self",
                fields: ["titel"],
              },
            },
          },
        ],
      },
      models,
    }),
  ).toThrow(
    'sds: binding "todo-records" shape.stored.fields references unknown attribute "titel" on entity "Todo" (did you mean "title"?)',
  );
});

test("rejects duplicate storage space names", () => {
  const models = loadModels(todoModel());
  expect(() =>
    validateStorageDeclarations({
      doc: {
        name: "todo-app",
        version: "1.0.0",
        origin: "https://example.test/todo",
        models: [],
        storageSpaces: [
          { name: "todos", kind: "filesystem" },
          { name: "todos", kind: "filesystem-journal" },
        ],
        bindings: [],
      },
      models,
    }),
  ).toThrow('sds: storageSpaces contains duplicate name "todos"');
});

test("rejects duplicate binding names", () => {
  const models = loadModels(todoModel());
  expect(() =>
    validateStorageDeclarations({
      doc: {
        name: "todo-app",
        version: "1.0.0",
        origin: "https://example.test/todo",
        models: [],
        storageSpaces: [{ name: "todos", kind: "filesystem" }],
        bindings: [
          {
            name: "todo-records",
            space: "todos",
            aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
            shape: { stored: "$self" },
          },
          {
            name: "todo-records",
            space: "todos",
            aspect: { kind: "eventJournal", entity: "Todo" },
            shape: { stored: "$self" },
          },
        ],
      },
      models,
    }),
  ).toThrow('sds: bindings contains duplicate name "todo-records"');
});

test("rejects duplicate bindings for the same entity aspect pair", () => {
  const models = loadModels(todoModel());
  expect(() =>
    validateStorageDeclarations({
      doc: {
        name: "todo-app",
        version: "1.0.0",
        origin: "https://example.test/todo",
        models: [],
        storageSpaces: [{ name: "todos", kind: "filesystem" }],
        bindings: [
          {
            name: "todo-records",
            space: "todos",
            aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
            shape: { stored: "$self" },
          },
          {
            name: "todo-records-copy",
            space: "todos",
            aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
            shape: { stored: "$self" },
          },
        ],
      },
      models,
    }),
  ).toThrow(
    'sds: duplicate binding for (entityCollection, Todo): "todo-records" and "todo-records-copy". V1 allows one binding per (subject, aspect-kind).',
  );
});

test("rejects mixing legacy persistence with storage spaces", () => {
  const warning = mock(() => {});
  const originalWarn = console.warn;
  console.warn = warning as typeof console.warn;
  try {
    expect(() =>
      desugarLegacyPersistence(
        {
          name: "legacy-app",
          version: "1.0.0",
          origin: "https://example.test/legacy",
          models: [{ path: "./todo-primary.model.yaml", role: "primary", initialBinding: true }],
          persistence: { kind: "filesystem", path: "./legacy.json" },
          storageSpaces: [{ name: "todos", kind: "filesystem", path: "./todos.json" }],
        },
        [
          {
            model: { path: "./todo-primary.model.yaml", role: "primary", initialBinding: true },
            result: loadModels(primaryTodoModel()).get("todo-primary")!,
          },
        ],
        new Set<string>(),
      ),
    ).toThrow("sds: cannot mix legacy persistence: with storageSpaces/bindings");
  } finally {
    console.warn = originalWarn;
  }
});

test("desugars legacy filesystem persistence into one space and one binding", () => {
  const warn = mock(() => {});
  const originalWarn = console.warn;
  console.warn = warn as typeof console.warn;
  const models = loadModels(primaryTodoModel());
  try {
    const desugared = desugarLegacyPersistence(
      {
        name: "legacy-app",
        version: "1.0.0",
        origin: "https://example.test/legacy",
        models: [{ path: "./todo-primary.model.yaml", role: "primary", initialBinding: true }],
        persistence: { kind: "filesystem", path: "./legacy.json" },
      },
      [
        {
          model: { path: "./todo-primary.model.yaml", role: "primary", initialBinding: true },
          result: models.get("todo-primary")!,
        },
      ],
      new Set<string>(),
    );

    expect(desugared.storageSpaces).toEqual([
      {
        name: "default-fs",
        kind: "filesystem",
        path: "./legacy.json",
        debounceMs: 50,
      },
    ]);
    expect(desugared.bindings).toEqual([
      {
        name: "default",
        space: "default-fs",
        aspect: { kind: "entityCollection", entity: "Todo", keyField: "id" },
        shape: { stored: "$self", derived: { id: "$key" } },
      },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]?.[0]).toContain("auto-desugaring to storageSpaces + bindings");
  } finally {
    console.warn = originalWarn;
  }
});

test("logs the legacy desugar warning once per boot for the same sds", () => {
  const warn = mock(() => {});
  const originalWarn = console.warn;
  console.warn = warn as typeof console.warn;
  const warned = new Set<string>();
  const result = loadModels(primaryTodoModel()).get("todo-primary")!;
  const doc: ComposedSds = {
    name: "legacy-app",
    version: "1.0.0",
    origin: "https://example.test/legacy",
    models: [{ path: "./todo-primary.model.yaml", role: "primary", initialBinding: true }],
    persistence: { kind: "filesystem", path: "./legacy.json" },
  };
  const loaded = [
    { model: { path: "./todo-primary.model.yaml", role: "primary", initialBinding: true }, result },
  ];

  try {
    desugarLegacyPersistence(doc, loaded, warned);
    desugarLegacyPersistence(doc, loaded, warned);

    expect(warn).toHaveBeenCalledTimes(1);
  } finally {
    console.warn = originalWarn;
  }
});

function loadModels(...docs: ModelDocument[]): Map<string, ModelLoadResult> {
  const loader = new ModelLoader(AlgebraicKernel.create());
  return new Map(
    docs.map((doc) => {
      const result = loader.loadModel(doc);
      return [result.modelId, result];
    }),
  );
}

function todoModel(): ModelDocument {
  return {
    model: "todo",
    version: "1.0.0",
    origin: "https://example.test/todo",
    entities: {
      Todo: {
        attributes: {
          id: { type: "string", required: true },
          title: { type: "string", required: true },
          completed: { type: "boolean", required: true },
        },
      },
    },
  };
}

function primaryTodoModel(): ModelDocument {
  return {
    ...todoModel(),
    model: "todo-primary",
  };
}

function orderModel(): ModelDocument {
  return {
    model: "orders",
    version: "1.0.0",
    origin: "https://example.test/orders",
    entities: {
      Order: {
        attributes: {
          id: { type: "string", required: true },
          orderId: { type: "string" },
          total: { type: "number", required: true },
        },
      },
    },
    lifecycle: {
      machine: "OrderLifecycle",
      states: ["pending", "paid"],
      initial: "pending",
      terminal: ["paid"],
      transitions: [{ from: "pending", to: "paid", verb: "pay" }],
    } as ModelDocument["lifecycle"],
  };
}
