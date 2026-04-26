import { afterEach, describe, expect, test } from "bun:test";
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { makePackageTmpDir } from "../L01-foundation/tmp.ts";
import { loadKernelModel } from "./bootstrap.ts";
import {
  createLocalModuleResolver,
  __resetModuleLoaderCacheForTests,
  type ModuleResolver,
} from "./module-loader.ts";
import { parseKernelModel } from "./metamodel.ts";

const SOURCE_YAML_PATH = resolve(import.meta.dir, "..", "L00-model", "kernel.model.yaml");
const createdDirs: string[] = [];

function makeKernelFixture(mutator?: (yaml: string) => string): {
  yamlPath: string;
  docText: string;
} {
  const root = makePackageTmpDir("preload-wp040-");
  const dir = join(root, "fixture");
  createdDirs.push(root);
  mkdirSync(dir, { recursive: true });
  cpSync(resolve(import.meta.dir, "..", "L01-foundation"), join(dir, "L01-foundation"), {
    recursive: true,
  });
  cpSync(resolve(import.meta.dir, "..", "L08-kinds"), join(dir, "L08-kinds"), { recursive: true });
  cpSync(resolve(import.meta.dir, "..", "L10-acceptance"), join(dir, "L10-acceptance"), {
    recursive: true,
  });
  mkdirSync(join(dir, "L11-projection"), { recursive: true });
  cpSync(
    resolve(import.meta.dir, "render-pass-registry.ts"),
    join(dir, "L11-projection", "render-pass-registry.ts"),
  );
  const docText = (
    mutator
      ? mutator(readFileSync(SOURCE_YAML_PATH, "utf-8"))
      : readFileSync(SOURCE_YAML_PATH, "utf-8")
  ).replaceAll("module://./L11-projection/", "module://adk/L11-projection/");
  const yamlPath = join(dir, "kernel.model.yaml");
  writeFileSync(yamlPath, docText);
  return { yamlPath, docText };
}

function trackingResolver(
  yamlPath: string,
  onCall?: (uri: string) => Promise<void> | void,
): { resolver: ModuleResolver; calls: string[]; defaultCalls: string[] } {
  const base = createLocalModuleResolver(dirname(yamlPath)),
    calls: string[] = [],
    defaultCalls: string[] = [];
  return {
    calls,
    defaultCalls,
    resolver: async (uri, exportName) => {
      calls.push(`${uri}#${exportName}`);
      if (exportName === "default") defaultCalls.push(`${uri}#${exportName}`);
      await onCall?.(uri);
      return base(uri, exportName);
    },
  };
}

afterEach(() => {
  __resetModuleLoaderCacheForTests();
  while (createdDirs.length > 0) rmSync(createdDirs.pop()!, { recursive: true, force: true });
});

