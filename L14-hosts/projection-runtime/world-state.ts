import { MetaLevel } from "../../L13-facade/index.ts";
import { PLUGGABLE_INTERFACE_M2 } from "../../L02-metamodels/pluggable-interface.ts";
import { SPECIALISATION_RULE_METAMODEL } from "../../L02-metamodels/specialisation-rule.ts";
import type { ModelLoadResult } from "../../L09-demand/model-loader.ts";
import type {
  ActionInfo,
  ContractInfo,
  EnumInfo,
  EventData,
  MachineInfo,
  TypeInfo,
  WorldState,
} from "./world-state-types.ts";
import type { NodeRuntime } from "./boot-node.ts";

const props = (schema: {
  required?: string[];
  properties?: Record<string, unknown>;
}): TypeInfo["properties"] =>
  Object.fromEntries(
    Object.entries(schema.properties ?? {}).map(([name, value]) => {
      const entry = value as { type?: string | string[]; enum?: string[] };
      return [
        name,
        {
          type: Array.isArray(entry.type)
            ? String(entry.type[0] ?? "unknown")
            : String(entry.type ?? "unknown"),
          required: (schema.required ?? []).includes(name) || undefined,
          enum: entry.enum,
        },
      ];
    }),
  );
const byScope = <T extends { modelName?: string }>(values: T[], scope: string) =>
  scope === "*" ? values : values.filter((value) => value.modelName === scope);
const modelForType = (typeId: string, byTypeId: Map<string, string>) => byTypeId.get(typeId) ?? "";
const loadResults = (runtime: NodeRuntime): ModelLoadResult[] =>
  Array.from(
    (
      runtime.loader as unknown as { loadedModels?: Map<string, ModelLoadResult> }
    ).loadedModels?.values() ?? [],
  );
const listInstances = (boot: { listInstances(): Array<{ key: string; state: unknown }> }) =>
  boot.listInstances();

