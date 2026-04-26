import {
  Compatibility,
  type BreakingChange,
  type CompatibilityResult,
  type JsonSchema,
  type MigrationStep,
  type TypeDef,
} from "../../L01-foundation/types.ts";
import { requiredDiff } from "../../L01-foundation/utils.ts";
import { ExpressionEvaluator } from "../../L04-expression/evaluator.ts";
import { CompatibilityRules, type RulesDocument, type Rule } from "./m1.ts";

type ExtendRulesOptions = {
  strategy: "append" | "replace-by-id" | "prepend";
  conflictPolicy: "error" | "last-wins" | "first-wins";
};
type Match = { path: string; message: string; field?: string };
type FieldFacts = {
  name: string;
  path: string;
  inOld: boolean;
  inNew: boolean;
  oldRequired: boolean;
  newRequired: boolean;
  newDefaultMissing: boolean;
  typeChanged: boolean;
  minimumTightened: boolean;
  maximumTightened: boolean;
  oldEnum?: unknown[];
  newEnum?: unknown[];
  requiredAddedMessage: string;
  fieldRemovedMessage: string;
  typeChangedMessage: string;
  minimumMessage: string;
  maximumMessage: string;
  requiredAddedForwardMessage: string;
  requiredRemovedMessage: string;
};

const flatten = (value: unknown): Match[] =>
  Array.isArray(value)
    ? value.flatMap(flatten)
    : value && typeof value === "object" && "path" in value && "message" in value
      ? [value as Match]
      : [];
const includes = (values: string[] | undefined, value: string) => (values ?? []).includes(value);
const mergeRules = (base: Rule[], extension: Rule[], opts: ExtendRulesOptions) => {
  const baseIds = base.map(({ id }) => id),
    extIds = extension.map(({ id }) => id),
    shared = extIds.filter((id) => baseIds.includes(id));
  if (shared.length && opts.conflictPolicy === "error")
    throw new Error(`CompatibilityChecker.extendRules: overlapping rule ids: ${shared.join(", ")}`);
  const choose = (id: string) => {
    const prior = base.find((rule) => rule.id === id),
      next = extension.find((rule) => rule.id === id);
    return prior && next ? (opts.conflictPolicy === "first-wins" ? prior : next) : (next ?? prior!);
  };
  const ids =
    opts.strategy === "prepend"
      ? [...new Set([...extIds, ...baseIds])]
      : opts.strategy === "replace-by-id"
        ? [...baseIds, ...extIds.filter((id) => !baseIds.includes(id))]
        : [...new Set([...baseIds, ...extIds])];
  return ids.map(choose);
};
const fieldFacts = (oldSchema: JsonSchema, newSchema: JsonSchema): FieldFacts[] =>
  [
    ...new Set([
      ...Object.keys(oldSchema.properties ?? {}),
      ...Object.keys(newSchema.properties ?? {}),
    ]),
  ].map((name) => {
    const oldField = oldSchema.properties?.[name] as JsonSchema | undefined,
      newField = newSchema.properties?.[name] as JsonSchema | undefined;
    return {
      name,
      path: `/${name}`,
      inOld: !!oldField,
      inNew: !!newField,
      oldRequired: includes(oldSchema.required, name),
      newRequired: includes(newSchema.required, name),
      newDefaultMissing: !!newField && newField.default === undefined,
      typeChanged: !!oldField?.type && !!newField?.type && oldField.type !== newField.type,
      minimumTightened:
        !!newField &&
        newField.minimum !== undefined &&
        (oldField?.minimum === undefined || newField.minimum > oldField.minimum),
      maximumTightened:
        !!newField &&
        newField.maximum !== undefined &&
        (oldField?.maximum === undefined || newField.maximum < oldField.maximum),
      oldEnum: oldField?.enum,
      newEnum: newField?.enum,
      requiredAddedMessage: `New required field "${name}" has no default — old data will fail`,
      fieldRemovedMessage: `Field "${name}" removed and additionalProperties=false — old data with this field will fail`,
      typeChangedMessage: `Field "${name}" type changed from ${oldField?.type} to ${newField?.type}`,
      minimumMessage: `Field "${name}" minimum tightened from ${oldField?.minimum} to ${newField?.minimum}`,
      maximumMessage: `Field "${name}" maximum tightened from ${oldField?.maximum} to ${newField?.maximum}`,
      requiredAddedForwardMessage: `New required field "${name}" — old producers won't include it`,
      requiredRemovedMessage: `Required field "${name}" dropped — old consumers may break`,
    };
  });

