type Template = { template: string };
type FieldCheck = { fieldNames: string[]; hasEnum: boolean; minEnumValues: number };
type InputSchema = { type: "object"; properties: { id: { type: "string" } }; required: ["id"] };
type PluralRule = { op: "concat"; parts: [{ lowercase: string }, "s"] };
type EndpointRule = {
  method: "GET" | "POST";
  path: string;
  description: string;
  action?: string;
  forEach?: "actions";
};
type ActionPrecondition = { op: string };

export interface DetectLifecycle {
  id: "detect-lifecycle";
  when: FieldCheck;
  emit: {
    kind: "state-machine";
    machineId: Template;
    stateTypeName: Template;
    eventTypeName: Template;
    transitionShape: "adjacent-pair-verb";
  };
}
export interface ActionPerTransition {
  id: string;
  when: { requires: string[] };
  emit: {
    kind: "action-per-transition";
    actionName: Template;
    inputSchema: InputSchema;
    origin: string;
  };
}
export interface TransitionsToActions extends ActionPerTransition {
  id: "transitions-to-actions";
  when: { requires: ["detect-lifecycle"] };
}
export interface EndpointGenerator {
  id: string;
  when: Record<string, never>;
  emit: { plural: PluralRule; endpoints: EndpointRule[] };
}
export interface GenerateEndpoints extends EndpointGenerator {
  id: "generate-endpoints";
}
export interface ActionPreconditionHeuristic {
  id: string;
  when: { fieldNames: string[] };
  emit: {
    kind: "action-precondition";
    appliesTo: "all-generated-actions";
    precondition: ActionPrecondition;
  };
}
export type UnfoldHeuristic =
  | DetectLifecycle
  | ActionPerTransition
  | EndpointGenerator
  | ActionPreconditionHeuristic;

export interface UnfoldRulesDocument {
  conformsTo: "adk:RulesDocument/1.0";
  discriminator: "unfold";
  id: string;
  version: string;
  heuristics: UnfoldHeuristic[];
}

const IDS = ["detect-lifecycle", "transitions-to-actions", "generate-endpoints"] as const;

function validateHeader(doc: unknown): asserts doc is {
  conformsTo: "adk:RulesDocument/1.0";
  discriminator: "unfold";
  heuristics: unknown[];
} {
  const value = doc as { conformsTo?: unknown; discriminator?: unknown; heuristics?: unknown };
  if (value?.conformsTo !== "adk:RulesDocument/1.0") {
    throw new Error(
      `UnfoldRulesDocument: conformsTo must be 'adk:RulesDocument/1.0' (got '${String(value?.conformsTo)}')`,
    );
  }
  if (value.discriminator !== "unfold")
    throw new Error(
      `UnfoldRulesDocument: discriminator must be 'unfold' (got '${String(value.discriminator)}')`,
    );
  if (!Array.isArray(value.heuristics))
    throw new Error("UnfoldRulesDocument: heuristics must be an array");
}

export function validateUnfoldRulesDocument(doc: unknown): asserts doc is UnfoldRulesDocument {
  validateHeader(doc);
  const ids = doc.heuristics.map((heuristic) => (heuristic as { id?: unknown })?.id);
  for (const id of ids)
    if (!IDS.includes(id as (typeof IDS)[number]))
      throw new Error(`UnfoldRulesDocument: unknown heuristic id '${String(id)}'`);
  for (const id of IDS)
    if (ids.filter((seen) => seen === id).length !== 1)
      throw new Error(`UnfoldRulesDocument: missing required heuristic '${id}'`);
  if (doc.heuristics.length !== 3)
    throw new Error("UnfoldRulesDocument: heuristics must be an array of length 3");
}

export function validateUnfoldRulesExtension(doc: unknown): asserts doc is UnfoldRulesDocument {
  validateHeader(doc);
  if (doc.heuristics.length < 1)
    throw new Error(
      "UnfoldRulesDocument: extension heuristics must contain at least one heuristic",
    );
  for (const heuristic of doc.heuristics) {
    if (
      typeof (heuristic as { id?: unknown }).id !== "string" ||
      !(heuristic as { id: string }).id
    ) {
      throw new Error("UnfoldRulesDocument: heuristic id must be a non-empty string");
    }
  }
}
