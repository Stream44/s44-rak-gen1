import { AlgebraicKernel, type Morphism } from "../../L13-facade/index.ts";
import type { MorphismRef } from "../metamodel.ts";

export default async function evaluateActionMorphism(
  ref: MorphismRef,
  input: unknown,
  morphismIdsByName: Map<string, string>,
  algebraBindings: Map<string, Function>,
  ak: AlgebraicKernel,
): Promise<unknown> {
  if (ref.kind === "name") {
    const morphismId = morphismIdsByName.get(ref.name);
    if (!morphismId) throw new Error(`Unknown morphism ref: ${ref.name}`);
    return evaluateNamedMorphism(ak.morphisms.resolve(morphismId), input, algebraBindings, ak);
  }
  if (ref.kind === "compose")
    return evaluateActionMorphism(
      ref.g,
      await evaluateActionMorphism(ref.f, input, morphismIdsByName, algebraBindings, ak),
      morphismIdsByName,
      algebraBindings,
      ak,
    );
  throw new Error("inline-AST action morphisms are not supported yet");
}

export async function evaluateNamedMorphism(
  morphism: Morphism,
  input: unknown,
  algebraBindings: Map<string, Function>,
  ak: AlgebraicKernel,
): Promise<unknown> {
  if (morphism.impl?.kind !== "algebra")
    return ak.morphisms.evaluate(morphism.id, input, { ak, kernel: ak });
  const inputValidation = ak.validate(morphism.sourceType, input);
  if (!inputValidation.valid)
    throw new Error(
      `Morphism ${morphism.id}: input does not conform to ${morphism.sourceType}: ${inputValidation.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
    );
  const evaluation = ak.evaluate(morphism.expr, {
    $input: input,
    $self: input,
    ...Object.fromEntries(algebraBindings),
  });
  if (evaluation.error) throw new Error(`Morphism evaluation failed: ${evaluation.error}`);
  const outputValidation = ak.validate(morphism.targetType, evaluation.value);
  if (!outputValidation.valid)
    throw new Error(
      `Morphism ${morphism.id}: output does not conform to ${morphism.targetType}: ${outputValidation.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
    );
  return evaluation.value;
}
