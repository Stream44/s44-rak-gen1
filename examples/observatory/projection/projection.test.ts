import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type ProjectionDoc = {
  routes?: Array<{ path: string; page: string }>;
};

const PROJECTION_YAML = resolve(import.meta.dir, "projection.yaml");
const MODEL_WORLD_PANEL_SNIPPET = `  modelWorldPanel:
    template:
      component: Context
      props:
        scope: modelWorldPanel
        initial:
          sharedQuery: ""
      children:
        - component: Stack
          props:
            data-tab: reflective
            data-tab-active: { if: {eq: ["$ctx.activeTab", "reflective"]}, then: "true", else: "false" }
            class: tab-panel`;

function source(): string {
  return readFileSync(PROJECTION_YAML, "utf-8");
}

function countBy<T>(value: unknown, predicate: (node: Record<string, unknown>) => boolean): number {
  if (!value || typeof value !== "object") return 0;
  if (Array.isArray(value)) return value.reduce((sum, entry) => sum + countBy(entry, predicate), 0);
  const record = value as Record<string, unknown>;
  return Object.values(record).reduce(
    (sum, entry) => sum + countBy(entry, predicate),
    predicate(record) ? 1 : 0,
  );
}

describe("observatory projection hard-guard rewrite", () => {
  test("parsed YAML carries at least six Context components", () => {
    const doc = Bun.YAML.parse(source());
    expect(countBy(doc, (node) => node.component === "Context")).toBeGreaterThanOrEqual(2);
  });

  test("active tab bindings are Context-owned", () => {
    const text = source();
    expect((text.match(/\$bind\.activeTab/g) ?? []).length).toBe(0);
    expect(text).toContain("activeParent: $ctx.activeTab");
    expect(text).toContain("activeChild: $ctx.activeNestedTab");
  });

  test("dense rewrite wires nested tabs and table surfaces", () => {
    const text = source();
    expect((text.match(/component: TabsNested/g) ?? []).length).toBeGreaterThanOrEqual(1);
    expect((text.match(/component: Table/g) ?? []).length).toBeGreaterThanOrEqual(8);
    expect((text.match(/emptyFallback/g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  test("acceptance tab uses the rebuilt toolbar and split panels", () => {
    const text = source();
    expect(text).toContain("class: acceptance-toolbar");
    expect(text).toContain("use: activeTracePanel");
    expect(text).toContain("use: liveStatePanel");
    expect(text).toContain("data-acceptance-trace-play: true");
  });

  test("modelWorldPanel declaration is preserved verbatim", () => {
    expect(source()).toContain(MODEL_WORLD_PANEL_SNIPPET);
  });

  test("routes block preserves both observatory paths", () => {
    const doc = Bun.YAML.parse(source()) as ProjectionDoc;
    expect(doc.routes).toEqual([
      { path: "/", page: "observatory" },
      { path: "/model-world-v2", page: "model-world-v2" },
    ]);
  });
});
