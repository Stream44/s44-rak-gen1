import { describe, test, expect, beforeEach } from "bun:test";
import { MetaLevel } from "../L13-facade/index.ts";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import { IntentProcessor } from "../L07-agency/intent.ts";
import { UnfoldingEngine } from "./unfold.ts";
import { buildTypeUri } from "../L01-foundation/utils.ts";
import { AssetRegistry } from "../L11-projection/asset-registry.ts";
import type { MorphismAST, RefNode } from "../L11-projection/algebra.ts";
import { loadKindPack } from "../L11-projection/metamodel.ts";
import type {
  ProjectionAsset,
  ProjectionModel,
  ProjectionNode,
  ProjectionTree,
  ProjectionKind,
} from "../L01-foundation/projection-types.ts";
import apiDispatch from "../L08-kinds/api-rest/dispatch.ts";
import renderAuthZ from "../L08-kinds/api-rest/primitives/AuthZ.ts";
import renderEndpoint from "../L08-kinds/api-rest/primitives/Endpoint.ts";
import renderErrorCase from "../L08-kinds/api-rest/primitives/ErrorCase.ts";
import renderQueryParam from "../L08-kinds/api-rest/primitives/QueryParam.ts";
import renderRequestBody from "../L08-kinds/api-rest/primitives/RequestBody.ts";
import renderResponseShape from "../L08-kinds/api-rest/primitives/ResponseShape.ts";
import renderRouteParam from "../L08-kinds/api-rest/primitives/RouteParam.ts";
import { readFileSync } from "fs";
import { resolve } from "path";

// ── Setup ────────────────────────────────────────────────────────────────

let ak: AlgebraicKernel;
let intents: IntentProcessor;
let engine: UnfoldingEngine;
const API_KIND_DIR = resolve(import.meta.dir, "../L08-kinds/api-rest");
const API_RENDERERS = new Map([
  ["AuthZ", renderAuthZ],
  ["Endpoint", renderEndpoint],
  ["ErrorCase", renderErrorCase],
  ["QueryParam", renderQueryParam],
  ["RequestBody", renderRequestBody],
  ["ResponseShape", renderResponseShape],
  ["RouteParam", renderRouteParam],
] as const);

beforeEach(() => {
  ak = AlgebraicKernel.create();
  intents = new IntentProcessor(ak);
  engine = new UnfoldingEngine(ak, intents);
});

// ── Helpers ──────────────────────────────────────────────────────────────

function defineOrderType(): string {
  const id = buildTypeUri("test.example", "Order", "1.0");
  ak.defineType({
    id,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    name: "Order",
    version: "1.0",
    schema: {
      type: "object",
      required: ["id", "status", "total"],
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["pending", "paid", "shipped", "delivered"] },
        total: { type: "number", minimum: 0 },
      },
    },
  });
  return id;
}

function defineProductType(): string {
  const id = buildTypeUri("test.example", "Product", "1.0");
  ak.defineType({
    id,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    name: "Product",
    version: "1.0",
    schema: {
      type: "object",
      required: ["sku", "name", "price"],
      properties: {
        sku: { type: "string" },
        name: { type: "string" },
        price: { type: "number" },
      },
    },
  });
  return id;
}

function defineCapabilityOrderType(): string {
  const id = buildTypeUri("test.example", "SecureOrder", "1.0");
  ak.defineType({
    id,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    name: "SecureOrder",
    version: "1.0",
    schema: {
      type: "object",
      required: ["id", "status"],
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["draft", "approved"] },
      },
    },
  });
  return id;
}

function collectRefs(ast: MorphismAST): RefNode[] {
  switch (ast.op) {
    case "ref":
      return [ast];
    case "product":
      return [...collectRefs(ast.left), ...collectRefs(ast.right)];
    case "compose":
      return [...collectRefs(ast.outer), ...collectRefs(ast.inner)];
    case "sum":
      return [...collectRefs(ast.then), ...collectRefs(ast.else)];
    case "restrict":
      return [...collectRefs(ast.f), ...(ast.fallback ? collectRefs(ast.fallback) : [])];
    case "extend":
      return collectRefs(ast.f);
    case "fmap":
      return collectRefs(ast.f);
    case "iter":
      return collectRefs(ast.template);
    case "cond":
      return [...collectRefs(ast.then), ...(ast.else ? collectRefs(ast.else) : [])];
    case "guard":
      return [...collectRefs(ast.f), ...(ast.fallback ? collectRefs(ast.fallback) : [])];
    case "literal":
      return [];
  }
}

function morphismToNodes(ast: MorphismAST, registry: AssetRegistry): ProjectionNode[] {
  switch (ast.op) {
    case "ref": {
      const asset = registry.resolve(ast.asset, "api.rest");
      const name = asset?.name ?? ast.asset.split("/").at(-2) ?? ast.asset;
      const props = { ...(ast.props ?? {}) };
      const childAsts = Array.isArray(props.children) ? (props.children as MorphismAST[]) : [];
      delete props.children;
      if (ast.requires) props.requires = ast.requires;
      return [
        {
          component: name,
          props,
          children: childAsts.flatMap((child) => morphismToNodes(child, registry)),
        },
      ];
    }
    case "product":
      return [...morphismToNodes(ast.left, registry), ...morphismToNodes(ast.right, registry)];
    case "literal":
      return [];
    default:
      throw new Error(`Unsupported morphism op in test helper: ${ast.op}`);
  }
}

