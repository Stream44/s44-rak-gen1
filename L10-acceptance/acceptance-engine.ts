import { readFileSync } from "fs";
import { dirname, resolve } from "path";
import type { ModelBoot } from "../L09-demand/model-loader.ts";
import type {
  AcceptanceSuite,
  AcceptanceMorphismKernel,
  Persona,
  Scenario,
  ScenarioResult,
  Seed,
  StepContext,
  StepResult,
  SuiteResult,
  SuiteStats,
  Trace,
  TraceResult,
  UseCase,
  UseCaseResult,
} from "./acceptance-types.ts";
import type { ProjectorSession } from "./projector-session.ts";
import { getAcceptanceMorphismKernel } from "./m1.ts";
import {
  buildAcceptanceSuite,
  parseAcceptanceSuiteDocument,
  type AcceptancePersonaSpec,
} from "./yaml-parsers.ts";
import { extractTraces } from "./trace-extract.ts";
import runStepLeaf from "./modules/run-step.ts";

export class AcceptanceEngine {
  private suite: AcceptanceSuite | null = null;
  private readonly kernel: AcceptanceMorphismKernel;
  constructor(private app: ModelBoot) {
    this.kernel = getAcceptanceMorphismKernel();
  }

  loadSuite(suitePath: string): AcceptanceSuite {
    const absPath = resolve(suitePath);
    const baseDir = dirname(absPath);
    const doc = parseAcceptanceSuiteDocument(Bun.YAML.parse(readFileSync(absPath, "utf-8")));
    const rawPersonas =
      typeof doc.personas === "string"
        ? (Bun.YAML.parse(
            readFileSync(resolve(baseDir, doc.personas), "utf-8"),
          ) as AcceptancePersonaSpec[])
        : doc.personas;
    const seeds =
      typeof doc.seeds === "string"
        ? (Bun.YAML.parse(readFileSync(resolve(baseDir, doc.seeds), "utf-8")) as Seed[])
        : (doc.seeds ?? []);
    const personas: Persona[] = rawPersonas.map((persona) => ({ ...persona, capabilities: {} }));
    this.issuePersonaCapabilities(personas, this.app);
    this.suite = buildAcceptanceSuite({ doc, personas, seeds });
    this.validateRestartAfterSuite(this.suite);
    return this.suite;
  }

  setSuite(suite: AcceptanceSuite): void {
    this.issuePersonaCapabilities(suite.personas, this.app);
    this.suite = suite;
    this.validateRestartAfterSuite(this.suite);
  }

  getSuite(): AcceptanceSuite | null {
    return this.suite;
  }

  async run(opts?: { projectorSession?: ProjectorSession }): Promise<SuiteResult> {
    if (!this.suite) throw new Error("No suite loaded; call loadSuite() first.");
    const useCases: UseCaseResult[] = [];
    for (const useCase of this.suite.useCases)
      useCases.push(await this.runUseCase_inner(useCase, opts));
    const stats = this.computeStats(useCases);
    return {
      suiteId: this.suite.id,
      modelId: this.suite.modelId,
      modelVersion: this.suite.modelVersion,
      passed: useCases.every((useCase) => useCase.passed),
      useCases,
      timestamp: new Date().toISOString(),
      stats,
    };
  }

  async runUseCase(id: string): Promise<UseCaseResult> {
    if (!this.suite) throw new Error("No suite loaded.");
    const useCase = this.suite.useCases.find((entry) => entry.id === id);
    if (!useCase) throw new Error(`Unknown use case: ${id}`);
    return await this.runUseCase_inner(useCase);
  }
  async runScenario(id: string): Promise<ScenarioResult> {
    if (!this.suite) throw new Error("No suite loaded.");
    for (const useCase of this.suite.useCases) {
      const scenario = useCase.scenarios.find((entry) => entry.id === id);
      if (scenario) return await this.runScenario_inner(scenario);
    }
    throw new Error(`Unknown scenario: ${id}`);
  }

  private computeStats(results: UseCaseResult[]): SuiteStats {
    const stats = {
      totalScenarios: 0,
      passedScenarios: 0,
      totalTraces: 0,
      passedTraces: 0,
      totalSteps: 0,
      passedSteps: 0,
    };
    for (const useCase of results)
      for (const scenario of useCase.scenarios) {
        stats.totalScenarios += 1;
        stats.passedScenarios += scenario.passed ? 1 : 0;
        for (const trace of scenario.traces) {
          stats.totalTraces += 1;
          stats.passedTraces += trace.passed ? 1 : 0;
          for (const step of trace.steps)
            ((stats.totalSteps += 1), (stats.passedSteps += step.passed ? 1 : 0));
        }
      }
    return stats;
  }

  private async runUseCase_inner(
    useCase: UseCase,
    opts?: { projectorSession?: ProjectorSession },
  ): Promise<UseCaseResult> {
    const scenarios: ScenarioResult[] = [];
    for (const scenario of useCase.scenarios)
      scenarios.push(await this.runScenario_inner(scenario, opts));
    return {
      useCaseId: useCase.id,
      name: useCase.name,
      passed: scenarios.every((scenario) => scenario.passed),
      scenarios,
    };
  }

  private async runScenario_inner(
    scenario: Scenario,
    opts?: { projectorSession?: ProjectorSession },
  ): Promise<ScenarioResult> {
    if (!this.suite) throw new Error("No suite loaded.");
    const traces = (await this.kernel.morphisms.evaluate("morphism://adk/extractTraces/1.0", {
      rootStep: scenario.root,
    })) as Trace[];
    const results: TraceResult[] = [];
    for (const trace of traces)
      results.push(
        await this.runTrace_dispatch(trace, scenario, this.suite, opts?.projectorSession),
      );
    return {
      scenarioId: scenario.id,
      name: scenario.name,
      passed: results.every((result) => result.passed),
      traceCount: traces.length,
      traces: results,
    };
  }