describe("module preload", () => {
  test("default preload loads every module URI from the kernel model", async () => {
    const { yamlPath, docText } = makeKernelFixture();
    const preloaded: string[][] = [];
    await loadKernelModel(yamlPath, { onPreloadComplete: (uris) => preloaded.push(uris) });
    const expected = Object.values(parseKernelModel(docText).morphisms).flatMap((m) =>
      m.impl.kind === "module" ? [m.impl.uri] : [],
    );
    expect(preloaded).toEqual([expected]);
  });

  test("custom preload returning [] skips eager loads", async () => {
    const { yamlPath } = makeKernelFixture((yaml) =>
      yaml.replace(
        /computeModulePreload:[\s\S]*?category: pure\n  parseProjectionDoc:/,
        `computeModulePreload:
    id: computeModulePreload
    input: type://adk/KernelModelDocument/0.1.0
    output: type://adk/ModulePreloadList/0.1.0
    impl:
      kind: algebra
      ast: { op: array, elements: [] }
    category: pure
  parseProjectionDoc:`,
      ),
    );
    const seen: string[][] = [];
    const { resolver, defaultCalls } = trackingResolver(yamlPath);
    await loadKernelModel(yamlPath, {
      internals: { resolverOverride: resolver },
      onPreloadComplete: (uris) => seen.push(uris),
    });
    expect(seen).toEqual([[]]);
    expect(defaultCalls).toEqual([]);
  });

  test("custom preload subset loads only that subset", async () => {
    const subset = "module://adk/L11-projection/morphisms/upper-case.ts";
    const { yamlPath } = makeKernelFixture((yaml) =>
      yaml.replace(
        /computeModulePreload:[\s\S]*?category: pure\n  parseProjectionDoc:/,
        `computeModulePreload:
    id: computeModulePreload
    input: type://adk/KernelModelDocument/0.1.0
    output: type://adk/ModulePreloadList/0.1.0
    impl:
      kind: algebra
      ast:
        op: array
        elements:
          - op: const
            value: ${subset}
    category: pure
  parseProjectionDoc:`,
      ),
    );
    const seen: string[][] = [];
    const { resolver, defaultCalls } = trackingResolver(yamlPath);
    await loadKernelModel(yamlPath, {
      internals: { resolverOverride: resolver },
      onPreloadComplete: (uris) => seen.push(uris),
    });
    expect(seen).toEqual([[subset]]);
    expect(defaultCalls).toEqual([`${subset}#default`]);
  });

  test("preload runs in parallel", async () => {
    const chosen = [
      "module://adk/L11-projection/morphisms/upper-case.ts",
      "module://adk/L11-projection/morphisms/measure.ts",
      "module://adk/L11-projection/morphisms/render.ts",
    ];
    const { yamlPath } = makeKernelFixture((yaml) =>
      yaml.replace(
        /computeModulePreload:[\s\S]*?category: pure\n  parseProjectionDoc:/,
        `computeModulePreload:
    id: computeModulePreload
    input: type://adk/KernelModelDocument/0.1.0
    output: type://adk/ModulePreloadList/0.1.0
    impl:
      kind: algebra
      ast:
        op: array
        elements:
          - op: const
            value: ${chosen[0]}
          - op: const
            value: ${chosen[1]}
          - op: const
            value: ${chosen[2]}
    category: pure
  parseProjectionDoc:`,
      ),
    );
    const pending = { current: 0, max: 0 };
    const { resolver } = trackingResolver(yamlPath, async () => {
      pending.current += 1;
      pending.max = Math.max(pending.max, pending.current);
      await new Promise((resolve) => setImmediate(resolve));
      pending.current -= 1;
    });
    await loadKernelModel(yamlPath, { internals: { resolverOverride: resolver } });
    expect(pending.max).toBeGreaterThan(1);
  });

  test("broken preload URI fails load with a descriptive error", async () => {
    const { yamlPath } = makeKernelFixture((yaml) =>
      yaml
        .replace(
          "uri: module://./L11-projection/morphisms/upper-case.ts",
          "uri: module://./L11-projection/morphisms/does-not-exist.ts",
        )
        .replace(
          "  - module://./L11-projection/morphisms/upper-case.ts#default",
          "  - module://./L11-projection/morphisms/does-not-exist.ts#default",
        ),
    );
    await expect(loadKernelModel(yamlPath)).rejects.toThrow(
      /Preload failed for module URI .*does-not-exist\.ts/,
    );
  });

  test("preload runs before installKernelModel", async () => {
    const { yamlPath } = makeKernelFixture();
    const callLog: string[] = [];
    await loadKernelModel(yamlPath, {
      internals: {
        preloadModulesOverride: async ({ doc }) => {
          callLog.push("preload");
          return {
            algebraBindings: new Map(),
            preloaded: Object.values(doc.morphisms)
              .flatMap((m) => (m.impl.kind === "module" ? [m.impl.uri] : []))
              .slice(0, 1),
          };
        },
        installKernelModelOverride: async () => {
          callLog.push("installKernelModel");
          return {
            morphismIdsByName: new Map(),
            actionsByName: new Map(),
            actionMorphisms: new Map(),
            actionRequirements: new Map(),
          };
        },
      },
    });
    expect(callLog.slice(0, 2)).toEqual(["preload", "installKernelModel"]);
  });

  test("module-backed computeModulePreload resolves its own loader first", async () => {
    const { yamlPath } = makeKernelFixture();
    const customModule = join(dirname(yamlPath), "compute-preload-module.ts");
    writeFileSync(
      customModule,
      `export default function computeModulePreload() { return ["module://adk/L11-projection/morphisms/upper-case.ts"]; }\n`,
    );
    writeFileSync(
      yamlPath,
      readFileSync(yamlPath, "utf-8").replace(
        /computeModulePreload:[\s\S]*?category: pure\n  parseProjectionDoc:/,
        `computeModulePreload:
    id: computeModulePreload
    input: type://adk/KernelModelDocument/0.1.0
    output: type://adk/ModulePreloadList/0.1.0
    impl:
      kind: module
      uri: module://./compute-preload-module.ts
      export: default
    category: pure
  parseProjectionDoc:`,
      ),
    );
    const seen: string[][] = [];
    const { resolver } = trackingResolver(yamlPath);
    await loadKernelModel(yamlPath, {
      internals: { resolverOverride: resolver },
      onPreloadComplete: (uris) => seen.push(uris),
    });
    expect(seen).toEqual([["module://adk/L11-projection/morphisms/upper-case.ts"]]);
  });
});