export class CompatibilityChecker {
  private evaluator = new ExpressionEvaluator();
  private rules: RulesDocument;
  private extensions: Array<{
    id: string;
    strategy: ExtendRulesOptions["strategy"];
    conflictPolicy: ExtendRulesOptions["conflictPolicy"];
  }> = [];
  constructor(opts?: { rules?: RulesDocument }) {
    this.rules = structuredClone(opts?.rules ?? CompatibilityRules);
  }
  check(oldType: TypeDef, newType: TypeDef, mode: Compatibility): CompatibilityResult {
    const selected =
      mode === Compatibility.None
        ? []
        : this.rules.rules.filter(
            ({ appliesTo }) =>
              mode === Compatibility.Full ||
              (mode === Compatibility.Backward
                ? ["backward", "both"]
                : ["forward", "both"]
              ).includes(appliesTo),
          );
    const context = {
      $old: oldType.schema,
      $new: newType.schema,
      $fields: fieldFacts(oldType.schema, newType.schema),
      $newClosed: newType.schema.additionalProperties === false,
    };
    const breakingChanges = selected.flatMap((rule) => {
      const result = this.evaluator.evaluate(rule.predicate, context);
      if (result.error)
        throw new Error(`CompatibilityChecker: rule '${rule.id}' failed: ${result.error}`);
      return flatten(result.value).map(({ path, message }) => ({
        kind: rule.id,
        path,
        message,
      })) as BreakingChange[];
    });
    return { compatible: breakingChanges.length === 0, mode, breakingChanges };
  }
  isBackwardCompatible(oldType: TypeDef, newType: TypeDef): CompatibilityResult {
    return this.check(oldType, newType, Compatibility.Backward);
  }
  isForwardCompatible(oldType: TypeDef, newType: TypeDef): CompatibilityResult {
    return this.check(oldType, newType, Compatibility.Forward);
  }
  isFullyCompatible(oldType: TypeDef, newType: TypeDef): CompatibilityResult {
    return this.check(oldType, newType, Compatibility.Full);
  }
  extendRules(doc: RulesDocument, opts: ExtendRulesOptions): void {
    const prior = this.extensions.find(
      (entry) => entry.strategy !== opts.strategy || entry.conflictPolicy !== opts.conflictPolicy,
    );
    if (prior)
      throw new Error(
        `Compatibility rules extension strategy disagreement: existing=${prior.strategy} new=${opts.strategy} (existing extension=${prior.id}, new extension=${doc.id ?? "inline"})`,
      );
    this.rules = { ...this.rules, rules: mergeRules(this.rules.rules, doc.rules, opts) };
    this.extensions.push({
      id: doc.id ?? "inline",
      strategy: opts.strategy,
      conflictPolicy: opts.conflictPolicy,
    });
  }
  suggestMigration(oldType: TypeDef, newType: TypeDef): MigrationStep[] {
    const steps: MigrationStep[] = [],
      { added, removed } = requiredDiff(oldType.schema, newType.schema),
      oldProps = oldType.schema.properties ?? {},
      newProps = newType.schema.properties ?? {};
    for (const field of added)
      steps.push({
        path: `/${field}`,
        action: "add-default",
        defaultValue: ((newType.schema.properties?.[field] as JsonSchema) ?? {}).default ?? null,
        description: `Add required field "${field}" with default value`,
      });
    for (const field of removed)
      steps.push({
        path: `/${field}`,
        action: "remove",
        description: `Remove field "${field}" (no longer required)`,
      });
    for (const key of Object.keys(oldProps))
      if (key in newProps) {
        const op = oldProps[key] as JsonSchema,
          np = newProps[key] as JsonSchema;
        if (op.type && np.type && op.type !== np.type)
          steps.push({
            path: `/${key}`,
            action: "transform-type",
            description: `Transform "${key}" from ${op.type} to ${np.type}`,
          });
      }
    return steps;
  }
}
