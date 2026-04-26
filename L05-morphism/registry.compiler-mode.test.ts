import { describe, expect, test } from "bun:test";
import { MetamodelKernel } from "../L03-tower/metamodel-kernel.ts";
import { ExpressionEvaluator } from "../L04-expression/evaluator.ts";
import { ParityMismatchError } from "../L12-compiler/parity/parity-mode.ts";
import { OpcodeKernelVm } from "../L12-compiler/runtime/kernel-vm.ts";
import type { CompiledMorphismRef, Morphism } from "./registry.ts";
import { MorphismRegistry } from "./registry.ts";

class MockVm extends OpcodeKernelVm {
  calls: Array<{ cid: string; input: unknown }> = [];
  constructor(private readonly impl: (cid: string, input: unknown) => unknown) {
    super();
  }
  override run(cidOrInput?: unknown, input?: unknown): unknown {
    const cid = String(cidOrInput);
    this.calls.push({ cid, input });
    return this.impl(cid, input);
  }
}

const setup = () => {
  const kernel = MetamodelKernel.create();
  const registry = new MorphismRegistry(kernel, new ExpressionEvaluator());
  const numberType = kernel.defineScalar("Number", "1.0", { type: "number" });
  const define = (name: string, compiled?: CompiledMorphismRef) =>
    registry.define(
      name,
      numberType,
      numberType,
      {
        op: "call",
        fn: "add",
        args: [
          { op: "var", name: "$input" },
          { op: "const", value: 1 },
        ],
      },
      { compiled },
    );
  return { registry, define };
};

describe("Layer 12: compiler routing", () => {
  test("registry starts in source mode", () =>
    expect(setup().registry.getCompilerMode()).toBe("source"));
  test("registerCompiler(source) stores mode without changing routing", async () => {
    const { registry, define } = setup();
    const vm = new MockVm(() => 99);
    const morphism = define("sourceStored");
    registry.registerCompiler(vm, "source");
    expect(registry.getCompilerMode()).toBe("source");
    await expect(registry.evaluate(morphism.id, 2)).resolves.toBe(3);
    expect(vm.calls).toHaveLength(0);
  });
  test("registerCompiler(compiled) switches mode", () => {
    const { registry } = setup();
    registry.registerCompiler(new MockVm(() => 1), "compiled");
    expect(registry.getCompilerMode()).toBe("compiled");
  });
  test("compiled mode falls back to source and emits event when compiled ref is absent", async () => {
    const { registry, define } = setup();
    const events: unknown[] = [];
    const morphism = define("fallback");
    registry.onEvent((event) => events.push(event));
    registry.registerCompiler(new MockVm(() => 99), "compiled");
    await expect(registry.evaluate(morphism.id, 2)).resolves.toBe(3);
    expect(events).toEqual([
      {
        kind: "registry:compiled-fallback",
        morphismId: morphism.id,
        cid: morphism.cid,
        mode: "compiled",
      },
    ]);
  });
  test("compiled mode uses vm when compiled ref exists", async () => {
    const { registry, define } = setup();
    const vm = new MockVm((_cid, input) => Number(input) + 10);
    const morphism = define("compiled", { cid: "cid:bundle", compilerVersion: 1 });
    registry.registerCompiler(vm, "compiled");
    await expect(registry.evaluate(morphism.id, 2)).resolves.toBe(12);
    expect(vm.calls).toEqual([{ cid: "cid:bundle", input: 2 }]);
  });
  test("parity mode returns source value when both paths agree", async () => {
    const { registry, define } = setup();
    const morphism = define("parityAgree", { cid: "cid:agree", compilerVersion: 1 });
    registry.registerCompiler(new MockVm((_cid, input) => Number(input) + 1), "parity");
    await expect(registry.evaluate(morphism.id, 2)).resolves.toBe(3);
  });
  test("parity mode throws ParityMismatchError on disagreement", async () => {
    const { registry, define } = setup();
    const morphism = define("parityMismatch", { cid: "cid:mismatch", compilerVersion: 1 });
    registry.registerCompiler(new MockVm(() => 99), "parity");
    await expect(registry.evaluate(morphism.id, 2)).rejects.toMatchObject({
      name: "ParityMismatchError",
      morphismId: morphism.id,
      sourceValue: 3,
      compiledValue: 99,
      input: 2,
    } satisfies Partial<ParityMismatchError>);
  });
  test("Morphism.compiled remains optional", () => {
    const morphism: Morphism = {
      id: "m",
      name: "m",
      sourceType: "s",
      targetType: "t",
      expr: { op: "var", name: "$input" },
      isIsomorphism: false,
      cid: "cid:x",
    };
    expect(morphism.compiled).toBeUndefined();
  });
  test("CompiledMorphismRef.compilerVersion is numeric", () =>
    expect(
      typeof ({ cid: "cid:x", compilerVersion: 1 } satisfies CompiledMorphismRef).compilerVersion,
    ).toBe("number"));
  test("latest compiler registration wins", async () => {
    const { registry, define } = setup();
    const morphism = define("latest", { cid: "cid:latest", compilerVersion: 1 });
    const first = new MockVm(() => 10);
    const second = new MockVm(() => 20);
    registry.registerCompiler(first, "compiled");
    registry.registerCompiler(second, "compiled");
    await expect(registry.evaluate(morphism.id, 1)).resolves.toBe(20);
    expect(first.calls).toHaveLength(0);
    expect(second.calls).toHaveLength(1);
  });
  test("switching back to source disables compiled path", async () => {
    const { registry, define } = setup();
    const vm = new MockVm(() => 20);
    const morphism = define("backToSource", { cid: "cid:source", compilerVersion: 1 });
    registry.registerCompiler(vm, "compiled");
    registry.registerCompiler(vm, "source");
    await expect(registry.evaluate(morphism.id, 1)).resolves.toBe(2);
    expect(vm.calls).toHaveLength(0);
  });
  test("parity mode without compiled ref stays on source only", async () => {
    const { registry, define } = setup();
    const vm = new MockVm(() => 20);
    const morphism = define("parityFallback");
    registry.registerCompiler(vm, "parity");
    await expect(registry.evaluate(morphism.id, 1)).resolves.toBe(2);
    expect(vm.calls).toHaveLength(0);
  });
});
