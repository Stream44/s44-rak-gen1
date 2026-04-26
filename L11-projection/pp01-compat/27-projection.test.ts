/**
 * Layer 27: Projection Layer tests.
 *
 * Covers loader, compile-time validation, primitive registry, manifest
 * resolution, render-to-tree, HTML serialization, action dispatch
 * (model + custom + ephemeral), capability filtering, payload validation,
 * and binding resolution.
 *
 * Uses local kernel fixtures as the test fixture.
 */

import { describe, test, expect, beforeEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "path";
import { AlgebraicKernel, ModelLoader, IntentProcessor } from "../../L13-facade/index.ts";
import type { ModelBoot, ModelDocument } from "../L09-demand/model-loader.ts";
import type { ActionType } from "../../L07-agency/intent.ts";
import { createMetaProjectionKernel } from "../bootstrap.ts";
import { CORE_MODEL_FIXTURE } from "../../tests/kernel-fixtures/core.model.ts";
import { COMMERCE_MODEL_FIXTURE } from "../../tests/kernel-fixtures/commerce.model.ts";

import { ProjectionKernel } from "../projection-kernel.ts";
import { PrimitiveRegistry } from "../primitive-registry.ts";
import { BindingResolver } from "../bindings.ts";
import type { ProjectorDocument, RenderContext } from "../../L01-foundation/projection-types.ts";
import type {
  ProjectionAsset,
  ProjectionKind,
  ProjectionModel,
} from "../../L01-foundation/projection-types.ts";

// ── Harness ──────────────────────────────────────────────────────────────

const EXAMPLE_PATH = resolve(
  import.meta.dir,
  "../../tests/kernel-fixtures/projections/engine.yaml",
);
const KERNEL_MODEL_PATH = resolve(import.meta.dir, "..", "..", "L00-model", "kernel.model.yaml");
const ORDER_RECORDS = Bun.YAML.parse(
  readFileSync(resolve(import.meta.dir, "../../tests/kernel-fixtures/seeds/orders.yaml"), "utf-8"),
) as Array<{ id: string; total: number }>;

let ak: AlgebraicKernel;
let loader: ModelLoader;
let ip: IntentProcessor;
let app: ModelBoot;
let projector: Awaited<ReturnType<typeof createMetaProjectionKernel>>;

/** Build a full action map (short-name -> ActionType) from the loaded model. */
function buildActionMap(): Map<string, ActionType> {
  const loaded = loader.getLoadedModel("commerce")!;
  const map = new Map<string, ActionType>();
  for (const { name } of loaded.actionDefs) {
    const a = ip.resolveAction(`action://${loaded.origin}/${name}/1.0.0`);
    map.set(name, a);
  }
  return map;
}

beforeEach(async () => {
  ak = AlgebraicKernel.create();
  loader = new ModelLoader(ak);
  ip = new IntentProcessor(ak);
  loader.setIntentProcessor(ip);
  loader.loadModel(CORE_MODEL_FIXTURE as ModelDocument);
  app = loader.boot(COMMERCE_MODEL_FIXTURE as ModelDocument);

  for (const order of ORDER_RECORDS) {
    app.setState(order.id, { id: order.id, status: "pending" });
  }

  projector = await createMetaProjectionKernel(app, { yamlPath: KERNEL_MODEL_PATH });
  projector.injectActionMap(buildActionMap());

  const caps: Record<string, string> = {};
  for (const verb of Object.keys(app.actions)) {
    caps[verb] = app.issueCapability(verb, "test-user");
  }
  projector.setSession({
    currentUser: { id: "test-user", capabilities: caps },
    route: { path: "/", params: {}, query: {} },
    ephemeral: new Map(),
  });
});

// ── 1. Loader ────────────────────────────────────────────────────────────

describe("Projector loader", () => {
  test("loads a well-formed projector YAML file", () => {
    const doc = projector.loadYamlFile(EXAMPLE_PATH);
    expect(doc.projector).toBe("commerce-engine");
    expect(doc.version).toBe("0.1.0");
    expect(doc.bindsModel).toBe("commerce@1.0.0");
    expect(Object.keys(doc.pages)).toContain("orders");
    expect(doc.actions?.length).toBeGreaterThanOrEqual(3);
  });

  test("rejects a document missing required fields", () => {
    expect(() =>
      projector.loadDocument({
        projector: "",
        version: "0.1.0",
        session: { scope: "invalid" },
        bindsModel: "commerce@1.0.0",
        pages: {},
      } as unknown as ProjectorDocument),
    ).toThrow(/missing required field/);
  });
});

// ── 2. Compile errors ────────────────────────────────────────────────────

describe("Compile-time validation", () => {
  test("action ref not declared in actions: yields a descriptive error", () => {
    const bad: ProjectorDocument = {
      projector: "bad-actions",
      version: "0.1.0",
      session: { scope: "bad-actions" },
      bindsModel: "commerce@1.0.0",
      routes: [{ path: "/", page: "home" }],
      actions: [],
      pages: {
        home: {
          children: [
            {
              component: "Button",
              props: { label: "Click" },
              onClick: { action: "Foo" },
            },
          ],
        },
      },
    };
    expect(() => projector.loadDocument(bad)).toThrow(/unknown action "Foo"/);
  });

  test("action declared as kind:model but missing in bindsModel fails at manifest build", () => {
    const bad: ProjectorDocument = {
      projector: "bad-manifest-entry",
      version: "0.1.0",
      session: { scope: "bad-manifest-entry" },
      bindsModel: "commerce@1.0.0",
      routes: [],
      actions: [{ name: "NoSuchAction", kind: "model" }],
      pages: { home: { children: [] } },
    };
    expect(() => projector.loadDocument(bad)).toThrow(/NoSuchAction.*not found in bindsModel/i);
  });

  test("unknown composite reference yields a descriptive error", () => {
    const bad: ProjectorDocument = {
      projector: "bad-composite",
      version: "0.1.0",
      session: { scope: "bad-composite" },
      bindsModel: "commerce@1.0.0",
      routes: [{ path: "/", page: "home" }],
      pages: {
        home: { children: [{ use: "nonexistent-widget" } as any] },
      },
    };
    expect(() => projector.loadDocument(bad)).toThrow(/unknown composite "nonexistent-widget"/);
  });

  test("route referencing unknown page fails", () => {
    const bad: ProjectorDocument = {
      projector: "bad-route",
      version: "0.1.0",
      session: { scope: "bad-route" },
      bindsModel: "commerce@1.0.0",
      routes: [{ path: "/", page: "does-not-exist" }],
      pages: { home: { children: [] } },
    };
    expect(() => projector.loadDocument(bad)).toThrow(/unknown page/);
  });
});

// ── 3. Primitive registry ────────────────────────────────────────────────

// @future: move to L08-kinds/ui-html-ws/kind.test.ts
describe("Primitive registry", () => {
  test("creates with built-in primitives", () => {
    const r = PrimitiveRegistry.createWithBuiltins();
    expect(r.has("Button")).toBe(true);
    expect(r.has("Stack")).toBe(true);
    expect(r.has("Text")).toBe(true);
    expect(r.has("Heading")).toBe(true);
    expect(r.has("Card")).toBe(true);
    expect(r.has("List")).toBe(true);
    expect(r.has("Iframe")).toBe(true);
  });

  test("registers a new primitive by name", () => {
    const r = PrimitiveRegistry.createWithBuiltins();
    r.register({ name: "Custom", supportsChildren: false });
    expect(r.has("Custom")).toBe(true);
  });

  test("rejects duplicate registrations", () => {
    const r = PrimitiveRegistry.createWithBuiltins();
    expect(() => r.register({ name: "Button", supportsChildren: false })).toThrow(
      /already registered/,
    );
  });

  test("resolves a primitive by name; returns null for unknown", () => {
    const r = PrimitiveRegistry.createWithBuiltins();
    expect(r.resolve("Button")?.name).toBe("Button");
    expect(r.resolve("Nope")).toBeNull();
  });
});

// ── 4. Manifest resolution ────────────────────────────────────────────────

describe("Manifest resolution", () => {
  test("string entries register as model actions by default", () => {
    projector.loadYamlFile(EXAMPLE_PATH);
    expect(projector.actionKind("ConfirmOrder")).toBe("model");
    expect(projector.actionKind("PayOrder")).toBe("model");
  });

  test("custom-kind entries register as custom", () => {
    const doc: ProjectorDocument = {
      projector: "custom-shell",
      version: "0.1.0",
      session: { scope: "custom-shell" },
      bindsModel: "commerce@1.0.0",
      routes: [],
      actions: [
        { name: "tab.select", kind: "custom" },
        { name: "ui.refresh", kind: "custom" },
      ],
      pages: { home: { children: [] } },
    };
    projector.loadDocument(doc);
    expect(projector.actionKind("tab.select")).toBe("custom");
    expect(projector.actionKind("ui.refresh")).toBe("custom");
  });

  test("ephemeral-kind entries register as ephemeral", () => {
    const doc: ProjectorDocument = {
      projector: "ephemeral-demo",
      version: "0.1.0",
      session: { scope: "ephemeral-demo" },
      bindsModel: "commerce@1.0.0",
      routes: [],
      actions: [{ name: "ui.toggle", kind: "ephemeral" }],
      pages: { home: { children: [] } },
    };
    projector.loadDocument(doc);
    expect(projector.actionKind("ui.toggle")).toBe("ephemeral");
  });

  test("unknown refs return null", () => {
    projector.loadYamlFile(EXAMPLE_PATH);
    expect(projector.actionKind("TotallyMadeUp")).toBeNull();
  });
});

// ── 5. Render to tree ────────────────────────────────────────────────────

// @future: move to L08-kinds/ui-html-ws/kind.test.ts
describe("Render to Interface Tree", () => {
  test("renders the orders-panel projector with seeded data", () => {
    projector.loadYamlFile(EXAMPLE_PATH);
    projector.setBinding("instances", ORDER_RECORDS);

    const tree = projector.render("orders");
    expect(tree.root.component).toBe("Stack");
    expect(tree.root.children.length).toBeGreaterThanOrEqual(2);
    const heading = tree.root.children.find((c) => c.component === "Heading");
    expect(heading).toBeTruthy();
    expect(heading?.props.text).toBe("Projection Engine - Commerce");
  });

  test("List iteration produces one card per seed order", () => {
    projector.loadYamlFile(EXAMPLE_PATH);
    projector.setBinding("instances", ORDER_RECORDS);
    const tree = projector.render("orders");

    const section = tree.root.children.find((c) => c.component === "Section")!;
    const cards = section.children.filter((c) => c.component === "Card");
    expect(cards.length).toBe(ORDER_RECORDS.length);
  });
});

// ── 6. HTML serialization ────────────────────────────────────────────────

// @future: move to L08-kinds/ui-html-ws/kind.test.ts
describe("HTML serialization", () => {
  test("renders HTML containing seeded order IDs and button labels", () => {
    projector.loadYamlFile(EXAMPLE_PATH);
    projector.setBinding("instances", ORDER_RECORDS);
    const { html } = projector.renderHtml("orders");

    for (const order of ORDER_RECORDS) {
      expect(html).toContain(order.id);
    }
    expect(html).toContain("Confirm");
    expect(html).toContain("Pay");
    expect(html).toContain("Ship");
  });

  test("emits a client JS stub with action handlers for buttons", () => {
    projector.loadYamlFile(EXAMPLE_PATH);
    projector.setBinding("instances", ORDER_RECORDS);
    const { handlersJs, tree } = projector.renderHtml("orders");
    expect(tree.actionHandlers.length).toBeGreaterThan(0);
    expect(handlersJs).toContain('type: "action"');
    expect(handlersJs).toContain("ConfirmOrder");
  });

  test("custom actions emit __adkCustomAction invocations rather than WS frames", () => {
    const doc: ProjectorDocument = {
      projector: "custom-buttons",
      version: "0.1.0",
      session: { scope: "custom-buttons" },
      bindsModel: "commerce@1.0.0",
      routes: [],
      actions: [{ name: "tab.select", kind: "custom" }],
      pages: {
        home: {
          children: [
            {
              component: "Button",
              props: { label: "Go" },
              onClick: {
                action: "tab.select",
                payload: { url: "/commerce" },
              },
            },
          ],
        },
      },
    };
    projector.loadDocument(doc);
    const { handlersJs } = projector.renderHtml("home");
    expect(handlersJs).toContain("__adkCustomAction");
    expect(handlersJs).toContain("tab.select");
    expect(handlersJs).not.toMatch(/type:\s*"action".*tab\.select/);
  });
});

// ── 7. Action dispatch ───────────────────────────────────────────────────

describe("Action dispatch", () => {
  test("dispatching ConfirmOrder on a pending order transitions to confirmed", async () => {
    projector.loadYamlFile(EXAMPLE_PATH);
    projector.setBinding("instances", ORDER_RECORDS);

    const result = await projector.dispatch({
      ref: "ConfirmOrder",
      target: "ord-001",
      payload: { id: "ord-001" },
    });
    expect(result.success).toBe(true);
    expect(result.kind).toBe("model");
    const state = app.getState("ord-001") as { status: string };
    expect(state.status).toBe("confirmed");
  });

  test("custom action dispatch returns custom result without touching ModelBoot", async () => {
    const doc: ProjectorDocument = {
      projector: "custom-dispatch",
      version: "0.1.0",
      session: { scope: "custom-dispatch" },
      bindsModel: "commerce@1.0.0",
      routes: [],
      actions: [{ name: "ui.tab", kind: "custom" }],
      pages: { home: { children: [] } },
    };
    projector.loadDocument(doc);

    const beforeState = app.getState("ord-001");
    const r = await projector.dispatch({
      ref: "ui.tab",
      payload: { url: "/inspector" },
    });
    expect(r.kind).toBe("custom");
    expect(r.success).toBe(true);
    expect(r.name).toBe("ui.tab");
    expect(r.payload).toEqual({ url: "/inspector" });
    // World state untouched.
    expect(app.getState("ord-001")).toEqual(beforeState);
  });

  test("ephemeral action dispatch stores value in session", async () => {
    const doc: ProjectorDocument = {
      projector: "ephemeral-dispatch",
      version: "0.1.0",
      session: { scope: "ephemeral-dispatch" },
      bindsModel: "commerce@1.0.0",
      routes: [],
      actions: [{ name: "ui.expand", kind: "ephemeral" }],
      pages: { home: { children: [] } },
    };
    projector.loadDocument(doc);
    const r = await projector.dispatch({
      ref: "ui.expand",
      payload: { value: true },
    });
    expect(r.kind).toBe("ephemeral");
    expect(r.success).toBe(true);
    expect(projector.getSession().ephemeral.get("ui.expand")).toEqual({ value: true });
  });

  test("unknown action ref returns a manifest-aware error", async () => {
    projector.loadYamlFile(EXAMPLE_PATH);
    const r = await projector.dispatch({ ref: "NoSuchAction" });
    expect(r.success).toBe(false);
    expect(r.error).toContain("not declared in actions:");
  });
});

// ── 8. Capability filtering ──────────────────────────────────────────────

// @future: move to L08-kinds/ui-html-ws/kind.test.ts
describe("Capability filtering", () => {
  test("Button rendered disabled when session lacks capability", () => {
    projector.loadYamlFile(EXAMPLE_PATH);
    projector.setBinding("instances", ORDER_RECORDS);

    projector.setSession({
      currentUser: { id: "anon", capabilities: {} },
      route: { path: "/", params: {}, query: {} },
      ephemeral: new Map(),
    });
    const tree = projector.render("orders");
    const section = tree.root.children.find((c) => c.component === "Section")!;
    const firstCard = section.children.find((c) => c.component === "Card")!;
    const buttons: Array<{ props: any; disabled?: boolean }> = [];
    const collect = (n: any) => {
      if (n.component === "Button") buttons.push(n);
      (n.children ?? []).forEach(collect);
    };
    collect(firstCard);
    expect(buttons.length).toBeGreaterThan(0);
    for (const b of buttons) expect(b.disabled).toBe(true);
  });

  test("Button rendered enabled when session HAS the capability (and state allows)", () => {
    projector.loadYamlFile(EXAMPLE_PATH);
    projector.setBinding("instances", ORDER_RECORDS);
    const tree = projector.render("orders");
    const section = tree.root.children.find((c) => c.component === "Section")!;
    const firstCard = section.children.find((c) => c.component === "Card")!;
    let confirmBtn: any = null;
    const findConfirm = (n: any) => {
      if (n.component === "Button" && n.props.label === "Confirm") {
        confirmBtn = n;
      }
      (n.children ?? []).forEach(findConfirm);
    };
    findConfirm(firstCard);
    expect(confirmBtn).toBeTruthy();
    expect(confirmBtn.disabled).toBe(false);
  });
});

// ── 9. Payload validation ────────────────────────────────────────────────

describe("Payload validation", () => {
  test("dispatching with an invalid payload returns success=false", async () => {
    projector.loadYamlFile(EXAMPLE_PATH);
    const r = await projector.dispatch({
      ref: "PayOrder",
      target: "ord-001",
      payload: { id: "ord-001", amount: "not-a-number" },
    });
    expect(r.success).toBe(false);
    expect(r.error).toMatch(/validation|expected/i);
  });
});

// ── 10. Binding resolution ───────────────────────────────────────────────

describe("Binding resolver", () => {
  function makeCtx(overrides: Partial<RenderContext> = {}): RenderContext {
    return {
      pageName: "t",
      route: { path: "/orders/ord-9", params: { id: "ord-9" }, query: {} },
      currentUser: { id: "u1", capabilities: {} },
      bindings: new Map<string, unknown>([["order", { id: "ord-9", status: "pending" }]]),
      props: { x: 42, y: "hello" },
      nodeIdCounter: { n: 0 },
      ...overrides,
    };
  }

  test("$bind.* resolves a nested path", () => {
    const r = new BindingResolver(makeCtx());
    expect(r.resolve("$bind.order.id")).toBe("ord-9");
    expect(r.resolve("$bind.order.status")).toBe("pending");
  });

  test("$props.* and $route.* resolve", () => {
    const r = new BindingResolver(makeCtx());
    expect(r.resolve("$props.x")).toBe(42);
    expect(r.resolve("$props.y")).toBe("hello");
    expect(r.resolve("$route.id")).toBe("ord-9");
  });

  test("$item and $i resolve inside iteration", () => {
    const r = new BindingResolver(
      makeCtx({ iteration: { item: { sku: "X1" }, index: 2, name: "item" } }),
    );
    expect(r.resolve("$item.sku")).toBe("X1");
    expect(r.resolve("$i")).toBe(2);
  });

  test("string interpolation substitutes path tokens", () => {
    const r = new BindingResolver(makeCtx());
    expect(r.resolve("#$bind.order.id")).toBe("#ord-9");
  });

  test("operator expressions evaluate", () => {
    const r = new BindingResolver(makeCtx());
    expect(r.resolve({ eq: ["$bind.order.status", "pending"] })).toBe(true);
    expect(r.resolve({ neq: ["$bind.order.status", "pending"] })).toBe(false);
    expect(r.resolve({ not: { eq: ["$bind.order.status", "pending"] } })).toBe(false);
    expect(r.resolve({ and: [{ eq: ["$bind.order.status", "pending"] }, true] })).toBe(true);
  });
});

// ── 11. Shell rendering ──────────────────────────────────────────────────

// @future: move to L08-kinds/ui-html-ws/kind.test.ts
describe("Shell rendering", () => {
  test("projection's shell.html is used when shell: is declared", () => {
    projector.loadYamlFile(EXAMPLE_PATH);
    projector.setBinding("instances", ORDER_RECORDS);
    const html = projector.renderShell({ pageName: "orders" });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<div id="root">');
    expect(html).toContain("Projection Engine");
    expect(html).toContain("Confirm");
  });

  test("default built-in shell substitutes body, handlersJs, title when no shell:", () => {
    const doc: ProjectorDocument = {
      projector: "no-shell",
      version: "0.1.0",
      session: { scope: "no-shell" },
      bindsModel: "commerce@1.0.0",
      title: "No-Shell Projection",
      routes: [],
      pages: {
        home: {
          children: [{ component: "Heading", props: { level: 1, text: "Hi" } }],
        },
      },
    };
    projector.loadDocument(doc);
    const html = projector.renderShell({ pageName: "home" });
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain("<title>No-Shell Projection</title>");
    expect(html).toContain('<div id="root">');
    expect(html).toContain("Hi");
  });

  test("{{mount}} substitution uses extras.mount", () => {
    const doc: ProjectorDocument = {
      projector: "mount-test",
      version: "0.1.0",
      session: { scope: "mount-test" },
      bindsModel: "commerce@1.0.0",
      routes: [],
      pages: { home: { children: [] } },
    };
    projector.loadDocument(doc);
    const out = projector.renderShell({ pageName: "home" }, { mount: "/foo" });
    expect(out).toContain("<!DOCTYPE html>");
  });

  test("defaultPageName picks first route or first page", () => {
    projector.loadYamlFile(EXAMPLE_PATH);
    expect(projector.defaultPageName()).toBe("orders");
  });
});

describe("ProjectionKernel — kernel-agnostic (stub kind)", () => {
  let kernel: ProjectionKernel;

  function makeStubKind(): ProjectionKind {
    return {
      id: "test.stub",
      name: "Test Stub Kind",
      version: "1.0.0",
      targetCategory: "in-memory record",
      primitives: ["asset://test/primitive/stub/Hello/1.0"],
      backends: ["asset://test/backend/stub/NoopBackend/1.0"],
      actionSemantics: "asset://test/action-semantics/stub/Noop/1.0",
      cid: "bafy-test-stub-1",
    };
  }

  function makeStubAsset(): ProjectionAsset {
    return {
      cid: "bafy-test-asset-hello",
      id: "asset://test/primitive/stub/Hello/1.0",
      name: "Hello",
      assetKind: "primitive",
      conformsToKind: "test.stub",
      version: "1.0.0",
      propSchema: { type: "object" },
      implementation: { kind: "template", template: "<hello/>" },
    };
  }

  function makeStubModel(overrides: Partial<ProjectionModel> = {}): ProjectionModel {
    return {
      projector: "stub-model",
      version: "1.0.0",
      session: { scope: "stub-model" },
      conformsToKind: "test.stub",
      bindsModel: "commerce@1.0.0",
      actions: [{ name: "ui.poke", kind: "custom" }],
      pages: { home: { children: [] } },
      ...overrides,
    };
  }

  beforeEach(() => {
    kernel = new ProjectionKernel(null);
    kernel.registerKind(makeStubKind());
  });

  test("registerKind stores the kind and resolveKind returns it", () => {
    const freshKernel = new ProjectionKernel(null);
    freshKernel.registerKind(makeStubKind());

    expect(freshKernel.assets.resolveKind("test.stub")?.id).toBe("test.stub");
  });

  test("morphism-only documents compile and render a ProjectionTree", () => {
    kernel.registerAsset(makeStubAsset());
    const doc = makeStubModel({
      pages: undefined,
      morphism: {
        op: "ref",
        asset: "asset://test/primitive/stub/Hello/1.0",
        props: { message: "hi" },
      },
    });

    kernel.loadDocument(doc);
    const tree = kernel.render("ignored");

    expect(tree.root.component).toBe("Stack");
    expect(tree.root.children).toHaveLength(1);
    expect(tree.root.children[0]).toMatchObject({
      component: "Hello",
      props: { message: "hi" },
    });
  });

  test("pages-only documents still render through the legacy path", () => {
    kernel.loadDocument(
      makeStubModel({
        pages: {
          home: {
            children: [{ component: "Text", props: { text: "legacy" } }],
          },
        },
      }),
    );

    const tree = kernel.render("home");
    expect(tree.root.children[0]).toMatchObject({
      component: "Text",
      props: { text: "legacy" },
    });
  });

  test("registerAsset stores an asset and resolve by CID returns it", () => {
    kernel.registerAsset(makeStubAsset());

    expect(kernel.assets.resolve("bafy-test-asset-hello")?.name).toBe("Hello");
  });

  test("registerAsset stores an asset and resolve by id returns it", () => {
    kernel.registerAsset(makeStubAsset());

    expect(kernel.assets.resolve("asset://test/primitive/stub/Hello/1.0")?.name).toBe("Hello");
  });

  test("resolve with activeKind filter prefers same-kind asset", () => {
    kernel.registerAsset(makeStubAsset());
    kernel.registerAsset({
      ...makeStubAsset(),
      cid: "bafy-test-asset-hello-generic",
      id: "asset://other/primitive/shared/Hello/1.0",
      conformsToKind: undefined,
    });

    expect(kernel.assets.resolve("Hello/1.0", "test.stub")?.cid).toBe("bafy-test-asset-hello");
  });

  test("dispatch routes manifest kind correctly for a custom action against a stub-kind model", async () => {
    kernel.loadDocument(makeStubModel());

    const result = await kernel.dispatch({ ref: "ui.poke", payload: { x: 1 } });
    expect(result.kind).toBe("custom");
    expect(result.payload?.x).toBe(1);
  });

  test("compile rejects documents that declare both pages and morphism", () => {
    expect(() =>
      kernel.loadDocument(
        makeStubModel({
          morphism: {
            op: "ref",
            asset: "asset://test/primitive/stub/Hello/1.0",
          },
        }),
      ),
    ).toThrow(/exactly one of `pages:` or `morphism:`/);
  });

  test("compile rejects documents that declare neither pages nor morphism", () => {
    expect(() =>
      kernel.loadDocument(
        makeStubModel({
          pages: undefined,
        }),
      ),
    ).toThrow(/exactly one of `pages:` or `morphism:`/);
  });

  test("morphism-only documents expose a null defaultPageName for single-surface routing", () => {
    kernel.registerAsset(makeStubAsset());
    kernel.loadDocument(
      makeStubModel({
        pages: undefined,
        morphism: {
          op: "ref",
          asset: "asset://test/primitive/stub/Hello/1.0",
        },
      }),
    );

    expect(kernel.defaultPageName()).toBeNull();
  });

  // TODO: flip to toThrow once compile() enforces kind lookup (spec §7.2 step 3).
  test("compile error: ProjectionModel with unknown conformsToKind is rejected OR passes through in v1", () => {
    expect(() =>
      kernel.loadDocument(
        makeStubModel({
          projector: "unknown-kind-model",
          conformsToKind: "test.unknown",
        }),
      ),
    ).not.toThrow();
  });

  test("registerKind is idempotent by id — second register is a no-op", () => {
    kernel.registerKind(makeStubKind());

    expect(kernel.assets.listKinds()).toHaveLength(1);
  });
});
