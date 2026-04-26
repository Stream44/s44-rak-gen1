import { afterEach, expect, test } from "bun:test";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makePackageTmpDir } from "../L01-foundation/tmp.ts";
import { AlgebraicKernel, CapabilityEngine, type ActionType } from "../L13-facade/index.ts";
import { createMetaProjectionKernel, loadKernelModel } from "./bootstrap.ts";

const MODEL_PATH = resolve(import.meta.dir, "..", "L00-model", "kernel.model.yaml");
const PROJECTION_PATHS = [
  "../tests/kernel-fixtures/projections/engine.yaml",
  "../tests/kernel-fixtures/projections/cross-surface.yaml",
  "../tests/kernel-fixtures/projections/cli.yaml",
  "../tests/kernel-fixtures/projections/api.yaml",
  "../tests/kernel-fixtures/projections/dashboard.yaml",
  "../tests/kernel-fixtures/projections/inspector.yaml",
  "../L14-hosts/viewer/test-fixtures/minimal/projection.yaml",
  "../L14-hosts/viewer/test-fixtures/shell-only/projection.yaml",
  "../L14-hosts/viewer/projection/projection.yaml",
] as const;
const createdDirs: string[] = [];
const modelAction = (name: string): ActionType => ({
  id: `action://test/${name}/1.0.0`,
  name,
  version: "1.0.0",
  verb: name.toLowerCase(),
  inputSchema: { type: "object" },
  targetMachine: "EchoLifecycle",
  preconditions: [],
  origin: "test",
});

afterEach(() => {
  while (createdDirs.length > 0) {
    rmSync(createdDirs.pop()!, { recursive: true, force: true });
  }
});

test("end-to-end smoke dispatches Echo through the canary model", async () => {
  const runtime = await loadKernelModel(MODEL_PATH, { kernel: AlgebraicKernel.create() });
  const result = await runtime.dispatch({ ref: "Echo", payload: { msg: "hi" } });

  expect(result).toEqual({
    success: true,
    value: { msg: "HI", length: 2 },
  });
});

test("state-machine wiring registers EchoLifecycle via StateMachineEngine.resolve()", async () => {
  const kernel = AlgebraicKernel.create();
  await loadKernelModel(MODEL_PATH, { kernel });

  expect(kernel.stateMachines.resolve("EchoLifecycle").initialState).toEqual({ status: "pending" });
});

test("capability gating denies SecureEcho without a cap and allows it with CapabilityEngine.issue()", async () => {
  const kernel = AlgebraicKernel.create();
  const capabilityEngine = new CapabilityEngine(kernel);
  const runtime = await loadKernelModel(MODEL_PATH, { kernel, capabilityEngine });

  const denied = await runtime.dispatch({ ref: "SecureEcho", payload: { msg: "hi" } });
  expect(denied.success).toBe(false);
  expect(denied.error).toMatch(/cap:\/\/|denied|missing/i);

  const issued = capabilityEngine.issue(
    "action://adk/SecureEcho/0.1.0",
    "kernel://adk/meta-projection-minimal",
  );
  const allowed = await runtime.dispatch({
    ref: "SecureEcho",
    payload: { msg: "hi" },
    capabilityId: issued.id,
  });

  expect(allowed).toEqual({
    success: true,
    value: { msg: "HI", length: 2 },
  });
});

test("trust-model enforcement rejects module URIs outside packages/04-ReflexiveAlgebraicKernel", async () => {
  const { yamlPath } = writeFixture({
    moduleUri: "module://adk/../../../../../../etc/passwd",
  });

  await expect(loadKernelModel(yamlPath, { kernel: AlgebraicKernel.create() })).rejects.toThrow(
    /outside packages\/04-ReflexiveAlgebraicKernel|not in.*allowlist|refused to load/i,
  );
});

