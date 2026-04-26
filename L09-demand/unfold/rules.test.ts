import { expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";
import { validateUnfoldRulesDocument } from "./rules-types.ts";

const RULES_YAML = resolve(import.meta.dir, "./rules.yaml");
const loadDoc = () => Bun.YAML.parse(readFileSync(RULES_YAML, "utf-8")) as Record<string, unknown>;

test("loads rules.yaml via fs + yaml.parse", () => {
  const doc = loadDoc();
  expect(doc.conformsTo).toBe("adk:RulesDocument/1.0");
  expect(doc.discriminator).toBe("unfold");
  expect((doc.heuristics as unknown[]).length).toBe(3);
});

test("validator accepts the shipped YAML", () => {
  expect(() => validateUnfoldRulesDocument(loadDoc())).not.toThrow();
});

test("validator rejects wrong conformsTo", () => {
  const doc = { ...loadDoc(), conformsTo: "other/1.0" };
  expect(() => validateUnfoldRulesDocument(doc)).toThrow("adk:RulesDocument/1.0");
});

test("validator rejects missing heuristic", () => {
  const doc = {
    ...loadDoc(),
    heuristics: (loadDoc().heuristics as { id: string }[]).filter(
      (h) => h.id !== "detect-lifecycle",
    ),
  };
  expect(() => validateUnfoldRulesDocument(doc)).toThrow("detect-lifecycle");
});

test("validator rejects non-array heuristics", () => {
  expect(() => validateUnfoldRulesDocument({ ...loadDoc(), heuristics: {} })).toThrow("heuristics");
});

test("heuristic ids match the specified trio", () => {
  const ids = (loadDoc().heuristics as { id: string }[]).map((h) => h.id).sort();
  expect(ids).toEqual(["detect-lifecycle", "generate-endpoints", "transitions-to-actions"]);
});
