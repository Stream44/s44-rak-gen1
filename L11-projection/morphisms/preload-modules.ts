import type { AlgebraicKernel, KernelExpression } from "../../L13-facade/index.ts";
import type { KernelModelDocument } from "../metamodel.ts";
import type { ModuleResolver } from "../module-loader.ts";

const DEFAULT_PRELOAD_AST: KernelExpression = {
  op: "call",
  fn: "map",
  args: [
    {
      op: "call",
      fn: "filter",
      args: [
        { op: "call", fn: "values", args: [{ op: "get", path: "$input/morphisms" }] },
        {
          op: "lambda",
          param: "$m",
          body: {
            op: "call",
            fn: "eq",
            args: [
              { op: "get", path: "$m/impl/kind" },
              { op: "const", value: "module" },
            ],
          },
        },
      ],
    },
    { op: "lambda", param: "$m", body: { op: "get", path: "$m/impl/uri" } },
  ],
};

/**
 * Prefer the document's declared `computeModulePreload` morphism when present.
 * If the model omits it, fall back to the built-in default algebra AST.
 */
export default async function preloadModules(input: {
  doc: KernelModelDocument;
  ak: AlgebraicKernel;
  resolver: ModuleResolver;
}): Promise<{ algebraBindings: Map<string, Function>; preloaded: string[] }> {
  const { doc, ak, resolver } = input,
    preloadDef = doc.morphisms.computeModulePreload;
  const uris =
    preloadDef?.impl.kind === "module"
      ? ((await (
          await resolver(preloadDef.impl.uri, preloadDef.impl.export)
        )(doc)) as string[])
      : (ak.evaluate(
          preloadDef?.impl.kind === "algebra"
            ? (preloadDef.impl.ast as KernelExpression)
            : DEFAULT_PRELOAD_AST,
          { $input: doc, $self: doc },
        ).value as string[]);
  const algebraBindings = new Map<string, Function>(),
    preloadedSet = new Set(uris);
  const preloadTargets = [
    ...new Set(
      Object.values(doc.morphisms).flatMap((morphism) =>
        morphism.impl.kind === "module" && preloadedSet.has(morphism.impl.uri)
          ? [`${morphism.impl.uri}::${morphism.impl.export}`]
          : [],
      ),
    ),
  ];
  const preloadedFns = new Map(
    await Promise.all(
      preloadTargets.map(async (target) => {
        const [uri, exportName] = target.split("::");
        try {
          return [target, await resolver(uri!, exportName!)] as const;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          throw new Error(`Preload failed for module URI ${uri}: ${message}`);
        }
      }),
    ),
  );
  for (const [name, morphism] of Object.entries(doc.morphisms)) {
    if (morphism.impl.kind === "module" && preloadedSet.has(morphism.impl.uri))
      algebraBindings.set(
        `$${name}`,
        preloadedFns.get(`${morphism.impl.uri}::${morphism.impl.export}`)!,
      );
  }
  return { algebraBindings, preloaded: uris };
}
