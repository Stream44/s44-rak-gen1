import { evalStateFieldMatch } from "../modules/eval-assertion-kinds.ts";

export default function evalAssertionStateFieldMatchMorphism(input: {
  actual: unknown;
  fields: Record<string, unknown>;
}) {
  return evalStateFieldMatch(
    { kind: "state-field-match", targetKey: "__morphism__", fields: input.fields },
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
