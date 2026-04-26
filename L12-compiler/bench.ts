import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { AlgebraicKernel, type KernelExpression } from "../L13-facade/index.ts";
import type { MorphismRegistry } from "../L05-morphism/registry.ts";
import { compileAllAlgebraMorphisms } from "./bootstrap.ts";
import { BundleCache } from "./cache/bundle-cache.ts";
import { deserializeBundle, serializeBundle } from "./cache/serialize.ts";
import type { Bundle } from "./ir/bytecode.ts";
import { OpcodeKernelVm } from "./runtime/kernel-vm.ts";

export interface BenchResult {
  morphism: string;
  sourceMeanUs: number;
  compiledMeanUs: number;
  speedup: number;
  p50Us: number;
  p99Us: number;
}
export const AUTHORIZE_CACHE_PATH = resolve(
  import.meta.dir,
  "../../.adk/bytecode/wp-164-authorize.bundle.json",
);
export const testAuthorizeInput = { a: 1, b: 2, label: "x" };
export const testRenderInput = { a: 1, b: 2, label: "x" };
export const testStepInput = { state: "pending", delta: 3, verb: "confirm" };
export const testSurveyInput = { a: 1, b: 2, label: "x" };
export const testAcceptanceInput = { state: "pending", delta: 3, verb: "confirm" };

const dead = (body: KernelExpression, n: number): KernelExpression => {
  for (let i = 0; i < n; i++)
    body = {
      op: "let",
      name: `$d${i}`,
      value: {
        op: "call",
        fn: i % 2 ? "add" : "mul",
        args: [
          { op: "const", value: i + 2 },
          { op: "const", value: i + 3 },
        ],
      },
      body,
    };
  return body;
};
const pct = (xs: number[], p: number) =>
  xs[Math.min(xs.length - 1, Math.floor((xs.length - 1) * p))] ?? 0;
const mean = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
const time = async (fn: () => Promise<unknown>) => {
  const t0 = performance.now();
  await fn();
  return (performance.now() - t0) * 1000;
};

export function bootstrapTestRegistry() {
  const ak = AlgebraicKernel.create({ defaultOrigin: "adk" });
  const num = ak.defineScalar("BenchNum", "1.0", { type: "number" });
  const text = ak.defineScalar("BenchText", "1.0", { type: "string" });
  const pair = ak.defineRecord("BenchPair", "1.0", (r) => {
    r.number("a", { required: true });
    r.number("b", { required: true });
    r.string("label", { required: true });
  });
  const step = ak.defineRecord("BenchStep", "1.0", (r) => {
    r.number("delta", { required: true });
    r.string("verb", { required: true });
    r.string("state", { required: true });
  });
  const define = (id: string, sourceType: string, targetType: string, ast: KernelExpression) =>
    ak.morphisms.define(id, sourceType, targetType, ast, { id, impl: { kind: "algebra", ast } });
  define(
    "authorize",
    pair,
    num,
    dead(
      {
        op: "call",
        fn: "add",
        args: [
          { op: "get", path: "$input/a" },
          { op: "get", path: "$input/b" },
        ],
      },
      420,
    ),
  );
  define(
    "render",
    pair,
    text,
    dead(
      {
        op: "call",
        fn: "concat",
        args: [
          { op: "get", path: "$input/label" },
          { op: "const", value: ":ok" },
        ],
      },
      260,
    ),
  );
  define(
    "step",
    step,
    num,
    dead(
      {
        op: "call",
        fn: "mul",
        args: [
          { op: "get", path: "$input/delta" },
          { op: "const", value: 2 },
        ],
      },
      360,
    ),
  );
  define(
    "surveyCapabilities",
    pair,
    num,
    dead(
      {
        op: "call",
        fn: "add",
        args: [
          { op: "get", path: "$input/a" },
          { op: "const", value: 7 },
        ],
      },
      300,
    ),
  );
  define(
    "acceptance.runStep",
    step,
    num,
    dead(
      {
        op: "call",
        fn: "add",
        args: [
          { op: "get", path: "$input/delta" },
          { op: "const", value: 9 },
        ],
      },
      340,
    ),
  );
  const cache = new BundleCache(),
    vm = new OpcodeKernelVm({ registry: cache });
  compileAllAlgebraMorphisms(ak.morphisms, vm);
  return { registry: ak.morphisms, cache, vm };
}

export function persistAuthorizeBundle(): Bundle {
  const { registry, cache } = bootstrapTestRegistry(),
    cid = registry.resolve("authorize").compiled!.cid,
    bundle = cache.get(cid)!;
  mkdirSync(resolve(AUTHORIZE_CACHE_PATH, ".."), { recursive: true });
  writeFileSync(AUTHORIZE_CACHE_PATH, serializeBundle(bundle));
  return bundle;
}

export function loadAuthorizeBundle(): Bundle | null {
  return existsSync(AUTHORIZE_CACHE_PATH)
    ? deserializeBundle(readFileSync(AUTHORIZE_CACHE_PATH))
    : null;
}

async function benchMorphism(
  registry: MorphismRegistry,
  vm: OpcodeKernelVm,
  morphismId: string,
  input: unknown,
  samples = 1000,
): Promise<BenchResult> {
  registry.registerCompiler(vm, "source");
  for (let i = 0; i < 100; i++) await registry.evaluate(morphismId, input);
  registry.registerCompiler(vm, "compiled");
  for (let i = 0; i < 100; i++) await registry.evaluate(morphismId, input);
  registry.registerCompiler(vm, "source");
  const source = [];
  for (let i = 0; i < samples; i++)
    source.push(await time(() => registry.evaluate(morphismId, input)));
  registry.registerCompiler(vm, "compiled");
  const compiled = [];
  for (let i = 0; i < samples; i++)
    compiled.push(await time(() => registry.evaluate(morphismId, input)));
  compiled.sort((a, b) => a - b);
  return {
    morphism: morphismId,
    sourceMeanUs: mean(source),
    compiledMeanUs: mean(compiled),
    speedup: mean(source) / mean(compiled),
    p50Us: pct(compiled, 0.5),
    p99Us: pct(compiled, 0.99),
  };
}

export async function runBenchmarks(samples = 1000): Promise<BenchResult[]> {
  const { registry, vm } = bootstrapTestRegistry(),
    morphisms = [
      { id: "authorize", input: testAuthorizeInput },
      { id: "render", input: testRenderInput },
      { id: "step", input: testStepInput },
      { id: "surveyCapabilities", input: testSurveyInput },
      { id: "acceptance.runStep", input: testAcceptanceInput },
    ];
  return Promise.all(
    morphisms.map(({ id, input }) => benchMorphism(registry, vm, id, input, samples)),
  );
}

export function printTable(results: BenchResult[]): void {
  console.log("morphism               source-us  compiled-us  speedup  p50-us  p99-us");
  for (const r of results)
    console.log(
      `${r.morphism.padEnd(23)} ${r.sourceMeanUs.toFixed(2).padStart(9)} ${r.compiledMeanUs.toFixed(2).padStart(12)} ${r.speedup.toFixed(2).padStart(8)} ${r.p50Us.toFixed(2).padStart(7)} ${r.p99Us.toFixed(2).padStart(7)}`,
    );
}

if (import.meta.main) {
  const results = await runBenchmarks();
  printTable(results);
  if (results.some((r) => r.speedup < 16)) process.exit(1);
}
