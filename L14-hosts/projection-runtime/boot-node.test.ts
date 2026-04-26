import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join, resolve } from "path";
import { bootNode } from "./boot-node.ts";

const FIXTURES = resolve(import.meta.dir, "test-fixtures");

test("bootNode loads every declared model and exposes a boot map", () => {
  const runtime = bootNode(resolve(FIXTURES, "basic-node/sds.yaml"));
  expect(runtime.apps.size).toBe(2);
  expect(runtime.apps.has("foundation")).toBe(true);
  expect(runtime.apps.has("orders")).toBe(true);
});

test("bootNode composes extends chains by concatenating parent and child models", () => {
  const runtime = bootNode(resolve(FIXTURES, "child-node/sds.yaml"));
  expect(runtime.sds.models?.map((model) => model.path)).toEqual([
    resolve(FIXTURES, "models/foundation.model.yaml"),
    resolve(FIXTURES, "models/orders.model.yaml"),
    resolve(FIXTURES, "models/analytics.model.yaml"),
  ]);
});

test("bootNode preserves base observatory inspector schemas from sds", () => {
  const runtime = bootNode(resolve(FIXTURES, "basic-node/sds.yaml"));
  expect(runtime.sds.hostSurface?.inspectors).toEqual([
    {
      kind: "instance",
      selectionKey: "selection.instanceId",
      selectedBinding: "$bind.runtime.panels.selectedInstance",
      tabs: ["runtime/instances"],
      autoSelectFirst: true,
      sections: [
        { heading: "Current State", kind: "code", text: "$selected.stateJson" },
        {
          heading: "Timeline",
          kind: "table",
          rows: "$selected.timeline",
          columns: ["ts", "label", "detail"],
        },
      ],
    },
  ]);
});

test("observatorySurface alias: legacy field name still loads with a one-time warning", async () => {
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  let tempDir: string | undefined;
  try {
    tempDir = await mkdtemp(join(tmpdir(), "wp283-legacy-"));
    const uniqueId = tempDir.replaceAll(/[^a-zA-Z0-9_-]/g, "-");
    const sdsPath = join(tempDir, "sds.yaml");
    await writeFile(
      sdsPath,
      `name: legacy-${uniqueId}\n` +
        "version: 1.0.0\n" +
        `origin: https://test/legacy/${uniqueId}\n` +
        "models:\n" +
        `  - path: ${resolve(FIXTURES, "models/orders.model.yaml")}\n` +
        "    role: primary\n" +
        "    initialBinding: true\n" +
        "observatorySurface:\n" + // alias
        "  tabs:\n" +
        "    - { id: main, from: root }\n",
    );
    const runtime = bootNode(sdsPath);
    expect(runtime.sds.hostSurface?.tabs?.[0]?.id).toBe("main");
    expect(
      warnings.some((w) => w.includes("observatorySurface") && w.includes("hostSurface")),
    ).toBe(true); // alias
    const before = warnings.length;
    runtime.dispose();
    const runtimeAgain = bootNode(sdsPath);
    expect(warnings.length).toBe(before);
    runtimeAgain.dispose();
  } finally {
    console.warn = originalWarn;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
});

test("bootNode merges model inspector overrides by section heading", () => {
  const runtime = bootNode(resolve(FIXTURES, "basic-node/sds.yaml"));
  expect(runtime.inspectors.find((inspector) => inspector.kind === "instance")).toEqual({
    kind: "instance",
    selectionKey: "selection.instanceId",
    selectedBinding: "$bind.runtime.panels.selectedInstance",
    tabs: ["runtime/instances"],
    autoSelectFirst: true,
    sections: [
      { heading: "Current State", kind: "keyvalue", items: "$selected.bookMetadata" },
      {
        heading: "Timeline",
        kind: "table",
        rows: "$selected.timeline",
        columns: ["ts", "label", "detail"],
      },
      { heading: "Order Lifecycle", kind: "text", text: "pending -> confirmed" },
    ],
  });
});

test("bootNode appends model-only inspector kinds after merging overrides", () => {
  const runtime = bootNode(resolve(FIXTURES, "basic-node/sds.yaml"));
  expect(runtime.inspectors.find((inspector) => inspector.kind === "custom")).toEqual({
    kind: "custom",
    selectionKey: "selection.instanceId",
    selectedBinding: "$bind.runtime.panels.selectedInstance",
    sections: [{ heading: "Custom", kind: "text", text: "$selected.modelName" }],
  });
});

test("bootNode picks the single initial binding model as app", () => {
  const runtime = bootNode(resolve(FIXTURES, "basic-node/sds.yaml"));
  expect(runtime.app).toBe(runtime.apps.get("orders"));
});

test("bootNode applies seeds after boot", () => {
  const runtime = bootNode(resolve(FIXTURES, "seeded-node/sds.yaml"));
  expect(runtime.app.getState("ord-001")).toEqual({ status: "pending" });
  expect(runtime.app.getState("ord-002")).toEqual({ status: "confirmed" });
});

test("bootNode surfaces acceptance suites with default flags preserved", () => {
  const runtime = bootNode(resolve(FIXTURES, "basic-node/sds.yaml"));
  expect(runtime.suiteRegistry).toEqual([
    {
      id: "foundation-suite",
      name: "Foundation Suite",
      path: resolve(FIXTURES, "suites/foundation.acceptance.yaml"),
      default: false,
    },
    {
      id: "orders-suite",
      name: "Orders Suite",
      path: resolve(FIXTURES, "suites/orders.acceptance.yaml"),
      default: true,
    },
  ]);
});

test("bootNode throws a clear error when no initial binding is declared", () => {
  expect(() => bootNode(resolve(FIXTURES, "missing-initial-binding/sds.yaml"))).toThrow(
    "bootNode requires exactly one model with initialBinding:true; found 0.",
  );
});

test("composeSds: sds.test.yaml overrides parent storageSpaces by name (child-wins, not concat)", () => {
  const runtime = bootNode(resolve(FIXTURES, "override-node/sds.test.yaml"));
  const spaces = runtime.sds.storageSpaces ?? [];
  const todosEntries = spaces.filter((space) => space.name === "todos-fs");
  expect(todosEntries.length).toBe(1);
  expect(todosEntries[0]?.kind).toBe("ephemeral");
});
