import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { surveyCapabilityRequirements } from "./capability-enforcement.ts";
import type { CapabilityRequirement, ProjectionModel } from "../L01-foundation/projection-types.ts";
import { AlgebraicKernel, CapabilityEngine } from "../L13-facade/index.ts";
import { loadKernelModel, type ProjectionKernelRuntime } from "./bootstrap.ts";
import { __setEngine } from "./morphisms/verify-one.ts";

const MODEL_PATH = resolve(import.meta.dir, "..", "L00-model", "kernel.model.yaml");
const FIXTURE_PATHS = [
  "../tests/kernel-fixtures/projections/dashboard.yaml",
  "../tests/kernel-fixtures/projections/api.yaml",
  "../tests/kernel-fixtures/projections/cli.yaml",
] as const;
const sessionDecl = { scope: "test" } as const;

describe("surveyCapabilities algebra", () => {
  let capabilityEngine: CapabilityEngine;

  beforeEach(() => {
    capabilityEngine = new CapabilityEngine(AlgebraicKernel.create());
    __setEngine(capabilityEngine);
  });

  afterEach(() => {
    __setEngine(undefined);
  });

  afterAll(() => {
    __setEngine(undefined);
  });

  test("returns an empty requirement list for an empty projection model", async () => {
    const runtime = await makeRuntime(capabilityEngine);
    const result = await survey(runtime, {
      projector: "empty",
      version: "1.0.0",
      session: sessionDecl,
      bindsModel: "demo@1.0.0",
    });
    expect(result).toEqual([]);
  });

  test("emits one action requirement for a component action binding", async () => {
    const runtime = await makeRuntime(capabilityEngine);
    const result = await survey(runtime, {
      projector: "action-only",
      version: "1.0.0",
      session: sessionDecl,
      bindsModel: "demo@1.0.0",
      pages: {
        p: { children: [{ component: "Button", onClick: { action: "x", requires: ["cap-a"] } }] },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      scope: "action",
      nodePath: "pages.p.children[0].onClick",
      caps: ["cap-a"],
      combinator: "all",
    });
  });

  test("emits separate requirements for projection and binding scopes", async () => {
    const runtime = await makeRuntime(capabilityEngine);
    const result = normalize(
      await survey(runtime, {
        projector: "multi-scope",
        version: "1.0.0",
        session: sessionDecl,
        bindsModel: "demo@1.0.0",
        requires: ["cap-p"],
        pages: { p: { bind: { order: { source: { value: "1" }, requires: ["cap-b"] } } } },
      }),
    );
    expect(result).toEqual([
      { scope: "binding", nodePath: "pages.p.bind.order", caps: ["cap-b"], combinator: "all" },
      { scope: "projection", nodePath: "$", caps: ["cap-p"], combinator: "all" },
    ]);
  });

  test("preserves nested child depth in node paths", async () => {
    const runtime = await makeRuntime(capabilityEngine);
    const result = await survey(runtime, {
      projector: "nested",
      version: "1.0.0",
      session: sessionDecl,
      bindsModel: "demo@1.0.0",
      pages: {
        p: {
          children: [
            { component: "Stack", children: [{ component: "Text", requires: ["cap-inner"] }] },
          ],
        },
      },
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.nodePath).toContain("pages.p.children[0].children[0]");
    expect(result[0]?.caps).toEqual(["cap-inner"]);
  });

  test("matches the imperative survey for three canonical projection fixtures", async () => {
    const runtime = await makeRuntime(capabilityEngine);
    for (const fixturePath of FIXTURE_PATHS) {
      const doc = loadFixture(fixturePath);
      const imperative = surveyCapabilityRequirements(doc);
      const algebra = await runtime.dispatch({ ref: "SurveyCapabilities", payload: doc });
      expect(algebra.success).toBe(true);
      expect(normalize(algebra.value as CapabilityRequirement[])).toEqual(normalize(imperative));
    }
  });

  test("survey output composes with Authorize without extra glue", async () => {
    const runtime = await makeRuntime(capabilityEngine);
    const session = { currentUser: { id: "u1", capabilities: {} as Record<string, string> } };
    const [entry] = await survey(runtime, {
      projector: "round-trip",
      version: "1.0.0",
      session: sessionDecl,
      bindsModel: "demo@1.0.0",
      requires: ["cap-a"],
    });
    const denied = await runtime.dispatch({
      ref: "Authorize",
      payload: { requires: entry!.caps, session, scope: entry!.scope, nodePath: entry!.nodePath },
    });
    expect(denied.success).toBe(true);
    expect((denied.value as { outcome: string }).outcome).toBe("deny");

    const issued = capabilityEngine.issue("cap-a", "kernel://test");
    session.currentUser.capabilities["cap-a"] = issued.id;
    const allowed = await runtime.dispatch({
      ref: "Authorize",
      payload: { requires: entry!.caps, session, scope: entry!.scope, nodePath: entry!.nodePath },
    });
    expect(allowed.success).toBe(true);
    expect(allowed.value).toEqual({ outcome: "allow" });
  });
});

async function makeRuntime(capabilityEngine: CapabilityEngine): Promise<ProjectionKernelRuntime> {
  __setEngine(capabilityEngine);
  return loadKernelModel(MODEL_PATH, { kernel: AlgebraicKernel.create(), capabilityEngine });
}

async function survey(
  runtime: ProjectionKernelRuntime,
  doc: ProjectionModel,
): Promise<CapabilityRequirement[]> {
  const result = await runtime.dispatch({
    ref: "SurveyCapabilities",
    payload: doc as Record<string, unknown>,
  });
  expect(result.success).toBe(true);
  return result.value as CapabilityRequirement[];
}

function normalize(entries: CapabilityRequirement[]): CapabilityRequirement[] {
  return [...entries].sort((a, b) =>
    [a.scope, a.nodePath, a.combinator, a.caps.join(",")]
      .join("|")
      .localeCompare([b.scope, b.nodePath, b.combinator, b.caps.join(",")].join("|")),
  );
}

function loadFixture(relativePath: string): ProjectionModel {
  return Bun.YAML.parse(
    readFileSync(resolve(import.meta.dir, relativePath), "utf-8"),
  ) as ProjectionModel;
}
