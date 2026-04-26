import { evalStateEquals } from "../modules/eval-assertion-kinds.ts";

export default function evalAssertionStateEqualsMorphism(input: {
  actual: unknown;
  expected: unknown;
}) {
  return evalStateEquals(
    { kind: "state-equals", targetKey: "__morphism__", expected: input.expected },
    {
      kernel: { morphisms: { evaluate: async () => undefined } },
      step: {
        id: "__morphism__",
        personaId: "__morphism__",
        verb: "__morphism__",
        targetKey: "__morphism__",
        assertions: [],
      },
      persona: {
        id: "__morphism__",
        name: "__morphism__",
        role: "__morphism__",
        capabilities: {},
      },
      result: { success: true, events: [] },
      getState: () => input.actual,
      listInstances: () => [],
      capturedEvents: [],
    },
  );
}
