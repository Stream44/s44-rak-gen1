import type { TypeDef } from "../L01-foundation/types.ts";
import { MetaLevel } from "../L01-foundation/types.ts";
import type { KernelExpression } from "../L04-expression/evaluator.ts";
import type { ActionType } from "../L07-agency/intent.ts";
import type { AlgebraicKernel } from "../L13-facade/index.ts";
import type { AssetRegistry } from "../L11-projection/asset-registry.ts";
import collectPreconditionRequirements from "./demand/modules/collect-precondition-requirements.ts";

export interface DataRequirement {
  typeRef: string;
  key: string;
  optional?: boolean;
}
export interface LoadingPlan {
  requirements: DataRequirement[];
  estimatedCount: number;
}
export interface ExecutionContext {
  cache: Map<string, unknown>;
  missing: string[];
  complete: boolean;
}
export interface DataProvider {
  load(key: string): unknown | null;
  loadBatch(keys: string[]): Map<string, unknown>;
}

export class MemoryDataProvider implements DataProvider {
  private store = new Map<string, unknown>();
  put(key: string, data: unknown): void {
    this.store.set(key, data);
  }
  load(key: string): unknown | null {
    if (!this.store.has(key)) return null;
    return this.store.get(key)!;
  }

  loadBatch(keys: string[]): Map<string, unknown> {
    const result = new Map<string, unknown>();
    for (const key of keys) {
      if (this.store.has(key)) result.set(key, this.store.get(key)!);
    }
    return result;
  }
}

export class DemandEngine {
  private static readonly SURVEY_MORPHISM_ID =
    "morphism://github.com/Stream44/s44-rak-gen1@1.0/survey/1.0";
  private kernel: AlgebraicKernel;
  private provider: DataProvider;

  constructor(kernel: AlgebraicKernel, provider: DataProvider);
  constructor(kernel: AlgebraicKernel, opts: { providerRef: string; registry: AssetRegistry });
  constructor(
    kernel: AlgebraicKernel,
    providerOrOpts: DataProvider | { providerRef: string; registry: AssetRegistry },
  ) {
    this.kernel = kernel;
    ensureDemandRuntime(this.kernel);
    // registerMorphismDocument(...) is intentionally not invoked at runtime here
    // because the current adapter import path introduces bootstrap cycles.
    if (isDataProvider(providerOrOpts)) {
      this.provider = providerOrOpts;
      return;
    }
    throw new Error("DemandEngine requires either a direct provider or { providerRef, registry }");
  }

  static async createFromRef(
    kernel: AlgebraicKernel,
    opts: { providerRef: string; registry: AssetRegistry },
  ): Promise<DemandEngine> {
    const asset = opts.registry.resolve(opts.providerRef, "data-provider");
    if (!asset)
      throw new Error(
        `DataProvider asset not found for ref "${opts.providerRef}" and kind "data-provider"`,
      );
    if (asset.implementation.kind !== "module")
      throw new Error(`DataProvider asset "${opts.providerRef}" must use a module implementation`);
    const modulePath = new URL(
      `../L08-kinds/${asset.conformsToKind}/${asset.implementation.module.replace("./", "")}`,
      import.meta.url,
    ).pathname;
    const mod = await import(modulePath);
    const exportName = asset.implementation.export ?? "default";
    const Ctor = mod[exportName as keyof typeof mod] as (new () => DataProvider) | undefined;
    if (typeof Ctor !== "function")
      throw new Error(`DataProvider asset "${opts.providerRef}" missing export "${exportName}"`);
    return new DemandEngine(kernel, new Ctor());
  }

  async survey(action: ActionType, payload: unknown): Promise<LoadingPlan> {
    return (await this.kernel.morphisms.evaluate(DemandEngine.SURVEY_MORPHISM_ID, {
      action,
      payload,
    })) as LoadingPlan;
  }

