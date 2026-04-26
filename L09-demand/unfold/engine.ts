import type { JsonSchema } from "../../L01-foundation/types.ts";
import type { KernelExpression, Pattern } from "../../L04-expression/evaluator.ts";
import { IntentProcessor, type ActionType } from "../../L07-agency/intent.ts";
import type { Transition } from "../../L06-process/engine.ts";
import type { MorphismAST } from "../../L11-projection/algebra.ts";
import type { ProjectionModel } from "../../L01-foundation/projection-types.ts";
import type { TypeRegistry } from "../../L03-tower/registry.ts";
import type { AlgebraicKernel } from "../../L13-facade/index.ts";
import "./m1.ts";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  type UnfoldRulesDocument,
  validateUnfoldRulesDocument,
  validateUnfoldRulesExtension,
} from "./rules-types.ts";
import { interpolate } from "./interpolate.ts";
import { mergeRules, type MergeRulesOptions } from "./merge.ts";

export interface EndpointDef {
  method: "GET" | "POST" | "PUT" | "DELETE";
  path: string;
  action?: string;
  responseType: string;
  description?: string;
}
export interface UnfoldResult {
  seed: string;
  strata: {
    data: string;
    process?: string;
    actions: ActionType[];
    projection: ProjectionModel;
    endpoints: EndpointDef[];
  };
}
type RuleHeuristic = UnfoldRulesDocument["heuristics"][number] & { id: string };
type LifecycleHeuristic = RuleHeuristic & {
  when: { fieldNames: string[]; hasEnum: boolean; minEnumValues: number };
  emit: {
    kind: "state-machine";
    machineId: { template: string };
    stateTypeName: { template: string };
    eventTypeName: { template: string };
  };
};
type ActionHeuristic = RuleHeuristic & {
  emit: {
    kind: "action-per-transition";
    actionName: { template: string };
    inputSchema: JsonSchema;
    origin: string;
  };
};
type EndpointHeuristic = RuleHeuristic & {
  emit: {
    plural: { parts: Array<string | { lowercase: string }> };
    endpoints: Array<{
      method: EndpointDef["method"];
      path: string;
      description: string;
      action?: string;
      forEach?: "actions";
    }>;
  };
};
type ActionPreconditionHeuristic = RuleHeuristic & {
  when: { fieldNames: string[] };
  emit: {
    kind: "action-precondition";
    appliesTo: "all-generated-actions";
    precondition: KernelExpression;
  };
};

function constPat(value: unknown): Pattern {
  return { kind: "const", value };
}

function recordPat(fields: Record<string, Pattern>): Pattern {
  return { kind: "record", fields };
}

function constExpr(value: unknown): KernelExpression {
  return { op: "const", value };
}

function endpointRef(props: Record<string, unknown>, requires?: string[]): MorphismAST {
  return {
    op: "ref",
    asset: "asset://adk.example/api.rest/primitive/Endpoint/1.0",
    props,
    ...(requires ? { requires } : {}),
  };
}

function pluralize(name: string): string {
  return name.toLowerCase() + "s";
}

function capitalize(s: string): string {
  if (!s) return s;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function extractCapabilityUris(expr: KernelExpression): string[] {
  const found = new Set<string>();
  const visit = (value: unknown): void => {
    if (typeof value === "string") {
      if (value.startsWith("cap://")) found.add(value);
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry);
      return;
    }
    if (value && typeof value === "object") {
      for (const entry of Object.values(value as Record<string, unknown>)) visit(entry);
    }
  };
  visit(expr);
  return [...found];
}

function buildProjectionMorphism(nodes: MorphismAST[]): MorphismAST {
  if (nodes.length === 0) return { op: "literal", value: null };
  if (nodes.length === 1) return nodes[0];
  const [first, ...rest] = nodes;
  return {
    op: "product",
    left: first,
    right: buildProjectionMorphism(rest),
  };
}

function matchesFieldNames(typeDef: { schema: JsonSchema }, fieldNames: string[]): boolean {
  const properties = typeDef.schema.properties ?? {};
  return fieldNames.some((fieldName) => fieldName in properties);
}

const RULES_PATH = resolve(import.meta.dir, "./rules.yaml");
const RULES_DOC: UnfoldRulesDocument = (() => {
  const parsed = Bun.YAML.parse(readFileSync(RULES_PATH, "utf-8"));
  validateUnfoldRulesDocument(parsed);
  return parsed;
})();

function loadNamedRules(registry: TypeRegistry, name: string): UnfoldRulesDocument {
  const doc = registry.resolveByName(name)?.typeDef?.schema.default;
  if (!doc) throw new Error(`UnfoldingEngine: named rules "${name}" not found`);
  const clone = structuredClone(doc) as UnfoldRulesDocument;
  validateUnfoldRulesExtension(clone);
  return clone;
}

