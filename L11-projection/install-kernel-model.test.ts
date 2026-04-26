import { describe, expect, test } from "bun:test";
import { AlgebraicKernel, IntentProcessor, buildTypeUri } from "../L13-facade/index.ts";
import { createLocalModuleResolver } from "./module-loader.ts";
import type { KernelModelDocument } from "./metamodel.ts";
import installKernelModel from "./morphisms/install-kernel-model.ts";

function makeDoc(): KernelModelDocument {
  return {
    kernel: "EchoKernel",
    version: "1.0",
    conformsTo: "adk:KernelMetamodel/1.0",
    origin: "adk",
    types: {
      EchoInput: {
        name: "EchoInput",
        jsonSchema: {
          type: "object",
          required: ["msg"],
          properties: { msg: { type: "string" } },
          additionalProperties: true,
        },
      },
      EchoOutput: {
        name: "EchoOutput",
        jsonSchema: {
          type: "object",
          required: ["msg"],
          properties: { msg: { type: "string" } },
          additionalProperties: true,
        },
      },
      EchoState: {
        name: "EchoState",
        jsonSchema: {
          type: "object",
          required: ["status"],
          properties: { status: { type: "string" } },
          additionalProperties: true,
        },
      },
      EchoEvent: {
        name: "EchoEvent",
        jsonSchema: {
          type: "object",
          required: ["verb"],
          properties: { verb: { type: "string" } },
          additionalProperties: true,
        },
      },
    },
    machines: {
      EchoMachine: {
        id: "EchoMachine",
        name: "EchoMachine",
        stateType: "type://adk/EchoState/1.0",
        eventType: "type://adk/EchoEvent/1.0",
        initialState: { status: "idle" },
        transitions: [
          {
            from: { kind: "wildcard" },
            event: { kind: "wildcard" },
            to: { op: "const", value: { status: "echoed" } },
          },
        ],
      },
    },
    morphisms: {
      identity: {
        id: "identity",
        input: "type://adk/EchoInput/1.0",
        output: "type://adk/EchoInput/1.0",
        impl: { kind: "algebra", ast: { op: "var", name: "$input" } },
      },
      echo: {
        id: "echo",
        input: "type://adk/EchoInput/1.0",
        output: "type://adk/EchoOutput/1.0",
        impl: {
          kind: "module",
          uri: "module://adk/27B-projection/morphisms/test-fixtures/echo.ts",
          export: "default",
        },
      },
    },
    actions: {
      Echo: {
        name: "Echo",
        verb: "echo",
        inputSchema: { type: "object", required: ["msg"], properties: { msg: { type: "string" } } },
        capabilityRequirement: "cap://none",
        machine: "EchoMachine",
        morphism: {
          kind: "compose",
          f: { kind: "name", name: "identity" },
          g: { kind: "name", name: "echo" },
        },
      },
    },
  };
}

describe("installKernelModel", () => {
  test("registers every declared type", async () => {
    const doc = makeDoc(),
      ak = AlgebraicKernel.create();
    await installKernelModel({
      doc,
      ak,
      intents: new IntentProcessor(ak),
      resolver: createLocalModuleResolver(import.meta.dir),
      algebraBindings: new Map(),
    });
    for (const name of Object.keys(doc.types))
      expect(ak.resolveType(buildTypeUri("adk", name, doc.version)).name).toBe(name);
  });

  test("registers every machine", async () => {
    const doc = makeDoc(),
      ak = AlgebraicKernel.create();
    await installKernelModel({
      doc,
      ak,
      intents: new IntentProcessor(ak),
      resolver: createLocalModuleResolver(import.meta.dir),
      algebraBindings: new Map(),
    });
    expect(ak.stateMachines.resolve("EchoMachine").name).toBe("EchoMachine");
  });

  test("registers every morphism", async () => {
    const doc = makeDoc(),
      ak = AlgebraicKernel.create();
    const result = await installKernelModel({
      doc,
      ak,
      intents: new IntentProcessor(ak),
      resolver: createLocalModuleResolver(import.meta.dir),
      algebraBindings: new Map(),
    });
    expect(result.morphismIdsByName.size).toBe(Object.keys(doc.morphisms).length);
  });

  test("registers every action", async () => {
    const doc = makeDoc(),
      ak = AlgebraicKernel.create();
    const result = await installKernelModel({
      doc,
      ak,
      intents: new IntentProcessor(ak),
      resolver: createLocalModuleResolver(import.meta.dir),
      algebraBindings: new Map(),
    });
    expect(result.actionsByName.size).toBe(Object.keys(doc.actions).length);
  });

  test("registers morphisms before actions consume them", async () => {
    const doc = makeDoc(),
      ak = AlgebraicKernel.create();
    const result = await installKernelModel({
      doc,
      ak,
      intents: new IntentProcessor(ak),
      resolver: createLocalModuleResolver(import.meta.dir),
      algebraBindings: new Map(),
    });
    expect(
      result.morphismIdsByName.has(
        (result.actionMorphisms.get("Echo") as { g: { name: string } }).g.name,
      ),
    ).toBe(true);
  });
});