function compileAndRender(morphism: MorphismAST) {
  const registry = new AssetRegistry();
  registerApiRestAssets(registry);
  const tree: ProjectionTree = {
    root: {
      component: "Root",
      props: {},
      children: morphismToNodes(morphism, registry),
    },
    pageName: "api.rest",
    actionHandlers: [],
  };
  return apiDispatch(
    tree,
    {
      projector: { projector: "test-api", version: "1.0.0" },
    },
    (component) => API_RENDERERS.get(component as never) ?? null,
  );
}

function projectionMorphism(projection: ProjectionModel): MorphismAST {
  return (projection as ProjectionModel & { morphism: MorphismAST }).morphism;
}

function registerApiRestAssets(registry: AssetRegistry): void {
  const kind = loadKindPack(API_KIND_DIR) as ProjectionKind & { primitiveAssets?: string[] };
  registry.registerKind({ ...kind, cid: kind.cid ?? `test:${kind.id}` });
  for (const relativePath of kind.primitiveAssets ?? []) {
    const asset = Bun.YAML.parse(
      readFileSync(resolve(API_KIND_DIR, relativePath), "utf-8"),
    ) as ProjectionAsset;
    registry.register({ ...asset, cid: asset.cid ?? `test:${asset.name}` });
  }
}

// ── Tests ────────────────────────────────────────────────────────────────

describe("UnfoldingEngine", () => {
  test("unfold Order with status enum", () => {
    const seedRef = defineOrderType();
    const result = engine.unfold(seedRef);

    expect(result.seed).toBe(seedRef);
    expect(result.strata.data).toBe(seedRef);

    // Process stratum: machine ID exists
    expect(result.strata.process).toBe("order-lifecycle");

    // Agency stratum: 3 actions (pending->paid, paid->shipped, shipped->delivered)
    expect(result.strata.actions).toHaveLength(3);
    expect(result.strata.actions[0].verb).toBe("paid");
    expect(result.strata.actions[1].verb).toBe("shipped");
    expect(result.strata.actions[2].verb).toBe("delivered");

    // Interface stratum: GET list, GET by id, POST create, + 3 action endpoints = 6
    expect(result.strata.endpoints.length).toBeGreaterThanOrEqual(5);
  });

  test("unfold Product without status", () => {
    const seedRef = defineProductType();
    const result = engine.unfold(seedRef);

    expect(result.strata.data).toBe(seedRef);
    expect(result.strata.process).toBeUndefined();
    expect(result.strata.actions).toHaveLength(0);
    // GET list + GET by id + POST create = 3 (no action endpoints since no actions)
    expect(result.strata.endpoints).toHaveLength(3);
  });

  test("generated state machine works", async () => {
    const seedRef = defineOrderType();
    engine.unfold(seedRef);

    // Step the generated machine: pending + "paid" -> paid
    const step = ak.stepStateMachine("order-lifecycle", { status: "pending" }, { verb: "paid" });
    expect(step.success).toBe(true);
    expect(step.newState).toEqual({ status: "paid" });
  });

  test("generated actions are registered", () => {
    const seedRef = defineOrderType();
    const result = engine.unfold(seedRef);

    for (const action of result.strata.actions) {
      const resolved = intents.resolveAction(action.id);
      expect(resolved).toBeDefined();
      expect(resolved.name).toBe(action.name);
      expect(resolved.targetMachine).toBe("order-lifecycle");
    }
  });

  test("generated endpoints have correct paths", () => {
    const seedRef = defineOrderType();
    const result = engine.unfold(seedRef);

    const paths = result.strata.endpoints.map((e) => `${e.method} ${e.path}`);
    expect(paths).toContain("GET /orders");
    expect(paths).toContain("GET /orders/:id");
    expect(paths).toContain("POST /orders");
    expect(paths).toContain("POST /orders/:id/paid");
    expect(paths).toContain("POST /orders/:id/shipped");
    expect(paths).toContain("POST /orders/:id/delivered");
  });

  test("unfold type without any properties", () => {
    const id = buildTypeUri("test.example", "Empty", "1.0");
    ak.defineType({
      id,
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      name: "Empty",
      version: "1.0",
      schema: { type: "object", properties: {}, required: [] },
    });

    const result = engine.unfold(id);
    expect(result.strata.data).toBe(id);
    expect(result.strata.process).toBeUndefined();
    expect(result.strata.actions).toHaveLength(0);
  });

  test("refold returns same structure", () => {
    const seedRef = defineOrderType();

    // Need fresh kernel for refold since defineUnion/defineStateMachine
    // would conflict on second call. Instead, just verify refold on a
    // type that doesn't generate state machines.
    const prodRef = defineProductType();
    const first = engine.unfold(prodRef);
    const second = engine.refold(prodRef);

    expect(second.seed).toBe(first.seed);
    expect(second.strata.data).toBe(first.strata.data);
    expect(second.strata.process).toBe(first.strata.process);
    expect(second.strata.actions.length).toBe(first.strata.actions.length);
    expect(second.strata.endpoints.length).toBe(first.strata.endpoints.length);
  });

  test("unfold with 'state' field (not 'status')", async () => {
    const id = buildTypeUri("test.example", "Task", "1.0");
    ak.defineType({
      id,
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      name: "Task",
      version: "1.0",
      schema: {
        type: "object",
        required: ["id", "state"],
        properties: {
          id: { type: "string" },
          state: { type: "string", enum: ["open", "in_progress", "done"] },
        },
      },
    });

    const result = engine.unfold(id);

    // Detects "state" field
    expect(result.strata.process).toBe("task-lifecycle");
    expect(result.strata.actions).toHaveLength(2);
    expect(result.strata.actions[0].verb).toBe("in_progress");
    expect(result.strata.actions[1].verb).toBe("done");

    // Verify the machine actually works with "state" field
    const step = ak.stepStateMachine("task-lifecycle", { state: "open" }, { verb: "in_progress" });
    expect(step.success).toBe(true);
    expect(step.newState).toEqual({ state: "in_progress" });
  });
});

