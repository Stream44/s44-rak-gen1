import { describe, expect, test } from "bun:test";
import { MetaLevel } from "../L01-foundation/types.ts";
import { AlgebraicKernel } from "../L13-facade/kernel.export.ts";
import { MORPHISM_DOCUMENT_ID } from "./morphism-document.ts";
import {
  registerMorphismDocument,
  validateMorphismDocument,
  type MorphismDocumentM1,
} from "./morphism-document-adapter.ts";

describe("MorphismDocument adapter", () => {
  function setupKernel() {
    const kernel = AlgebraicKernel.create();
    const numberType = kernel.defineScalar("DocNumber", "1.0", { type: "number" });
    const stringType = kernel.defineScalar("DocString", "1.0", { type: "string" });
    return { kernel, numberType, stringType };
  }

  function makeDoc(): MorphismDocumentM1 {
    return {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/TestMorphisms/1.0",
      level: MetaLevel.Model,
      conformsTo: MORPHISM_DOCUMENT_ID,
      schema: {},
      discriminator: "test",
      morphisms: {
        addTen: {
          id: "morphism://github.com/Stream44/s44-rak-gen1@1.0/addTen/1.0",
          input: "type://github.com/Stream44/s44-rak-gen1@1.0/DocNumber/1.0",
          output: "type://github.com/Stream44/s44-rak-gen1@1.0/DocNumber/1.0",
          impl: {
            kind: "algebra",
            ast: {
              op: "call",
              fn: "add",
              args: [
                { op: "var", name: "$input" },
                { op: "const", value: 10 },
              ],
            },
          },
        },
        upcase: {
          id: "morphism://github.com/Stream44/s44-rak-gen1@1.0/upcase/1.0",
          input: "type://github.com/Stream44/s44-rak-gen1@1.0/DocString/1.0",
          output: "type://github.com/Stream44/s44-rak-gen1@1.0/DocString/1.0",
          impl: {
            kind: "module",
            uri: "module://./upcase.ts",
            export: "default",
          },
        },
      },
    };
  }

  test("well-formed document registers every morphism and each becomes dispatchable", async () => {
    const { kernel } = setupKernel();
    kernel.morphisms.registerModuleResolver(async (uri, exportName) => {
      expect(uri).toBe("module://./upcase.ts");
      expect(exportName).toBe("default");
      return (input: string) => input.toUpperCase();
    });

    registerMorphismDocument(makeDoc(), kernel);

    await expect(
      kernel.morphisms.evaluate("morphism://github.com/Stream44/s44-rak-gen1@1.0/addTen/1.0", 5),
    ).resolves.toBe(15);
    await expect(
      kernel.morphisms.evaluate(
        "morphism://github.com/Stream44/s44-rak-gen1@1.0/upcase/1.0",
        "echo",
      ),
    ).resolves.toBe("ECHO");
  });

  test("unresolved input type URI errors clearly", () => {
    const { kernel } = setupKernel();
    const doc = makeDoc();
    doc.morphisms.addTen = {
      ...doc.morphisms.addTen,
      input: "type://github.com/Stream44/s44-rak-gen1@1.0/MissingInput/1.0",
    };

    expect(() => registerMorphismDocument(doc, kernel)).toThrow(
      /MorphismDocument adapter: morphism "addTen" has unresolved input type "type:\/\/.*": .*/,
    );
  });

  test("unresolved output type URI errors clearly", () => {
    const { kernel } = setupKernel();
    const doc = makeDoc();
    doc.morphisms.addTen = {
      ...doc.morphisms.addTen,
      output: "type://github.com/Stream44/s44-rak-gen1@1.0/MissingOutput/1.0",
    };

    expect(() => registerMorphismDocument(doc, kernel)).toThrow(
      /MorphismDocument adapter: morphism "addTen" has unresolved output type "type:\/\/.*": .*/,
    );
  });

  test("bad impl.kind errors at validation", () => {
    const doc = makeDoc();
    doc.morphisms.addTen = {
      ...doc.morphisms.addTen,
      impl: { kind: "algebra-ish", ast: {} } as never,
    };

    expect(() => validateMorphismDocument(doc)).toThrow(/unknown impl.kind "algebra-ish"/);
  });

  test("missing impl.ast for algebra-kind errors at validation", () => {
    const doc = makeDoc();
    doc.morphisms.addTen = {
      ...doc.morphisms.addTen,
      impl: { kind: "algebra" } as never,
    };

    expect(() => validateMorphismDocument(doc)).toThrow(/impl.kind="algebra" but ast is missing/);
  });

  test("missing impl.uri for module-kind errors at validation", () => {
    const doc = makeDoc();
    doc.morphisms.upcase = {
      ...doc.morphisms.upcase,
      impl: { kind: "module", export: "default" } as never,
    };

    expect(() => validateMorphismDocument(doc)).toThrow(/impl.kind="module" but uri.*missing/);
  });

  test("duplicate morphism id across entries errors", () => {
    const doc = makeDoc();
    doc.morphisms.upcase = {
      ...doc.morphisms.upcase,
      id: "morphism://adk/foo/1.0",
    };
    doc.morphisms.addTen = {
      ...doc.morphisms.addTen,
      id: "morphism://adk/foo/1.0",
    };

    expect(() => validateMorphismDocument(doc)).toThrow(
      /duplicate morphism id "morphism:\/\/adk\/foo\/1.0"/,
    );
  });

  test("wrong conformsTo errors", () => {
    const doc = makeDoc();
    doc.conformsTo = "type://github.com/Stream44/s44-rak-gen1@1.0/adk/MorphismDocument/2.0";

    expect(() => validateMorphismDocument(doc)).toThrow(
      /conformsTo must be "type:\/\/github\.com\/Stream44\/s44-rak-gen1@1\.0\/adk\/MorphismDocument\/1\.0", got "type:\/\/.*\/2\.0"/,
    );
  });

  test("empty discriminator errors", () => {
    const doc = makeDoc();
    doc.discriminator = "";

    expect(() => validateMorphismDocument(doc)).toThrow(/discriminator must be a non-empty string/);
  });

  test("sibling dispatch works", async () => {
    const { kernel, numberType } = setupKernel();
    const doc: MorphismDocumentM1 = {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/SiblingMorphisms/1.0",
      level: MetaLevel.Model,
      conformsTo: MORPHISM_DOCUMENT_ID,
      schema: {},
      discriminator: "test",
      morphisms: {
        foo: {
          id: "morphism://github.com/Stream44/s44-rak-gen1@1.0/foo/1.0",
          input: numberType,
          output: numberType,
          impl: { kind: "algebra", ast: { op: "const", value: 7 } },
        },
        bar: {
          id: "morphism://github.com/Stream44/s44-rak-gen1@1.0/bar/1.0",
          input: numberType,
          output: numberType,
          impl: {
            kind: "algebra",
            ast: {
              op: "apply",
              fn: { op: "var", name: "$fooMorphism" },
              arg: { op: "const", value: null },
            },
          },
        },
      },
    };

    registerMorphismDocument(doc, kernel);

    await expect(
      kernel.morphisms.evaluate("morphism://github.com/Stream44/s44-rak-gen1@1.0/bar/1.0", 123),
    ).resolves.toBe(7);
  });

  test("cycle is gas-bounded", async () => {
    const kernel = AlgebraicKernel.create({ maxGas: 32 });
    const numberType = kernel.defineScalar("DocNumber", "1.0", { type: "number" });
    const doc: MorphismDocumentM1 = {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/CycleMorphisms/1.0",
      level: MetaLevel.Model,
      conformsTo: MORPHISM_DOCUMENT_ID,
      schema: {},
      discriminator: "test",
      morphisms: {
        foo: {
          id: "morphism://github.com/Stream44/s44-rak-gen1@1.0/foo/1.0",
          input: numberType,
          output: numberType,
          impl: {
            kind: "algebra",
            ast: {
              op: "apply",
              fn: { op: "var", name: "$barMorphism" },
              arg: { op: "var", name: "$input" },
            },
          },
        },
        bar: {
          id: "morphism://github.com/Stream44/s44-rak-gen1@1.0/bar/1.0",
          input: numberType,
          output: numberType,
          impl: {
            kind: "algebra",
            ast: {
              op: "apply",
              fn: { op: "var", name: "$fooMorphism" },
              arg: { op: "var", name: "$input" },
            },
          },
        },
      },
    };

    registerMorphismDocument(doc, kernel);

    await expect(
      kernel.morphisms.evaluate("morphism://github.com/Stream44/s44-rak-gen1@1.0/foo/1.0", 1),
    ).rejects.toThrow(/OutOfGas|Sibling .*gas|Sibling .*dispatch failed/);
  });

  test("naming convention is exact", async () => {
    const { kernel, numberType } = setupKernel();
    const doc: MorphismDocumentM1 = {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/NamingMorphisms/1.0",
      level: MetaLevel.Model,
      conformsTo: MORPHISM_DOCUMENT_ID,
      schema: {},
      discriminator: "test",
      morphisms: {
        runStep: {
          id: "morphism://adk/runStep/1.0",
          input: numberType,
          output: numberType,
          impl: { kind: "algebra", ast: { op: "const", value: 9 } },
        },
        ok: {
          id: "morphism://github.com/Stream44/s44-rak-gen1@1.0/ok/1.0",
          input: numberType,
          output: numberType,
          impl: {
            kind: "algebra",
            ast: {
              op: "apply",
              fn: { op: "var", name: "$runStepMorphism" },
              arg: { op: "const", value: null },
            },
          },
        },
        bad: {
          id: "morphism://github.com/Stream44/s44-rak-gen1@1.0/bad/1.0",
          input: numberType,
          output: numberType,
          impl: {
            kind: "algebra",
            ast: {
              op: "apply",
              fn: { op: "var", name: "$runstepMorphism" },
              arg: { op: "const", value: null },
            },
          },
        },
      },
    };

    registerMorphismDocument(doc, kernel);

    await expect(
      kernel.morphisms.evaluate("morphism://github.com/Stream44/s44-rak-gen1@1.0/ok/1.0", 0),
    ).resolves.toBe(9);
    await expect(
      kernel.morphisms.evaluate("morphism://github.com/Stream44/s44-rak-gen1@1.0/bad/1.0", 0),
    ).rejects.toThrow("Unbound variable: $runstepMorphism");
  });

  test("no-sibling-reference morphism still dispatches", async () => {
    const { kernel, stringType } = setupKernel();
    const doc: MorphismDocumentM1 = {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/InputMorphisms/1.0",
      level: MetaLevel.Model,
      conformsTo: MORPHISM_DOCUMENT_ID,
      schema: {},
      discriminator: "test",
      morphisms: {
        echo: {
          id: "morphism://github.com/Stream44/s44-rak-gen1@1.0/echo/1.0",
          input: stringType,
          output: stringType,
          impl: { kind: "algebra", ast: { op: "var", name: "$input" } },
        },
      },
    };

    registerMorphismDocument(doc, kernel);

    await expect(
      kernel.morphisms.evaluate("morphism://github.com/Stream44/s44-rak-gen1@1.0/echo/1.0", "ping"),
    ).resolves.toBe("ping");
  });

  test("discriminator is accessible", async () => {
    const { kernel, stringType } = setupKernel();
    const doc: MorphismDocumentM1 = {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/DiscriminatorMorphisms/1.0",
      level: MetaLevel.Model,
      conformsTo: MORPHISM_DOCUMENT_ID,
      schema: {},
      discriminator: "state-machine",
      morphisms: {
        tag: {
          id: "morphism://github.com/Stream44/s44-rak-gen1@1.0/tag/1.0",
          input: stringType,
          output: stringType,
          impl: { kind: "algebra", ast: { op: "var", name: "$discriminator" } },
        },
      },
    };

    registerMorphismDocument(doc, kernel);

    await expect(
      kernel.morphisms.evaluate(
        "morphism://github.com/Stream44/s44-rak-gen1@1.0/tag/1.0",
        "ignored",
      ),
    ).resolves.toBe("state-machine");
  });

  test('typo yields "Unbound variable" error', async () => {
    const { kernel, numberType } = setupKernel();
    const doc: MorphismDocumentM1 = {
      id: "type://github.com/Stream44/s44-rak-gen1@1.0/adk/TypoMorphisms/1.0",
      level: MetaLevel.Model,
      conformsTo: MORPHISM_DOCUMENT_ID,
      schema: {},
      discriminator: "test",
      morphisms: {
        step: {
          id: "morphism://github.com/Stream44/s44-rak-gen1@1.0/step/1.0",
          input: numberType,
          output: numberType,
          impl: { kind: "algebra", ast: { op: "const", value: 1 } },
        },
        caller: {
          id: "morphism://github.com/Stream44/s44-rak-gen1@1.0/caller/1.0",
          input: numberType,
          output: numberType,
          impl: {
            kind: "algebra",
            ast: {
              op: "apply",
              fn: { op: "var", name: "$stepMorphis" },
              arg: { op: "const", value: null },
            },
          },
        },
      },
    };

    registerMorphismDocument(doc, kernel);

    await expect(
      kernel.morphisms.evaluate("morphism://github.com/Stream44/s44-rak-gen1@1.0/caller/1.0", 0),
    ).rejects.toThrow("Unbound variable: $stepMorphis");
  });
});
