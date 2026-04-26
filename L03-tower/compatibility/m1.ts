import { readFileSync } from "fs";
import { resolve } from "path";
import type { KernelExpression } from "../../L04-expression/evaluator.ts";

export interface Rule {
  id: string;
  appliesTo: "backward" | "forward" | "both";
  severity: "major" | "minor" | "patch";
  message: string;
  semver: string;
  predicate: KernelExpression;
}

export interface RulesDocument {
  conformsTo: "adk:RulesDocument/1.0";
  discriminator: "compatibility";
  version: string;
  rules: Rule[];
  id?: string;
}

function assertRulesDocument(value: unknown): asserts value is RulesDocument {
  if (!value || typeof value !== "object")
    throw new Error("CompatibilityRules: document must be an object");
  const doc = value as Partial<RulesDocument>;
  if (doc.conformsTo !== "adk:RulesDocument/1.0")
    throw new Error(
      `CompatibilityRules: conformsTo must be 'adk:RulesDocument/1.0' (got '${String(doc.conformsTo)}')`,
    );
  if (doc.discriminator !== "compatibility")
    throw new Error(
      `CompatibilityRules: discriminator must be 'compatibility' (got '${String(doc.discriminator)}')`,
    );
  if (!Array.isArray(doc.rules)) throw new Error("CompatibilityRules: rules must be an array");
}

const rulesYamlPath = resolve(import.meta.dir, "./rules.yaml");
const parsed = Bun.YAML.parse(readFileSync(rulesYamlPath, "utf-8"));
assertRulesDocument(parsed);

export const CompatibilityRules: RulesDocument = parsed;