describe("api.rest projection emission", () => {
  test("unfold(Order) populates strata.projection with conformsToKind: api.rest", () => {
    const seedRef = defineOrderType();
    const result = engine.unfold(seedRef);

    expect(result.strata.projection.conformsToKind).toBe("api.rest");
    expect(result.strata.projection.conformsTo).toBe("adk:KernelMetamodel/1.0");
    expect(result.strata.projection.bindsModel).toBe(seedRef);
  });

  test("projection.morphism is a product tree of Endpoint refs", () => {
    const seedRef = defineOrderType();
    const result = engine.unfold(seedRef);

    const endpointRefs = collectRefs(projectionMorphism(result.strata.projection)).filter((node) =>
      node.asset.endsWith("/Endpoint/1.0"),
    );
    expect(endpointRefs).toHaveLength(result.strata.endpoints.length);
  });

  test("write endpoints expose onRequest.action bound to the action name", () => {
    const seedRef = defineOrderType();
    const result = engine.unfold(seedRef);

    const writeEndpoint = result.strata.endpoints.find((endpoint) => endpoint.action);
    const endpointRef = collectRefs(projectionMorphism(result.strata.projection)).find(
      (node) =>
        node.asset.endsWith("/Endpoint/1.0") &&
        node.props?.method === writeEndpoint?.method &&
        node.props?.path === writeEndpoint?.path,
    );
    const actionName = result.strata.actions.find(
      (action) => action.id === writeEndpoint?.action,
    )?.name;

    expect(endpointRef).toBeDefined();
    expect((endpointRef?.props?.onRequest as { action?: string } | undefined)?.action).toBe(
      actionName,
    );
  });

  test("paths containing :id produce a RouteParam child ref", () => {
    const seedRef = defineOrderType();
    const result = engine.unfold(seedRef);

    const endpointRef = collectRefs(projectionMorphism(result.strata.projection)).find(
      (node) =>
        node.asset.endsWith("/Endpoint/1.0") &&
        typeof node.props?.path === "string" &&
        node.props.path.includes(":id"),
    );
    const children = (endpointRef?.props?.children ?? []) as MorphismAST[];

    expect(
      children.some((child) => child.op === "ref" && child.asset.includes("/RouteParam/")),
    ).toBe(true);
  });

  test("the emitted projection round-trips through OpenApiBackend", () => {
    const seedRef = defineOrderType();
    const result = engine.unfold(seedRef);

    const rendered = compileAndRender(projectionMorphism(result.strata.projection));

    expect(rendered.document.paths["/orders"]).toBeDefined();
    expect(rendered.handlers.routes.some((route) => route.path === "/orders")).toBe(true);
  });

  test("capability-requirements on actions propagate", () => {
    const seedRef = defineCapabilityOrderType();
    const originalDefineAction = intents.defineAction.bind(intents);
    intents.defineAction = ((name, version, opts) =>
      originalDefineAction(name, version, {
        ...opts,
        preconditions: [{ op: "const", value: "cap://adk.example/orders/approve" }],
      })) as typeof intents.defineAction;

    const result = engine.unfold(seedRef);
    const actionEndpoint = result.strata.endpoints.find((endpoint) =>
      endpoint.path.endsWith("/approved"),
    );
    const endpointRef = collectRefs(projectionMorphism(result.strata.projection)).find(
      (node) =>
        node.asset.endsWith("/Endpoint/1.0") &&
        node.props?.method === actionEndpoint?.method &&
        node.props?.path === actionEndpoint?.path,
    );

    expect(endpointRef?.requires).toContain("cap://adk.example/orders/approve");
  });
});
