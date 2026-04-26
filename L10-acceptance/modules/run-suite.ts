import type {
  AcceptanceSuite,
  SuiteResult,
  SuiteStats,
  UseCase,
  UseCaseResult,
} from "../acceptance.ts";

export default function runSuite(input: {
  suite: AcceptanceSuite;
  runUseCase: (useCase: UseCase) => UseCaseResult;
  computeStats: (results: UseCaseResult[]) => SuiteStats;
}): SuiteResult {
  const useCases = input.suite.useCases.map((useCase) => input.runUseCase(useCase));
  return {
    suiteId: input.suite.id,
    modelId: input.suite.modelId,
    modelVersion: input.suite.modelVersion,
    passed: useCases.every((result) => result.passed),
    useCases,
    timestamp: new Date().toISOString(),
    stats: input.computeStats(useCases),
  };
}
