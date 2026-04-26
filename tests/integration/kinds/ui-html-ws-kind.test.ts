import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AssetRegistry } from "../../../L11-projection/asset-registry.ts";
import { loadKindPack } from "../../../L11-projection/metamodel.ts";
import { renderHtmlTree } from "../../../L11-projection/render-html.ts";
import { MetaLevel } from "../../../L01-foundation/types.ts";
import type {
  ProjectionAsset,
  ProjectionKind,
  ProjectionNode,
  ProjectionTree,
} from "../../../L01-foundation/projection-types.ts";
import dispatch from "../../../L08-kinds/ui-html-ws/dispatch.ts";
import shellTemplate from "../../../L08-kinds/ui-html-ws/shell-template.ts";
import emitHandlersJs from "../../../L08-kinds/ui-html-ws/ws-action.ts";
import renderBadge from "../../../L08-kinds/ui-html-ws/primitives/Badge.ts";
import renderButton from "../../../L08-kinds/ui-html-ws/primitives/Button.ts";
import renderCard from "../../../L08-kinds/ui-html-ws/primitives/Card.ts";
import renderColumn from "../../../L08-kinds/ui-html-ws/primitives/Column.ts";
import renderEventTimeline from "../../../L08-kinds/ui-html-ws/primitives/EventTimeline.ts";
import renderForm from "../../../L08-kinds/ui-html-ws/primitives/Form.ts";
import renderGrid from "../../../L08-kinds/ui-html-ws/primitives/Grid.ts";
import renderGridDense from "../../../L08-kinds/ui-html-ws/primitives/GridDense.ts";
import renderHeading from "../../../L08-kinds/ui-html-ws/primitives/Heading.ts";
import renderInspector from "../../../L08-kinds/ui-html-ws/primitives/Inspector.ts";
import renderIframe from "../../../L08-kinds/ui-html-ws/primitives/Iframe.ts";
import renderInput from "../../../L08-kinds/ui-html-ws/primitives/Input.ts";
import renderDescriptionList from "../../../L08-kinds/ui-html-ws/primitives/DescriptionList.ts";
import renderKeyValueList from "../../../L08-kinds/ui-html-ws/primitives/KeyValueList.ts";
import renderLink from "../../../L08-kinds/ui-html-ws/primitives/Link.ts";
import renderList from "../../../L08-kinds/ui-html-ws/primitives/List.ts";
import renderBreadcrumb from "../../../L08-kinds/ui-html-ws/primitives/Breadcrumb.ts";
import renderRow from "../../../L08-kinds/ui-html-ws/primitives/Row.ts";
import renderSearchBox from "../../../L08-kinds/ui-html-ws/primitives/SearchBox.ts";
import renderSelect from "../../../L08-kinds/ui-html-ws/primitives/Select.ts";
import renderSection from "../../../L08-kinds/ui-html-ws/primitives/Section.ts";
import renderSplit from "../../../L08-kinds/ui-html-ws/primitives/Split.ts";
import renderStack from "../../../L08-kinds/ui-html-ws/primitives/Stack.ts";
import renderStatusDot from "../../../L08-kinds/ui-html-ws/primitives/StatusDot.ts";
import renderTabBar from "../../../L08-kinds/ui-html-ws/primitives/TabBar.ts";
import renderTable from "../../../L08-kinds/ui-html-ws/primitives/Table.ts";
import renderText from "../../../L08-kinds/ui-html-ws/primitives/Text.ts";
import renderTree from "../../../L08-kinds/ui-html-ws/primitives/Tree.ts";
import { AlgebraicKernel } from "../../../L13-facade/index.ts";

