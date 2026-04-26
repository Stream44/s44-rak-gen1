import { afterAll, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { AlgebraicKernel, CapabilityEngine, type KernelExpression } from "../L13-facade/index.ts";
import type { Morphism } from "../L05-morphism/registry.ts";
import { ParityMismatchError } from "./parity/parity-mode.ts";
import { BundleCache } from "./cache/bundle-cache.ts";
import { compileAllAlgebraMorphisms } from "./bootstrap.ts";
import { OpcodeKernelVm } from "./runtime/kernel-vm.ts";
import { __setEngine } from "../L11-projection/morphisms/verify-one.ts";

const MODEL_PATH = resolve(import.meta.dir, "..", "L00-model", "kernel.model.yaml");
const cases = (kernel: AlgebraicKernel) => {
  const num = kernel.defineScalar("Wp162Num", "1.0", { type: "number" });
  const bool = kernel.defineScalar("Wp162Bool", "1.0", { type: "boolean" });
  const text = kernel.defineScalar("Wp162Text", "1.0", { type: "string" });
  const list = kernel.defineCollection("Wp162NumList", "1.0", { type: "number" });
  const merged = kernel.defineRecord("Wp162Merged", "1.0", (r) => {
    r.string("label", { required: true });
    r.number("score", { required: true });
  });
  const pair = kernel.defineRecord("Wp162Pair", "1.0", (r) => {
    r.number("left", { required: true });
    r.number("right", { required: true });
    r.string("text", { required: true });
    r.array("items", { type: "number" }, { required: true });
    r.boolean("flag", { required: true });
  });
  const def = (
    name: string,
    sourceType: string,
    targetType: string,
    expr: KernelExpression,
    impl?: Morphism["impl"],
  ) => kernel.morphisms.define(name, sourceType, targetType, expr, impl ? { impl } : undefined);
  const pairInput = { left: 4, right: 3, text: "hi", items: [9, 8, 7], flag: true };
  return {
    module: def(
      "fxModule",
      pair,
      merged,
      { op: "var", name: "$input" },
      { kind: "module", uri: "module://./fx-module.ts", export: "default" },
    ),
    entries: [
      {
        morphism: def("fxAddOne", num, num, {
          op: "call",
          fn: "add",
          args: [
            { op: "var", name: "$input" },
            { op: "const", value: 1 },
          ],
        }),
        input: 2,
        expected: 3,
      },
      {
        morphism: def("fxMulThree", num, num, {
          op: "call",
          fn: "mul",
          args: [
            { op: "var", name: "$input" },
            { op: "const", value: 3 },
          ],
        }),
        input: 4,
        expected: 12,
      },
      {
        morphism: def("fxAbs", num, num, {
          op: "call",
          fn: "abs",
          args: [{ op: "var", name: "$input" }],
        }),
        input: -6,
        expected: 6,
      },
      {
        morphism: def("fxPositive", num, bool, {
          op: "call",
          fn: "gt",
          args: [
            { op: "var", name: "$input" },
            { op: "const", value: 0 },
          ],
        }),
        input: 5,
        expected: true,
      },
      {
        morphism: def("fxPairSum", pair, num, {
          op: "call",
          fn: "add",
          args: [
            { op: "get", path: "$input/left" },
            { op: "get", path: "$input/right" },
          ],
        }),
        input: pairInput,
        expected: 7,
      },
      {
        morphism: def("fxChoose", pair, num, {
          op: "if",
          cond: { op: "get", path: "$input/flag" },
          then: { op: "get", path: "$input/left" },
          else: { op: "get", path: "$input/right" },
        }),
        input: pairInput,
        expected: 4,
      },
      {
        morphism: def("fxText", pair, text, {
          op: "call",
          fn: "concat",
          args: [
            { op: "get", path: "$input/text" },
            { op: "const", value: "!" },
          ],
        }),
        input: pairInput,
        expected: "hi!",
      },
      {
        morphism: def("fxHead", pair, num, {
          op: "call",
          fn: "head",
          args: [{ op: "get", path: "$input/items" }],
        }),
        input: pairInput,
        expected: 9,
      },
      {
        morphism: def("fxTail", pair, list, {
          op: "call",
          fn: "tail",
          args: [{ op: "get", path: "$input/items" }],
        }),
        input: pairInput,
        expected: [8, 7],
      },
      {
        morphism: def("fxMerge", pair, merged, {
          op: "call",
          fn: "merge",
          args: [
            { op: "record", fields: { label: { op: "get", path: "$input/text" } } },
            {
              op: "record",
              fields: {
                score: {
                  op: "call",
                  fn: "add",
                  args: [
                    { op: "get", path: "$input/left" },
                    { op: "get", path: "$input/right" },
                  ],
                },
              },
            },
          ],
        }),
        input: pairInput,
        expected: { label: "hi", score: 7 },
      },
    ],
  };
};

class MockVm extends OpcodeKernelVm {
  constructor(private readonly value: unknown) {
    super();
  }
  override async run(): Promise<unknown> {
    return this.value;
  }
}

let envLock = Promise.resolve();
async function boot(
  mode?: string,
  seed = false,
  capabilityEngine?: CapabilityEngine,
  kernel = AlgebraicKernel.create(),
) {
  const wait = envLock;
  let release!: () => void;
  envLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await wait;
  try {
    const prev = process.env.ADK_COMPILED_KERNEL;
    if (mode === undefined) delete process.env.ADK_COMPILED_KERNEL;
    else process.env.ADK_COMPILED_KERNEL = mode;
    const fixture = seed ? cases(kernel) : null;
    const { loadKernelModel } = await import(
      `../L11-projection/bootstrap.ts?wp162=${Math.random()}`
    );
    const runtime = await loadKernelModel(
      MODEL_PATH,
      capabilityEngine ? { kernel, capabilityEngine } : { kernel },
    );
    if (prev === undefined) delete process.env.ADK_COMPILED_KERNEL;
    else process.env.ADK_COMPILED_KERNEL = prev;
    return { kernel, runtime, fixture };
  } finally {
    release();
  }
}

const vmOf = (kernel: AlgebraicKernel) =>
  (kernel.morphisms as unknown as { vm: OpcodeKernelVm | null }).vm;

describe("27C bootstrap", () => {
  afterAll(() => __setEngine(undefined));

  test("default env keeps source mode and no VM", async () => {
    const { kernel } = await boot();
    expect(kernel.morphisms.getCompilerMode()).toBe("source");
    expect(vmOf(kernel)).toBeNull();
  });

  test("ADK_COMPILED_KERNEL=false matches default", async () => {
    const { kernel } = await boot("false");
    expect(kernel.morphisms.getCompilerMode()).toBe("source");
    expect(vmOf(kernel)).toBeNull();
  });

  test("ADK_COMPILED_KERNEL=true registers compiled VM and compiled refs", async () => {
    const { kernel } = await boot("true", true);
    expect(kernel.morphisms.getCompilerMode()).toBe("compiled");
    expect(vmOf(kernel)).toBeTruthy();
    expect(
      kernel.morphisms
        .list()
        .filter((m) => m.impl?.kind === "algebra")
        .every((m) => !!m.compiled),
    ).toBe(true);
  });

  test("ADK_COMPILED_KERNEL=compiled matches true mode", async () => {
    const { kernel } = await boot("compiled");
    expect(kernel.morphisms.getCompilerMode()).toBe("compiled");
    expect(vmOf(kernel)).toBeTruthy();
  });

  test("ADK_COMPILED_KERNEL=parity registers parity VM", async () => {
    const { kernel } = await boot("parity");
    expect(kernel.morphisms.getCompilerMode()).toBe("parity");
    expect(vmOf(kernel)).toBeTruthy();
  });

  test("parity mode throws ParityMismatchError for a bootstrapped divergent morphism", async () => {
    const kernel = AlgebraicKernel.create();
    const num = kernel.defineScalar("Wp162ParityNum", "1.0", { type: "number" });
    const morphism = kernel.morphisms.define(
      "wp162ParityMismatch",
      num,
      num,
      {
        op: "call",
        fn: "add",
        args: [
          { op: "var", name: "$input" },
          { op: "const", value: 1 },
        ],
      },
      {
        impl: {
          kind: "algebra",
          ast: {
            op: "call",
            fn: "add",
            args: [
              { op: "var", name: "$input" },
              { op: "const", value: 1 },
            ],
          },
        },
      },
    );
    await boot("parity", false, undefined, kernel);
    kernel.morphisms.registerCompiler(new MockVm(999), "parity");
    try {
      await kernel.morphisms.evaluate(morphism.id, 2);
      throw new Error("expected parity mismatch");
    } catch (error) {
      expect(error).toMatchObject({
        name: "ParityMismatchError",
        morphismId: morphism.id,
      } satisfies Partial<ParityMismatchError>);
    }
  });

  test("compiled authorize matches source authorize", async () => {
    const capabilityEngine = new CapabilityEngine(AlgebraicKernel.create()),
      cap = capabilityEngine.issue("cap-a", "kernel://test"),
      payload = {
        requires: ["cap-a"],
        session: { currentUser: { id: "u1", capabilities: { "cap-a": cap.id } } },
        scope: "projection",
        nodePath: "$",
      };
    __setEngine(capabilityEngine);
    const [source, compiled] = await Promise.all([
      boot(undefined, false, capabilityEngine),
      boot("true", false, capabilityEngine),
    ]);
    await expect(source.runtime.dispatch({ ref: "Authorize", payload })).resolves.toEqual(
      await compiled.runtime.dispatch({ ref: "Authorize", payload }),
    );
  });

  for (const index of Array.from({ length: 10 }, (_, i) => i))
    test(`fixture morphism ${index + 1} matches source in compiled mode`, async () => {
      const [source, compiled] = await Promise.all([boot(undefined, true), boot("true", true)]);
      const entry = source.fixture!.entries[index]!;
      await expect(
        compiled.kernel.morphisms.evaluate(
          compiled.fixture!.entries[index]!.morphism.id,
          entry.input,
        ),
      ).resolves.toEqual(await source.kernel.morphisms.evaluate(entry.morphism.id, entry.input));
    });

  test("module-backed morphisms are not compiled", async () => {
    const { fixture } = await boot("true", true);
    expect(fixture!.module.compiled).toBeUndefined();
  });

  test("compileAllAlgebraMorphisms is idempotent", () => {
    const kernel = AlgebraicKernel.create(),
      fixture = cases(kernel),
      cache = new BundleCache(),
      vm = new OpcodeKernelVm({ registry: cache });
    compileAllAlgebraMorphisms(kernel.morphisms, vm);
    const first = fixture.entries.map((entry) => entry.morphism.compiled?.cid);
    const size = cache.size();
    compileAllAlgebraMorphisms(kernel.morphisms, vm);
    expect(cache.size()).toBe(size);
    expect(fixture.entries.map((entry) => entry.morphism.compiled?.cid)).toEqual(first);
  });

  test("mode changes follow env set before importing bootstrap.ts", async () => {
    const source = await boot(undefined);
    const parity = await boot("parity");
    expect(source.kernel.morphisms.getCompilerMode()).toBe("source");
    expect(parity.kernel.morphisms.getCompilerMode()).toBe("parity");
  });
});
