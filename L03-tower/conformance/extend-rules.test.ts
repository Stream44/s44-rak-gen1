import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MetaLevel, SchemaValidator, type TypeDef } from "../../L13-facade/index.ts";
import { ConformanceEngine, type ConformanceRulesDocument } from "./engine.ts";

const tempDir = mkdtempSync(join(tmpdir(), "adk-conformance-"));

function writeDoc(name: string, doc: ConformanceRulesDocument): string {
  const path = join(tempDir, name);
  writeFileSync(path, Bun.YAML.stringify(doc));
  return path;
}

afterAll(() => rmSync(tempDir, { recursive: true, force: true }));

describe("ConformanceEngine.extendRules", () => {
  const makeEngine = () => new ConformanceEngine(new SchemaValidator());
  const child: TypeDef = {
    id: "type://Example/1.0",
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    schema: { type: "object", properties: {} },
  };
  const parent: TypeDef = {
    id: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    level: MetaLevel.Metamodel,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0",
    schema: { type: "object", properties: {} },
  };

  test("refuses sealed rule overrides", () => {
    const path = writeDoc("sealed.yaml", {
      id: "adk:sealed/1.0",
      version: "1.0",
      conformsTo: "adk:RulesDocument/1.0",
      discriminator: "conformance",
      rules: [
        {
          id: "mof.child-plus-one-equals-parent",
          description: "override",
          when: { childLevel: 1 },
          outcome: "pass",
        },
      ],
    });
    expect(() =>
      makeEngine().extendRules(path, { strategy: "override-ids", conflictPolicy: "error" }),
    ).toThrow('sealed rule "mof.child-plus-one-equals-parent"');
  });

  test("honours valid extension rules", () => {
    const path = writeDoc("custom.yaml", {
      id: "adk:project/1.0",
      version: "1.0",
      conformsTo: "adk:RulesDocument/1.0",
      discriminator: "conformance",
      rules: [
        {
          id: "project.custom-policy",
          description: "custom failure",
          when: { childLevel: 1, parentLevel: 2, childIdEqualsParentId: false },
          outcome: { onFail: { message: "Custom policy blocked", keyword: "custom" } },
        },
      ],
    });
    const engine = makeEngine();
    engine.extendRules(path, { strategy: "append", conflictPolicy: "error" });
    expect(engine.checkDirect(child, parent)).toEqual({
      valid: false,
      errors: [{ path: "/level", message: "Custom policy blocked", keyword: "custom", params: {} }],
    });
  });

  test("rejects strategy disagreement on shared namespaces", () => {
    const first = writeDoc("first.yaml", {
      id: "adk:project-a/1.0",
      version: "1.0",
      conformsTo: "adk:RulesDocument/1.0",
      discriminator: "conformance",
      rules: [{ id: "project.alpha", description: "a" }],
    });
    const second = writeDoc("second.yaml", {
      id: "adk:project-b/1.0",
      version: "1.0",
      conformsTo: "adk:RulesDocument/1.0",
      discriminator: "conformance",
      rules: [{ id: "project.beta", description: "b" }],
    });
    const engine = makeEngine();
    engine.extendRules(first, { strategy: "append", conflictPolicy: "error" });
    const call = () =>
      engine.extendRules(second, { strategy: "override-ids", conflictPolicy: "last-wins" });
    expect(call).toThrow(
      new RegExp(
        `${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*${second.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}|${second.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}.*${first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
      ),
    );
    expect(call).toThrow(/strategy disagreement/);
    expect(call).toThrow(/project\./);
  });
});
