import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { resolve } from "path";

import { AlgebraicKernel, IntentProcessor, ModelLoader } from "../../../L13-facade/index.ts";
import type { ModelBoot, ModelDocument } from "../../../L09-demand/model-loader.ts";
import type { ActionType } from "../../../L13-facade/index.ts";
import { loadKindPack } from "../../../L11-projection/metamodel.ts";
import { ProjectionKernel } from "../../../L11-projection/projection-kernel.ts";
import { buildManifest } from "../../../L11-projection/dispatch.ts";
import type { ProjectionAsset, ProjectionKind } from "../../../L01-foundation/projection-types.ts";
import { decode } from "../../../L08-kinds/cli-stdout/arg-action.ts";
import cliDispatch from "../../../L08-kinds/cli-stdout/dispatch.ts";
import renderBadge from "../../../L08-kinds/cli-stdout/primitives/Badge.ts";
import renderHeading from "../../../L08-kinds/cli-stdout/primitives/Heading.ts";
import renderKV from "../../../L08-kinds/cli-stdout/primitives/KV.ts";
import renderPrompt from "../../../L08-kinds/cli-stdout/primitives/Prompt.ts";
import renderSpinner from "../../../L08-kinds/cli-stdout/primitives/Spinner.ts";
import renderTable from "../../../L08-kinds/cli-stdout/primitives/Table.ts";
import renderText from "../../../L08-kinds/cli-stdout/primitives/Text.ts";
import type { ProjectionSession } from "../../../L11-projection/session.ts";
import { CORE_MODEL } from "../core.model.ts";
import { ECOMMERCE_MODEL } from "../ecommerce.model.ts";

const PROJECTION_YAML = resolve(import.meta.dir, "./projection.yaml");
const CLI_KIND_DIR = resolve(import.meta.dir, "../../../L08-kinds/cli-stdout");
const ORDER_RECORDS = Bun.YAML.parse(
  readFileSync(resolve(import.meta.dir, "../seeds/orders.yaml"), "utf-8"),
) as Array<{ id: string; total: number }>;
const CLI_RENDERERS = new Map([
  ["Badge", renderBadge],
  ["Heading", renderHeading],
  ["KV", renderKV],
  ["Prompt", renderPrompt],
  ["Spinner", renderSpinner],
  ["Table", renderTable],
  ["Text", renderText],
] as const);

function makeHarness(extraCaps: Record<string, string> = {}): {
  app: ModelBoot;
  kernel: ProjectionKernel;
  session: ProjectionSession;
} {
  const ak = AlgebraicKernel.create();
  const loader = new ModelLoader(ak);
  const ip = new IntentProcessor(ak);
  loader.setIntentProcessor(ip);
  loader.loadModel(CORE_MODEL as ModelDocument);
  const app = loader.boot(ECOMMERCE_MODEL as ModelDocument);

  for (const order of ORDER_RECORDS) {
    app.setState(String(order.id), { status: "pending" });
  }

  const capabilities: Record<string, string> = {};
  for (const verb of Object.keys(app.actions)) {
    capabilities[verb] = app.issueCapability(verb, "test-user");
  }

  const kernel = new ProjectionKernel(app);
  const kind = loadKindPack(CLI_KIND_DIR) as Omit<ProjectionKind, "cid">;
  kernel.registerKind({ ...kind, cid: "test-cli.stdout-kind" });
  registerPrimitiveAssets(kernel, kind);
  kernel.loadYamlFile(PROJECTION_YAML);

  const session: ProjectionSession = {
    currentUser: { id: "test-user", capabilities: { ...capabilities, ...extraCaps } },
    route: { path: "/orders", params: {}, query: {} },
    ephemeral: new Map(),
  };
  kernel.setSession(session);
  kernel.setBinding(
    "orderRows",
    ORDER_RECORDS.map((order) => [
      String(order.id),
      "pending",
      `$${Number(order.total).toFixed(2)}`,
    ]),
  );
  kernel.setBinding("customer", { email: "ada@example.com" });

  return { app, kernel, session };
}

