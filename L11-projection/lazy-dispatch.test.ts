import { afterEach, describe, expect, test } from "bun:test";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { makePackageTmpDir } from "../L01-foundation/tmp.ts";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import { loadKernelModel } from "./bootstrap.ts";
import {
  createLocalModuleResolver,
  __resetModuleLoaderCacheForTests,
  type ModuleResolver,
} from "./module-loader.ts";

const createdDirs: string[] = [];

type FixtureOptions = {
  computeModulePreloadAst?: string;
  upperCaseModuleSource?: string;
  measureModuleSource?: string;
  upperCaseUri?: string;
  measureUri?: string;
};

type Tracking = {
  calls: string[];
  targetCalls: string[];
  maxInFlight: number;
  reset(): void;
  resolver: ModuleResolver;
};

function makeFixture(options: FixtureOptions = {}): { yamlPath: string } {
  const dir = makePackageTmpDir("lazy-dispatch-wp041-");
  createdDirs.push(dir);
  writeFileSync(
    join(dir, "upper-case.ts"),
    options.upperCaseModuleSource ??
      `export default function upperCase(input) {
  return { msg: String(input.msg).toUpperCase() };
}
`,
  );
  writeFileSync(
    join(dir, "measure.ts"),
    options.measureModuleSource ??
      `export default function measure(input) {
  return { msg: String(input.msg), length: String(input.msg).length };
}
`,
  );
  const yamlPath = join(dir, "kernel.model.yaml");
  writeFileSync(
    yamlPath,
    `kernel: EchoKernel
version: "1.0"
conformsTo: adk:KernelMetamodel/1.0
origin: adk
types:
  ModulePreloadList:
    name: ModulePreloadList
    jsonSchema:
      type: array
      items: { type: string }
  EchoInput:
    name: EchoInput
    jsonSchema:
      type: object
      required: [msg]
      properties:
        msg: { type: string }
  EchoOutput:
    name: EchoOutput
    jsonSchema:
      type: object
      required: [msg, length]
      properties:
        msg: { type: string }
        length: { type: integer }
  EchoState:
    name: EchoState
    jsonSchema:
      type: object
      required: [status]
      properties:
        status: { type: string }
  EchoEvent:
    name: EchoEvent
    jsonSchema:
      type: object
      required: [verb]
      properties:
        verb: { type: string }
machines:
  EchoMachine:
    id: EchoMachine
    name: EchoMachine
    stateType: type://adk/EchoState/1.0
    eventType: type://adk/EchoEvent/1.0
    initialState: { status: idle }
    transitions:
      - from: { kind: wildcard }
        event: { kind: wildcard }
        to: { op: const, value: { status: echoed } }
morphisms:
  computeModulePreload:
    id: computeModulePreload
    input: type://adk/EchoInput/1.0
    output: type://adk/ModulePreloadList/1.0
    impl:
      kind: algebra
      ast:
${
  options.computeModulePreloadAst ??
  `        op: array
        elements: []`
}
  upperCase:
    id: upperCase
    input: type://adk/EchoInput/1.0
    output: type://adk/EchoInput/1.0
    impl:
      kind: module
      uri: ${options.upperCaseUri ?? "module://./upper-case.ts"}
      export: default
  measure:
    id: measure
    input: type://adk/EchoInput/1.0
    output: type://adk/EchoOutput/1.0
    impl:
      kind: module
      uri: ${options.measureUri ?? "module://./measure.ts"}
      export: default
actions:
  Echo:
    name: Echo
    verb: echo
    inputSchema:
      type: object
      required: [msg]
      properties:
        msg: { type: string }
    capabilityRequirement: cap://none
    machine: EchoMachine
    morphism:
      kind: compose
      f:
        kind: name
        name: upperCase
      g:
        kind: name
        name: measure
`,
  );
  return { yamlPath };
}

function createTrackingResolver(
  yamlPath: string,
  options: {
    trackUri?: string;
    delayUri?: string;
  } = {},
): Tracking {
  const base = createLocalModuleResolver(dirname(yamlPath));
  const calls: string[] = [];
  const targetCalls: string[] = [];
  const loaded = new Set<string>();
  let currentInFlight = 0;
  let maxInFlight = 0;

  return {
    calls,
    targetCalls,
    get maxInFlight() {
      return maxInFlight;
    },
    reset() {
      calls.length = 0;
      targetCalls.length = 0;
      currentInFlight = 0;
      maxInFlight = 0;
    },
    resolver: async (uri, exportName) => {
      const key = `${uri}#${exportName}`;
      const isColdLoad = !loaded.has(key);
      const shouldTrack = options.trackUri === undefined || uri === options.trackUri;
      if (isColdLoad) {
        calls.push(key);
      }
      if (shouldTrack && isColdLoad) {
        targetCalls.push(key);
        currentInFlight += 1;
        maxInFlight = Math.max(maxInFlight, currentInFlight);
      }
      if (uri === options.delayUri) {
        await new Promise<void>((resolve) => queueMicrotask(resolve));
      }
      try {
        const fn = await base(uri, exportName);
        loaded.add(key);
        return fn;
      } finally {
        if (shouldTrack && isColdLoad) {
          currentInFlight -= 1;
        }
      }
    },
  };
}

function morphismId(name: string): string {
  return `morphism://github.com/Stream44/s44-rak-gen1@1.0/${name}/1.0`;
}

afterEach(() => {
  __resetModuleLoaderCacheForTests();
  while (createdDirs.length > 0) {
    rmSync(createdDirs.pop()!, { recursive: true, force: true });
  }
});

