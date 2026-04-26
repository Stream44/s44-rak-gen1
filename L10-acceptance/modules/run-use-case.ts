import type { Scenario, ScenarioResult, UseCase, UseCaseResult } from "../acceptance.ts";

export default function runUseCase(input: {
  useCase: UseCase;
  runScenario: (scenario: Scenario) => ScenarioResult;
}): UseCaseResult {
  const scenarios = input.useCase.scenarios.map((scenario) => input.runScenario(scenario));
  return {
    useCaseId: input.useCase.id,
    name: input.useCase.name,
    passed: scenarios.every((result) => result.passed),
    scenarios,
  };
}
