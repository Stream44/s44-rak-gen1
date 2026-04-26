import { evalEventEmitted } from "../modules/eval-assertion-kinds.ts";

export default function evalAssertionEventEmittedMorphism(input: {
  events: Array<{
    id: string;
    action: string;
    targetKey: string;
    previousState: unknown;
    newState: unknown;
  }>;
  targetKey: string;
  newStateFields?: Record<string, unknown>;
}) {
  return evalEventEmitted(
    {
      kind: "event-emitted",
      targetKey: input.targetKey,
      newStateFields: input.newStateFields,
    },
    {
      kernel: { morphisms: { evaluate: async () => undefined } },
      step: {
        id: "__morphism__",
        personaId: "__morphism__",
        verb: "__morphism__",
        targetKey: input.targetKey,
        assertions: [],
      },
      persona: {
        id: "__morphism__",
        name: "__morphism__",
        role: "__morphism__",
        capabilities: {},
      },
      result: { success: true, events: [] },
      getState: () => undefined,
      listInstances: () => [],
      capturedEvents: input.events,
    },
  );
}
