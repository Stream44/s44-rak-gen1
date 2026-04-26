import { describe, expect, test } from "bun:test";
import type { ProjectionNode, ProjectionTree } from "../../../L01-foundation/projection-types.ts";
import { ProjectionKernel } from "../../../L11-projection/projection-kernel.ts";
import "../../../L08-kinds/ui-html-ws/register-passes.ts";
import { splitProjection, type SplitArtefact } from "../../../L08-kinds/ui-html-ws/split-pass.ts";

type MetaNode = ProjectionNode & {
  splitMeta?: { control?: "iter" | "cond"; path?: string; renderer?: unknown };
  contextScope?: string;
};
const node = (
  component: string,
  props: Record<string, unknown> = {},
  children: ProjectionNode[] = [],
  extra: Partial<MetaNode> = {},
): MetaNode => ({ component, props, children, ...extra });
const tree = (root: ProjectionNode): ProjectionTree => ({
  root,
  pageName: "p",
  actionHandlers: [],
});

describe("splitProjection", () => {
  test("simple ref emits one text slot", () => {
    const artefact = splitProjection(
      tree(node("Text", { text: "Title" }, [], { bindingPaths: { text: "$ws.title" } })),
    );
    expect(artefact.slots).toHaveLength(1);
    expect(artefact.slots[0]).toMatchObject({ kind: "text", path: "$ws.title" });
    expect((artefact.skeleton.match(/data-slot-id=/g) ?? []).length).toBe(1);
  });

  test("nested cond emits html slot and namespaced sub-slots", () => {
    const thenNode = node("Text", { text: "Structure" }, [], {
      bindingPaths: { text: "$ws.structure" },
    });
    const elseNode = node("Text", { text: "Dynamics" }, [], {
      bindingPaths: { text: "$ws.dynamics" },
    });
    const artefact = splitProjection(
      tree(
        node("Stack", {}, [
          node("Stack", {}, [], {
            splitMeta: {
              control: "cond",
              path: "$ui.page.activeTab",
              renderer: { then: [thenNode], else: [elseNode] },
            },
          }),
        ]),
      ),
    );
    expect(artefact.slots[0]).toMatchObject({ kind: "html", path: "$ui.page.activeTab" });
    expect(artefact.slots.some((slot) => slot.id.startsWith(`${artefact.slots[0]!.id}/`))).toBe(
      true,
    );
    expect(((artefact.slots[0]!.renderer as any).expr as any).value.branches.then).toBeDefined();
  });

  test("iter emits one list slot plus row sub-slots with stable keys", () => {
    const rows = [
      {
        key: "ord-1",
        nodes: [node("Text", { text: "A" }, [], { bindingPaths: { text: "$order.id" } })],
      },
      {
        key: "ord-2",
        nodes: [node("Text", { text: "B" }, [], { bindingPaths: { text: "$order.id" } })],
      },
    ];
    const artefact = splitProjection(
      tree(
        node("List", {}, [], {
          splitMeta: { control: "iter", path: "$ws.orders", renderer: rows },
        }),
      ),
    );
    expect(artefact.slots[0]).toMatchObject({ kind: "html", path: "$ws.orders" });
    expect(artefact.slots.map((slot) => slot.id)).toContain("list:$ws.orders:ord-1/s1");
    expect(artefact.slots.map((slot) => slot.id)).toContain("list:$ws.orders:ord-2/s2");
  });

  test("context transparency rewrites ctx paths and keeps short-form dependents", () => {
    const artefact = splitProjection(
      tree(
        node("Context", { scope: "ordersPanel" }, [
          node("Text", { text: "42" }, [], { bindingPaths: { text: "$ctx.selectedOrderId" } }),
        ]),
      ),
    );
    expect(artefact.slots[0]).toMatchObject({
      path: "$ui.ordersPanel.selectedOrderId",
      contextScope: "ordersPanel",
    });
    expect(artefact.ctxScopes).toEqual([{ scopePath: "page/ordersPanel", scope: "ordersPanel" }]);
    expect(artefact.dependents.get("$ctx.selectedOrderId")?.has("ordersPanel.s0")).toBe(true);
  });

  test("module URI renders as literal text without slots", () => {
    const artefact = splitProjection(
      tree(
        node("Text", { text: "module://adk/some/1.0" }, [], {
          bindingPaths: { text: "$ws.module" },
        }),
      ),
    );
    expect(artefact.slots).toHaveLength(0);
    expect(artefact.skeleton).toContain("module://adk/some/1.0");
  });

  test("deep nesting preserves a single deeply nested path", () => {
    const artefact = splitProjection(
      tree(
        node("Card", {}, [
          node("Stack", {}, [
            node("Text", { text: "abc" }, [], { bindingPaths: { text: "$ws.a.b.c" } }),
          ]),
        ]),
      ),
    );
    expect(artefact.slots).toHaveLength(1);
    expect(artefact.slots[0]?.path).toBe("$ws.a.b.c");
    expect(artefact.skeleton).toContain("<div><div><span data-slot-id=");
  });

  test("dependents deduplicate duplicate paths into one set", () => {
    const artefact = splitProjection(
      tree(
        node("Stack", {}, [
          node("Text", { text: "A" }, [], { bindingPaths: { text: "$ws.orders" } }),
          node("Text", { text: "B" }, [], { bindingPaths: { text: "$ws.orders" } }),
        ]),
      ),
    );
    expect(artefact.dependents.get("$ws.orders")?.size).toBe(2);
  });

  test("splitProjection is deterministic", () => {
    const input = tree(
      node("Stack", {}, [
        node("Text", { text: "Title" }, [], { bindingPaths: { text: "$ws.title" } }),
        node("Card", { class: "open" }, [node("Text", { text: "Body" })]),
      ]),
    );
    const a = splitProjection(input),
      b = splitProjection(input);
    expect(a.skeleton).toBe(b.skeleton);
    expect(a.slots.map((slot) => slot.id)).toEqual(b.slots.map((slot) => slot.id));
  });

  test("skeleton size stays under 8KB for a 100/10 tree", () => {
    const children = Array.from({ length: 100 }, (_, i) =>
      i < 10
        ? node("Text", { text: `v${i}` }, [], { bindingPaths: { text: `$ws.v${i}` } })
        : node("Text", { text: `static-${i}` }),
    );
    const artefact = splitProjection(tree(node("Stack", {}, children)));
    expect(Buffer.byteLength(artefact.skeleton, "utf8")).toBeLessThan(8192);
  });

  test("attr slots carry attrName and place an adjacent marker", () => {
    const artefact = splitProjection(
      tree(
        node("Card", { class: "selected" }, [], {
          bindingPaths: { class: "$ctx.foo" },
          contextScope: "ordersPanel",
        }),
      ),
    );
    expect(artefact.slots[0]).toMatchObject({
      kind: "attr",
      attrName: "class",
      path: "$ui.ordersPanel.foo",
    });
    expect(artefact.skeleton).toContain("</div><!--slot:ordersPanel.s0-->");
  });

  test("compat render attaches splitArtefact behind ADK_RPR_SPLIT", () => {
    const prev = process.env.ADK_RPR_SPLIT;
    process.env.ADK_RPR_SPLIT = "true";
    try {
      const kernel = new ProjectionKernel(null);
      kernel.loadDocument({
        projector: "pp09",
        version: "1.0.0",
        bindsModel: "",
        session: { scope: "pp09" },
        pages: { home: { children: [{ component: "Text", bind: { value: "$ws.title" } }] } },
      } as never);
      const rendered = kernel.render("home");
      expect((rendered.splitArtefact as SplitArtefact | undefined)?.slots[0]).toMatchObject({
        kind: "text",
        path: "$ws.title",
      });
    } finally {
      process.env.ADK_RPR_SPLIT = prev;
    }
  });
});