  assemble(plan: LoadingPlan): ExecutionContext {
    const cache = new Map<string, unknown>();
    const missing: string[] = [];

    for (const req of plan.requirements) {
      const data = this.provider.load(req.key);
      if (data !== null) {
        cache.set(req.key, data);
      } else if (!req.optional) {
        missing.push(req.key);
      }
    }

    return { cache, missing, complete: missing.length === 0 };
  }

  execute(expr: KernelExpression, context: ExecutionContext): unknown {
    const evalContext: Record<string, unknown> = {};
    for (const [key, value] of context.cache) evalContext[key] = value;
    const result = this.kernel.evaluate(expr, evalContext);
    if (result.error) throw new Error(`Expression evaluation failed: ${result.error}`);
    return result.value;
  }

  async run(
    action: ActionType,
    payload: unknown,
    expr: KernelExpression,
  ): Promise<{ result: unknown; context: ExecutionContext }> {
    const plan = await this.survey(action, payload);
    const context = this.assemble(plan);
    const result = this.execute(expr, context);
    return { result, context };
  }
}

function isDataProvider(
  value: DataProvider | { providerRef: string; registry: AssetRegistry },
): value is DataProvider {
  return (
    typeof (value as DataProvider).load === "function" &&
    typeof (value as DataProvider).loadBatch === "function"
  );
}

const DEMAND_SURVEY_INPUT: TypeDef = {
  id: "type://adk/internal/DemandSurveyInput/1.0",
  level: MetaLevel.Model,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
  name: "DemandSurveyInput",
  version: "1.0",
  schema: {
    type: "object",
    required: ["action", "payload"],
    properties: {
      action: { type: "object", additionalProperties: true },
      payload: {},
    },
    additionalProperties: false,
  },
};

const LOADING_PLAN: TypeDef = {
  id: "type://adk/internal/LoadingPlan/1.0",
  level: MetaLevel.Model,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
  name: "LoadingPlan",
  version: "1.0",
  schema: {
    type: "object",
    required: ["requirements", "estimatedCount"],
    properties: {
      requirements: { type: "array", items: { type: "object" } },
      estimatedCount: { type: "number" },
    },
    additionalProperties: false,
  },
};

function ensureDemandRuntime(kernel: AlgebraicKernel): void {
  ensureType(kernel, DEMAND_SURVEY_INPUT);
  ensureType(kernel, LOADING_PLAN);
  if (hasMorphism(kernel, "morphism://github.com/Stream44/s44-rak-gen1@1.0/survey/1.0")) return;
  const surveyExpr = {
    op: "apply" as const,
    fn: { op: "var" as const, name: "$survey" },
    arg: { op: "var" as const, name: "$input" },
  };
  kernel.morphisms.define("survey", DEMAND_SURVEY_INPUT.id, LOADING_PLAN.id, surveyExpr, {
    impl: { kind: "algebra", ast: surveyExpr },
    defaultContext: {
      $survey: (input: { action: ActionType; payload: unknown }): LoadingPlan => {
        const payloadObj = (input.payload ?? {}) as Record<string, unknown>;
        const requirements: DataRequirement[] = [];
        const properties = (input.action.inputSchema.properties ?? {}) as Record<
          string,
          { $typeRef?: string; optional?: boolean }
        >;
        for (const [field, schema] of Object.entries(properties)) {
          if (schema.$typeRef && payloadObj[field] != null) {
            requirements.push({
              typeRef: schema.$typeRef,
              key: String(payloadObj[field]),
              optional: schema.optional === true,
            });
          }
        }
        for (const precondition of input.action.preconditions as KernelExpression[]) {
          requirements.push(...collectPreconditionRequirements(precondition));
        }
        return { requirements, estimatedCount: requirements.length };
      },
    },
  });
}

function ensureType(kernel: AlgebraicKernel, typeDef: TypeDef): void {
  try {
    kernel.resolveType(typeDef.id);
  } catch {
    kernel.defineType(typeDef);
  }
}

function hasMorphism(kernel: AlgebraicKernel, morphismId: string): boolean {
  try {
    kernel.morphisms.resolve(morphismId);
    return true;
  } catch {
    return false;
  }
}
