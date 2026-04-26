import { IntentProcessor, type ActionType } from "../../L13-facade/index.ts";
import type { KernelModelDocument, MorphismRef } from "../metamodel.ts";

export default async function registerActions(input: {
  doc: KernelModelDocument;
  intents: IntentProcessor;
  version: string;
  origin: string;
}): Promise<{
  actionsByName: Map<string, ActionType>;
  actionMorphisms: Map<string, MorphismRef>;
  actionRequirements: Map<string, string>;
  actionCount: number;
}> {
  const { doc, intents, version, origin } = input,
    actionsByName = new Map<string, ActionType>(),
    actionMorphisms = new Map<string, MorphismRef>(),
    actionRequirements = new Map<string, string>();
  for (const action of Object.values(doc.actions)) {
    actionsByName.set(
      action.name,
      intents.defineAction(action.name, version, {
        verb: action.verb,
        inputSchema: action.inputSchema,
        targetMachine: action.machine,
        preconditions: [],
        origin,
      }),
    );
    actionMorphisms.set(action.name, action.morphism);
    actionRequirements.set(action.name, action.capabilityRequirement);
  }
  return {
    actionsByName,
    actionMorphisms,
    actionRequirements,
    actionCount: Object.keys(doc.actions).length,
  };
}
