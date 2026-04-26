import { readFileSync } from "fs";
import { beforeEach, describe, expect, test } from "bun:test";
import { resolve } from "path";

import { AlgebraicKernel, IntentProcessor, ModelLoader } from "../../../L13-facade/index.ts";
import type { ModelBoot } from "../../../L09-demand/model-loader.ts";
import {
  AcceptanceEngine,
  ProjectorSession,
  hasSurfaceEvaluator,
  type ProjectionTree,
  type ScenarioResult,
  type SuiteResult,
} from "../../../L10-acceptance/acceptance.ts";
import { loadKindPack } from "../../../L11-projection/metamodel.ts";
import { ProjectionKernel } from "../../../L11-projection/projection-kernel.ts";
import { PrimitiveRegistry } from "../../../L11-projection/primitive-registry.ts";
import type { ProjectionAsset, ProjectionKind } from "../../../L01-foundation/projection-types.ts";
import { registerApiRestSurfaceHandlers } from "../../../L08-kinds/api-rest/surface-handlers.ts";
import { registerCliStdoutSurfaceHandlers } from "../../../L08-kinds/cli-stdout/surface-handlers.ts";

const MODEL_YAML = resolve(import.meta.dir, "../models/ecommerce.model.yaml");
const SUITE_YAML = resolve(import.meta.dir, "./ecommerce-cross.acceptance.yaml");
const PROJECTION_YAML = resolve(import.meta.dir, "../projection-engine/cross-product-orders.yaml");
const API_KIND_DIR = resolve(import.meta.dir, "../../../L08-kinds/api-rest");
const UI_KIND_DIR = resolve(import.meta.dir, "../../../L08-kinds/ui-html-ws");

let app: ModelBoot;
let engine: AcceptanceEngine;

registerApiRestSurfaceHandlers();
registerCliStdoutSurfaceHandlers();

beforeEach(() => {
  const ak = AlgebraicKernel.create();
  const loader = new ModelLoader(ak);
  loader.setIntentProcessor(new IntentProcessor(ak));
  app = loader.bootYamlFile(MODEL_YAML);
  app.setState("ord-001", { status: "pending" });
  app.setState("ord-002", { status: "pending" });

  engine = new AcceptanceEngine(app);
  engine.loadSuite(SUITE_YAML);
});

function compileProjection(app: ModelBoot) {
  const primitives = PrimitiveRegistry.createWithBuiltins();
  for (const name of ["Endpoint", "RouteParam", "ResponseShape"]) {
    primitives.register({ name, supportsChildren: true });
  }
  const kernel = new ProjectionKernel(app, { primitives });
  registerKindAssets(kernel, UI_KIND_DIR);
  registerKindAssets(kernel, API_KIND_DIR);
  const projection = kernel.loadYamlFile(PROJECTION_YAML);
  return { kernel, projection };
}

function registerKindAssets(kernel: ProjectionKernel, kindDir: string): void {
  const kind = loadKindPack(kindDir) as ProjectionKind & { primitiveAssets?: string[] };
  kernel.registerKind({ ...kind, cid: kind.cid ?? `test:${kind.id}` });
  for (const relativePath of kind.primitiveAssets ?? []) {
    const asset = Bun.YAML.parse(
      readFileSync(resolve(kindDir, relativePath), "utf-8"),
    ) as ProjectionAsset;
    kernel.registerAsset({ ...asset, cid: asset.cid ?? `test:${asset.name}` });
  }
}

function getScenario(result: SuiteResult): ScenarioResult {
  return result.useCases[0]!.scenarios[0]!;
}

function findNode(
  tree: ProjectionTree,
  predicate: (node: ProjectionTree["root"]) => boolean,
): ProjectionTree["root"] | null {
  const visit = (node: ProjectionTree["root"]): ProjectionTree["root"] | null => {
    if (predicate(node)) return node;
    for (const child of node.children) {
      const match = visit(child);
      if (match) return match;
    }
    return null;
  };

  return visit(tree.root);
}

