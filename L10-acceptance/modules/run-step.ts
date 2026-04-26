// Single-step acceptance leaf extracted from the trace runner.
import type { ModelBoot } from "../../L09-demand/model-loader.ts";
import { ActionMorphismResolver } from "../../L07-agency/action-morphism.ts";
import { generateKey } from "../../L07-agency/keygen.ts";
import type {
  AcceptanceMorphismKernel,
  Persona,
  ProjectorSession,
  Step,
  StepContext,
  StepResult,
} from "../acceptance.ts";
import evalAssertion from "./eval-assertion.ts";
import { getAcceptanceMorphismKernel } from "../m1.ts";

const ASSERTION_ONLY_VERB = "__assertion_only__";

function actionNameForVerb(app: ModelBoot, verb: string): string | null {
  const actionId = app.actions[verb];
  if (!actionId) return null;
  const parts = actionId.split("/");
  return parts.length >= 2 ? (parts[parts.length - 2] ?? null) : null;
}

async function executeDeclarativeAction(
  app: ModelBoot,
  verb: string,
  targetKey: string,
  payload: Record<string, unknown> = {},
): Promise<{
  success: boolean;
  newState?: unknown;
  error?: string;
  events: Array<{ id: string; previousState: unknown; newState: unknown }>;
}> {
  const actionName = actionNameForVerb(app, verb);
  if (!actionName) {
    return { success: false, error: `No action for verb "${verb}"`, events: [] };
  }

  const action = app.getActionDef(actionName);
  if (!action) {
    return { success: false, error: `No action definition for "${actionName}"`, events: [] };
  }

  switch (action.kind ?? "mutate") {
    case "mutate": {
      const current = app.getState(targetKey);
      const nextState = {
        ...(current && typeof current === "object" ? (current as Record<string, unknown>) : {}),
        ...payload,
      };
      app.setState(targetKey, nextState);
      return { success: true, newState: nextState, events: [] };
    }
    case "create": {
      const keyField = action.keyField ?? "id";
      const key = targetKey || generateKey(action.keyStrategy, payload);
      const nextState = { ...(action.defaults ?? {}), [keyField]: key, ...payload };
      app.setState(key, nextState);
      return { success: true, newState: nextState, events: [] };
    }
    case "remove":
      app.removeInstance(targetKey || String(payload[action.targetField ?? "id"] ?? ""));
      return { success: true, newState: undefined, events: [] };
    case "batch": {
      const bindings = new Map<string, unknown>([
        ["instances", app.listInstances().map(({ state }) => state)],
      ]);
      const resolver = new ActionMorphismResolver({
        bindings,
        payload,
        session: { currentUser: { id: "acceptance", capabilities: {} } },
        route: { path: "/", params: {}, query: {} },
      });
      const items = resolver.resolve(action.selector);
      if (!Array.isArray(items)) {
        return { success: true, events: [] };
      }
      for (const [index, item] of items.entries()) {
        const sub = new ActionMorphismResolver({
          bindings,
          payload,
          item,
          index,
          session: { currentUser: { id: "acceptance", capabilities: {} } },
          route: { path: "/", params: {}, query: {} },
        }).resolve(action.submit) as {
          verb: string;
          target: string;
          payload?: Record<string, unknown>;
        };
        const result = await executeDeclarativeAction(
          app,
          sub.verb,
          String(sub.target),
          sub.payload ?? {},
        );
        if (!result.success) return result;
      }
      return { success: true, events: [] };
    }
    case "custom":
      return {
        success: false,
        error: `Custom action "${actionName}" is not supported in AcceptanceEngine`,
        events: [],
      };
  }
}

export default async function runStep(input: {
  step: Step;
  persona: Persona;
  app: ModelBoot;
  kernel?: AcceptanceMorphismKernel;
  projectorSession?: ProjectorSession;
  capturedEvents: StepContext["capturedEvents"];
}): Promise<StepResult> {
  const { step, persona, app, projectorSession, capturedEvents } = input;
  const kernel = input.kernel ?? getAcceptanceMorphismKernel();
  const capId = persona.capabilities[step.verb];
  projectorSession?.setSessionCaps(persona.capabilities);
  let result: {
    success: boolean;
    newState?: unknown;
    error?: string;
    events: Array<{ id: string; previousState: unknown; newState: unknown }>;
  };

  if (step.verb === ASSERTION_ONLY_VERB) {
    result = {
      success: true,
      newState: step.targetKey ? app.getState(step.targetKey) : undefined,
      events: [],
    };
  } else if (!capId) {
    result = {
      success: false,
      error: `Authorization denied: persona "${persona.name}" (${persona.role}) has no capability for verb "${step.verb}"`,
      events: [],
    };
  } else if (step.useActionDispatch) {
    const actionName = actionNameForVerb(app, step.verb);
    const action = actionName ? app.getActionDef(actionName) : undefined;
    if ((action?.kind ?? "mutate") === "batch" || action?.kind === "custom") {
      result = await executeDeclarativeAction(app, step.verb, step.targetKey, step.payload ?? {});
    } else if ((action?.kind ?? "mutate") === "create") {
      result = await app.submit(
        step.verb,
        step.targetKey,
        {
          ...(action?.defaults ?? {}),
          [action?.keyField ?? "id"]: step.targetKey,
          ...(step.payload ?? {}),
        },
        capId,
      );
    } else {
      result = await app.submit(step.verb, step.targetKey, step.payload, capId);
    }
  } else {
    result = await app.submit(step.verb, step.targetKey, step.payload, capId);
  }

  const ctx: StepContext = {
    kernel,
    step,
    persona,
    result,
    getState: (key) => app.getState(key),
    listInstances: () => app.listInstances(),
    capturedEvents: [...capturedEvents],
    projectorSession,
  };
  const expectSuccess = step.expectSuccess ?? true;
  if (result.success !== expectSuccess)
    return {
      stepId: step.id,
      passed: false,
      error: expectSuccess
        ? `Expected success but got error: ${result.error}`
        : `Expected failure but step succeeded. New state: ${JSON.stringify(result.newState)}`,
      submitResult: { success: result.success, newState: result.newState, error: result.error },
      assertions: [],
    };
  const assertions = await Promise.all(
    step.assertions.map((assertion) => evalAssertion({ assertion, ctx })),
  );
  return {
    stepId: step.id,
    passed: assertions.every((a) => a.passed),
    submitResult: { success: result.success, newState: result.newState, error: result.error },
    assertions,
  };
}