export class UnfoldingEngine {
  private readonly registry: TypeRegistry;
  private readonly unsubscribeRules: () => void;
  private compiledRules = structuredClone(RULES_DOC);
  private cacheStale = false;
  private invalidationEpoch = 0;
  private readonly extensions: Array<{ document: UnfoldRulesDocument; opts: MergeRulesOptions }> =
    [];
  private readonly appliedStrategies: Array<{
    extensionId: string;
    heuristicIds: string[];
    strategy: MergeRulesOptions["strategy"];
    conflictPolicy: MergeRulesOptions["conflictPolicy"];
  }> = [];
  readonly ruleNames: Set<string>;
  constructor(
    private kernel: AlgebraicKernel,
    private intents: IntentProcessor,
    opts?: { registry?: TypeRegistry; ruleNames?: string[] },
  ) {
    this.registry = opts?.registry ?? kernel.kernel.registry;
    this.ruleNames = new Set(opts?.ruleNames ?? []);
    this.cacheStale = this.ruleNames.size > 0;
    this.unsubscribeRules = this.registry.onRebind((event) => {
      if (this.ruleNames.has(event.name)) this.invalidateCache();
    });
  }
  private interpolate(template: string, scope: Record<string, unknown>): string {
    return interpolate(template, scope);
  }
  private invalidateCache(): void {
    this.cacheStale = true;
    this.invalidationEpoch += 1;
  }
  private recompileRules(): void {
    let rules = structuredClone(RULES_DOC);
    for (const name of this.ruleNames)
      rules = mergeRules(rules, loadNamedRules(this.registry, name), {
        strategy: "append",
        conflictPolicy: "override",
      });
    for (const { document, opts } of this.extensions) rules = mergeRules(rules, document, opts);
    this.compiledRules = rules;
    this.cacheStale = false;
  }
  private currentRules(): UnfoldRulesDocument {
    if (this.cacheStale) {
      const epoch = this.invalidationEpoch;
      this.recompileRules();
      this.cacheStale = this.invalidationEpoch !== epoch;
    }
    return this.compiledRules;
  }
  dispose(): void {
    this.unsubscribeRules();
  }
  extendRules(extension: UnfoldRulesDocument | string, opts: MergeRulesOptions): void {
    const document =
      typeof extension === "string"
        ? (() => {
            const parsed = Bun.YAML.parse(readFileSync(extension, "utf-8"));
            validateUnfoldRulesExtension(parsed);
            return parsed;
          })()
        : (() => {
            const clone = structuredClone(extension);
            validateUnfoldRulesExtension(clone);
            return clone;
          })();
    const heuristicIds = document.heuristics.map((heuristic) => heuristic.id);
    for (const prior of this.appliedStrategies) {
      const shared = heuristicIds.find((id) => prior.heuristicIds.includes(id));
      if (
        shared &&
        (prior.strategy !== opts.strategy || prior.conflictPolicy !== opts.conflictPolicy)
      ) {
        throw new Error(
          `UnfoldingEngine: strategy disagreement applying extension '${document.id}' — heuristic '${shared}' was previously extended by '${prior.extensionId}' with {strategy:${prior.strategy}, conflictPolicy:${prior.conflictPolicy}}, but new extension declares {strategy:${opts.strategy}, conflictPolicy:${opts.conflictPolicy}}.`,
        );
      }
    }
    this.extensions.push({ document, opts });
    this.appliedStrategies.push({
      extensionId: document.id,
      heuristicIds,
      strategy: opts.strategy,
      conflictPolicy: opts.conflictPolicy,
    });
    this.invalidateCache();
  }
  unfold(seedTypeRef: string): UnfoldResult {
    const typeDef = this.kernel.resolveType(seedTypeRef),
      entity = { name: typeDef.name ?? "Entity" };
    const heuristics = this.currentRules().heuristics as RuleHeuristic[];
    const life = heuristics.find(
      (heuristic) => (heuristic as LifecycleHeuristic).emit?.kind === "state-machine",
    ) as LifecycleHeuristic | undefined;
    const actionRules = heuristics.filter(
      (heuristic) => (heuristic as ActionHeuristic).emit?.kind === "action-per-transition",
    ) as ActionHeuristic[];
    const endpointRules = heuristics.find((heuristic) =>
      Array.isArray((heuristic as EndpointHeuristic).emit?.endpoints),
    ) as EndpointHeuristic | undefined;
    if (!life || !actionRules || !endpointRules)
      throw new Error("UnfoldingEngine: required rules missing");
    const status = life.when.fieldNames
      .map((fieldName) => ({ fieldName, prop: typeDef.schema.properties?.[fieldName] }))
      .find(
        ({ prop }) =>
          !!(
            life.when.hasEnum &&
            prop?.enum &&
            Array.isArray(prop.enum) &&
            prop.enum.length >= life.when.minEnumValues
          ),
      );
    let machineId: string | undefined,
      transitions: Transition[] = [],
      enumValues: string[] = [],
      fieldName = "";
    if (status) {
      fieldName = status.fieldName;
      enumValues = status.prop!.enum as string[];
      machineId = this.interpolate(life.emit.machineId.template, { entity });
      const stateTypeId = this.kernel.defineUnion(
        this.interpolate(life.emit.stateTypeName.template, { entity }),
        "1.0",
        enumValues.map((v) => ({
          type: "object",
          properties: { [fieldName]: { const: v } },
          required: [fieldName],
        })),
      );
      const eventTypeId = this.kernel.defineUnion(
        this.interpolate(life.emit.eventTypeName.template, { entity }),
        "1.0",
        enumValues
          .slice(1)
          .map((v) => ({ type: "object", properties: { verb: { const: v } }, required: ["verb"] })),
      );
      transitions = enumValues.slice(0, -1).map((fromState, i) => ({
        from: recordPat({ [fieldName]: constPat(fromState) }),
        event: recordPat({ verb: constPat(enumValues[i + 1]) }),
        to: constExpr({ [fieldName]: enumValues[i + 1] }),
        label: enumValues[i + 1],
      }));
      this.kernel.defineStateMachine({
        id: machineId,
        name: `${entity.name} Lifecycle`,
        stateType: stateTypeId,
        eventType: eventTypeId,
        initialState: { [fieldName]: enumValues[0] },
        transitions,
      });
    }
    const actions = machineId
      ? actionRules.flatMap((rule) =>
          transitions.map((t) =>
            this.intents.defineAction(
              this.interpolate(rule.emit.actionName.template, { verb: t.label!, entity }),
              "1.0",
              {
                verb: t.label!,
                inputSchema: rule.emit.inputSchema,
                targetMachine: machineId!,
                origin: rule.emit.origin,
              },
            ),
          ),
        )
      : [];
    const preconditionRules = heuristics.filter(
      (heuristic) =>
        (heuristic as ActionPreconditionHeuristic).emit?.kind === "action-precondition" &&
        (heuristic as ActionPreconditionHeuristic).emit.appliesTo === "all-generated-actions" &&
        matchesFieldNames(typeDef, (heuristic as ActionPreconditionHeuristic).when.fieldNames),
    ) as ActionPreconditionHeuristic[];
    for (const action of actions)
      for (const rule of preconditionRules)
        action.preconditions.push(structuredClone(rule.emit.precondition));
    const plural =
      endpointRules.emit.plural.parts
        .map((part) =>
          typeof part === "string"
            ? part
            : this.interpolate(part.lowercase, { entity }).toLowerCase(),
        )
        .join("") || pluralize(entity.name);
    const endpoints = endpointRules.emit.endpoints.flatMap((rule) => {
      const build = (action?: ActionType): EndpointDef => {
        const scope = { entity, plural, action, actions },
          raw = rule.action?.endsWith("?") ? rule.action.slice(0, -1) : rule.action,
          actionRef =
            raw && (action || actions[0])
              ? this.interpolate(raw, scope)
              : rule.forEach === "actions"
                ? action?.id
                : undefined;
        return {
          method: rule.method,
          path: this.interpolate(rule.path, scope),
          ...(actionRef ? { action: actionRef } : {}),
          responseType: seedTypeRef,
          description: this.interpolate(rule.description, scope),
        };
      };
      return rule.forEach === "actions" ? actions.map((action) => build(action)) : [build()];
    });
    const actionsById = new Map(actions.map((action) => [action.id, action]));
    const endpointNodes = endpoints.map((endpoint) => {
      const action = endpoint.action ? actionsById.get(endpoint.action) : undefined,
        children: MorphismAST[] = [];
      if (endpoint.path.includes(":id"))
        children.push({
          op: "ref",
          asset: "asset://adk.example/api.rest/primitive/RouteParam/1.0",
          props: { name: "id", required: true, schema: { type: "string" } },
        });
      if (action?.inputSchema)
        children.push({
          op: "ref",
          asset: "asset://adk.example/api.rest/primitive/RequestBody/1.0",
          props: { schema: action.inputSchema },
        });
      return endpointRef(
        {
          method: endpoint.method,
          path: endpoint.path,
          summary: endpoint.description ?? undefined,
          ...(action
            ? {
                onRequest: {
                  action: action.name,
                  target: "$route.id",
                  payload: { id: "$route.id" },
                },
              }
            : {}),
          ...(children.length > 0 ? { children } : {}),
        },
        action
          ? (action.preconditions as KernelExpression[]).flatMap((precondition) =>
              extractCapabilityUris(precondition),
            )
          : [],
      );
    });
    const projection: ProjectionModel = {
      projector: `adk-default/${entity.name}/api.rest`,
      version: "1.0.0",
      conformsTo: "adk:KernelMetamodel/1.0",
      conformsToKind: "api.rest",
      session: { scope: entity.name.toLowerCase() },
      bindsModel: seedTypeRef,
      actions: actions.map((action) => action.name),
      morphism: buildProjectionMorphism(endpointNodes),
      routes: [],
    };
    return {
      seed: seedTypeRef,
      strata: { data: seedTypeRef, process: machineId, actions, projection, endpoints },
    };
  }
  refold(seedTypeRef: string): UnfoldResult {
    return this.unfold(seedTypeRef);
  }
}