  private async runTrace_dispatch(
    trace: Trace,
    scenario: Scenario,
    suite: AcceptanceSuite,
    projectorSession?: ProjectorSession,
  ): Promise<TraceResult> {
    this.validateRestartAfterTrace(scenario, trace);
    const inlineBy = new Map(
      (scenario.inlineSeeds ?? []).map((seed) => [seed.targetKey, seed] as const),
    );
    const keysToSeed = scenario.seedKeys ?? suite.seeds.map((seed) => seed.targetKey);
    const resolveSeed = (key: string): Seed | undefined =>
      inlineBy.get(key) ?? suite.seeds.find((seed) => seed.targetKey === key);
    let activeApp = this.app;
    for (const instance of activeApp.listInstances()) activeApp.removeInstance(instance.key);
    for (const key of keysToSeed) this.applySeed_dispatch(activeApp, resolveSeed(key));
    for (const seed of scenario.inlineSeeds ?? [])
      if (!keysToSeed.includes(seed.targetKey)) this.applySeed_dispatch(activeApp, seed);
    const personaById = new Map(suite.personas.map((persona) => [persona.id, persona] as const));
    const capturedEvents: StepContext["capturedEvents"] = [];
    let unsub = activeApp.onEvent((event) =>
      event.kind === "transactionCommitted"
        ? capturedEvents.push(...(event.events ?? []))
        : capturedEvents.push(event),
    );
    const results: StepResult[] = [];
    let passed = true;
    let lastCreatedKey: string | null = null;
    const restartAfter = new Set(scenario.restartAfter ?? []);
    try {
      for (let index = 0; index < trace.steps.length; index += 1) {
        const step = (await this.kernel.morphisms.evaluate(
          "morphism://adk/resolveMacrosInStep/1.0",
          {
            step: trace.steps[index]!,
            lastCreatedKey,
          },
        )) as Trace["steps"][number];
        const incomingEdge = index > 0 ? trace.edges[index - 1] : undefined;
        if (incomingEdge?.ref && incomingEdge.resetBeforeCycle)
          this.applySeed_dispatch(activeApp, resolveSeed(step.targetKey));
        capturedEvents.length = 0;
        const persona = personaById.get(step.personaId);
        if (!persona) {
          results.push({
            stepId: step.id,
            passed: false,
            error: `Unknown persona: "${step.personaId}"`,
            assertions: [],
          });
          passed = false;
          break;
        }
        const beforeState = activeApp.getState(step.targetKey);
        const stepResult = await this.runStep_dispatch({
          step,
          persona,
          app: activeApp,
          kernel: this.kernel,
          projectorSession,
          capturedEvents,
        });
        results.push(stepResult);
        if (!stepResult.passed) {
          passed = false;
          break;
        }
        const afterState = activeApp.getState(step.targetKey);
        if (beforeState === undefined && afterState !== undefined) lastCreatedKey = step.targetKey;
        if (restartAfter.has(index + 1)) {
          await activeApp.flush?.();
          await activeApp.dispose?.();
          const rebooted = await activeApp.restart?.();
          if (rebooted) {
            activeApp = rebooted;
            this.app = rebooted;
            this.issuePersonaCapabilities(suite.personas, rebooted);
            unsub();
            unsub = activeApp.onEvent((event) =>
              event.kind === "transactionCommitted"
                ? capturedEvents.push(...(event.events ?? []))
                : capturedEvents.push(event),
            );
          }
        }
      }
    } finally {
      unsub();
    }
    const traceLabel = `${trace.steps.map((step) => step.description ?? step.id).join(" -> ")}${trace.cycle ? ` ↺ ${trace.cycle.toStepId}` : ""}`;
    return trace.cycle
      ? { traceLabel, passed, steps: results, cyclic: true, cycleTo: trace.cycle.toStepId }
      : { traceLabel, passed, steps: results };
  }

  private async runStep_dispatch(input: {
    step: Trace["steps"][number];
    persona: Persona;
    app: ModelBoot;
    kernel: AcceptanceMorphismKernel;
    projectorSession?: ProjectorSession;
    capturedEvents: StepContext["capturedEvents"];
  }): Promise<StepResult> {
    return await runStepLeaf(input);
  }

  private applySeed_dispatch(app: ModelBoot, seed?: Seed): void {
    if (seed) app.setState(seed.targetKey, seed.state);
  }

  private issuePersonaCapabilities(personas: Persona[], app: ModelBoot): void {
    for (const persona of personas) {
      persona.capabilities = {};
      for (const verb of persona.verbs ?? [])
        try {
          persona.capabilities[verb] = app.issueCapability(verb, persona.id);
        } catch {}
      for (const capabilityUri of persona.capabilityUris ?? [])
        try {
          persona.capabilities[capabilityUri] = app.issueCapability(capabilityUri, persona.id);
        } catch {}
    }
  }

  private validateRestartAfterSuite(suite: AcceptanceSuite): void {
    for (const useCase of suite.useCases)
      for (const scenario of useCase.scenarios)
        for (const trace of extractTraces(scenario.root))
          this.validateRestartAfterTrace(scenario, trace);
  }

  private validateRestartAfterTrace(scenario: Scenario, trace: Trace): void {
    if (!scenario.restartAfter?.length) return;
    const invalid = scenario.restartAfter.filter(
      (position) => !Number.isInteger(position) || position <= 0 || position > trace.steps.length,
    );
    if (invalid.length)
      throw new Error(
        `Scenario "${scenario.id}" declared restartAfter: [${invalid.join(", ")}] but only ${trace.steps.length} steps exist.`,
      );
  }
}