function renderStdout(kernel: ProjectionKernel, session: ProjectionSession, ansi: boolean): string {
  const tree = kernel.render("orders");
  return cliDispatch(
    tree,
    {
      pageName: "orders",
      route: session.route,
      currentUser: session.currentUser,
      bindings: new Map(),
      props: {},
      nodeIdCounter: { n: 0 },
      session,
    },
    { ansi },
    (component) => CLI_RENDERERS.get(component) ?? null,
  ).stdout;
}

describe("orders cli.stdout worked example", () => {
  test("renders every seeded order ID to stdout", () => {
    const { kernel, session } = makeHarness();
    const stdout = renderStdout(kernel, session, false);

    expect(Bun.YAML.parse(readFileSync(PROJECTION_YAML, "utf-8"))).toMatchObject({
      conformsTo: "adk:KernelMetamodel/1.0",
      conformsToKind: "kind://adk/cli.stdout/1.0",
      morphism: expect.any(Object),
    });
    for (const order of ORDER_RECORDS) {
      expect(stdout).toContain(String(order.id));
    }
  });

  test("decode(confirm ord-001) round-trips into a successful dispatch", async () => {
    const { app, kernel, session } = makeHarness();
    const doc = kernel.document!;
    const manifest = buildManifest(doc, collectModelActions(app));

    const decoded = decode({ command: ["confirm", "ord-001"], flags: {} }, manifest, session);

    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;

    const dispatched = await kernel.dispatch(decoded.frame);
    expect(dispatched.success).toBe(true);
    expect(app.getState("ord-001")).toMatchObject({ status: "confirmed" });
  });

  test("ansi off emits plain text with no escape sequences", () => {
    const { kernel, session } = makeHarness();
    const stdout = renderStdout(kernel, session, false);

    expect(stdout).not.toContain("\x1b[");
    expect(stdout).toContain("customer.email");
  });

  test("ansi on dims redacted customer.email when the session lacks cap://pii/view/1.0", () => {
    const { kernel, session } = makeHarness();
    const stdout = renderStdout(kernel, session, true);

    expect(stdout).toContain("customer.email: ada@example.com");
    expect(stdout).toContain("\x1b[2m");
    expect(stdout).toContain("\x1b[22m");
  });

  test("ansi on shows unguarded customer.email when the session has cap://pii/view/1.0", () => {
    const { kernel, session } = makeHarness({
      "cap://pii/view/1.0": "cid-pii-view",
    });
    const stdout = renderStdout(kernel, session, true);

    expect(stdout).toContain("customer.email: ada@example.com");
    expect(stdout).not.toContain("\x1b[2m");
  });
});

function collectModelActions(app: ModelBoot): Map<string, ActionType> {
  const out = new Map<string, ActionType>();
  for (const [verb, id] of Object.entries(app.actions)) {
    const name = String(id).match(/^action:\/\/[^/]+\/([^/]+)\/[^/]+$/)?.[1] ?? verb;
    out.set(name, {
      id,
      name,
      version: "1.0.0",
      verb,
      inputSchema:
        name === "PayOrder"
          ? {
              type: "object",
              required: ["id", "amount"],
              properties: { id: { type: "string" }, amount: { type: "number" } },
            }
          : {
              type: "object",
              required: ["id"],
              properties: { id: { type: "string" } },
            },
      targetMachine: app.stateMachineId ?? "",
      preconditions: [],
      origin: app.origin,
    });
  }
  return out;
}

function registerPrimitiveAssets(
  kernel: ProjectionKernel,
  kind: ProjectionKind & { primitiveAssets?: string[] },
): void {
  for (const relativePath of kind.primitiveAssets ?? []) {
    const asset = Bun.YAML.parse(
      readFileSync(resolve(CLI_KIND_DIR, relativePath), "utf-8"),
    ) as ProjectionAsset;
    kernel.registerAsset({ ...asset, cid: asset.cid ?? `test:${asset.name}` });
  }
}
