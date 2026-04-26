import { AlgebraicKernel } from "../../L13-facade/index.ts";
import type { KernelModelDocument, MorphismRef } from "../metamodel.ts";

function validateActionMorphismRef(
  actionName: string,
  ref: MorphismRef,
  morphismNames: Set<string>,
  errors: string[],
): void {
  if (ref.kind === "name")
    return void (
      !morphismNames.has(ref.name) &&
      errors.push(`Action ${actionName} references unknown morphism: ${ref.name}`)
    );
  if (ref.kind === "compose")
    return void (validateActionMorphismRef(actionName, ref.f, morphismNames, errors),
    validateActionMorphismRef(actionName, ref.g, morphismNames, errors));
  if (ref.kind === "product")
    return void (validateActionMorphismRef(actionName, ref.left, morphismNames, errors),
    validateActionMorphismRef(actionName, ref.right, morphismNames, errors));
  validateActionMorphismRef(actionName, ref.then, morphismNames, errors);
  validateActionMorphismRef(actionName, ref.else, morphismNames, errors);
}

export default function validateSemantics(input: {
  doc: KernelModelDocument;
  ak: AlgebraicKernel;
}): void {
  const { doc, ak } = input,
    errors: string[] = [],
    morphismNames = new Set(Object.keys(doc.morphisms)),
    machineNames = new Set(Object.keys(doc.machines));
  for (const morphism of Object.values(doc.morphisms))
    for (const ref of [morphism.input, morphism.output])
      try {
        ak.resolveType(ref);
      } catch {
        errors.push(`Morphism ${morphism.id} references unknown type: ${ref}`);
      }
  for (const action of Object.values(doc.actions)) {
    if (!machineNames.has(action.machine))
      errors.push(`Action ${action.name} references unknown machine: ${action.machine}`);
    try {
      new URL(action.capabilityRequirement);
    } catch {
      errors.push(
        `Action ${action.name} has malformed capabilityRequirement: ${action.capabilityRequirement}`,
      );
    }
    validateActionMorphismRef(action.name, action.morphism, morphismNames, errors);
  }
  if (errors.length > 0) throw new Error(errors.join("; "));
}
