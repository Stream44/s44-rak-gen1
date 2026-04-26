import type { UnfoldRulesDocument } from "./rules-types.ts";

export interface MergeRulesOptions {
  strategy: "append" | "prepend" | "replace";
  conflictPolicy: "error" | "override" | "skip";
}

export function mergeRules(
  base: UnfoldRulesDocument,
  extension: UnfoldRulesDocument,
  opts: MergeRulesOptions,
): UnfoldRulesDocument {
  const baseIds = base.heuristics.map((heuristic) => heuristic.id);
  const extIds = extension.heuristics.map((heuristic) => heuristic.id);
  const shared = extIds.filter((id) => baseIds.includes(id));
  if (shared.length && opts.conflictPolicy === "error")
    throw new Error(`UnfoldingEngine.extendRules: overlapping heuristic ids: ${shared.join(", ")}`);
  const choose = (id: string) => {
    const baseRule = base.heuristics.find((heuristic) => heuristic.id === id);
    const extRule = extension.heuristics.find((heuristic) => heuristic.id === id);
    if (baseRule && extRule) return opts.conflictPolicy === "skip" ? baseRule : extRule;
    return extRule ?? baseRule!;
  };
  const ids =
    opts.strategy === "replace"
      ? extIds
      : opts.strategy === "prepend"
        ? [...new Set([...extIds, ...baseIds])]
        : [...new Set([...baseIds, ...extIds])];
  return {
    ...base,
    ...extension,
    heuristics: ids.map(choose),
  };
}