describe("lazy dispatch", () => {
  test("empty preload lazy-loads on first dispatch and caches on the second", async () => {
    const { yamlPath } = makeFixture();
    const tracking = createTrackingResolver(yamlPath, {
      trackUri: "module://./upper-case.ts",
    });
    const runtime = await loadKernelModel(yamlPath, {
      internals: { resolverOverride: tracking.resolver },
    });

    tracking.reset();

    await expect(runtime.dispatch({ ref: "Echo", payload: { msg: "hi" } })).resolves.toEqual({
      success: true,
      value: { msg: "HI", length: 2 },
    });
    expect(tracking.targetCalls).toEqual(["module://./upper-case.ts#default"]);

    await expect(runtime.dispatch({ ref: "Echo", payload: { msg: "bye" } })).resolves.toEqual({
      success: true,
      value: { msg: "BYE", length: 3 },
    });
    expect(tracking.targetCalls).toEqual(["module://./upper-case.ts#default"]);
  });

  test("concurrent dispatches share a single import", async () => {
    const { yamlPath } = makeFixture();
    const tracking = createTrackingResolver(yamlPath, {
      trackUri: "module://./upper-case.ts",
      delayUri: "module://./upper-case.ts",
    });
    const runtime = await loadKernelModel(yamlPath, {
      internals: { resolverOverride: tracking.resolver },
    });

    tracking.reset();

    await expect(
      Promise.all([
        runtime.dispatch({ ref: "Echo", payload: { msg: "one" } }),
        runtime.dispatch({ ref: "Echo", payload: { msg: "two" } }),
      ]),
    ).resolves.toEqual([
      { success: true, value: { msg: "ONE", length: 3 } },
      { success: true, value: { msg: "TWO", length: 3 } },
    ]);
    expect(tracking.targetCalls).toEqual(["module://./upper-case.ts#default"]);
    expect(tracking.maxInFlight).toBe(1);
  });

  test("broken URI returns a clear lazy-load error", async () => {
    const brokenUri = "module://./does-not-exist.ts";
    const { yamlPath } = makeFixture({
      upperCaseUri: brokenUri,
    });
    const tracking = createTrackingResolver(yamlPath, {
      trackUri: brokenUri,
    });
    const kernel = AlgebraicKernel.create();
    await loadKernelModel(yamlPath, {
      kernel,
      internals: { resolverOverride: tracking.resolver },
    });

    tracking.reset();

    await expect(kernel.morphisms.evaluate(morphismId("upperCase"), { msg: "x" })).rejects.toThrow(
      /Morphism .*: lazy module load failed for module:\/\/\.\/does-not-exist\.ts#default:.*Consider adding this URI to the kernel model's computeModulePreload/,
    );
    expect(tracking.targetCalls).toEqual([`${brokenUri}#default`]);
  });

  test("rejected lazy loads do not poison the cache", async () => {
    const brokenUri = "module://./does-not-exist.ts";
    const { yamlPath } = makeFixture({
      upperCaseUri: brokenUri,
    });
    const tracking = createTrackingResolver(yamlPath, {
      trackUri: brokenUri,
    });
    const kernel = AlgebraicKernel.create();
    await loadKernelModel(yamlPath, {
      kernel,
      internals: { resolverOverride: tracking.resolver },
    });

    tracking.reset();

    await expect(kernel.morphisms.evaluate(morphismId("upperCase"), { msg: "x" })).rejects.toThrow(
      /lazy module load failed/,
    );
    await expect(kernel.morphisms.evaluate(morphismId("upperCase"), { msg: "x" })).rejects.toThrow(
      /lazy module load failed/,
    );
    expect(tracking.targetCalls).toEqual([`${brokenUri}#default`, `${brokenUri}#default`]);
  });

  test("mixed preload plus lazy dispatch does not reload preloaded morphisms", async () => {
    const { yamlPath } = makeFixture({
      computeModulePreloadAst: `        op: array
        elements:
          - op: const
            value: module://./upper-case.ts`,
    });
    const tracking = createTrackingResolver(yamlPath);
    const runtime = await loadKernelModel(yamlPath, {
      internals: { resolverOverride: tracking.resolver },
    });

    tracking.reset();

    await expect(runtime.dispatch({ ref: "Echo", payload: { msg: "mix" } })).resolves.toEqual({
      success: true,
      value: { msg: "MIX", length: 3 },
    });
    expect(tracking.calls).not.toContain("module://./upper-case.ts#default");
    expect(tracking.calls).toContain("module://./measure.ts#default");
  });

  test("same-tick evaluate calls use the pending load as the re-entrancy surrogate", async () => {
    const { yamlPath } = makeFixture();
    const tracking = createTrackingResolver(yamlPath, {
      trackUri: "module://./upper-case.ts",
      delayUri: "module://./upper-case.ts",
    });
    const kernel = AlgebraicKernel.create();
    await loadKernelModel(yamlPath, {
      kernel,
      internals: { resolverOverride: tracking.resolver },
    });

    tracking.reset();

    await expect(
      Promise.all([
        kernel.morphisms.evaluate(morphismId("upperCase"), { msg: "a" }),
        kernel.morphisms.evaluate(morphismId("upperCase"), { msg: "b" }),
      ]),
    ).resolves.toEqual([{ msg: "A" }, { msg: "B" }]);
    expect(tracking.targetCalls).toEqual(["module://./upper-case.ts#default"]);
    expect(tracking.maxInFlight).toBe(1);
  });
});