const KIND_DIR = resolve(import.meta.dir, "../../../L08-kinds/ui-html-ws");
const BOOTSTRAP_PATH = resolve(import.meta.dir, "../../../L11-projection/projection-kernel.ts");
const EXPECTED_SHELL_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<title>{{title}}</title>
<link rel="stylesheet" href="/assets/theme.css" />
</head>
<body>
<div id="root">{{body}}</div>
<script>{{handlersJs}}</script>
<script type="module">
import init from "/runtime.js";
init();
</script>
</body>
</html>`;
const RENDERERS = new Map([
  ["Badge", renderBadge],
  ["Button", renderButton],
  ["Card", renderCard],
  ["Column", renderColumn],
  ["Breadcrumb", renderBreadcrumb],
  ["Form", renderForm],
  ["EventTimeline", renderEventTimeline],
  ["Grid", renderGrid],
  ["GridDense", renderGridDense],
  ["Heading", renderHeading],
  ["Inspector", renderInspector],
  ["Iframe", renderIframe],
  ["Input", renderInput],
  ["DescriptionList", renderDescriptionList],
  ["KeyValueList", renderKeyValueList],
  ["Link", renderLink],
  ["List", renderList],
  ["Row", renderRow],
  ["SearchBox", renderSearchBox],
  ["Select", renderSelect],
  ["Section", renderSection],
  ["Split", renderSplit],
  ["Stack", renderStack],
  ["StatusDot", renderStatusDot],
  ["TabBar", renderTabBar],
  ["Table", renderTable],
  ["Text", renderText],
  ["Tree", renderTree],
] as const);
const PRIMITIVE_NAMES = [
  "Badge",
  "Breadcrumb",
  "Button",
  "Card",
  "Code",
  "Column",
  "Context",
  "DescriptionList",
  "EditableText",
  "Effect",
  "EmptyState",
  "EventTimeline",
  "Form",
  "Grid",
  "GridDense",
  "Heading",
  "Icon",
  "Iframe",
  "Input",
  "Inspector",
  "KeyValueList",
  "Link",
  "List",
  "Pill",
  "Row",
  "SchemaForm",
  "SearchBox",
  "Section",
  "Select",
  "Split",
  "Splitter",
  "Stack",
  "StateMachineGraph",
  "StatusDot",
  "StickyHeader",
  "TabBar",
  "Table",
  "TabsNested",
  "Text",
  "Timeline",
  "Toolbar",
  "Tree",
];

const PARITY_FIXTURES: ProjectionTree[] = [
  {
    pageName: "button-in-stack",
    root: {
      component: "Stack",
      props: {},
      children: [{ component: "Button", props: { label: "Go" }, children: [], nodeId: "n1" }],
    },
    actionHandlers: [],
  },
  {
    pageName: "disabled-button",
    root: {
      component: "Button",
      props: { label: "Go" },
      children: [],
      nodeId: "n2",
      disabled: true,
    },
    actionHandlers: [],
  },
  {
    pageName: "escaped-text",
    root: { component: "Text", props: { text: "a & <b>" }, children: [] },
    actionHandlers: [],
  },
  {
    pageName: "stack-layout",
    root: {
      component: "Stack",
      props: {},
      children: [
        { component: "Text", props: { text: "one" }, children: [] },
        { component: "Text", props: { text: "two" }, children: [] },
        { component: "Text", props: { text: "three" }, children: [] },
      ],
    },
    actionHandlers: [],
  },
  {
    pageName: "card-roundtrip",
    root: {
      component: "Card",
      props: {},
      children: [
        { component: "Heading", props: { level: 2, text: "Hi" }, children: [] },
        {
          component: "Row",
          props: {},
          children: [
            { component: "Text", props: { text: "a" }, children: [] },
            { component: "Text", props: { text: "b" }, children: [] },
          ],
        },
      ],
    },
    actionHandlers: [],
  },
  {
    pageName: "unknown-primitive",
    root: { component: "FakePrimitive", props: {}, children: [] },
    actionHandlers: [],
  },
];

function loadKind(): ProjectionKind & {
  primitiveAssets: string[];
  backend: string;
  actionSemanticsImpl: string;
  backendHelpers: string;
  defaultShellTemplate: string;
} {
  return loadKindPack(KIND_DIR) as ReturnType<typeof loadKind>;
}

function lookupRender(component: string) {
  return RENDERERS.get(component) ?? null;
}

async function renderPorted(tree: ProjectionTree) {
  return dispatch(tree, lookupRender);
}

function renderLegacy(tree: ProjectionTree) {
  return renderHtmlTree(tree);
}

function loadBootstrapShell(): string | null {
  const source = readFileSync(BOOTSTRAP_PATH, "utf-8");
  const match = source.match(/const DEFAULT_SHELL_HTML = `([\s\S]*?)`;/);
  return match ? match[1] : null;
}

describe("ui.html.ws kind (ported)", () => {
  test("loading the kind pack yields a valid ProjectionKind-shaped record", async () => {
    const kind = loadKind();
    expect(kind.conformsTo).toBe("adk:ProjectionKind/1.0");
    expect(kind.id).toBe("ui.html.ws");
    expect(kind.primitives).toHaveLength(42);
    expect(kind.primitiveAssets).toHaveLength(42);
    expect(kind.backend.startsWith("module://")).toBe(true);
    expect(kind.defaultShellTemplate.startsWith("module://")).toBe(true);
  });

  test("all 42 primitives register as ProjectionAssets", async () => {
    const registry = new AssetRegistry();
    const kind = loadKind();
    for (const primitiveAsset of kind.primitiveAssets) {
      const path = resolve(KIND_DIR, primitiveAsset);
      const asset = Bun.YAML.parse(readFileSync(path, "utf-8")) as ProjectionAsset;
      registry.register({ ...asset, cid: `bafy-ui-${asset.name.toLowerCase()}-1.0` });
    }
    const names = registry
      .list({ kind: "ui.html.ws", assetKind: "primitive" })
      .map((asset) => asset.name)
      .sort();
    expect(names).toEqual(PRIMITIVE_NAMES);
  });

  test("kind pack includes the Context primitive IRI", () => {
    expect(loadKind().primitives).toContain("asset://adk.example/ui.html.ws/primitive/Context/1.0");
  });

  test("Context primitive YAML renders inline algebra through MorphismRegistry.evaluate()", async () => {
    const primitive = Bun.YAML.parse(
      readFileSync(resolve(KIND_DIR, "./primitives/Context.yaml"), "utf-8"),
    ) as { render: unknown };
    const kernel = AlgebraicKernel.create();
    kernel.defineType({
      id: "type://adk/UiHtmlWsContextIn/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      name: "UiHtmlWsContextIn",
      schema: {
        type: "object",
        properties: {
          scope: { type: "string" },
          initial: { type: "object" },
          mirror: { type: "array", items: { type: "string" } },
          key: {},
        },
        required: ["scope"],
      },
    });
    kernel.defineType({
      id: "type://adk/UiHtmlWsContextOut/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      name: "UiHtmlWsContextOut",
      schema: {
        type: "object",
        properties: {
          kind: { type: "string" },
          scope: { type: "string" },
          initial: { type: "object" },
          mirror: { type: "array", items: { type: "string" } },
          key: {},
        },
        required: ["kind", "scope"],
      },
    });
    kernel.morphisms.define(
      "ui-html-ws-context",
      "type://adk/UiHtmlWsContextIn/1.0",
      "type://adk/UiHtmlWsContextOut/1.0",
      { op: "const", value: null },
      {
        id: "morphism://adk/test/ui-html-ws-context/1.0",
        impl: { kind: "algebra", ast: primitive.render as never },
      },
    );
    await expect(
      kernel.morphisms.evaluate("morphism://adk/test/ui-html-ws-context/1.0", {
        scope: "foo",
        initial: { x: 1 },
        mirror: ["x"],
        key: "$item.id",
      }),
    ).resolves.toEqual({
      kind: "ctxScope",
      scope: "foo",
      initial: { x: 1 },
      mirror: ["x"],
      key: "$item.id",
    });
  });

  test("a minimal projection renders byte-identical HTML to the legacy backend", async () => {
    const out = await renderPorted(PARITY_FIXTURES[0]!);
    expect(out.html).toBe(renderLegacy(PARITY_FIXTURES[0]!).html);
  });

  test("button with disabled true emits the disabled attribute in the correct position", async () => {
    const out = await renderPorted(PARITY_FIXTURES[1]!);
    expect(out.html).toContain("disabled>");
    expect(out.html).not.toContain(' disabled="');
    expect(out.html).toBe(renderLegacy(PARITY_FIXTURES[1]!).html);
  });

  test("text primitive escaping is byte-identical to legacy", async () => {
    const out = await renderPorted(PARITY_FIXTURES[2]!);
    expect(out.html).toBe("<span>a &amp; &lt;b&gt;</span>");
    expect(out.html).toBe(renderLegacy(PARITY_FIXTURES[2]!).html);
  });

  test("stack layout emits a stack div with rendered children", async () => {
    const out = await renderPorted(PARITY_FIXTURES[3]!);
    expect(out.html).toContain('<div class="stack">');
    expect(out.html).toContain("<span>one</span><span>two</span><span>three</span>");
    expect(out.html).toBe(renderLegacy(PARITY_FIXTURES[3]!).html);
  });

  test("ws-frame emission for onClick matches the legacy emitter", async () => {
    const tree: ProjectionTree = {
      pageName: "actions",
      root: { component: "Button", props: { label: "Go" }, children: [], nodeId: "n1" },
      actionHandlers: [
        {
          nodeId: "n1",
          kind: "model",
          binding: { action: "Order.Confirm", target: "o1", payload: { a: 1 } },
        },
      ],
    };
    expect(emitHandlersJs(tree)).toBe(renderLegacy(tree).handlersJs);
  });

  test("shell template substitution round-trip stays byte-identical to bootstrap", async () => {
    expect(shellTemplate).toContain("{{title}}");
    expect(shellTemplate).toContain("{{body}}");
    expect(shellTemplate).toContain("{{handlersJs}}");
    expect(shellTemplate).toBe(EXPECTED_SHELL_TEMPLATE);
    const bootstrapShell = loadBootstrapShell();
    if (bootstrapShell !== null) {
      expect(shellTemplate).toBe(bootstrapShell);
    }
  });

  test("a Card containing a Heading and Row round-trips with identical output", async () => {
    const out = await renderPorted(PARITY_FIXTURES[4]!);
    expect(out.html).toBe(renderLegacy(PARITY_FIXTURES[4]!).html);
  });

  test("unknown primitive produces the legacy fallback", async () => {
    const out = await renderPorted(PARITY_FIXTURES[5]!);
    expect(out.html).toContain('data-unknown-primitive="FakePrimitive"');
    expect(out.html).toBe(renderLegacy(PARITY_FIXTURES[5]!).html);
  });

  test("custom actions use __adkCustomAction and not action frames", async () => {
    const tree: ProjectionTree = {
      pageName: "custom-actions",
      root: { component: "Button", props: { label: "Go" }, children: [], nodeId: "nX" },
      actionHandlers: [
        {
          nodeId: "nX",
          kind: "custom",
          binding: { action: "tab.select", payload: { url: "/" } },
        },
      ],
    };
    const handlersJs = emitHandlersJs(tree);
    expect(handlersJs).toContain("__adkCustomAction");
    expect(handlersJs).not.toContain('type: "action"');
  });

  test("PARITY_FIXTURES stay byte-identical for html and handlers", async () => {
    for (const fixture of PARITY_FIXTURES) {
      const ported = await renderPorted(fixture);
      const legacy = renderLegacy(fixture);
      expect(ported.html).toBe(legacy.html);
      expect(ported.handlersJs).toBe(legacy.handlersJs);
    }
  });
});
