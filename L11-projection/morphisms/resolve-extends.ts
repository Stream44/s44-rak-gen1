import type { AlgebraicKernel } from "../../L13-facade/index.ts";
import type { ProjectionModel } from "../../L01-foundation/projection-types.ts";

export default async function resolveExtends(
  input: { doc: ProjectionModel; registry?: Map<string, ProjectionModel> } | ProjectionModel,
  kernelOrContext?: AlgebraicKernel | { kernel?: AlgebraicKernel; ak?: AlgebraicKernel },
): Promise<ProjectionModel> {
  const payload = "doc" in input ? input : { doc: input, registry: undefined };
  const kernel =
    typeof (kernelOrContext as Partial<AlgebraicKernel> | undefined)?.morphisms?.evaluate ===
    "function"
      ? (kernelOrContext as AlgebraicKernel)
      : ((kernelOrContext as { kernel?: AlgebraicKernel; ak?: AlgebraicKernel } | undefined)
          ?.kernel ??
        (kernelOrContext as { kernel?: AlgebraicKernel; ak?: AlgebraicKernel } | undefined)?.ak);
  return kernel
    ? ((await kernel.morphisms.evaluate(
        "morphism://adk/extendsResolver/1.0",
        payload,
      )) as ProjectionModel)
    : payload.doc;
}
