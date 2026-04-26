import { beforeAll, describe, expect, test } from "bun:test";
import { performance } from "node:perf_hooks";
import { readFileSync } from "node:fs";
import {
  AlgebraicKernel,
  CapabilityEngine,
  IntentProcessor,
  ModelLoader,
} from "../L13-facade/index.ts";
import type { ActionType, ModelBoot, ModelDocument } from "../L13-facade/index.ts";
import { CORE_MODEL_FIXTURE } from "../tests/kernel-fixtures/core.model.ts";
import { COMMERCE_MODEL_FIXTURE } from "../tests/kernel-fixtures/commerce.model.ts";
import { createMetaProjectionKernel } from "./bootstrap.ts";
import { createDefaultSession, type ProjectionSession } from "./session.ts";
import { CANONICAL_PARITY_CASES, type ParityInput } from "./parity-cases.ts";
import { runParity, type ProjectionKernelLike } from "./parity-harness.ts";

const KERNEL_MODEL_PATH = new URL("../L00-model/kernel.model.yaml", import.meta.url).pathname;
const ORDER_RECORDS = Bun.YAML.parse(
  readFileSync(new URL("../tests/kernel-fixtures/seeds/orders.yaml", import.meta.url), "utf-8"),
) as Array<{ id: string; status: string }>;
type ParityKernel = ProjectionKernelLike<ParityInput, unknown>;

let metaKernelA: ParityKernel;
let metaKernelB: ParityKernel;

describe("parity battery", () => {
  beforeAll(async () => {
    const { app, actionMap, capabilityEngine } = buildHarness();
    await createMetaProjectionKernel(app, { capabilityEngine, yamlPath: KERNEL_MODEL_PATH }).then(
      (kernel) => kernel.injectActionMap(actionMap),
    );
    await createMetaProjectionKernel(app, { capabilityEngine, yamlPath: KERNEL_MODEL_PATH }).then(
      (kernel) => kernel.injectActionMap(actionMap),
    );
    metaKernelA = makeParityKernel();
    metaKernelB = makeParityKernel();
  });

  test.each(CANONICAL_PARITY_CASES)("parity: $name", async ({ name, input, assert }) => {
    const report = await runParity(metaKernelA, metaKernelB, [{ name, input, assert }]);
    expect(report.failed.map((entry) => entry.name)).toEqual([]);
  });

  test("battery summary: zero divergences", async () => {
    const startedAt = performance.now();
    const report = await runParity(metaKernelA, metaKernelB, CANONICAL_PARITY_CASES);
    const elapsedMs = performance.now() - startedAt;
    console.log(
      `[parity-battery] ${CANONICAL_PARITY_CASES.length} cases in ${elapsedMs.toFixed(2)}ms`,
    );
    expect(report.passed).toBe(CANONICAL_PARITY_CASES.length);
    expect(report.failed).toEqual([]);
  });
});

function makeParityKernel(): ParityKernel {
  return {
    async dispatch(input: ParityInput): Promise<unknown> {
      const { app, actionMap, capabilityEngine } = buildHarness();
      const kernel = await createMetaProjectionKernel(app, {
        capabilityEngine,
        yamlPath: KERNEL_MODEL_PATH,
      });
      kernel.injectActionMap(actionMap);
      if (input.method === "compile") {
        const yamlText = readFileSync(input.yamlPath, "utf-8");
        return kernel.compile(yamlText);
      }
      if (input.method === "authorize") {
        return kernel.authorize(
          input.requires,
          sessionFor(input.sessionKey, app, capabilityEngine),
          input.ctx,
        );
      }
      if (input.yamlPath) kernel.loadYamlFile(input.yamlPath);
      else if (input.doc) kernel.loadDocument(clone(input.doc));
      if (input.method === "dispatch") {
        resetOrders(app, input.stateOverrides);
        kernel.setSession(sessionFor(input.sessionKey, app, capabilityEngine));
        return kernel.dispatch(input.frame);
      }
      kernel.setSession(sessionFor(input.sessionKey, app, capabilityEngine));
      for (const [name, value] of Object.entries(input.bindings ?? {}))
        kernel.setBinding(name, clone(value));
      return kernel.render(input.pageName);
    },
  };
}

function buildHarness(): {
  app: ModelBoot;
  actionMap: Map<string, ActionType>;
  capabilityEngine: CapabilityEngine;
} {
  const capabilityKernel = AlgebraicKernel.create();
  const capabilityEngine = new CapabilityEngine(capabilityKernel);
  const ak = AlgebraicKernel.create();
  const loader = new ModelLoader(ak);
  const intents = new IntentProcessor(ak);
  loader.setIntentProcessor(intents);
  loader.loadModel(CORE_MODEL_FIXTURE as ModelDocument);
  const app = loader.boot(COMMERCE_MODEL_FIXTURE as ModelDocument);
  resetOrders(app);
  const loaded = loader.getLoadedModel("commerce")!;
  const actionMap = new Map<string, ActionType>();
  for (const { name } of loaded.actionDefs) {
    actionMap.set(name, intents.resolveAction(`action://${loaded.origin}/${name}/1.0.0`));
  }
  return { app, actionMap, capabilityEngine };
}

function resetOrders(app: ModelBoot, overrides: Record<string, { status: string }> = {}): void {
  for (const order of ORDER_RECORDS) {
    app.setState(order.id, { status: order.status });
  }
  for (const [id, state] of Object.entries(overrides)) app.setState(id, state);
}

function sessionFor(
  key: string,
  app: ModelBoot,
  capabilityEngine: CapabilityEngine,
): ProjectionSession {
  const session = createDefaultSession();
  session.currentUser = { id: key, capabilities: capabilityBagFor(key, app, capabilityEngine) };
  session.route = { path: "/orders/ord-001", params: { id: "ord-001" }, query: {} };
  session.ephemeral = new Map();
  return session;
}

function capabilityBagFor(
  key: string,
  app: ModelBoot,
  capabilityEngine: CapabilityEngine,
): Record<string, string> {
  switch (key) {
    case "model-alice":
      return issueBag(app, capabilityEngine, key, ["confirm", "pay", "ship", "cancel"]);
    case "model-bob":
      return issueBag(app, capabilityEngine, key, ["confirm", "pay", "ship"]);
    case "api-bob":
      return issueBag(app, capabilityEngine, key, ["cap://commerce/orders/view/1.0"]);
    case "auth-abc":
      return issueBag(app, capabilityEngine, key, ["cap://a/read", "cap://b/read", "cap://c/read"]);
    default:
      return {};
  }
}

function issueBag(
  app: ModelBoot,
  capabilityEngine: CapabilityEngine,
  subject: string,
  caps: string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const cap of caps) {
    out[cap] = cap.startsWith("cap://")
      ? capabilityEngine.issue(cap, `kernel://${subject}`).id
      : app.issueCapability(cap, subject);
  }
  return out;
}

function clone<T>(value: T): T {
  return value === undefined ? value : (JSON.parse(JSON.stringify(value)) as T);
}