describe("e-commerce cross-kind acceptance suite", () => {
  test("both surfaces render from the same loaded projection", async () => {
    const { kernel, projection } = compileProjection(app);
    const aliceCaps = engine
      .getSuite()!
      .personas.find((persona) => persona.id === "alice")!.capabilities;

    const uiSession = new ProjectorSession({
      kernel,
      projection,
      surface: "ui.html.ws",
      sessionCaps: aliceCaps,
    });
    const apiSession = new ProjectorSession({
      kernel,
      projection,
      surface: "api.rest",
      sessionCaps: aliceCaps,
    });

    expect(hasSurfaceEvaluator("ui.html.ws")).toBe(true);
    expect(hasSurfaceEvaluator("api.rest")).toBe(true);
    expect(projection.conformsToKind).toBe("cross.product");
    expect(uiSession.currentTree()).not.toBeNull();
    expect(await apiSession.requestHttp({ method: "GET", path: "/orders/ord-001" })).toMatchObject({
      status: 200,
      body: {
        customer: {
          pii: {
            email: "ada@example.com",
          },
        },
      },
    });
  });

  test("action dispatch on UI surface converges", async () => {
    const { kernel, projection } = compileProjection(app);
    const aliceCaps = engine
      .getSuite()!
      .personas.find((persona) => persona.id === "alice")!.capabilities;
    const session = new ProjectorSession({
      kernel,
      projection,
      surface: "ui.html.ws",
      sessionCaps: aliceCaps,
    });

    await session.click("[data-action=ConfirmOrder]");

    expect(app.getState("ord-001")).toMatchObject({ status: "confirmed" });
  });

  test("action dispatch on API surface converges", async () => {
    const { kernel, projection } = compileProjection(app);
    const bobCaps = engine
      .getSuite()!
      .personas.find((persona) => persona.id === "bob")!.capabilities;
    const session = new ProjectorSession({
      kernel,
      projection,
      surface: "api.rest",
      sessionCaps: bobCaps,
    });

    const response = await session.requestHttp({ method: "POST", path: "/orders/ord-002/confirm" });

    expect(response.status).toBe(200);
    expect(app.getState("ord-002")).toMatchObject({ status: "confirmed" });
  });

  test("uniform redaction across both surfaces for a cap-lacking persona", async () => {
    const { kernel, projection } = compileProjection(app);
    const bobCaps = engine
      .getSuite()!
      .personas.find((persona) => persona.id === "bob")!.capabilities;
    const session = new ProjectorSession({
      kernel,
      projection,
      surface: "ui.html.ws",
      sessionCaps: bobCaps,
    });

    const tree = session.currentTree();
    expect(tree).not.toBeNull();
    const redactedNode = findNode(
      tree!,
      (node) =>
        node.props["data-testid"] === "order-row-pii" && node.props["data-redacted"] === "1",
    );
    const response = await session.requestHttp({ method: "GET", path: "/orders/ord-001" });

    expect(redactedNode).not.toBeNull();
    expect(response.body).toMatchObject({
      customer: {
        pii: {
          email: "(redacted)",
        },
      },
    });
  });

  test("acceptance suite passes end-to-end", async () => {
    const { kernel, projection } = compileProjection(app);
    const aliceCaps = engine
      .getSuite()!
      .personas.find((persona) => persona.id === "alice")!.capabilities;
    const projectorSession = new ProjectorSession({
      kernel,
      projection,
      surface: "ui.html.ws",
      sessionCaps: aliceCaps,
    });

    const result = await engine.run({ projectorSession });
    const scenario = getScenario(result);

    expect(result.passed).toBe(true);
    expect(scenario.passed).toBe(true);
    expect(scenario.traces[0]!.steps).toHaveLength(2);
    expect(scenario.traces[0]!.steps.every((step) => step.passed)).toBe(true);
  });
});
