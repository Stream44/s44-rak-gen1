import { afterEach, expect, test } from "bun:test";
import { cpSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makePackageTmpDir } from "../L01-foundation/tmp.ts";
import { loadKindPack, parseKernelModel } from "./metamodel.ts";

const tempDirs: string[] = [];
const kindDir = (name: string) => resolve(import.meta.dir, "..", "L08-kinds", name);

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { force: true, recursive: true });
});

const minimal = (overrides: string = "") => `kernel: EchoKernel
version: 1.0.0
conformsTo: adk:KernelMetamodel/1.0
types:
  EchoInput:
    name: EchoInput
    jsonSchema:
      type: object
machines:
  EchoMachine:
    id: EchoMachine
    name: EchoMachine
    stateType: type://adk/EchoState/1.0
    eventType: type://adk/EchoEvent/1.0
    initialState:
      status: idle
    transitions:
      - from:
          const: idle
        event:
          const: echo
        to:
          op: literal
          value:
            status: echoed
morphisms:
  echo:
    id: echo
    input: type://adk/EchoInput/1.0
    output: type://adk/EchoOutput/1.0
    impl:
      kind: algebra
      ast:
        op: literal
        value: ok
actions:
  Echo:
    name: Echo
    verb: echo
    inputSchema:
      type: object
    capabilityRequirement: cap://echo
    machine: EchoMachine
    morphism:
      kind: name
      name: echo
${overrides}`;

test("well-formed minimal document parses", () => {
  const doc = parseKernelModel(minimal());
  expect(doc.kernel).toBe("EchoKernel");
  expect(doc.version).toBe("1.0.0");
  expect(doc.conformsTo).toBe("adk:KernelMetamodel/1.0");
  expect(doc.types.EchoInput.name).toBe("EchoInput");
  expect(doc.machines.EchoMachine.id).toBe("EchoMachine");
  expect(doc.morphisms.echo.impl.kind).toBe("algebra");
  expect(doc.actions.Echo.machine).toBe("EchoMachine");
});

test("missing kernel field is rejected", () => {
  const yamlText = minimal().replace("kernel: EchoKernel\n", "");
  expect(() => parseKernelModel(yamlText)).toThrow(/kernel.*KernelMetamodel/i);
});

test("missing version is rejected", () => {
  const yamlText = minimal().replace("version: 1.0.0\n", "");
  expect(() => parseKernelModel(yamlText)).toThrow(/version/i);
});

test("malformed YAML is rejected", () => {
  expect(() => parseKernelModel("kernel: [unclosed")).toThrow(
    /^parseKernelModel: YAML parse failed:/,
  );
});

test("wrong impl.kind value is rejected", () => {
  const yamlText = minimal().replace("kind: algebra", "kind: wasm");
  expect(() => parseKernelModel(yamlText)).toThrow(/impl/i);
});

test("module impl missing uri is rejected", () => {
  const yamlText = minimal().replace(
    `    impl:
      kind: algebra
      ast:
        op: literal
        value: ok`,
    `    impl:
      kind: module
      export: default`,
  );
  expect(() => parseKernelModel(yamlText)).toThrow(/uri/i);
});

test("module impl uri must use module scheme", () => {
  const yamlText = minimal().replace(
    `    impl:
      kind: algebra
      ast:
        op: literal
        value: ok`,
    `    impl:
      kind: module
      uri: http://example.com
      export: default`,
  );
  expect(() => parseKernelModel(yamlText)).toThrow(/pattern|uri/i);
});

test("undeclared type refs are accepted here as a semantic boundary", () => {
  const yamlText = minimal().replace("type://adk/EchoInput/1.0", "type://adk/Undeclared/1.0");
  // Cross-field semantic validation is handled elsewhere; structural-only here per spec §6.
  expect(() => parseKernelModel(yamlText)).not.toThrow();
});

test("loadKindPack merges api.rest defaults and invariants", () => {
  const kind = loadKindPack(kindDir("api-rest")) as {
    id: string;
    primitives: string[];
    backend: string;
  };
  expect(kind.id).toBe("api.rest");
  expect(kind.primitives).toHaveLength(7);
  expect(kind.backend).toBe("module://./dispatch.ts#default");
});

test("loadKindPack merges cli.stdout and ui.html.ws packs", () => {
  const cli = loadKindPack(kindDir("cli-stdout")) as {
    id: string;
    primitives: string[];
    backend: string;
  };
  const ui = loadKindPack(kindDir("ui-html-ws")) as {
    id: string;
    primitives: string[];
    backend: string;
  };
  expect(cli.id).toBe("kind://adk.example/cli.stdout/1.0");
  expect(cli.primitives).toHaveLength(7);
  expect(ui.id).toBe("ui.html.ws");
  expect(ui.primitives).toHaveLength(42);
  expect(ui.backend).toBe("module://./dispatch.ts#default");
});

test("loadKindPack rejects a legacy single-file kind.yaml beside a migrated pack", () => {
  const dir = makePackageTmpDir("kind-pack-");
  tempDirs.push(dir);
  cpSync(kindDir("api-rest"), dir, { recursive: true });
  writeFileSync(join(dir, "kind.yaml"), "id: legacy\n");
  expect(() => loadKindPack(dir)).toThrow(
    /^Legacy single-file kind\.yaml at .*kind\.yaml; migrate to kind\.invariants\.yaml \+ kind\.defaults\.yaml$/,
  );
});

test("loadKindPack reports a missing invariants file with the directory path", () => {
  const dir = makePackageTmpDir("kind-pack-");
  tempDirs.push(dir);
  cpSync(kindDir("api-rest"), dir, { recursive: true });
  rmSync(join(dir, "kind.invariants.yaml"));
  expect(() => loadKindPack(dir)).toThrow(
    new RegExp(`kind\\.invariants\\.yaml.*${dir.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")}`),
  );
});
