import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AlgebraicKernel,
  ModelLoader,
  type ModelDocument,
  type ProjectionNode,
  type ProjectionTree,
} from "../../../L13-facade/index.ts";
import { ProjectionKernel } from "../../../L11-projection/projection-kernel.ts";
import { renderHtmlTree } from "../../../L11-projection/render-html.ts";
import {
  registerReflectRecordMorphisms,
  type CategoryView,
  listCategories,
  reflectRecordNode,
} from "../../../L11-projection/reflect-record-m1.ts";

const ROOT = import.meta.dir;
const PROJECTION_PATH = resolve(ROOT, "./projection.yaml");
const MODEL_DIR = resolve(ROOT, "../models");
const ECOMMERCE_MODEL = Bun.YAML.parse(
  readFileSync(resolve(MODEL_DIR, "ecommerce.model.yaml"), "utf-8"),
) as ModelDocument;
const CORE_MODEL = Bun.YAML.parse(
  readFileSync(resolve(MODEL_DIR, "core.model.yaml"), "utf-8"),
) as ModelDocument;

describe("reflective projection", () => {
  test("projection YAML registers projection://adk/reflective-model/1.0 and loads through ProjectionKernel", () => {
    const kernel = new ProjectionKernel(null);
    registerReflectivePrimitives(kernel);
    const doc = kernel.loadYamlFile(PROJECTION_PATH);
    expect(doc.id).toBe("projection://adk/reflective-model/1.0");
    expect(JSON.stringify(doc.body)).toContain("morphism://adk/reflect-record/1.0");
    expect(JSON.stringify(doc.body)).toContain("Context");
    expect(JSON.stringify(doc.body)).toContain("Inspector");
  });

  test("reflective rendering of ecommerce model emits category sections and card counts that match introspection", () => {
    const tree = buildProjectionTree(ECOMMERCE_MODEL);
    const html = renderHtmlTree(tree).html;
    const categories = listCategories(ECOMMERCE_MODEL);
    expect(count(html, /<section/g)).toBe(categories.length);
    expect(count(html, /<div class="card"/g)).toBeGreaterThanOrEqual(
      categories.reduce((sum, entry) => sum + entry.records.length, 0),
    );
    for (const name of ["entities", "enums", "lifecycle", "contracts", "actions", "morphisms"])
      expect(html).toContain(name);
  });

  test("reflective rendering of core model preserves empty categories in stable order", () => {
    const bindings = buildBindings(CORE_MODEL);
    expect(bindings.categories.map((entry) => entry.name)).toEqual([
      "entities",
      "enums",
      "relations",
      "lifecycle",
      "contracts",
      "actions",
      "capabilities",
      "morphisms",
    ]);
    const html = renderHtmlTree(buildProjectionTree(CORE_MODEL)).html;
    expect(html).toContain("entities");
    expect(html).toContain("morphisms");
    expect(count(html, /No items yet\./g)).toBeGreaterThanOrEqual(1);
  });

  test("xref badges render for type-to-relation and morphism-to-asset references", () => {
    const fixture: ModelDocument = {
      model: "fixture",
      version: "1.0.0",
      entities: {
        Order: {
          attributes: { id: { type: "string", required: true } },
          relations: ["model://fixture/relation/OrderCustomer/1.0"],
        } as unknown as ModelDocument["entities"][string],
      },
      morphisms: {
        LoadAsset: {
          impl: { kind: "module", uri: "asset://fixture/morphism/load-asset/1.0" },
        },
      },
    };
    const html = renderHtmlTree(buildProjectionTree(fixture)).html;
    expect(html).toContain('data-tone="ref"');
    expect(html).toContain("model://fixture/relation/OrderCustomer/1.0");
    expect(html).toContain("asset://fixture/morphism/load-asset/1.0");
  });

  test("lazy-expand at depth >= 3 keeps fetchChildren on Tree nodes and omits deep materialisation from the initial skeleton", () => {
    const deepRecord = { id: "Deep", a: { b: { c: { d: { e: "value" } } } } };
    const node = reflectRecordNode({ record: deepRecord, maxDepth: 5 });
    const treeNode = findNode(node, (entry) => entry.component === "Tree");
    expect(treeNode?.props.fetchChildren).toBe("morphism://adk/reflect-record/1.0");
    expect(JSON.stringify(node)).not.toContain('"e":"value"');
  });

  test("module URI plaintext passthrough remains literal text with no script injection", () => {
    const html = renderHtmlTree(
      buildProjectionTree({
        model: "module-fixture",
        version: "1.0.0",
        entities: {
          Step: {
            attributes: { id: { type: "string", required: true } },
            module: "module://adk/step/1.0",
          } as unknown as ModelDocument["entities"][string],
        },
      }),
    ).html;
    expect(html).toContain("module://adk/step/1.0");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("import(");
  });

  test("deeply nested records truncate at maxDepth and the synthetic register-then-load flow returns HTML", () => {
    const nested = nest(10);
    const started = performance.now();
    const node = reflectRecordNode({ record: nested, maxDepth: 5 });
    expect(performance.now() - started).toBeLessThan(2000);
    expect(JSON.stringify(node)).toContain("…(truncated at depth)");

    const kernel = AlgebraicKernel.create();
    registerReflectRecordMorphisms(kernel);
    const loader = new ModelLoader(kernel);
    const synthetic: ModelDocument = {
      model: "synthetic",
      version: "1.0.0",
      entities: {
        Customer: { attributes: { id: { type: "string", required: true } } },
        Order: { attributes: { id: { type: "string", required: true } } },
      },
      enums: { OrderState: { values: ["pending"] } },
    };
    loader.loadModel(synthetic);
    const projection = new ProjectionKernel(null);
    registerReflectivePrimitives(projection);
    const loaded = projection.loadYamlFile(PROJECTION_PATH);
    expect(loaded.id).toBe("projection://adk/reflective-model/1.0");
    const rendered = renderHtmlTree(buildProjectionTree(synthetic)).html;
    expect(rendered.startsWith("<div")).toBe(true);
    expect(rendered).toContain("entities");
    expect(rendered).toContain("enums");
  });
});

