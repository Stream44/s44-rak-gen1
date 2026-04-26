import type { Branch, Step, Trace } from "./acceptance-types.ts";

export function buildStepRegistry(root: Step): Map<string, Step> {
  const registry = new Map<string, Step>();
  const walk = (step: Step): void => {
    if (registry.has(step.id)) {
      if (registry.get(step.id) !== step)
        throw new Error(`Duplicate step id in scenario tree: "${step.id}"`);
      return;
    }
    registry.set(step.id, step);
    for (const branch of step.branches ?? []) {
      if (branch.step) walk(branch.step);
    }
  };
  walk(root);
  return registry;
}

export function extractTraces(root: Step, opts: { maxCycleDepth?: number } = {}): Trace[] {
  const maxCycleDepth = opts.maxCycleDepth ?? 2;
  const registry = buildStepRegistry(root);
  const visit = (
    step: Step,
    pathSteps: Step[],
    pathEdges: Branch[],
    counts: Map<string, number>,
  ): Trace[] => {
    const nextSteps = [...pathSteps, step];
    const nextCounts = new Map(counts);
    nextCounts.set(step.id, (nextCounts.get(step.id) ?? 0) + 1);
    if (!step.branches?.length) return [{ steps: nextSteps, edges: pathEdges }];
    const traces: Trace[] = [];
    for (const branch of step.branches) {
      if (branch.ref) {
        const target = registry.get(branch.ref);
        if (!target)
          throw new Error(
            `Branch ref "${branch.ref}" on step "${step.id}" does not resolve to any step in the scenario.`,
          );
        if ((nextCounts.get(target.id) ?? 0) >= maxCycleDepth) {
          traces.push({
            steps: nextSteps,
            edges: pathEdges,
            cycle: { toStepId: target.id, via: branch },
          });
          continue;
        }
        traces.push({
          steps: [...nextSteps, target],
          edges: [...pathEdges, branch],
          cycle: { toStepId: target.id, via: branch },
        });
        continue;
      }
      if (!branch.step)
        throw new Error(`Branch "${branch.label}" on step "${step.id}" has neither step nor ref.`);
      traces.push(...visit(branch.step, nextSteps, [...pathEdges, branch], nextCounts));
    }
    return traces;
  };
  return visit(root, [], [], new Map());
}
