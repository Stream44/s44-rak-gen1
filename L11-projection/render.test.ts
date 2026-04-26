import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ActionType } from "../L13-facade/index.ts";
import type { ProjectionModel, ProjectionTree } from "../L01-foundation/projection-types.ts";
import { createDefaultSession } from "./session.ts";
import { createMetaProjectionKernel } from "./bootstrap.ts";
import { parseKernelModel } from "./metamodel.ts";
import renderMorphism from "./morphisms/render.ts";

const MODEL_PATH = resolve(import.meta.dir, "..", "L00-model", "kernel.model.yaml");
const FIXTURE_PATH = resolve(
  import.meta.dir,
  "../tests/kernel-fixtures/projections/dashboard.yaml",
);
const sessionDecl = { scope: "test" } as const;

const action = (name: string, verb = name.toLowerCase()): ActionType => ({
  id: `action://demo/${name}/1.0.0`,
  name,
  version: "1.0.0",
  verb,
  inputSchema: { type: "object" },
  targetMachine: "EchoLifecycle",
  preconditions: [],
  origin: "demo",
});
const manifest = (...actions: ActionType[]) => ({
  byName: new Map(
    actions.flatMap((entry) => [
      [entry.name, { name: entry.name, kind: "model" as const, action: entry }],
      [entry.id, { name: entry.name, kind: "model" as const, action: entry }],
    ]),
  ),
  byUri: new Map(
    actions.map((entry) => [entry.id, { name: entry.name, kind: "model" as const, action: entry }]),
  ),
});
const normalize = (nodes: ProjectionTree["root"]["children"]): unknown[] =>
  nodes.map(({ component, props, children }) => ({
    component,
    props,
    children: normalize(children),
  }));

describe("Render action", () => {
  test("renders a page with a single Heading primitive", () => {
    const result = renderMorphism({
      doc: {
        projector: "p",
        version: "0.1.0",
        bindsModel: "demo@1",
        session: sessionDecl,
        pages: { index: { children: [{ component: "Heading", props: { text: "Hello" } }] } },
      },
      pageName: "index",
      props: {},
      bindings: new Map(),
      session: createDefaultSession(),
    });
    expect(result.root.children).toHaveLength(1);
    expect(result.root.children[0].component).toBe("Heading");
  });

  test("resolves $bind values into primitive props", () => {
    const result = renderMorphism({
      doc: {
        projector: "p",
        version: "0.1.0",
        bindsModel: "demo@1",
        session: sessionDecl,
        pages: { index: { children: [{ component: "Text", props: { text: "$bind.greeting" } }] } },
      },
      pageName: "index",
      props: {},
      bindings: new Map([["greeting", "Howdy"]]),
      session: createDefaultSession(),
    });
    expect(result.root.children[0].props.text).toBe("Howdy");
  });

  test("hides unauthorized nodes and disables the non-hidden path", () => {
    const doc: ProjectionModel = {
      projector: "p",
      version: "0.1.0",
      bindsModel: "demo@1",
      session: sessionDecl,
      actions: ["HiddenAction", "DisabledAction"],
      pages: {
        index: {
          children: [
            {
              component: "Button",
              props: { label: "Hide" },
              onClick: { action: "HiddenAction", hideIfUnauthorized: true },
            },
            {
              component: "Button",
              props: { label: "Disable" },
              onClick: { action: "DisabledAction" },
            },
          ],
        },
      },
    };
    const result = renderMorphism({
      doc,
      pageName: "index",
      props: {},
      bindings: new Map(),
      session: createDefaultSession(),
      manifest: manifest(action("HiddenAction", "hidden"), action("DisabledAction", "disabled")),
    });
    const children = result.root.children;
    expect(children).toHaveLength(1);
    expect(children[0].props.label).toBe("Disable");
    expect(children[0].disabled).toBe(true);
  });

  test("renders for-iteration templates with one node per item", () => {
    const result = renderMorphism({
      doc: {
        projector: "p",
        version: "0.1.0",
        bindsModel: "demo@1",
        session: sessionDecl,
        pages: {
          index: {
            children: [
              { for: "$bind.items", template: { component: "Text", props: { text: "$item" } } },
            ],
          },
        },
      },
      pageName: "index",
      props: {},
      bindings: new Map([["items", ["a", "b", "c"]]]),
      session: createDefaultSession(),
    });
    expect(result.root.children.map((node) => node.props.text)).toEqual(["a", "b", "c"]);
  });

  test("matches the projection fixture tree modulo node ids", async () => {
    const projector = await createMetaProjectionKernel(null, {
      modelActions: new Map(
        ["ConfirmOrder", "PayOrder", "ShipOrder", "CancelOrder"].map((name) => [
          name,
          action(name),
        ]),
      ),
      yamlPath: MODEL_PATH,
    });
    const doc = projector.loadYamlFile(FIXTURE_PATH);
    const orders = [
      { id: "o-1", status: "pending" },
      { id: "o-2", status: "paid" },
    ];
    projector.setBinding("orders", orders);
    const pageName = projector.defaultPageName()!;
    const legacy = projector.render(pageName);
    const meta = renderMorphism({
      doc,
      pageName,
      props: {},
      bindings: new Map([["orders", orders]]),
      session: createDefaultSession(),
    });
    expect(legacy.root.children).toHaveLength(meta.root.children.length);
    expect(normalize(meta.root.children)).toEqual(normalize(legacy.root.children));
  });

  test("renders morphism-based documents through evaluateMorphism", () => {
    const result = renderMorphism({
      doc: {
        projector: "p",
        version: "0.1.0",
        bindsModel: "demo@1",
        session: sessionDecl,
        morphism: {
          op: "literal",
          value: { component: "Heading", props: { text: "Static" }, children: [] },
        },
      },
      pageName: "ignored",
      props: {},
      bindings: new Map(),
      session: createDefaultSession(),
    });
    expect(result.root.children).toHaveLength(1);
    expect(result.root.children[0].component).toBe("Heading");
  });

  test("kernel.model.yaml remains parseable after adding render entries", () => {
    expect(() => parseKernelModel(readFileSync(MODEL_PATH, "utf-8"))).not.toThrow();
  });
});
