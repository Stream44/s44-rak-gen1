import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { AlgebraicKernel, type ActionType, type JsonSchema } from "../L13-facade/index.ts";
import { buildManifest as buildManifest27 } from "./dispatch.ts";
import { loadKernelModel } from "./bootstrap.ts";
import { parseKernelModel } from "./metamodel.ts";

const YAML_PATH = resolve(import.meta.dir, "..", "L00-model", "kernel.model.yaml");
const FIXTURE_PATH = resolve(import.meta.dir, "../tests/kernel-fixtures/projections/api.yaml");
const morphismId = (name: string) => `morphism://github.com/Stream44/s44-rak-gen1@1.0/${name}/1.0`;
const snap = (manifest: { byName: Map<string, unknown>; byUri: Map<string, unknown> }) => ({
  byName: [...manifest.byName.entries()],
  byUri: [...manifest.byUri.entries()],
});

function makeAction(name: string, schema: JsonSchema = { type: "object" }): ActionType {
  return {
    id: `action://ecommerce/${name}/1.0.0`,
    name,
    version: "1.0.0",
    verb: name.toLowerCase(),
    inputSchema: schema,
    targetMachine: "EchoLifecycle",
    preconditions: [],
    origin: "ecommerce",
  };
}

async function fresh() {
  const ak = AlgebraicKernel.create();
  const runtime = await loadKernelModel(YAML_PATH, { kernel: ak });
  return { ak, runtime };
}

