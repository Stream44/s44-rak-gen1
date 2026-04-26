import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { AlgebraicKernel, CapabilityEngine } from "../L13-facade/index.ts";
import { authorizeRequirements } from "./capability-enforcement.ts";
import { loadKernelModel, type ProjectionKernelRuntime } from "./bootstrap.ts";
import lookupCap from "./morphisms/lookup-cap.ts";
import verifyOne, { __setEngine } from "./morphisms/verify-one.ts";

const MODEL_PATH = resolve(import.meta.dir, "..", "L00-model", "kernel.model.yaml");

type Scope = "projection" | "page" | "route" | "component" | "asset" | "binding" | "action";

interface Session {
  currentUser: {
    id: string;
    capabilities: Record<string, string>;
  };
}

interface AuthorizeInput {
  requires: string[];
  requiresAny?: string[];
  session: Session;
  scope: Scope;
  nodePath: string;
}

describe("authorize algebra", () => {
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

  test("allows when requires is empty", async () => {
    const runtime = await makeRuntime(capabilityEngine);

    const result = await dispatchAuthorize(runtime, {
      requires: [],
      session: { currentUser: { id: "u1", capabilities: {} } },
      scope: "projection",
      nodePath: "$",
    });

    expect(result).toEqual({ outcome: "allow" });
  });

  test("allows a single required cap when the session holds it and Layer 24 authorizes it", async () => {
    const runtime = await makeRuntime(capabilityEngine);
    const issued = capabilityEngine.issue("cap-a", "kernel://test");
    const session = sessionWith("u1", { "cap-a": issued.id });

    const result = await dispatchAuthorize(runtime, {
      requires: ["cap-a"],
      session,
      scope: "projection",
      nodePath: "$",
    });

    expect(result).toEqual({ outcome: "allow" });
  });

  test("denies a single required cap when the session is missing it", async () => {
    const runtime = await makeRuntime(capabilityEngine);

    const result = await dispatchAuthorize(runtime, {
      requires: ["cap-a"],
      session: sessionWith("u1"),
      scope: "component",
      nodePath: "pages.home",
    });

    expect(result).toEqual({
      outcome: "deny",
      reason: "missing capabilities",
      missing: ["cap-a"],
      scope: "component",
      nodePath: "pages.home",
    });
  });

  test("allows multiple required caps when all are present and authorized", async () => {
    const runtime = await makeRuntime(capabilityEngine);
    const capA = capabilityEngine.issue("cap-a", "kernel://test");
    const capB = capabilityEngine.issue("cap-b", "kernel://test");

    const result = await dispatchAuthorize(runtime, {
      requires: ["cap-a", "cap-b"],
      session: sessionWith("u1", { "cap-a": capA.id, "cap-b": capB.id }),
      scope: "projection",
      nodePath: "$",
    });

    expect(result).toEqual({ outcome: "allow" });
  });

  test("denies multiple required caps with only the missing URIs listed", async () => {
    const runtime = await makeRuntime(capabilityEngine);
    const capA = capabilityEngine.issue("cap-a", "kernel://test");

    const result = await dispatchAuthorize(runtime, {
      requires: ["cap-a", "cap-b", "cap-c"],
      session: sessionWith("u1", { "cap-a": capA.id }),
      scope: "page",
      nodePath: "pages.orders",
    });

    expect(result.outcome).toBe("deny");
    expect([...result.missing].sort()).toEqual(["cap-b", "cap-c"]);
  });

  test("lookupCap returns undefined for missing entries and the bound cap id for present entries", () => {
    expect(
      lookupCap({
        session: sessionWith("u"),
        capUri: "cap-z",
      }),
    ).toBeUndefined();
    expect(
      lookupCap({
        session: sessionWith("u", { "cap-z": "held-cap" }),
        capUri: "cap-z",
      }),
    ).toBe("held-cap");
  });

  test("verifyOne delegates to Layer 24 and returns false for missing or invalid caps", () => {
    const issued = capabilityEngine.issue("cap-a", "kernel://test");

    expect(verifyOne({ capId: issued.id, resourceUri: "cap-a", subject: "u" })).toBe(true);
    expect(verifyOne({ capId: "bogus-cap-id", resourceUri: "cap-a", subject: "u" })).toBe(false);
    expect(verifyOne({ capId: undefined, resourceUri: "cap-a", subject: "u" })).toBe(false);
  });

  test("matches authorizeRequirements byte-for-byte for four canonical input triples", async () => {
    const runtime = await makeRuntime(capabilityEngine);
    const capA = capabilityEngine.issue("cap-a", "kernel://test");
    const capB = capabilityEngine.issue("cap-b", "kernel://test");
    const triples: AuthorizeInput[] = [
      {
        requires: [],
        session: sessionWith("u1"),
        scope: "projection",
        nodePath: "$",
      },
      {
        requires: ["cap-a"],
        session: sessionWith("u1", { "cap-a": capA.id }),
        scope: "projection",
        nodePath: "$",
      },
      {
        requires: ["cap-a"],
        session: sessionWith("u1"),
        scope: "component",
        nodePath: "pages.home",
      },
      {
        requires: ["cap-a", "cap-b", "cap-c"],
        session: sessionWith("u1", { "cap-a": capA.id, "cap-b": capB.id }),
        scope: "page",
        nodePath: "pages.orders",
      },
    ];

    for (const input of triples) {
      const algebraVerdict = await dispatchAuthorize(runtime, input);
      const imperativeVerdict = authorizeRequirements(
        input.requires,
        input.session,
        { scope: input.scope, nodePath: input.nodePath, requiresAny: input.requiresAny },
        capabilityEngine,
      );
      expect(JSON.stringify(algebraVerdict)).toBe(JSON.stringify(imperativeVerdict));
    }
  });
});

async function makeRuntime(capabilityEngine: CapabilityEngine): Promise<ProjectionKernelRuntime> {
  __setEngine(capabilityEngine);
  return loadKernelModel(MODEL_PATH, {
    kernel: AlgebraicKernel.create(),
    capabilityEngine,
  });
}

async function dispatchAuthorize(
  runtime: ProjectionKernelRuntime,
  input: AuthorizeInput,
): Promise<
  | { outcome: "allow" }
  | { outcome: "deny"; reason: string; missing: string[]; scope: Scope; nodePath: string }
> {
  const result = await runtime.dispatch({ ref: "Authorize", payload: input });
  expect(result.success).toBe(true);
  return result.value as
    | { outcome: "allow" }
    | { outcome: "deny"; reason: string; missing: string[]; scope: Scope; nodePath: string };
}

function sessionWith(id: string, capabilities: Record<string, string> = {}): Session {
  return {
    currentUser: {
      id,
      capabilities,
    },
  };
}
