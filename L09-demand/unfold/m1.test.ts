import { beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { buildTypeUri } from "../../L01-foundation/utils.ts";
import { MetaLevel } from "../../L01-foundation/types.ts";
import { AlgebraicKernel } from "../../L13-facade/index.ts";
import { IntentProcessor } from "../../L07-agency/intent.ts";
import { UnfoldingEngine } from "./engine.ts";
import type { UnfoldRulesDocument } from "./rules-types.ts";

let ak: AlgebraicKernel;
let intents: IntentProcessor;
let engine: UnfoldingEngine;

beforeEach(() => {
  ak = AlgebraicKernel.create();
  intents = new IntentProcessor(ak);
  engine = new UnfoldingEngine(ak, intents);
});

function defineOrderType(): string {
  const id = buildTypeUri("test.example", "Order", "1.0");
  ak.defineType({
    id,
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
    name: "Order",
    version: "1.0",
    schema: {
      type: "object",
      required: ["id", "status"],
      properties: {
        id: { type: "string" },
        status: { type: "string", enum: ["pending", "paid", "shipped", "delivered"] },
      },
    },
  });
  return id;
}

function baseRules(): UnfoldRulesDocument {
  return Bun.YAML.parse(
    readFileSync(new URL("./rules.yaml", import.meta.url), "utf-8"),
  ) as UnfoldRulesDocument;
}

function actionExtension(id: string, template: string): UnfoldRulesDocument {
  return {
    id: `adk:${id}/1.0`,
    conformsTo: "adk:RulesDocument/1.0",
    discriminator: "unfold",
    version: "1.0",
    heuristics: [
      {
        id,
        when: { requires: ["detect-lifecycle"] },
        emit: {
          kind: "action-per-transition",
          actionName: { template },
          inputSchema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
          origin: "test.example",
        },
      },
    ],
  } as unknown as UnfoldRulesDocument;
}

describe("UnfoldRules M1 and extendRules", () => {
  test("M2 adk:RulesDocument/1.0 resolves after AlgebraicKernel.create()", () => {
    const typeDef = ak.resolveType(
      "type://github.com/Stream44/s44-rak-gen1@1.0/rules-document/1.0",
    );
    expect(typeDef.name).toBe("RulesDocument");
  });

  test("M1 UnfoldRules resolves after engine construct", () => {
    const typeDef = ak.resolveType(
      "type://github.com/Stream44/s44-rak-gen1@1.0/adk/unfold-rules/1.0",
    );
    expect(typeDef.conformsTo).toBe(
      "type://github.com/Stream44/s44-rak-gen1@1.0/rules-document/1.0",
    );
  });

  test("extendRules append adds a new heuristic that changes generated action names", () => {
    engine.extendRules(
      actionExtension("transitions-to-audit-actions", "Audit${capitalize(verb)}${entity.name}"),
      { strategy: "append", conflictPolicy: "error" },
    );
    const result = engine.unfold(defineOrderType());
    expect(result.strata.actions.map((action) => action.name)).toContain("AuditPaidOrder");
  });

  test("two compatible extensions with the same tuple succeed", () => {
    engine.extendRules(
      actionExtension("transitions-to-audit-actions", "Audit${capitalize(verb)}${entity.name}"),
      { strategy: "append", conflictPolicy: "error" },
    );
    engine.extendRules(
      actionExtension("transitions-to-notify-actions", "Notify${capitalize(verb)}${entity.name}"),
      { strategy: "append", conflictPolicy: "error" },
    );
    const result = engine.unfold(defineOrderType());
    expect(result.strata.actions.map((action) => action.name)).toEqual(
      expect.arrayContaining(["AuditPaidOrder", "NotifyPaidOrder"]),
    );
  });

  test("two disagreeing extensions throw with both ids and tuples", () => {
    engine.extendRules(
      actionExtension("transitions-to-extended-actions", "Audit${capitalize(verb)}${entity.name}"),
      { strategy: "append", conflictPolicy: "error" },
    );
    expect(() =>
      engine.extendRules(
        actionExtension(
          "transitions-to-extended-actions",
          "Notify${capitalize(verb)}${entity.name}",
        ),
        { strategy: "prepend", conflictPolicy: "error" },
      ),
    ).toThrow(
      "UnfoldingEngine: strategy disagreement applying extension 'adk:transitions-to-extended-actions/1.0' — heuristic 'transitions-to-extended-actions' was previously extended by 'adk:transitions-to-extended-actions/1.0' with {strategy:append, conflictPolicy:error}, but new extension declares {strategy:prepend, conflictPolicy:error}.",
    );
  });

  test("extendRules accepts a filesystem ref after parse and validation", () => {
    const dir = mkdtempSync(join(tmpdir(), "wp-047-"));
    const path = join(dir, "ext.yaml");
    try {
      const doc = baseRules();
      doc.id = "adk:FileRules/1.0";
      doc.heuristics = doc.heuristics.map((heuristic) =>
        heuristic.id === "transitions-to-actions"
          ? {
              ...heuristic,
              emit: {
                ...heuristic.emit,
                actionName: { template: "File${capitalize(verb)}${entity.name}" },
              },
            }
          : heuristic,
      );
      writeFileSync(path, Bun.YAML.stringify(doc));
      engine.extendRules(path, { strategy: "append", conflictPolicy: "override" });
      const result = engine.unfold(defineOrderType());
      expect(result.strata.actions.map((action) => action.name)).toContain("FilePaidOrder");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
