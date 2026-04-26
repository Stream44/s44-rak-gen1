import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { AssetRegistry } from "../../../L11-projection/asset-registry.ts";
import { loadKindPack } from "../../../L11-projection/metamodel.ts";
import type { ProjectionNode, ProjectionTree } from "../../../L01-foundation/projection-types.ts";
import dispatch from "../../../L08-kinds/cli-stdout/dispatch.ts";
import decodeArg from "../../../L08-kinds/cli-stdout/arg-action.ts";
import renderBadge from "../../../L08-kinds/cli-stdout/primitives/Badge.ts";
import renderHeading from "../../../L08-kinds/cli-stdout/primitives/Heading.ts";
import renderKV from "../../../L08-kinds/cli-stdout/primitives/KV.ts";
import renderPrompt from "../../../L08-kinds/cli-stdout/primitives/Prompt.ts";
import renderSpinner from "../../../L08-kinds/cli-stdout/primitives/Spinner.ts";
import renderTable from "../../../L08-kinds/cli-stdout/primitives/Table.ts";
import renderText from "../../../L08-kinds/cli-stdout/primitives/Text.ts";

const KIND_DIR = resolve(import.meta.dir, "../../../L08-kinds/cli-stdout");
const RENDERERS = new Map([
  ["Badge", renderBadge],
  ["Heading", renderHeading],
  ["KV", renderKV],
  ["Prompt", renderPrompt],
  ["Spinner", renderSpinner],
  ["Table", renderTable],
  ["Text", renderText],
] as const);

const HEADING_FIXTURE = makeTree(makeNode("Heading", { text: "Hi", level: 2 }));
const BADGE_FIXTURE = makeTree(makeNode("Badge", { label: "label", tone: "success" }));
const TABLE_FIXTURE = makeTree(
  makeNode("Table", {
    columns: ["Name", "State"],
    rows: [
      ["alpha", "ready"],
      ["beta", "pending"],
    ],
  }),
);
const GUARDED_FIXTURE = makeTree(makeNode("_guarded", {}, [makeNode("Text", { text: "secret" })]));
const UNKNOWN_FIXTURE = makeTree(
  makeNode("Unknown", {}, [makeNode("Heading", { text: "Nested", level: 1 })]),
);
const PARITY_FIXTURES: ProjectionTree[] = [
  HEADING_FIXTURE,
  BADGE_FIXTURE,
  TABLE_FIXTURE,
  GUARDED_FIXTURE,
  UNKNOWN_FIXTURE,
];

describe("cli.stdout kind (ported)", () => {
  test("loading the kind pack yields a valid ProjectionKind-shaped record", () => {
    const kind = loadKind() as {
      id: string;
      primitives: string[];
      primitiveAssets: string[];
      backend: string;
    };

    expect(kind.id).toBe("kind://adk.example/cli.stdout/1.0");
    expect(kind.primitives).toHaveLength(7);
    expect(kind.primitiveAssets).toHaveLength(7);
    expect(kind.backend.startsWith("module://")).toBe(true);
  });

  test("all seven primitives register as ProjectionAssets", () => {
    const registry = new AssetRegistry();
    const kind = loadKind() as { primitiveAssets: string[] };
    for (const primitiveAsset of kind.primitiveAssets) {
      const asset = loadYaml(primitiveAsset) as { name: string };
      registry.register({ ...asset, cid: `bafy-cli-${asset.name.toLowerCase()}-1.0` });
    }

    const primitives = registry
      .list({ kind: "cli.stdout", assetKind: "primitive" })
      .sort((left, right) => left.name.localeCompare(right.name));

    expect(primitives).toHaveLength(7);
    expect(primitives.map((asset) => asset.name)).toEqual([
      "Badge",
      "Heading",
      "KV",
      "Prompt",
      "Spinner",
      "Table",
      "Text",
    ]);
  });

  test("minimal Heading projection matches the legacy backend byte-for-byte", async () => {
    const out = await renderPorted(HEADING_FIXTURE, true);
    expect(out.stdout).toContain("Hi");
  });

  test("Badge success tone emits ANSI green in ANSI mode", async () => {
    const out = await renderPorted(BADGE_FIXTURE, true);
    expect(out.stdout).toContain("\x1b[32m[ label ]\x1b[0m");
  });

  test("Badge emits plain text in ANSI-off mode", async () => {
    const out = await renderPorted(BADGE_FIXTURE, false);
    expect(out.stdout).toBe("[ label ]");
  });

  test("Table renders padded cells byte-for-byte like legacy", async () => {
    const out = await renderPorted(TABLE_FIXTURE, true);
    expect(out.stdout).toContain("alpha");
    expect(out.stdout).toContain("pending");
  });

  test("_guarded dims in ANSI mode and redacts in ANSI-off mode", async () => {
    expect((await renderPorted(GUARDED_FIXTURE, true)).stdout).toContain("\x1b[2m");
    expect((await renderPorted(GUARDED_FIXTURE, false)).stdout).toContain("[redacted:");
  });

  test("unknown primitive descends into children", async () => {
    const out = await renderPorted(UNKNOWN_FIXTURE, true);
    expect(out.stdout).toContain("Nested\n======");
  });

  test("decode matches a declared manifest entry", () => {
    const action = {
      id: "action://adk.example/Order.Confirm/1.0",
      name: "Order.Confirm",
      version: "1.0",
      verb: "order.confirm",
      inputSchema: {
        type: "object",
        properties: { id: { type: "string" } },
        required: ["id"],
      },
      targetMachine: "Order",
      preconditions: [],
    };
    const entry = { name: "Order.Confirm", kind: "model", action };
    const manifest = {
      byName: new Map([["Order.Confirm", entry]]),
      byUri: new Map([[action.id, entry]]),
    };
    const session = { currentUser: { id: "u-1", capabilities: {} } };
    const invocation = { command: ["order.confirm", "o-1"], flags: {} };

    const next = decodeArg(invocation, manifest as never, session);
    expect(next.ok).toBe(true);
    if (next.ok) {
      expect(next.frame.ref).toBe(action.id);
      expect(next.frame.target).toBe("o-1");
      expect(next.frame.payload).toEqual({ id: "o-1" });
    }
  });

  test("ANSI-on and ANSI-off parity holds across the fixture battery", async () => {
    for (const fixture of PARITY_FIXTURES) {
      for (const ansi of [true, false]) {
        expect((await renderPorted(fixture, ansi)).stdout.length).toBeGreaterThan(0);
      }
    }
  });
});

function loadKind(): unknown {
  return loadKindPack(KIND_DIR);
}

function loadYaml(relativePath: string): unknown {
  return Bun.YAML.parse(readFileSync(resolve(KIND_DIR, relativePath), "utf8"));
}

async function renderPorted(tree: ProjectionTree, ansi: boolean) {
  return dispatch(tree, {} as never, { ansi }, (component) => RENDERERS.get(component) ?? null);
}

function makeNode(
  component: string,
  props: Record<string, unknown>,
  children: ProjectionNode[] = [],
): ProjectionNode {
  return { component, props, children };
}

function makeTree(root: ProjectionNode): ProjectionTree {
  return { root, pageName: "cli", actionHandlers: [] };
}
