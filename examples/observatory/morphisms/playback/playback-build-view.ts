import {
  extractTraces,
  type AcceptanceSuite,
  type Step,
} from "../../../../L10-acceptance/acceptance.ts";
import type { AcceptanceSuiteView, StepTreeNode } from "../../protocol.ts";

function stepToTreeNode(step: Step | undefined, fallbackLabel?: string): StepTreeNode {
  if (!step) {
    return {
      stepId: fallbackLabel ?? "(ref)",
      persona: "—",
      verb: "(ref)",
      targetKey: "—",
      description: fallbackLabel,
      status: "skipped",
      branches: [],
    };
  }

  return {
    stepId: step.id,
    persona: step.personaId,
    verb: step.verb,
    targetKey: step.targetKey,
    description: step.description,
    status: "pending",
    branches: (step.branches ?? []).map((branch) => ({
      label: branch.label,
      node: stepToTreeNode(branch.step, branch.label),
    })),
  };
}

export function flattenTree(node: StepTreeNode): Array<{
  stepId: string;
  persona: string;
  verb: string;
  targetKey: string;
  hasChildren: boolean;
}> {
  return [
    {
      stepId: node.stepId,
      persona: node.persona,
      verb: node.verb,
      targetKey: node.targetKey,
      hasChildren: node.branches.length > 0,
    },
    ...node.branches.flatMap((branch) => flattenTree(branch.node)),
  ];
}

export default function buildPlaybackView(input: { suite: AcceptanceSuite }): AcceptanceSuiteView {
  const { suite } = input;

  return {
    name: suite.name,
    model: suite.modelId,
    version: suite.modelVersion,
    personas: suite.personas.map((persona) => ({
      id: persona.id,
      name: persona.name,
      role: persona.role,
      verbs: persona.verbs ?? Object.keys(persona.capabilities),
    })),
    useCases: suite.useCases.map((useCase) => ({
      id: useCase.id,
      name: useCase.name,
      description: useCase.description,
      scenarios: useCase.scenarios.map((scenario) => {
        const traces = extractTraces(scenario.root);
        return {
          id: scenario.id,
          name: scenario.name,
          description: scenario.description,
          traceCount: traces.length,
          traceIndices: traces.map((_, index) => index),
          traceButtons: traces.map((_, index) => ({
            scenarioId: scenario.id,
            traceIndex: index,
            label: `▶ trace ${index}`,
          })),
          traces: traces.map((trace) => ({
            stepIds: trace.steps.map((step) => step.id),
            cyclic: trace.cycle ? true : undefined,
            cycleTo: trace.cycle?.toStepId,
          })),
          tree: stepToTreeNode(scenario.root),
        };
      }),
    })),
  };
}
