import type { KernelExpression } from "../L04-expression/evaluator.ts";
import type { IntentProcessor } from "../L07-agency/intent.ts";
import { CapabilityEngine } from "../L07-agency/capability.ts";
import type { AlgebraicKernel } from "../L13-facade/kernel.export.ts";
import type { ActionDef, ModelBoot, ModelDocument, ModelLoadResult } from "./model-types.ts";

const eventPreviousState = (event: unknown) => {
  const rec = (event && typeof event === "object" ? event : {}) as {
    previousState?: unknown;
    data?: { previousState?: unknown };
  };
  return "previousState" in rec ? rec.previousState : rec.data?.previousState;
};

const eventNewState = (event: unknown) => {
  const rec = (event && typeof event === "object" ? event : {}) as {
    newState?: unknown;
    data?: { newState?: unknown };
  };
  return "newState" in rec ? rec.newState : rec.data?.newState;
};

const eventPayload = (event: unknown) => {
  const rec = (event && typeof event === "object" ? event : {}) as { data?: { payload?: unknown } };
  return "data" in rec ? (rec.data?.payload as Record<string, unknown> | undefined) : undefined;
};

export function normalizeActionDef(
  doc: ModelDocument,
  name: string,
  actionDef: ActionDef,
): ActionDef {
  const kind = actionDef.kind ?? "mutate";
  const source =
    (doc as ModelDocument & { __sourceFile?: string }).__sourceFile ?? `model ${doc.model}`;
  const fail = (field: string, detail?: string): never => {
    const suffix = detail ? ` ${detail}` : "";
    throw new Error(`${source}: action ${name} requires ${field} for kind '${kind}'.${suffix}`);
  };

  if (kind === "remove" && actionDef.kind !== undefined && !actionDef.targetField) {
    fail("targetField");
  }
  if (kind === "batch") {
    if (actionDef.selector === undefined || actionDef.selector === null) fail("selector");
    const selectorValid =
      typeof actionDef.selector === "string" ||
      (typeof actionDef.selector === "object" && !Array.isArray(actionDef.selector));
    if (!selectorValid) {
      fail("selector", "Selector must be a string binding reference or a plain-object morphism.");
    }
    if (!actionDef.submit) fail("submit");
  }

  return {
    ...actionDef,
    kind,
    inputSchema: actionDef.inputSchema ?? { type: "object" },
    keyStrategy: kind === "create" ? (actionDef.keyStrategy ?? "uuid") : actionDef.keyStrategy,
  };
}

export function registerModelActions(
  model: ModelLoadResult,
  intentProcessor: IntentProcessor,
): string[] {
  return model.actionDefs.map(
    ({ name, def }) =>
      intentProcessor.defineAction(name, "1.0.0", {
        verb: def.verb,
        inputSchema: def.inputSchema,
        targetMachine:
          def.targetMachine === null
            ? undefined
            : (def.targetMachine ?? model.statemachineId ?? undefined),
        entity:
          def.targetMachine === null || (!("targetMachine" in def) && !model.statemachineId)
            ? Object.keys(model.document.entities ?? {})[0]
            : undefined,
        kind: def.kind,
        targetField: def.targetField,
        keyField: def.keyField,
        keyStrategy: def.keyStrategy,
        defaults: def.defaults,
        selector: def.selector,
        submit: def.submit,
        origin: model.origin,
      }).id,
  );
}