function buildProjectionTree(document: ModelDocument): ProjectionTree {
  return {
    pageName: "reflective",
    actionHandlers: [],
    root: {
      component: "Stack",
      props: {},
      children: buildBindings(document).categories.map((category) => ({
        component: "Section",
        props: { title: category.name },
        children:
          category.records.length > 0
            ? category.records.flatMap((record) => record.rendered as ProjectionNode[])
            : [{ component: "Text", props: { text: "No items yet." }, children: [] }],
      })),
    },
  };
}

function buildBindings(document: ModelDocument): {
  categories: Array<CategoryView & { records: Array<{ id: string; rendered: ProjectionNode[] }> }>;
  inspectorChildren: ProjectionNode[];
} {
  const categories = listCategories(document).map((category) => ({
    ...category,
    records: category.records.map((record) => ({
      id: record.id,
      rendered: [reflectRecordNode({ record, maxDepth: 5 })],
    })),
  }));
  const firstRecord = categories.find((entry) => entry.records.length > 0)?.records[0];
  return {
    categories,
    inspectorChildren: firstRecord?.rendered ?? [],
  };
}

function findNode(
  node: ProjectionNode,
  predicate: (node: ProjectionNode) => boolean,
): ProjectionNode | null {
  if (predicate(node)) return node;
  for (const child of node.children) {
    const found = findNode(child, predicate);
    if (found) return found;
  }
  return null;
}

function nest(depth: number): Record<string, unknown> {
  let cursor: Record<string, unknown> = { done: true };
  for (let index = 0; index < depth; index += 1) cursor = { next: cursor };
  return cursor;
}

function count(input: string, pattern: RegExp): number {
  return [...input.matchAll(pattern)].length;
}

function registerReflectivePrimitives(kernel: ProjectionKernel): void {
  for (const name of ["Context", "Breadcrumb", "SearchBox", "Split", "Tree", "Inspector"]) {
    if (!kernel.primitives.has(name)) kernel.primitives.register({ name, supportsChildren: true });
  }
}
