import { describe, expect, test } from "bun:test";
import { AlgebraicKernel, MetaLevel } from "../../L13-facade/index.ts";
import type { KernelModelDocument } from "../metamodel.ts";
import validateSemantics from "./validate-semantics.ts";

function baseDoc(): KernelModelDocument {
  return {
    kernel: "TestKernel",
    version: "1.0",
    conformsTo: "adk:KernelMetamodel/1.0",
    origin: "adk",
    types: {},
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
            to: { op: "const", value: { status: "done" } },
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
    },
    actions: {
      Echo: {
        name: "Echo",
        verb: "echo",
        inputSchema: { type: "object" },
        capabilityRequirement: "cap://none",
        machine: "EchoMachine",
        morphism: { kind: "name", name: "identity" },
      },
    },
  };
}

function kernel(): AlgebraicKernel {
  const ak = AlgebraicKernel.create();
  for (const name of ["EchoInput", "EchoEvent", "EchoState"])
    ak.defineType({
      id: `type://adk/${name}/1.0`,
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: { type: "object", properties: {}, additionalProperties: true },
      name,
      version: "1.0",
    });
  return ak;
}

describe("validateSemantics", () => {
  test("rejects unknown morphism type refs", () => {
    const doc = baseDoc();
    doc.morphisms.identity.input = "type://adk/Missing/1.0";
    expect(() => validateSemantics({ doc, ak: kernel() })).toThrow(/identity.*Missing/);
  });

  test("rejects unknown machines", () => {
    const doc = baseDoc();
    doc.actions.Echo.machine = "MissingMachine";
    expect(() => validateSemantics({ doc, ak: kernel() })).toThrow(/Echo.*MissingMachine/);
  });

  test("rejects malformed capability URIs", () => {
    const doc = baseDoc();
    doc.actions.Echo.capabilityRequirement = "::bad::";
    expect(() => validateSemantics({ doc, ak: kernel() })).toThrow(
      /Echo.*malformed capabilityRequirement/,
    );
  });

  test("rejects unknown action morphism refs", () => {
    const doc = baseDoc();
    doc.actions.Echo.morphism = { kind: "name", name: "missing" };
    expect(() => validateSemantics({ doc, ak: kernel() })).toThrow(
      /Echo.*unknown morphism: missing/,
    );
  });
});