export function buildWorldState(
  runtime: NodeRuntime,
  opts?: { scope?: string; recentEvents?: EventData[] },
): WorldState {
  const scope = opts?.scope ?? "*";
  const registry = runtime.kernel.types.registry;
  const results = loadResults(runtime);
  const primaryModel = [...runtime.apps.entries()].find(([, app]) => app === runtime.app)?.[0];
  const modelByTypeId = new Map<string, string>();
  for (const result of results)
    for (const typeId of result.typesRegistered) modelByTypeId.set(typeId, result.modelId);
  const models = results.map((result) => ({
    name: result.modelId,
    version: result.version,
    origin: result.document.origin ?? result.origin,
  }));
  const typed = registry.listByMetalevel(MetaLevel.Model).map((type) => ({
    id: type.id,
    name: type.name,
    modelName: modelForType(type.id, modelByTypeId),
    level: type.level,
    conformsTo: type.conformsTo,
    properties: props(type.schema),
  }));
  const enums: EnumInfo[] = results.flatMap((result) =>
    Object.entries(result.document.enums ?? {}).map(([name, entry]) => ({
      id: `type://${result.origin}/${name}/${result.version}`,
      name,
      modelName: result.modelId,
      values: entry.values,
    })),
  );
  const contracts: ContractInfo[] = results.flatMap((result) =>
    Object.entries(result.document.contracts ?? {}).map(([name, entry]) => ({
      name,
      modelName: result.modelId,
      claim: entry.claim,
    })),
  );
  const actions: ActionInfo[] = results.flatMap((result) =>
    Object.entries(result.document.actions ?? {}).map(([name, action]) => ({
      id: runtime.apps.get(result.modelId)?.actions[action.verb] ?? name,
      name,
      modelName: result.modelId,
      verb: action.verb,
      description: action.description,
      inputSchema: (action.inputSchema ?? {}) as Record<string, unknown>,
    })),
  );
  const instances = Array.from(runtime.apps.entries()).flatMap(([modelName, boot]) =>
    listInstances(
      boot as unknown as { listInstances(): Array<{ key: string; state: unknown }> },
    ).map((instance: { key: string; state: unknown }) => ({ ...instance, modelName })),
  );
  const machines: MachineInfo[] = results.flatMap((result) => {
    const lifecycle = result.document.lifecycle,
      boot = runtime.apps.get(result.modelId);
    if (!lifecycle || !boot?.stateMachineId) return [];
    const currentStates = Object.fromEntries(
      instances
        .filter((instance) => instance.modelName === result.modelId)
        .map((instance) => [instance.key, instance.state]),
    );
    return [
      {
        id: boot.stateMachineId,
        name: `${result.modelId} lifecycle`,
        modelName: result.modelId,
        states: lifecycle.states,
        transitions: lifecycle.transitions.map((transition) => ({ ...transition })),
        currentStates,
      },
    ];
  });
  const currentModel = models.find((model) =>
    scope === "*" ? model.name === primaryModel : model.name === scope,
  ) ??
    models[0] ?? { name: "", version: "", origin: "" };

  return {
    model: currentModel,
    types: byScope(typed, scope),
    enums: byScope(enums, scope),
    edges: runtime.kernel.kernel.graph
      .allEdges()
      .map((edge) => ({ from: edge.from, to: edge.to, rel: edge.rel })),
    machines: byScope(machines, scope),
    actions: byScope(actions, scope),
    contracts: byScope(contracts, scope),
    instances: byScope(instances, scope),
    recentEvents: opts?.recentEvents ?? [],
    metamodels: registry.listByMetalevel(MetaLevel.Metamodel).map((type) => ({
      id: type.id,
      name: type.name ?? type.id,
      conformsTo: type.conformsTo,
      level: type.level,
    })),
    modelTypes: byScope(typed, scope),
    morphisms: byScope(
      registry.listMorphisms().map((type) => ({
        id: type.id,
        name: type.name ?? type.id,
        modelName: modelForType(type.id, modelByTypeId),
        conformsTo: type.conformsTo,
        inputKinds: [],
        outputKind: "unknown",
        impl:
          typeof (type as unknown as { discriminator?: string }).discriminator === "string"
            ? (type as unknown as { discriminator: string }).discriminator
            : undefined,
      })),
      scope,
    ),
    algebraOperators: registry.listAlgebraOperators().map((type) => ({
      id: type.id,
      name: type.name,
      modelName: modelForType(type.id, modelByTypeId),
      version: type.version ?? "unknown",
      arity: type.arity,
      inputKinds: type.inputKinds,
      outputKind: type.outputKind,
    })),
    specialisationRules: byScope(
      registry.listByConformsTo(SPECIALISATION_RULE_METAMODEL.id).map((type) => ({
        id: type.id,
        name: type.name ?? type.id,
        modelName: modelForType(type.id, modelByTypeId),
        from: String((type as unknown as { matchOp?: string }).matchOp ?? ""),
        to: String((type as unknown as { produceOp?: string }).produceOp ?? ""),
        when:
          typeof (type as unknown as { precondition?: string }).precondition === "string"
            ? (type as unknown as { precondition: string }).precondition
            : undefined,
      })),
      scope,
    ),
    capabilities: [],
    pluggableInterfaces: byScope(
      registry.listByConformsTo(PLUGGABLE_INTERFACE_M2.id).map((type) => ({
        id: type.id,
        name: type.name ?? type.id,
        modelName: modelForType(type.id, modelByTypeId),
        kind: type.name ?? "",
        impls:
          typeof (type.schema as { implModuleRef?: string }).implModuleRef === "string"
            ? [(type.schema as { implModuleRef: string }).implModuleRef]
            : [],
      })),
      scope,
    ),
    intents: [],
    policies: [],
    projections: [],
    bundles: [],
    auditLog: registry.history().map((event) => ({
      ts: event.ts,
      op: event.op,
      cid: event.cid,
      name: event.name,
      oldCid: event.oldCid,
    })),
    models: scope === "*" ? models : models.filter((model) => model.name === scope),
  };
}
