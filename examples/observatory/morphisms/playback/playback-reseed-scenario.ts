import type { ModelBoot } from "../../../../L09-demand/model-loader.ts";
import type { AcceptanceSuite, Scenario } from "../../../../L10-acceptance/acceptance.ts";

export default function reseedScenario(input: {
  suite: AcceptanceSuite;
  scenario: Scenario;
  app: ModelBoot;
}): { seededKeys: string[] } {
  const { suite, scenario, app } = input;
  const inlineByTarget = new Map<string, unknown>();

  for (const seed of scenario.inlineSeeds ?? []) {
    inlineByTarget.set(seed.targetKey, seed.state);
  }

  const keysToSeed = scenario.seedKeys ?? suite.seeds.map((seed) => seed.targetKey);
  const seededKeys: string[] = [];

  for (const key of keysToSeed) {
    if (inlineByTarget.has(key)) {
      app.setState(key, inlineByTarget.get(key));
      seededKeys.push(key);
      continue;
    }

    const suiteSeed = suite.seeds.find((seed) => seed.targetKey === key);
    if (suiteSeed) {
      app.setState(suiteSeed.targetKey, suiteSeed.state);
      seededKeys.push(suiteSeed.targetKey);
    }
  }

  for (const [key, state] of inlineByTarget.entries()) {
    if (keysToSeed.includes(key)) {
      continue;
    }
    app.setState(key, state);
    seededKeys.push(key);
  }

  return { seededKeys };
}
