import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { Compatibility, MetaLevel, type TypeDef } from "../../L01-foundation/types.ts";
import { CompatibilityChecker } from "./engine.ts";
import type { RulesDocument } from "./m1.ts";

const typeDef = (schema: TypeDef["schema"], id = "type://compat.test/1.0"): TypeDef => ({
  id,
  level: MetaLevel.Model,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
  schema,
});
const writeDoc = (name: string, doc: RulesDocument) => {
  const dir = mkdtempSync(join(tmpdir(), "compat-rules-")),
    path = join(dir, name);
  writeFileSync(path, Bun.YAML.stringify(doc));
  return Bun.YAML.parse(readFileSync(path, "utf-8")) as RulesDocument;
};

describe("CompatibilityChecker rule interpreter", () => {
  test("parity: required-added", () => {
    const result = new CompatibilityChecker().check(
      typeDef({ type: "object", properties: {} }),
      typeDef(
        { type: "object", required: ["foo"], properties: { foo: { type: "string" } } },
        "type://compat.test/2.0",
      ),
      Compatibility.Backward,
    );
    expect(result).toMatchObject({
      compatible: false,
      breakingChanges: [
        {
          kind: "required-added",
          path: "/foo",
          message: 'New required field "foo" has no default — old data will fail',
        },
      ],
    });
  });

  test("parity: field-removed with additionalProperties=false", () => {
    const result = new CompatibilityChecker().check(
      typeDef({ type: "object", properties: { foo: { type: "string" } } }),
      typeDef(
        { type: "object", properties: {}, additionalProperties: false },
        "type://compat.test/2.0",
      ),
      Compatibility.Backward,
    );
    expect(result.breakingChanges).toEqual([
      {
        kind: "field-removed",
        path: "/foo",
        message:
          'Field "foo" removed and additionalProperties=false — old data with this field will fail',
      },
    ]);
  });

  test("parity: type-changed", () => {
    const result = new CompatibilityChecker().check(
      typeDef({ type: "object", properties: { foo: { type: "string" } } }),
      typeDef(
        { type: "object", properties: { foo: { type: "number" } } },
        "type://compat.test/2.0",
      ),
      Compatibility.Backward,
    );
    expect(result.breakingChanges).toEqual([
      {
        kind: "type-changed",
        path: "/foo",
        message: 'Field "foo" type changed from string to number',
      },
    ]);
  });

  test("parity: range-narrowed minimum", () => {
    const result = new CompatibilityChecker().check(
      typeDef({ type: "object", properties: { foo: { type: "integer", minimum: 0 } } }),
      typeDef(
        { type: "object", properties: { foo: { type: "integer", minimum: 1 } } },
        "type://compat.test/2.0",
      ),
      Compatibility.Backward,
    );
    expect(result.breakingChanges).toEqual([
      {
        kind: "range-narrowed",
        path: "/foo",
        message: 'Field "foo" minimum tightened from 0 to 1',
      },
    ]);
  });

  test("parity: required-added-forward", () => {
    const result = new CompatibilityChecker().check(
      typeDef({ type: "object", properties: {} }),
      typeDef(
        { type: "object", required: ["foo"], properties: { foo: { type: "string" } } },
        "type://compat.test/2.0",
      ),
      Compatibility.Forward,
    );
    expect(result.breakingChanges).toEqual([
      {
        kind: "required-added-forward",
        path: "/foo",
        message: `New required field "foo" — old producers won't include it`,
      },
    ]);
  });

  test("suggestMigration matches legacy behavior", () => {
    const steps = new CompatibilityChecker().suggestMigration(
      typeDef({
        type: "object",
        required: ["keep", "drop"],
        properties: {
          keep: { type: "string" },
          drop: { type: "string" },
          mutate: { type: "string" },
        },
      }),
      typeDef(
        {
          type: "object",
          required: ["keep", "add"],
          properties: {
            keep: { type: "string" },
            add: { type: "number", default: 0 },
            mutate: { type: "number" },
          },
        },
        "type://compat.test/2.0",
      ),
    );
    expect(steps).toEqual([
      {
        path: "/add",
        action: "add-default",
        defaultValue: 0,
        description: 'Add required field "add" with default value',
      },
      { path: "/drop", action: "remove", description: 'Remove field "drop" (no longer required)' },
      {
        path: "/mutate",
        action: "transform-type",
        description: 'Transform "mutate" from string to number',
      },
    ]);
  });

  test("extendRules appends and fires enum-narrowed", () => {
    const checker = new CompatibilityChecker();
    checker.extendRules(
      writeDoc("enum.yaml", {
        id: "adk:compat-enum/1.0",
        conformsTo: "adk:RulesDocument/1.0",
        discriminator: "compatibility",
        version: "1.0.0",
        rules: [
          {
            id: "enum-narrowed",
            appliesTo: "backward",
            severity: "major",
            message: "enum narrowed",
            semver: "enum narrowing is major for this extension.",
            predicate: {
              op: "call",
              fn: "map",
              args: [
                {
                  op: "call",
                  fn: "filter",
                  args: [
                    { op: "var", name: "$fields" },
                    {
                      op: "lambda",
                      param: "$field",
                      body: {
                        op: "call",
                        fn: "gt",
                        args: [
                          {
                            op: "call",
                            fn: "length",
                            args: [
                              {
                                op: "call",
                                fn: "filter",
                                args: [
                                  { op: "get", path: "$field/oldEnum" },
                                  {
                                    op: "lambda",
                                    param: "$value",
                                    body: {
                                      op: "call",
                                      fn: "eq",
                                      args: [
                                        {
                                          op: "call",
                                          fn: "length",
                                          args: [
                                            {
                                              op: "call",
                                              fn: "filter",
                                              args: [
                                                { op: "get", path: "$field/newEnum" },
                                                {
                                                  op: "lambda",
                                                  param: "$candidate",
                                                  body: {
                                                    op: "call",
                                                    fn: "eq",
                                                    args: [
                                                      { op: "var", name: "$candidate" },
                                                      { op: "var", name: "$value" },
                                                    ],
                                                  },
                                                },
                                              ],
                                            },
                                          ],
                                        },
                                        { op: "const", value: 0 },
                                      ],
                                    },
                                  },
                                ],
                              },
                            ],
                          },
                          { op: "const", value: 0 },
                        ],
                      },
                    },
                  ],
                },
                {
                  op: "lambda",
                  param: "$field",
                  body: {
                    op: "record",
                    fields: {
                      field: { op: "get", path: "$field/name" },
                      path: { op: "get", path: "$field/path" },
                      message: { op: "const", value: "enum narrowed" },
                    },
                  },
                },
              ],
            },
          },
        ],
      }),
      { strategy: "append", conflictPolicy: "last-wins" },
    );
    const result = checker.check(
      typeDef({ type: "object", properties: { foo: { enum: ["a", "b"] } } }),
      typeDef({ type: "object", properties: { foo: { enum: ["a"] } } }, "type://compat.test/2.0"),
      Compatibility.Backward,
    );
    expect(result.breakingChanges).toContainEqual({
      kind: "enum-narrowed",
      path: "/foo",
      message: "enum narrowed",
    });
  });

  test("extendRules rejects strategy disagreement", () => {
    const checker = new CompatibilityChecker(),
      doc = writeDoc("noop.yaml", {
        id: "adk:compat-noop/1.0",
        conformsTo: "adk:RulesDocument/1.0",
        discriminator: "compatibility",
        version: "1.0.0",
        rules: [],
      });
    checker.extendRules(doc, { strategy: "append", conflictPolicy: "last-wins" });
    expect(() =>
      checker.extendRules(doc, { strategy: "replace-by-id", conflictPolicy: "last-wins" }),
    ).toThrow(/strategy disagreement.*append.*replace-by-id/);
  });
});
