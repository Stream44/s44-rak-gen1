import { describe, expect, test } from "bun:test";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import { ModelLoader, type ModelDocument } from "../L09-demand/model-loader.ts";
import { validateMorphismDocument } from "../L02-metamodels/morphism-document-adapter.ts";
import {
  buildModelIntrospectionRuntimeDocument,
  registerModelIntrospectionMorphisms,
} from "./model-introspection-m1.ts";
import { CORE_MODEL_FIXTURE } from "../tests/kernel-fixtures/core.model.ts";
import { COMMERCE_MODEL_FIXTURE } from "../tests/kernel-fixtures/commerce.model.ts";

describe("model introspection morphism document", () => {
  test("validateMorphismDocument(buildModelIntrospectionRuntimeDocument()) does not throw", () => {
    expect(() => validateMorphismDocument(buildModelIntrospectionRuntimeDocument())).not.toThrow();
  });

  test("listLoadedModels morphism with empty loader returns []", async () => {
    const { kernel } = setup();
    await expect(
      kernel.morphisms.evaluate("morphism://adk/listLoadedModels/1.0", {
        loader: { loadedModels: {} },
      }),
    ).resolves.toEqual([]);
  });

  test("listLoadedModels morphism with core-only loader returns 1 entry with modelId and non-zero typeCount", async () => {
    const { kernel, loader, core } = loadModels("core");
    const result = (await kernel.morphisms.evaluate("morphism://adk/listLoadedModels/1.0", {
      loader: { loadedModels: { core } },
    })) as Array<Record<string, unknown>>;
    expect(result).toHaveLength(1);
    expect(result[0]?.modelId).toBe("core");
    expect(Number(result[0]?.typeCount)).toBeGreaterThan(0);
    expect(await loader.listLoadedModels()).toEqual(result);
  });

  test("listLoadedModels morphism with core + commerce returns accurate counts", async () => {
    const { kernel, core, commerce } = loadModels("core", "commerce");
    await expect(
      kernel.morphisms.evaluate("morphism://adk/listLoadedModels/1.0", {
        loader: { loadedModels: { core, commerce } },
      }),
    ).resolves.toEqual([
      {
        modelId: "core",
        origin: "fixture.kernel/core",
        version: "1.0.0",
        conformsTo: undefined,
        typeCount: 3,
        enumCount: 0,
        relationCount: 0,
        actionCount: 0,
        hasLifecycle: false,
      },
      {
        modelId: "commerce",
        origin: "fixture.kernel/commerce",
        version: "1.0.0",
        conformsTo: "core",
        typeCount: 4,
        enumCount: 2,
        relationCount: 0,
        actionCount: 6,
        hasLifecycle: true,
      },
    ]);
  });

  test("getModelDocument morphism with known modelId returns the full document", async () => {
    const { kernel, core } = loadModels("core");
    await expect(
      kernel.morphisms.evaluate("morphism://adk/getModelDocument/1.0", {
        loader: { loadedModels: { core } },
        modelId: "core",
      }),
    ).resolves.toEqual(core.document);
  });

  test("getModelDocument morphism with unknown modelId returns null", async () => {
    const { kernel } = loadModels("core");
    await expect(
      kernel.morphisms.evaluate("morphism://adk/getModelDocument/1.0", {
        loader: { loadedModels: {} },
        modelId: "missing",
      }),
    ).resolves.toBeNull();
  });

  test("walkModelCrossRefs collects typeToRelations for a commerce-shaped document", async () => {
    const { kernel, commerce } = loadModels("commerce");
    const document = {
      ...commerce.document,
      relations: {
        TransactionParty: { roles: { transaction: "Transaction", party: "Party" } },
        ReceiptTransaction: { roles: { receipt: "Receipt", transaction: "Transaction" } },
      },
    };
    const result = (await kernel.morphisms.evaluate("morphism://adk/walkModelCrossRefs/1.0", {
      document,
    })) as { typeToRelations: Record<string, string[]> };
    expect(result.typeToRelations.Transaction).toEqual(["TransactionParty", "ReceiptTransaction"]);
  });

  test("walkModelCrossRefs on commerce actions maps action names to the lifecycle machine id", async () => {
    const { kernel, commerce } = loadModels("commerce");
    const result = (await kernel.morphisms.evaluate("morphism://adk/walkModelCrossRefs/1.0", {
      document: commerce.document,
    })) as { actionToTargetMachine: Record<string, string> };
    expect(result.actionToTargetMachine.ConfirmOrder).toBe(commerce.statemachineId);
    expect(result.actionToTargetMachine.CancelOrder).toBe(commerce.statemachineId);
  });

  test("walkModelCrossRefs on a module morphism records a synthetic asset-module entry", async () => {
    const { kernel } = setup();
    const result = (await kernel.morphisms.evaluate("morphism://adk/walkModelCrossRefs/1.0", {
      document: {
        morphisms: { loadAsset: { impl: { kind: "module", uri: "module://./mods/demo.ts" } } },
      },
    })) as { morphismToAssets: Record<string, string[]> };
    expect(result.morphismToAssets.loadAsset).toEqual(["asset-module:module://./mods/demo.ts"]);
  });

  test("walkModelCrossRefs on nested algebra assetRef nodes collects all refs", async () => {
    const { kernel } = setup();
    const document = {
      morphisms: {
        nested: {
          impl: {
            kind: "algebra",
            ast: {
              op: "let",
              name: "$x",
              value: { op: "assetRef", name: "asset://first" },
              body: {
                op: "record",
                fields: {
                  nested: {
                    op: "array",
                    elements: [
                      { op: "assetRef", name: "asset://second" },
                      {
                        op: "record",
                        fields: { deeper: { op: "assetRef", name: "asset://third" } },
                      },
                    ],
                  },
                },
              },
            },
          },
        },
      },
    };
    const result = (await kernel.morphisms.evaluate("morphism://adk/walkModelCrossRefs/1.0", {
      document,
    })) as { morphismToAssets: Record<string, string[]> };
    expect(result.morphismToAssets.nested).toEqual([
      "asset://first",
      "asset://second",
      "asset://third",
    ]);
  });

  test("ModelLoader.listLoadedModels returns the same shape as direct dispatch", async () => {
    const { kernel, loader, core, commerce } = loadModels("core", "commerce");
    const direct = await kernel.morphisms.evaluate("morphism://adk/listLoadedModels/1.0", {
      loader: { loadedModels: { core, commerce } },
    });
    await expect(loader.listLoadedModels()).resolves.toEqual(direct);
  });

  test("ModelLoader.getModelDocument(unknownId) returns undefined", async () => {
    const { loader } = loadModels("core");
    await expect(loader.getModelDocument("unknown")).resolves.toBeUndefined();
  });

  test("ModelLoader.walkCrossRefs(unknownId) returns undefined before walk dispatch", async () => {
    const { kernel, loader } = loadModels("core");
    const original = kernel.morphisms.evaluate.bind(kernel.morphisms);
    kernel.morphisms.evaluate = ((id: string, input: unknown) => {
      if (id === "morphism://adk/walkModelCrossRefs/1.0")
        throw new Error("walk dispatch should not happen");
      return original(id, input);
    }) as typeof kernel.morphisms.evaluate;
    await expect(loader.walkCrossRefs("unknown")).resolves.toBeUndefined();
  });

  test("empty state returns [] / undefined / undefined through the facade", async () => {
    const { loader } = setup();
    await expect(loader.listLoadedModels()).resolves.toEqual([]);
    await expect(loader.getModelDocument("x")).resolves.toBeUndefined();
    await expect(loader.walkCrossRefs("x")).resolves.toBeUndefined();
  });

  test("walkModelCrossRefs on commerce completes in <= 10ms", async () => {
    const { kernel, commerce } = loadModels("commerce");
    await kernel.morphisms.evaluate("morphism://adk/walkModelCrossRefs/1.0", {
      document: commerce.document,
    });
    const start = performance.now();
    await kernel.morphisms.evaluate("morphism://adk/walkModelCrossRefs/1.0", {
      document: commerce.document,
    });
    expect(performance.now() - start).toBeLessThanOrEqual(10);
  });
});

function setup() {
  const kernel = AlgebraicKernel.create();
  registerModelIntrospectionMorphisms(kernel);
  return { kernel, loader: new ModelLoader(kernel) };
}

function loadModels(...which: Array<"core" | "commerce">) {
  const { kernel, loader } = setup();
  const out: {
    kernel: AlgebraicKernel;
    loader: ModelLoader;
    core?: ReturnType<ModelLoader["loadModel"]>;
    commerce?: ReturnType<ModelLoader["loadModel"]>;
  } = { kernel, loader };
  for (const name of which)
    out[name] = loader.loadModel(
      name === "core"
        ? (CORE_MODEL_FIXTURE as ModelDocument)
        : (COMMERCE_MODEL_FIXTURE as ModelDocument),
    );
  return out as {
    kernel: AlgebraicKernel;
    loader: ModelLoader;
    core: ReturnType<ModelLoader["loadModel"]>;
    commerce: ReturnType<ModelLoader["loadModel"]>;
  };
}
