import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makePackageTmpDir } from "../L01-foundation/tmp.ts";
import { loadKernelModel, type ProjectionKernelRuntime } from "./bootstrap.ts";

const createdDirs: string[] = [];
const BOOTSTRAP_PATH = resolve(import.meta.dir, "bootstrap.ts");

function makeFixture(
  overrides: Partial<{
    moduleSource: string;
    moduleUri: string;
    morphismInput: string;
    actionMorphism: string;
    capabilityRequirement: string;
  }> = {},
): { yamlPath: string; modulePath: string } {
  const dir = makePackageTmpDir("bootstrap-wp026-");
  createdDirs.push(dir);
  const modulePath = join(dir, "upper.ts");
  writeFileSync(
    modulePath,
    overrides.moduleSource ??
      `export default function upper(input) {
  return { msg: String(input.msg).toUpperCase(), length: String(input.msg).length };
}
`,
  );
  const yamlPath = join(dir, "kernel.model.yaml");
  writeFileSync(
    yamlPath,
    `kernel: EchoKernel
version: "1.0"
conformsTo: adk:KernelMetamodel/1.0
types:
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
  identity:
    id: identity
    input: ${overrides.morphismInput ?? "type://adk/EchoInput/1.0"}
    output: type://adk/EchoInput/1.0
    impl:
      kind: algebra
      ast: { op: var, name: $input }
  upper:
    id: upper
    input: type://adk/EchoInput/1.0
    output: type://adk/EchoOutput/1.0
    impl:
      kind: module
      uri: ${overrides.moduleUri ?? `"module://./upper.ts"`}
      export: default
actions:
  echo:
    name: echo
    verb: echo
    inputSchema:
      type: object
      required: [msg]
      properties:
        msg: { type: string }
    capabilityRequirement: ${overrides.capabilityRequirement ?? "https://example.com/caps/echo"}
    machine: EchoMachine
    morphism:
${
  overrides.actionMorphism ??
  `      kind: compose
      f:
        kind: name
        name: identity
      g:
        kind: name
        name: upper`
}
`,
  );
  return { yamlPath, modulePath };
}

function snapshot(paths: string[]): Record<string, { size: number; mtimeMs: number }> {
  return Object.fromEntries(
    paths.map((file) => {
      const stat = statSync(file);
      return [file, { size: stat.size, mtimeMs: stat.mtimeMs }];
    }),
  );
}

afterEach(() => {
  while (createdDirs.length > 0) {
    rmSync(createdDirs.pop()!, { recursive: true, force: true });
  }
});

describe("loadKernelModel", () => {
  test("happy path loads a fully-constructed runtime", async () => {
    const { yamlPath } = makeFixture();
    const runtime = await loadKernelModel(yamlPath);

    expect(runtime).toBeDefined();
    expect(typeof (runtime as ProjectionKernelRuntime).dispatch).toBe("function");
    expect(typeof runtime.render).toBe("function");
  });

  test("dispatch round-trips through compose order", async () => {
    const { yamlPath } = makeFixture();
    const runtime = await loadKernelModel(yamlPath);

    await expect(runtime.dispatch({ ref: "echo", payload: { msg: "hi" } })).resolves.toEqual({
      success: true,
      value: { msg: "HI", length: 2 },
    });
  });

  test("unregistered action morphism fails at load time", async () => {
    const { yamlPath } = makeFixture({
      actionMorphism: `      kind: name
      name: missing`,
    });

    await expect(loadKernelModel(yamlPath)).rejects.toThrow(/echo.*missing/);
  });

  test("undeclared morphism type fails at load time", async () => {
    const { yamlPath } = makeFixture({
      morphismInput: "type://adk/NotDeclared/1.0",
    });

    await expect(loadKernelModel(yamlPath)).rejects.toThrow(/identity.*NotDeclared/);
  });

  test("missing module URI fails eagerly at load time", async () => {
    const { yamlPath } = makeFixture({
      moduleUri: '"module://./nope.ts"',
    });

    await expect(loadKernelModel(yamlPath)).rejects.toThrow(/module URI .*nope\.ts.*missing file/);
  });

  test("loadKernelModel does not mutate fixture files", async () => {
    const { yamlPath, modulePath } = makeFixture();
    const before = snapshot([yamlPath, modulePath]);

    await loadKernelModel(yamlPath);

    expect(snapshot([yamlPath, modulePath])).toEqual(before);
  });

  test("bootstrap.ts stays under 200 lines", () => {
    expect(readFileSync(BOOTSTRAP_PATH, "utf-8").split("\n").length).toBeLessThanOrEqual(200);
  });

  test("bootstrap.ts no longer contains extracted shell helpers", () => {
    const source = readFileSync(BOOTSTRAP_PATH, "utf-8");
    expect(source.includes("loadShellTemplate")).toBe(false);
    expect(source.includes("applyTemplate")).toBe(false);
    expect(source.includes("inferAssetName")).toBe(false);
    expect(source.includes("DEFAULT_SHELL_HTML")).toBe(false);
  });
});
