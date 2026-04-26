import { expect, test } from "bun:test";
import { AlgebraicKernel, type JsonSchema } from "../../L13-facade/index.ts";
import { compileAllAlgebraMorphisms } from "../bootstrap.ts";
import { BundleCache } from "../cache/bundle-cache.ts";
import { OpcodeKernelVm } from "../runtime/kernel-vm.ts";

test("parity fuzzer", async () => {
  const source = build("source");
  const compiled = build("compiled");
  const rng = mulberry32(0xfacade);
  const morphisms = source.morphisms
    .list()
    .filter((m) => m.impl?.kind === "algebra" && m.name.startsWith("fuzz"));
  expect(morphisms.length).toBeGreaterThan(0);
  for (let i = 0; i < 100; i++) {
    const morphism = morphisms[Math.floor(rng() * morphisms.length)]!;
    const input = sample(source.resolveType(morphism.sourceType).schema, rng);
    const sourceValue = await settle(() => source.morphisms.evaluate(morphism.id, input));
    const compiledValue = await settle(() => compiled.morphisms.evaluate(morphism.id, input));
    if (JSON.stringify(sourceValue) !== JSON.stringify(compiledValue)) {
      throw new Error(
        JSON.stringify({ morphismId: morphism.id, input, sourceValue, compiledValue }),
      );
    }
  }
});

function build(mode: "source" | "compiled") {
  const kernel = AlgebraicKernel.create();
  const num = kernel.defineScalar("FuzzNum", "1.0", { type: "number" });
  const text = kernel.defineScalar("FuzzText", "1.0", { type: "string" });
  const nums = kernel.defineScalar("FuzzNums", "1.0", { type: "array", items: { type: "number" } });
  const pair = kernel.defineScalar("FuzzPair", "1.0", {
    type: "object",
    required: ["left", "right", "flag", "label"],
    properties: {
      left: { type: "number" },
      right: { type: "number" },
      flag: { type: "boolean" },
      label: { type: "string" },
    },
  });
  kernel.morphisms.define(
    "fuzzAdd1",
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
  kernel.morphisms.define(
    "fuzzMul2",
    num,
    num,
    {
      op: "call",
      fn: "mul",
      args: [
        { op: "var", name: "$input" },
        { op: "const", value: 2 },
      ],
    },
    {
      impl: {
        kind: "algebra",
        ast: {
          op: "call",
          fn: "mul",
          args: [
            { op: "var", name: "$input" },
            { op: "const", value: 2 },
          ],
        },
      },
    },
  );
  kernel.morphisms.define(
    "fuzzPick",
    pair,
    num,
    {
      op: "if",
      cond: { op: "get", path: "$input/flag" },
      then: { op: "get", path: "$input/left" },
      else: { op: "get", path: "$input/right" },
    },
    {
      impl: {
        kind: "algebra",
        ast: {
          op: "if",
          cond: { op: "get", path: "$input/flag" },
          then: { op: "get", path: "$input/left" },
          else: { op: "get", path: "$input/right" },
        },
      },
    },
  );
  kernel.morphisms.define(
    "fuzzSumPair",
    pair,
    num,
    {
      op: "call",
      fn: "add",
      args: [
        { op: "get", path: "$input/left" },
        { op: "get", path: "$input/right" },
      ],
    },
    {
      impl: {
        kind: "algebra",
        ast: {
          op: "call",
          fn: "add",
          args: [
            { op: "get", path: "$input/left" },
            { op: "get", path: "$input/right" },
          ],
        },
      },
    },
  );
  kernel.morphisms.define(
    "fuzzDecorate",
    pair,
    text,
    {
      op: "call",
      fn: "concat",
      args: [
        { op: "get", path: "$input/label" },
        { op: "const", value: "!" },
      ],
    },
    {
      impl: {
        kind: "algebra",
        ast: {
          op: "call",
          fn: "concat",
          args: [
            { op: "get", path: "$input/label" },
            { op: "const", value: "!" },
          ],
        },
      },
    },
  );
  kernel.morphisms.define(
    "fuzzMapFilter",
    nums,
    nums,
    {
      op: "call",
      fn: "filter",
      args: [
        {
          op: "call",
          fn: "map",
          args: [
            { op: "var", name: "$input" },
            {
              op: "lambda",
              param: "n",
              body: {
                op: "call",
                fn: "add",
                args: [
                  { op: "var", name: "n" },
                  { op: "const", value: 1 },
                ],
              },
            },
          ],
        },
        {
          op: "lambda",
          param: "n",
          body: {
            op: "call",
            fn: "gt",
            args: [
              { op: "var", name: "n" },
              { op: "const", value: 3 },
            ],
          },
        },
      ],
    },
    {
      impl: {
        kind: "algebra",
        ast: {
          op: "call",
          fn: "filter",
          args: [
            {
              op: "call",
              fn: "map",
              args: [
                { op: "var", name: "$input" },
                {
                  op: "lambda",
                  param: "n",
                  body: {
                    op: "call",
                    fn: "add",
                    args: [
                      { op: "var", name: "n" },
                      { op: "const", value: 1 },
                    ],
                  },
                },
              ],
            },
            {
              op: "lambda",
              param: "n",
              body: {
                op: "call",
                fn: "gt",
                args: [
                  { op: "var", name: "n" },
                  { op: "const", value: 3 },
                ],
              },
            },
          ],
        },
      },
    },
  );
  if (mode === "compiled") {
    const vm = new OpcodeKernelVm({ registry: new BundleCache() });
    compileAllAlgebraMorphisms(kernel.morphisms, vm);
    kernel.morphisms.registerCompiler(vm, "compiled");
  }
  return kernel;
}

function sample(schema: JsonSchema, rng: () => number): unknown {
  if (schema.const !== undefined) return schema.const;
  if (schema.enum?.length) return schema.enum[Math.floor(rng() * schema.enum.length)];
  const type = Array.isArray(schema.type) ? schema.type[0] : schema.type;
  if (type === "boolean") return rng() > 0.5;
  if (type === "string") return `s${Math.floor(rng() * 10)}`;
  if (type === "array")
    return Array.from({ length: Math.floor(rng() * 4) }, () =>
      sample(schema.items ?? { type: "number" }, rng),
    );
  if (type === "object")
    return Object.fromEntries(
      Object.entries(schema.properties ?? {}).map(([key, value]) => [key, sample(value, rng)]),
    );
  return Math.floor(rng() * 10) - 5;
}

function mulberry32(seed: number) {
  return () => {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function settle(run: () => Promise<unknown>) {
  try {
    return await run();
  } catch (error) {
    return error instanceof Error ? { error: error.message } : { error: String(error) };
  }
}
