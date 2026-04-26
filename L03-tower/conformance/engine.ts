import { readFileSync } from "fs";
import { join } from "path";
import type {
  TypeDef,
  TypeRef,
  ValidationError,
  ValidationResult,
} from "../../L01-foundation/types.ts";
import type { SchemaValidator } from "../../L01-foundation/validator.ts";
import type { TypeRegistry } from "../registry.ts";

type Rule = {
  id: string;
  description?: string;
  kind?: string;
  when?: Record<string, unknown>;
  outcome?:
    | "pass"
    | { onFail: { message: string; keyword: string; params?: Record<string, unknown> } };
  template?: string;
  impl?: { name?: string };
};
type ExtendRulesOptions = {
  strategy: "append" | "override-ids" | "namespace-prefix";
  conflictPolicy: "error" | "last-wins";
};
type ExtensionRecord = {
  source: string;
  strategy: ExtendRulesOptions["strategy"];
  conflictPolicy: ExtendRulesOptions["conflictPolicy"];
  rules: Rule[];
};
export type ConformanceRulesDocument = {
  id?: string;
  version?: string;
  conformsTo: string;
  discriminator: string;
  sealed?: boolean;
  rules: Rule[];
};

export class ConformanceEngine {
  private readonly registry?: TypeRegistry;
  private readonly unsubscribeRules?: () => void;
  private rules: Rule[];
  private defaults: Map<string, Rule>;
  private invariants: Rule[];
  private sealedRuleIds: Set<string>;
  private readonly extensions: ExtensionRecord[] = [];
  private readonly ruleNames: Set<string>;
  private cacheStale = false;
  private invalidationEpoch = 0;
  constructor(
    private validator: SchemaValidator,
    opts?: { registry?: TypeRegistry; ruleNames?: string[] },
  ) {
    const invariantsDoc = Bun.YAML.parse(
      readFileSync(join(__dirname, "rules.invariants.yaml"), "utf-8"),
    ) as ConformanceRulesDocument;
    const defaultsDoc = Bun.YAML.parse(
      readFileSync(join(__dirname, "rules.defaults.yaml"), "utf-8"),
    ) as ConformanceRulesDocument;
    this.invariants = invariantsDoc.rules;
    this.sealedRuleIds = new Set(
      invariantsDoc.sealed ? invariantsDoc.rules.map((rule) => rule.id) : [],
    );
    this.defaults = new Map(defaultsDoc.rules.map((rule) => [rule.id, rule]));
    this.registry = opts?.registry;
    this.ruleNames = new Set(opts?.ruleNames ?? []);
    this.rules = this.rebuildRules();
    this.cacheStale = this.ruleNames.size > 0;
    this.unsubscribeRules = this.registry?.onRebind((event) => {
      if (this.ruleNames.has(event.name)) this.invalidateCache();
    });
  }
  private invalidateCache(): void {
    this.cacheStale = true;
    this.invalidationEpoch += 1;
  }
  private ruleDocFor(name: string): ConformanceRulesDocument | null {
    const doc = this.registry?.resolveByName(name)?.typeDef?.schema.default;
    if (!doc) return null;
    const clone = structuredClone(doc) as ConformanceRulesDocument;
    this.assertExtendable(clone);
    return clone;
  }
  private namedExtensions(): ExtensionRecord[] {
    const docs: ExtensionRecord[] = [];
    for (const name of this.ruleNames) {
      const resolved = this.ruleDocFor(name);
      if (!resolved) continue;
      docs.push({
        source: name,
        strategy: "append",
        conflictPolicy: "error",
        rules: resolved.rules,
      });
    }
    return docs;
  }
  private rebuildRules(): Rule[] {
    const activeExtensions = [...this.namedExtensions(), ...this.extensions];
    const claims = new Map(this.defaults.keys().map((id) => [id, "defaults"]));
    for (const extension of activeExtensions)
      for (const rule of extension.rules) claims.set(rule.id, extension.source);
    return [
      ...this.invariants,
      ...activeExtensions.flatMap((extension) =>
        extension.rules.filter((rule) => claims.get(rule.id) === extension.source),
      ),
      ...this.defaults.values().filter((rule) => claims.get(rule.id) === "defaults"),
    ];
  }
  private ensureRules(): void {
    if (!this.cacheStale) return;
    const epoch = this.invalidationEpoch;
    this.rules = this.rebuildRules();
    this.cacheStale = this.invalidationEpoch !== epoch;
  }
  private namespaceFor(ruleId: string): string {
    const dot = ruleId.indexOf(".");
    return dot >= 0 ? ruleId.slice(0, dot + 1) : `${ruleId}.`;
  }
  private loadExtension(refOrDoc: string | ConformanceRulesDocument): {
    source: string;
    document: ConformanceRulesDocument;
  } {
    if (typeof refOrDoc !== "string")
      return { source: refOrDoc.id ?? "<inline>", document: structuredClone(refOrDoc) };
    const scheme = refOrDoc.match(/^([a-z]+):\/\//)?.[1];
    if (scheme && scheme !== "file")
      throw new Error(`extendRules: unsupported ref scheme: ${scheme}`);
    const path = scheme === "file" ? new URL(refOrDoc).pathname : refOrDoc;
    return {
      source: refOrDoc,
      document: Bun.YAML.parse(readFileSync(path, "utf-8")) as ConformanceRulesDocument,
    };
  }
  private assertExtendable(document: ConformanceRulesDocument): void {
    if (
      document.conformsTo !== "adk:RulesDocument/1.0" ||
      document.discriminator !== "conformance" ||
      !Array.isArray(document.rules)
    ) {
      throw new Error(
        "extendRules: document does not conform to adk:RulesDocument/1.0 + conformance",
      );
    }
    for (const rule of document.rules)
      if (this.sealedRuleIds.has(rule.id))
        throw new Error(
          `ConformanceEngine.extendRules: cannot override sealed rule "${rule.id}" declared in rules.invariants.yaml`,
        );
  }
  private assertStrategyAgreement(incoming: ExtensionRecord): void {
    const seen = new Map<string, ExtensionRecord>();
    for (const extension of [...this.extensions, incoming])
      for (const namespace of new Set(extension.rules.map((rule) => this.namespaceFor(rule.id)))) {
        const prior = seen.get(namespace);
        if (
          prior &&
          (prior.strategy !== extension.strategy ||
            prior.conflictPolicy !== extension.conflictPolicy)
        ) {
          throw new Error(
            `ConformanceEngine.extendRules: strategy disagreement at load — extensions "${prior.source}" and "${extension.source}" both target rule-id namespace "${namespace}" with incompatible {strategy, conflictPolicy} tuples ({strategy:"${prior.strategy}",conflictPolicy:"${prior.conflictPolicy}"} vs {strategy:"${extension.strategy}",conflictPolicy:"${extension.conflictPolicy}"})`,
          );
        }
        seen.set(namespace, extension);
      }
  }
  private render(value: unknown, child: TypeDef, parent: TypeDef): unknown {
    const vars: Record<string, unknown> = {
      "childLevel": child.level,
      "childLevel+1": child.level + 1,
      "parentLevel": parent.level,
    };
    if (typeof value !== "string") return value;
    const exact = value.match(/^\{([^}]+)\}$/)?.[1];
    if (exact && exact in vars) return vars[exact];
    return value.replace(/\{([^}]+)\}/g, (_, key) => String(vars[key] ?? ""));
  }
  private checkRule(child: TypeDef, parent: TypeDef): ValidationError | null {
    this.ensureRules();
    for (const rule of this.rules) {
      if (!rule.when) continue;
      const matched =
        "predicate" in rule.when
          ? this.defaults.get(`predicates.${rule.when.predicate}`)?.impl?.name === "levelGap" &&
            child.level + 1 !== parent.level
          : Object.entries(rule.when).every(
              ([key, value]) =>
                ({
                  childLevel: child.level,
                  parentLevel: parent.level,
                  childIdEqualsParentId: child.id === parent.id,
                })[key] === value,
            );
      if (!matched) continue;
      if (rule.outcome === "pass") return null;
      if (rule.outcome?.onFail) {
        const { onFail } = rule.outcome;
        return {
          path: "/level",
          message: String(this.render(onFail.message, child, parent)),
          keyword: onFail.keyword,
          params: Object.fromEntries(
            Object.entries(onFail.params ?? {}).map(([key, value]) => [
              key,
              this.render(value, child, parent),
            ]),
          ),
        };
      }
    }
    return null;
  }
  extendRules(refOrDoc: string | ConformanceRulesDocument, opts: ExtendRulesOptions): void {
    const { source, document } = this.loadExtension(refOrDoc);
    this.assertExtendable(document);
    const rules =
      opts.strategy === "namespace-prefix"
        ? document.rules.map((rule) => ({
            ...rule,
            id: rule.id.startsWith(this.namespaceFor(rule.id))
              ? rule.id
              : `${this.namespaceFor(rule.id)}${rule.id}`,
          }))
        : document.rules;
    const claimed = new Set([
      ...this.defaults.keys(),
      ...this.extensions.flatMap((extension) => extension.rules.map((rule) => rule.id)),
    ]);
    if (opts.strategy === "append" && opts.conflictPolicy === "error") {
      const conflict = rules.find((rule) => claimed.has(rule.id));
      if (conflict)
        throw new Error(
          `ConformanceEngine.extendRules: duplicate rule "${conflict.id}" under append + error`,
        );
    }
    const incoming = {
      source,
      strategy: opts.strategy,
      conflictPolicy: opts.conflictPolicy,
      rules,
    };
    this.assertStrategyAgreement(incoming);
    this.extensions.push(incoming);
    this.invalidateCache();
  }
  dispose(): void {
    this.unsubscribeRules?.();
  }
  checkDirect(child: TypeDef, parent: TypeDef): ValidationResult {
    const error = this.checkRule(child, parent);
    return error
      ? { valid: false, errors: [error] }
      : this.validator.validate(child, parent.schema);
  }
  checkTransitive(
    child: TypeDef,
    ancestor: TypeDef,
    resolve: (ref: TypeRef) => TypeDef,
  ): ValidationResult {
    const allErrors: ValidationError[] = [];
    let current = child;
    while (current.id !== ancestor.id) {
      if (current.conformsTo === current.id) {
        allErrors.push({
          path: "",
          message: `Type "${child.id}" does not transitively conform to "${ancestor.id}"`,
          keyword: "conformsTo",
          params: { child: child.id, ancestor: ancestor.id },
        });
        break;
      }
      const parent = resolve(current.conformsTo),
        result = this.checkDirect(current, parent);
      if (!result.valid) {
        allErrors.push(...result.errors);
        break;
      }
      current = parent;
    }
    return { valid: allErrors.length === 0, errors: allErrors };
  }
  checkLevel(child: TypeDef, parent: TypeDef): string | null {
    return this.checkRule(child, parent)?.message ?? null;
  }
  walkChain(start: TypeDef, resolve: (ref: TypeRef) => TypeDef): TypeDef[] {
    const chain: TypeDef[] = [start];
    let current = start;
    while (current.conformsTo !== current.id) {
      const parent = resolve(current.conformsTo);
      chain.push(parent);
      current = parent;
    }
    return chain;
  }
}