test("schema wrapper enforcement reports wrong-shaped module output", async () => {
  const { yamlPath } = writeFixture({
    modulePath: "morphisms/bad.ts",
    moduleSource: `export default function bad(input) { return { msg: 42, length: input.msg.length }; }\n`,
    moduleUri: "module://./morphisms/bad.ts",
  });
  const runtime = await loadKernelModel(yamlPath, { kernel: AlgebraicKernel.create() });
  const result = await runtime.dispatch({ ref: "Echo", payload: { msg: "hi" } });

  expect(result.success).toBe(false);
  expect(result.error).toMatch(/Morphism .*output does not conform to/);
});

test("every in-tree projection YAML parses and validates with a session block", async () => {
  const projector = await createMetaProjectionKernel(null, {
    yamlPath: MODEL_PATH,
    modelActions: new Map(
      ["ConfirmOrder", "PayOrder", "ShipOrder", "CancelOrder"].map((name) => [
        name,
        modelAction(name),
      ]),
    ),
  });
  for (const relativePath of PROJECTION_PATHS)
    expect(() => projector.loadYamlFile(resolve(import.meta.dir, relativePath))).not.toThrow();
});

test("projection validation rejects a document missing session", async () => {
  const projector = await createMetaProjectionKernel(null, { yamlPath: MODEL_PATH });
  expect(() =>
    projector.loadYaml(
      "projector: no-session\nversion: 1.0.0\nbindsModel: demo@1.0.0\npages:\n  index:\n    children: []\n",
    ),
  ).toThrow(/session/);
});

test("projection validation rejects an empty session.scope array", async () => {
  const projector = await createMetaProjectionKernel(null, { yamlPath: MODEL_PATH });
  expect(() =>
    projector.loadYaml(
      "projector: empty-scope\nversion: 1.0.0\nsession:\n  scope: []\nbindsModel: demo@1.0.0\npages:\n  index:\n    children: []\n",
    ),
  ).toThrow(/session\.scope/);
});

function writeFixture(
  overrides: Partial<{
    modulePath: string;
    moduleSource: string;
    moduleUri: string;
  }> = {},
): { yamlPath: string } {
  const dir = makePackageTmpDir("projection-wp028-");
  createdDirs.push(dir);

  const modulePath = join(dir, overrides.modulePath ?? "morphisms/echo.ts");
  mkdirSync(resolve(modulePath, ".."), { recursive: true });
  writeFileSync(
    modulePath,
    overrides.moduleSource ??
      `export default function echo(input) { return { msg: String(input.msg).toUpperCase(), length: String(input.msg).length }; }\n`,
  );

  const yamlPath = join(dir, "kernel.model.yaml");
  writeFileSync(
    yamlPath,
    `kernel: fixture-kernel
version: 0.1.0
conformsTo: adk:KernelMetamodel/1.0
origin: adk
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
        status:
          type: string
          enum: [pending, echoed]
  EchoEvent:
    name: EchoEvent
    jsonSchema:
      type: object
      required: [verb]
      properties:
        verb:
          type: string
          enum: [echo]
machines:
  EchoLifecycle:
    id: EchoLifecycle
    name: Echo Lifecycle
    stateType: type://adk/EchoState/0.1.0
    eventType: type://adk/EchoEvent/0.1.0
    initialState: { status: pending }
    transitions:
      - from:
          kind: record
          fields:
            status: { kind: const, value: pending }
        event:
          kind: record
          fields:
            verb: { kind: const, value: echo }
        to:
          op: record
          fields:
            status: { op: const, value: echoed }
morphisms:
  fixtureEcho:
    id: fixtureEcho
    input: type://adk/EchoInput/0.1.0
    output: type://adk/EchoOutput/0.1.0
    impl:
      kind: module
      uri: ${overrides.moduleUri ?? "module://./morphisms/echo.ts"}
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
    machine: EchoLifecycle
    morphism:
      kind: name
      name: fixtureEcho
imports:
  - ${overrides.moduleUri ?? "module://./morphisms/echo.ts"}#default
`,
  );

  return { yamlPath };
}
