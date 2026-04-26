import { AlgebraicKernel, IntentProcessor, type ActionType } from "../../L13-facade/index.ts";
import type { KernelModelDocument, MorphismRef } from "../metamodel.ts";
import type { ModuleResolver } from "../module-loader.ts";
import registerActions from "./register-actions.ts";
import registerMachines from "./register-machines.ts";
import registerMorphisms from "./register-morphisms.ts";
import registerTypes from "./register-types.ts";
import validateSemantics from "./validate-semantics.ts";

export default async function installKernelModel(input: {
  doc: KernelModelDocument;
  ak: AlgebraicKernel;
  intents: IntentProcessor;
  resolver: ModuleResolver;
  algebraBindings: Map<string, Function>;
}): Promise<{
  morphismIdsByName: Map<string, string>;
  actionsByName: Map<string, ActionType>;
  actionMorphisms: Map<string, MorphismRef>;
  actionRequirements: Map<string, string>;
}> {
  const { doc, ak, intents, resolver, algebraBindings } = input,
    origin = doc.origin ?? "adk";
  await registerTypes({ doc, ak });
  await registerMachines({ doc, ak });
  ak.morphisms.registerModuleResolver(resolver);
  validateSemantics({ doc, ak });
  const { morphismIdsByName } = await registerMorphisms({ doc, ak, algebraBindings });
  const { actionsByName, actionMorphisms, actionRequirements } = await registerActions({
    doc,
    intents,
    version: doc.version,
    origin,
  });
  return { morphismIdsByName, actionsByName, actionMorphisms, actionRequirements };
}
