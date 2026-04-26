import type {
  CrossRefIndex,
  ModelBoot,
  ModelDocument,
  ModelLoader,
  ModelSummary,
} from "../../L09-demand/model-loader.ts";
export interface ModelWorldView {
  summary: ModelSummary;
  types: Array<{ name: string; description: string; attributes: string[]; referencedBy: string[] }>;
  enums: Array<{ name: string; description: string; values: string }>;
  relations: Array<{ name: string; description: string; roles: string }>;
  stateMachines: Array<{ id: string; states: string; initial: string; terminal: string }>;
  actions: Array<{ name: string; verb: string; description: string; targetMachine: string }>;
  contracts: Array<{ name: string; claim: string }>;
  lifecycle: Array<{ label: string; value: string }>;
  capabilities: string[];
  morphisms: Array<{ name: string; kind: string; uri: string; assets: string }>;
}

export interface ModelWorldSelection {
  summary: ModelSummary;
  document: ModelDocument;
  crossRefs: CrossRefIndex;
  view: ModelWorldView;
}

type ProjectorBindings = {
  defaultPageName(): string | null;
  renderHtml(
    pageName: string,
    props?: Record<string, unknown>,
  ): { html: string; handlersJs: string };
  setBinding(name: string, value: unknown): void;
};

export function buildModelWorldView(
  summary: ModelSummary,
  document: ModelDocument,
  crossRefs: CrossRefIndex,
): ModelWorldView {
  return {
    summary,
    types: Object.entries(document.entities ?? {}).map(([name, entity]) => ({
      name,
      description: entity.description ?? "",
      attributes: Object.entries(entity.attributes ?? {}).map(
        ([attrName, attr]) => `${attrName}: ${attr.type}`,
      ),
      referencedBy: crossRefs.typeToRelations[name] ?? [],
    })),
    enums: Object.entries(document.enums ?? {}).map(([name, entry]) => ({
      name,
      description: entry.description ?? "",
      values: entry.values.join(", "),
    })),
    relations: Object.entries(document.relations ?? {}).map(([name, relation]) => ({
      name,
      description: relation.description ?? "",
      roles: Object.entries(relation.roles ?? {})
        .map(([role, target]) => `${role} -> ${target}`)
        .join(", "),
    })),
    stateMachines: document.lifecycle
      ? [
          {
            id:
              Object.values(document.actions ?? {}).find((action) => action.targetMachine)
                ?.targetMachine ?? `${summary.modelId}-lifecycle`,
            states: document.lifecycle.states.join(", "),
            initial: document.lifecycle.initial,
            terminal: document.lifecycle.terminal.join(", "),
          },
        ]
      : [],
    actions: Object.entries(document.actions ?? {}).map(([name, action]) => ({
      name,
      verb: action.verb,
      description: action.description ?? "",
      targetMachine: crossRefs.actionToTargetMachine[name] ?? "",
    })),
    contracts: Object.entries(document.contracts ?? {}).map(([name, contract]) => ({
      name,
      claim: contract.claim,
    })),
    lifecycle: document.lifecycle
      ? [
          { label: "initial", value: document.lifecycle.initial },
          { label: "terminal", value: document.lifecycle.terminal.join(", ") },
          {
            label: "transitions",
            value: document.lifecycle.transitions
              .map((t) => `${t.from} -> ${t.to} (${t.verb})`)
              .join("; "),
          },
        ]
      : [],
    capabilities: [],
    morphisms: Object.entries(document.morphisms ?? {}).map(([name, morphism]) => ({
      name,
      kind: morphism.impl?.kind ?? "unknown",
      uri: morphism.impl?.kind === "module" ? (morphism.impl.uri ?? "") : "",
      assets: (crossRefs.morphismToAssets[name] ?? []).join(", "),
    })),
  };
}

export async function selectModelWorldModel(
  loader: ModelLoader,
  modelId: string,
): Promise<ModelWorldSelection | undefined> {
  const [summaries, document, crossRefs] = await Promise.all([
    loader.listLoadedModels(),
    loader.getModelDocument(modelId),
    loader.walkCrossRefs(modelId),
  ]);
  const summary = summaries.find((entry) => entry.modelId === modelId);
  if (!summary || !document || !crossRefs) return undefined;
  return { summary, document, crossRefs, view: buildModelWorldView(summary, document, crossRefs) };
}