describe("Compile action", () => {
  test("parses minimal valid YAML into a compiled projection", async () => {
    const { runtime } = await fresh();
    const result = await runtime.dispatch({
      ref: "Compile",
      payload: {
        yamlText:
          "projector: test\nversion: 0.0.1\nsession:\n  scope: test\nbindsModel: demo@1.0.0\npages:\n  index:\n    children: []\n",
      },
    });
    expect(result.success).toBe(true);
    expect((result.value as any).model.projector).toBe("test");
    expect((result.value as any).model.version).toBe("0.0.1");
  });

  test("reports invalid YAML with the existing schema error wording", async () => {
    const { runtime } = await fresh();
    const result = await runtime.dispatch({
      ref: "Compile",
      payload: {
        yamlText:
          "version: 0.0.1\nsession:\n  scope: test\nbindsModel: demo@1.0.0\npages:\n  index:\n    children: []\n",
      },
    });
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/projector/);
  });

  test("resolve-extends shim dispatches extendsResolver and returns the morphism output", async () => {
    const resolveExtends = (await import("./morphisms/resolve-extends.ts")).default;
    const calls: unknown[] = [];
    const output = { projector: "shimmed", version: "1", bindsModel: "demo" };
    const kernel = {
      morphisms: {
        evaluate: async (id: string, payload: unknown) => {
          calls.push({ id, payload });
          return output;
        },
      },
    } as any;
    const child = {
      projector: "test",
      version: "0.0.1",
      session: { scope: "test" },
      bindsModel: "demo@1.0.0",
      extends: ["base"],
      morphism: { op: "ref", asset: "Heading" },
    } as any;
    const base = {
      projector: "base",
      version: "0.0.1",
      session: { scope: "test" },
      bindsModel: "demo@1.0.0",
      morphism: { op: "ref", asset: "Heading" },
      title: "base-title",
    } as any;
    const payload = { doc: child, registry: new Map([["base", base]]) };
    await expect(resolveExtends(payload, kernel)).resolves.toEqual(output);
    expect(calls).toEqual([{ id: "morphism://adk/extendsResolver/1.0", payload }]);
  });

  test("builds a manifest from explicit custom and ephemeral entries with parity to 27", async () => {
    const { ak, runtime } = await fresh();
    const yamlText =
      "projector: test\nversion: 0.0.1\nsession:\n  scope: test\nbindsModel: demo@1.0.0\npages:\n  index:\n    children: []\nactions:\n  - name: custom\n    kind: custom\n  - name: ephemeral\n    kind: ephemeral\n";
    const result = await runtime.dispatch({ ref: "Compile", payload: { yamlText } });
    expect(result.success).toBe(true);
    const manifest = (result.value as any).manifest;
    expect(manifest.byName.size).toBeGreaterThanOrEqual(2);
    expect(manifest.byName.get("custom")?.kind).toBe("custom");
    expect(manifest.byName.get("ephemeral")?.kind).toBe("ephemeral");
    const doc = (await ak.morphisms.evaluate(morphismId("parseProjectionDoc"), {
      yamlText,
    })) as any;
    expect(snap(manifest)).toEqual(snap(buildManifest27(doc, new Map())));
  });

  test("walks page and morphism projectors into the expected shallow AST shapes", async () => {
    const { runtime } = await fresh();
    const pages = await runtime.dispatch({
      ref: "Compile",
      payload: {
        yamlText:
          "projector: test\nversion: 0.0.1\nsession:\n  scope: test\nbindsModel: demo@1.0.0\npages:\n  index:\n    children:\n      - component: Text\n",
      },
    });
    const morphism = await runtime.dispatch({
      ref: "Compile",
      payload: {
        yamlText:
          "projector: test\nversion: 0.0.1\nsession:\n  scope: test\nbindsModel: demo@1.0.0\nmorphism:\n  op: ref\n  asset: Heading\n  props:\n    text: hi\n",
      },
    });
    expect((pages.value as any).ast.kind).toBe("pages");
    expect((pages.value as any).ast.entries).toHaveLength(1);
    expect((morphism.value as any).ast.kind).toBe("morphism");
    expect((morphism.value as any).ast.entries).toHaveLength(1);
  });

  test("surveys one demand binding into one data requirement", async () => {
    const { runtime } = await fresh();
    const result = await runtime.dispatch({
      ref: "Compile",
      payload: {
        yamlText:
          "projector: test\nversion: 0.0.1\nsession:\n  scope: test\nbindsModel: demo@1.0.0\npages:\n  index:\n    bind:\n      users: $demand.UserModel/list\n    children: []\n",
      },
    });
    expect((result.value as any).staticRequirements).toEqual([
      { model: "UserModel", selector: "list", nodePath: "pages.index.bind.users" },
    ]);
  });

  test("compiles the api fixture end-to-end", async () => {
    const { runtime } = await fresh();
    const result = await runtime.dispatch({
      ref: "Compile",
      payload: { yamlText: readFileSync(FIXTURE_PATH, "utf-8") },
    });
    expect(result.success).toBe(true);
    expect(result.value).toMatchObject({
      cid: expect.any(String),
      model: expect.any(Object),
      manifest: expect.any(Object),
      ast: expect.any(Object),
      staticRequirements: expect.any(Array),
      staticCapabilities: expect.any(Array),
    });
  });

  test("keeps parity with the parsed document and 27-manifest cardinality", async () => {
    const { ak, runtime } = await fresh();
    const yamlText = readFileSync(FIXTURE_PATH, "utf-8");
    const actionMap = new Map([
      [
        "ConfirmOrder",
        makeAction("ConfirmOrder", {
          type: "object",
          required: ["id"],
          properties: { id: { type: "string" } },
        }),
      ],
    ]);
    const parsed = (await ak.morphisms.evaluate(morphismId("parseProjectionDoc"), {
      yamlText,
    })) as any;
    const manifest = (await ak.morphisms.evaluate(morphismId("buildManifest"), {
      ...parsed,
      modelActions: actionMap,
    })) as any;
    const compiled = await runtime.dispatch({ ref: "Compile", payload: { yamlText } });
    expect(compiled.success).toBe(true);
    expect((compiled.value as any).model).toEqual(parsed);
    expect((compiled.value as any).manifest.byName.size).toBe(
      buildManifest27(parsed, actionMap).byName.size,
    );
    expect(snap(manifest.manifest ?? manifest)).toEqual(snap(buildManifest27(parsed, actionMap)));
  });

  test("kernel.model.yaml remains parseable after adding compile-path entries", () => {
    expect(() => parseKernelModel(readFileSync(YAML_PATH, "utf-8"))).not.toThrow();
  });
});