export function createModelBoot(
  kernel: AlgebraicKernel,
  intentProcessor: IntentProcessor,
  result: ModelLoadResult,
): ModelBoot {
  const capEngine = new CapabilityEngine(kernel);
  const stateByKey = new Map<string, unknown>();
  const actionIds = registerModelActions(result, intentProcessor);
  const actionsByVerb: Record<string, string> = {};
  const actionDefsByName = new Map(result.actionDefs.map(({ name, def }) => [name, def]));
  const actionDefsByVerb = new Map(result.actionDefs.map(({ def }) => [def.verb, def]));

  for (const { name, def } of result.actionDefs) {
    const id = actionIds.find((actionId) => actionId.includes(`/${name}/`));
    if (id) actionsByVerb[def.verb] = id;
  }

  let boot!: ModelBoot;
  boot = {
    origin: result.origin,
    types: result.typesRegistered,
    stateMachineId: result.statemachineId,
    actions: actionsByVerb,
    kernel,
    getActionDef: (ref) => actionDefsByName.get(ref),
    issueCapability: (verb, issuerId, caveats) => {
      const actionRef = actionsByVerb[verb] ?? (verb.startsWith("cap://") ? verb : null);
      if (!actionRef) throw new Error(`No action for verb "${verb}"`);
      return capEngine.issue(actionRef, issuerId, {
        caveats: caveats as KernelExpression[] | undefined,
      }).id;
    },
    submit: async (verb, targetKey, payload, capabilityId) => {
      const actionId = actionsByVerb[verb];
      if (!actionId) {
        return {
          success: false,
          error: `No action for verb "${verb}". Available: ${Object.keys(actionsByVerb).join(", ")}`,
          events: [],
        };
      }

      const actionDef = actionDefsByVerb.get(verb);
      const removeEntity =
        actionDef?.targetMachine === null ||
        (!("targetMachine" in (actionDef ?? {})) && !result.statemachineId)
          ? Object.keys(result.document.entities ?? {})[0]
          : undefined;
      if (actionDef?.kind === "remove") {
        stateByKey.delete(targetKey);
        intentProcessor.removeState(targetKey, { entity: removeEntity });
        return { success: true, newState: undefined, events: [] };
      }

      const rawPayload = payload ?? {};
      const intentPayload =
        actionDef?.kind === "create" ? rawPayload : { id: targetKey, ...rawPayload };

      if (capabilityId) {
        const authResult = capEngine.authorize(
          {
            id: "intent-" + Date.now(),
            action: actionId,
            target: result.statemachineId!,
            targetKey,
            payload: intentPayload,
            timestamp: new Date().toISOString(),
          },
          capabilityId,
        );
        if (!authResult.authorized) {
          return {
            success: false,
            error: `Authorization denied: ${authResult.error ?? authResult.failedCaveat ?? "capability check failed"}`,
            events: [],
          };
        }
      }

      const intentResult = await intentProcessor.submit({
        action: actionId,
        target: result.statemachineId!,
        targetKey,
        payload: intentPayload,
      });
      if (intentResult.success) stateByKey.set(targetKey, intentResult.newState);
      return {
        success: intentResult.success,
        newState: intentResult.newState,
        error: intentResult.error,
        events: intentResult.emittedEvents.map((event) => ({
          id: event.id,
          previousState: eventPreviousState(event),
          newState: eventNewState(event),
        })),
      };
    },
    batch: async (calls) => {
      const tx = intentProcessor.beginTransaction();
      const stateSnapshot = new Map(stateByKey);
      try {
        for (const { verb, target, payload } of calls) {
          const next = await boot.submit(verb, target, payload ?? {});
          if (!next.success)
            throw new Error(next.error ?? `Batch submit failed for verb "${verb}"`);
        }
        intentProcessor.commitTransaction(tx);
      } catch (error) {
        intentProcessor.rollbackTransaction(tx);
        stateByKey.clear();
        for (const [key, value] of stateSnapshot) stateByKey.set(key, value);
        throw error;
      }
    },
    setState: (targetKey, state) => {
      stateByKey.set(targetKey, state);
      intentProcessor.setState(targetKey, state);
    },
    getState: (targetKey) => (stateByKey.has(targetKey) ? stateByKey.get(targetKey) : undefined),
    readStoreForBinding: (bindingName, targetKey) =>
      intentProcessor.readStoreForBinding(bindingName, targetKey),
    listStoreForBinding: (bindingName) => intentProcessor.listStoreForBinding(bindingName),
    currentStateForMachine: (machineId, aggregateKey) =>
      intentProcessor.currentStateForMachine(machineId, aggregateKey),
    removeInstance: (targetKey) => {
      const removeEntity = result.statemachineId
        ? undefined
        : Object.keys(result.document.entities ?? {})[0];
      stateByKey.delete(targetKey);
      intentProcessor.removeState(targetKey, {
        entity: removeEntity,
        targetMachine: result.statemachineId ?? undefined,
      });
    },
    listStateKeys: () => [...stateByKey.keys()],
    listInstances: () => [...stateByKey.entries()].map(([key, state]) => ({ key, state })),
    onEvent: (handler) =>
      intentProcessor.onEvent((event) => {
        if (event.kind === "transactionCommitted") {
          handler({
            id: event.id,
            kind: "transactionCommitted",
            action: "transactionCommitted",
            targetKey: "",
            previousState: undefined,
            newState: undefined,
            timestamp: event.timestamp,
            events: event.events.map((entry) => {
              const payload = eventPayload(entry);
              return {
                id: entry.id,
                kind: entry.kind,
                action: "type" in entry ? entry.type : "removed",
                targetKey:
                  "targetKey" in entry
                    ? entry.targetKey
                    : ((payload?.targetKey as string) ?? (payload?.id as string) ?? "?"),
                previousState: eventPreviousState(entry),
                newState: eventNewState(entry),
              };
            }),
          });
          return;
        }

        const payload = eventPayload(event);
        const targetKey =
          "targetKey" in event
            ? event.targetKey
            : ((payload?.targetKey as string) ?? (payload?.id as string) ?? "?");
        const previousState = eventPreviousState(event);
        const newState = eventNewState(event);
        if (targetKey !== "?") {
          if (event.kind === "removed") stateByKey.delete(targetKey);
          else stateByKey.set(targetKey, newState);
        }
        handler({
          id: event.id,
          kind: event.kind,
          action: "type" in event ? event.type : "removed",
          targetKey,
          previousState,
          newState,
          events: [],
        });
      }),
  };
  return boot;
}
