import type { CrossRefIndex, ModelDocument } from "./model-types.ts";

function assets(ast: unknown): string[] {
  if (!ast || typeof ast !== "object") return [];
  const node = ast as { op?: unknown; path?: unknown; args?: unknown; fields?: unknown };
  const direct = node.op === "asset" && typeof node.path === "string" ? [`asset:${node.path}`] : [];
  const argAssets = Array.isArray(node.args) ? node.args.flatMap((arg) => assets(arg)) : [];
  const fieldAssets =
    node.fields && typeof node.fields === "object"
      ? Object.values(node.fields).flatMap((value) => assets(value))
      : [];
  return [...direct, ...argAssets, ...fieldAssets];
}

export function buildCrossRefIndex(document: ModelDocument): CrossRefIndex {
  return {
    typeToRelations: Object.entries(document.relations ?? {}).reduce(
      (acc, [name, relation]) => {
        for (const type of Object.values(relation.roles ?? {})) {
          acc[String(type)] = [...(acc[String(type)] ?? []), name];
        }
        return acc;
      },
      {} as Record<string, string[]>,
    ),
    actionToTargetMachine: Object.fromEntries(
      Object.entries(document.actions ?? {})
        .map(([name, action]) => [name, String(action.targetMachine ?? "")])
        .filter(([, target]) => target.length > 0),
    ),
    morphismToAssets: Object.fromEntries(
      Object.entries(document.morphisms ?? {}).map(([name, morphism]) => [
        name,
        morphism.impl?.kind === "module"
          ? [`asset-module:${String(morphism.impl?.uri ?? "")}`]
          : assets(morphism.impl?.ast),
      ]),
    ),
  };
}
