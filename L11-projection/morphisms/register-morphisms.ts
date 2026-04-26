import { AlgebraicKernel, type KernelExpression } from "../../L13-facade/index.ts";
import type { KernelModelDocument, KernelMorphismDef } from "../metamodel.ts";

const PLACEHOLDER_EXPR: KernelExpression = { op: "var", name: "$input" };

export default async function registerMorphisms(input: {
  doc: KernelModelDocument;
  ak: AlgebraicKernel;
  algebraBindings: Map<string, Function>;
}): Promise<{ morphismIdsByName: Map<string, string>; morphismCount: number }> {
  const { doc, ak, algebraBindings } = input,
    morphismIdsByName = new Map<string, string>(),
    defaultContext = Object.fromEntries(algebraBindings) as Record<string, Function>,
    validate = (kind: "input" | "output", type: string, value: unknown, id: string) => {
      const result = ak.validate(type, value);
      if (!result.valid)
        throw new Error(
          `Morphism ${id}: ${kind} does not conform to ${type}: ${result.errors.map((e) => `${e.path}: ${e.message}`).join("; ")}`,
        );
    };
  for (const [name, morphism] of Object.entries(doc.morphisms)) {
    const ast = morphism.impl.kind === "algebra" ? (morphism.impl.ast as KernelExpression) : null,
      defined = ak.morphisms.define(
        name,
        morphism.input,
        morphism.output,
        ast ?? PLACEHOLDER_EXPR,
        {
          impl: morphism.impl as KernelMorphismDef["impl"],
          defaultContext,
          ...(morphism.id.startsWith("morphism://") ? { id: morphism.id } : {}),
        },
      );
    morphismIdsByName.set(name, defined.id);
    if (ast) {
      const binding = (arg: unknown) => {
        validate("input", defined.sourceType, arg, defined.id);
        const evaluation = ak.evaluate(ast, { $input: arg, $self: arg, ...defaultContext });
        if (evaluation.error)
          throw new Error(`Morphism ${defined.id}: algebra evaluation failed: ${evaluation.error}`);
        validate("output", defined.targetType, evaluation.value, defined.id);
        return evaluation.value;
      };
      algebraBindings.set(`$${name}`, binding);
      defaultContext[`$${name}`] = binding;
    }
  }
  return { morphismIdsByName, morphismCount: Object.keys(doc.morphisms).length };
}
