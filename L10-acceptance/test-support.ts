import { existsSync, mkdirSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { resolve } from "path";
import type {
  ProjectionModel,
  ProjectionNode,
  ProjectionTree,
} from "../L01-foundation/projection-types.ts";
import type { ModelBoot, ModelDocument } from "../L09-demand/model-loader.ts";
import { registerApiRestSurfaceHandlers } from "../L08-kinds/api-rest/surface-handlers.ts";
import { registerCliStdoutSurfaceHandlers } from "../L08-kinds/cli-stdout/surface-handlers.ts";
import { AlgebraicKernel, IntentProcessor, ModelLoader } from "../L13-facade/index.ts";
import {
  AcceptanceEngine,
  ProjectorSession,
  type AcceptanceSuite,
  type Assertion,
  type Persona,
  type Scenario,
  type Step,
} from "./acceptance.ts";

registerApiRestSurfaceHandlers();
registerCliStdoutSurfaceHandlers();

const TEST_MODEL: ModelDocument = {
  model: "mini-ecom",
  version: "1.0.0",
  origin: "https://test.mini.example",
  lifecycle: {
    states: ["pending", "confirmed", "paid", "shipped", "delivered", "cancelled"],
    initial: "pending",
    terminal: ["delivered", "cancelled"],
    transitions: [
      { from: "pending", to: "confirmed", verb: "confirm" },
      { from: "confirmed", to: "paid", verb: "pay" },
      { from: "paid", to: "shipped", verb: "ship" },
      { from: "shipped", to: "delivered", verb: "deliver" },
      { from: "pending", to: "cancelled", verb: "cancel" },
      { from: "confirmed", to: "cancelled", verb: "cancel" },
    ],
  },
  actions: {
    ConfirmOrder: {
      verb: "confirm",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    },
    PayOrder: {
      verb: "pay",
      inputSchema: {
        type: "object",
        required: ["id", "amount"],
        properties: { id: { type: "string" }, amount: { type: "number", minimum: 0 } },
      },
    },
    ShipOrder: {
      verb: "ship",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    },
    DeliverOrder: {
      verb: "deliver",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    },
    CancelOrder: {
      verb: "cancel",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    },
  },
};

export function bootTestApp(): ModelBoot {
  const ak = AlgebraicKernel.create();
  const loader = new ModelLoader(ak);
  loader.setIntentProcessor(new IntentProcessor(ak));
  return loader.boot(TEST_MODEL);
}

export function buildSuite(scenarios: Scenario[], personas?: Persona[]): AcceptanceSuite {
  return {
    id: "test-suite",
    name: "Test Suite",
    modelId: "mini-ecom",
    modelVersion: "1.0.0",
    personas: personas ?? [
      {
        id: "alice",
        name: "Alice",
        role: "customer",
        verbs: ["confirm", "cancel"],
        capabilities: {},
      },
      { id: "bob", name: "Bob", role: "warehouse", verbs: ["ship", "deliver"], capabilities: {} },
      { id: "pay", name: "Payment", role: "payment-system", verbs: ["pay"], capabilities: {} },
      {
        id: "admin",
        name: "Admin",
        role: "admin",
        verbs: ["confirm", "pay", "ship", "deliver", "cancel"],
        capabilities: {},
      },
    ],
    seeds: [
      { targetKey: "ord-001", state: { status: "pending" } },
      { targetKey: "ord-002", state: { status: "pending" } },
    ],
    useCases: [{ id: "uc-test", name: "Test", scenarios }],
  };
}

export function makeStep(id: string, overrides: Partial<Step> = {}): Step {
  return {
    id,
    personaId: "alice",
    verb: "confirm",
    targetKey: "k",
    assertions: [],
    ...overrides,
  };
}

export function createTempDir(prefix: string): string {
  const dir = resolve(tmpdir(), `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

export function writeYaml(dir: string, filename: string, contents: string): string {
  const file = resolve(dir, filename);
  writeFileSync(file, contents);
  return file;
}

export async function runSurfaceAssertion(
  assertion: Assertion,
  projectorSession: ProjectorSession,
) {
  const engine = new AcceptanceEngine(bootTestApp());
  const scenario: Scenario = {
    id: "surface-scenario",
    name: "Surface scenario",
    seedKeys: ["ord-001"],
    root: {
      id: "surface-step",
      personaId: "alice",
      verb: "confirm",
      targetKey: "ord-001",
      assertions: [assertion],
    },
  };

  engine.setSuite(buildSuite([scenario]));
  return (await engine.run({ projectorSession })).useCases[0].scenarios[0].traces[0].steps[0]
    .assertions[0];
}

export function makeProjectionModel(): ProjectionModel {
  return {
    projector: "orders",
    version: "1.0.0",
    bindsModel: "mini-ecom@1.0.0",
    session: {
      scope: "acceptance-test",
    },
    pages: {
      index: {
        children: [],
      },
    },
  };
}

export function makeNode(
  component: string,
  props: Record<string, unknown> = {},
  children: ProjectionNode[] = [],
  nodeId?: string,
): ProjectionNode {
  return {
    component,
    props,
    children,
    ...(nodeId ? { nodeId } : {}),
  };
}

export function makeTree(
  root: ProjectionNode,
  actionHandlers: ProjectionTree["actionHandlers"] = [],
): ProjectionTree {
  return {
    root,
    pageName: "index",
    actionHandlers,
  };
}

export function makeUiSession(
  tree: ProjectionTree,
  sessionCaps: Record<string, string> = {},
): ProjectorSession {
  const stub = makeStubKernel(tree);
  return new ProjectorSession({
    kernel: stub.kernel,
    projection: makeProjectionModel(),
    surface: "ui.html.ws",
    sessionCaps,
  });
}

export function makeApiSession(
  tree: ProjectionTree,
  sessionCaps: Record<string, string> = {},
): ProjectorSession {
  const stub = makeStubKernel(tree);
  return new ProjectorSession({
    kernel: stub.kernel,
    projection: makeProjectionModel(),
    surface: "api.rest",
    sessionCaps,
  });
}

export function makeCliSession(
  tree: ProjectionTree,
  sessionCaps: Record<string, string> = {},
): ProjectorSession {
  const stub = makeStubKernel(tree);
  return new ProjectorSession({
    kernel: stub.kernel,
    projection: makeProjectionModel(),
    surface: "cli.stdout",
    sessionCaps,
  });
}

export function makeStubKernel(
  initialTree: ProjectionTree,
  opts: { onDispatch?: (frame: unknown) => void } = {},
): {
  kernel: ProjectorSession["kernel"];
  dispatchCalls: unknown[];
  setTree: (tree: ProjectionTree) => void;
} {
  let tree = initialTree;
  let session = {
    currentUser: { id: "anonymous", capabilities: {} as Record<string, string> },
    route: { path: "/", params: {}, query: {} },
    ephemeral: new Map<string, unknown>(),
  };
  const dispatchCalls: unknown[] = [];

  return {
    kernel: {
      render: () => tree,
      dispatch: (frame: unknown) => {
        dispatchCalls.push(frame);
        opts.onDispatch?.(frame);
        return {
          kind: "model",
          success: true,
          intentResult: {
            success: true,
            newState: { status: "confirmed" },
            events: [],
          },
        };
      },
      defaultPageName: () => "index",
      setSession: (partial: Partial<typeof session>) => {
        session = {
          ...session,
          ...partial,
          currentUser: {
            ...session.currentUser,
            ...(partial.currentUser ?? {}),
          },
          route: {
            ...session.route,
            ...(partial.route ?? {}),
          },
        };
      },
      getSession: () => session,
    } as unknown as ProjectorSession["kernel"],
    dispatchCalls,
    setTree: (nextTree: ProjectionTree) => {
      tree = nextTree;
    },
  };
}
