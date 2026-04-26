import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";

import { createMetaProjectionKernel } from "../bootstrap.ts";
import { authorizeRequirements, surveyCapabilityRequirements } from "../capability-enforcement.ts";
import type { ProjectorDocument } from "../../L01-foundation/projection-types.ts";

const KERNEL_MODEL_PATH = resolve(import.meta.dir, "..", "..", "L00-model", "kernel.model.yaml");

const baseSession = {
  currentUser: { id: "user-1", capabilities: {} as Record<string, string> },
};

const allowEngine = {
  authorizeResource: (_capId: string, _resourceId: string, _subject: { id: string }) => ({
    authorized: true,
  }),
};

describe("authorizeRequirements", () => {
  test("allows when both requires lists are empty or undefined", () => {
    expect(
      authorizeRequirements(
        undefined,
        baseSession,
        {
          scope: "projection",
          nodePath: "$",
        },
        allowEngine,
      ),
    ).toEqual({ outcome: "allow" });

    expect(
      authorizeRequirements(
        [],
        baseSession,
        {
          scope: "projection",
          nodePath: "$",
          requiresAny: [],
        },
        allowEngine,
      ),
    ).toEqual({ outcome: "allow" });
  });

  test("denies when the session does not hold a required capability", () => {
    expect(
      authorizeRequirements(
        ["cap://read/orders"],
        baseSession,
        {
          scope: "component",
          nodePath: "pages.home.children[0]",
        },
        allowEngine,
      ),
    ).toEqual({
      outcome: "deny",
      reason: "missing capabilities",
      missing: ["cap://read/orders"],
      scope: "component",
      nodePath: "pages.home.children[0]",
    });
  });

  test("allows when the held capability passes Layer 24 authorization", () => {
    const session = {
      currentUser: {
        id: "user-1",
        capabilities: { "cap://read/orders": "held-cap-1" },
      },
    };

    expect(
      authorizeRequirements(
        ["cap://read/orders"],
        session,
        {
          scope: "projection",
          nodePath: "$",
        },
        allowEngine,
      ),
    ).toEqual({ outcome: "allow" });
  });

  test("denies when Layer 24 rejects a held capability", () => {
    const session = {
      currentUser: {
        id: "user-1",
        capabilities: { "cap://read/orders": "held-cap-1" },
      },
    };
    const denyEngine = {
      authorizeResource: (_capId: string, _resourceId: string, _subject: { id: string }) => ({
        authorized: false,
        error: "expired",
      }),
    };

    expect(
      authorizeRequirements(
        ["cap://read/orders"],
        session,
        {
          scope: "route",
          nodePath: "routes[0]",
        },
        denyEngine,
      ),
    ).toEqual({
      outcome: "deny",
      reason: "missing capabilities",
      missing: ["cap://read/orders"],
      scope: "route",
      nodePath: "routes[0]",
    });
  });

  test("supports OR semantics through requiresAny", () => {
    const session = {
      currentUser: {
        id: "user-1",
        capabilities: { "cap://read/b": "held-cap-b" },
      },
    };

    expect(
      authorizeRequirements(
        undefined,
        session,
        {
          scope: "component",
          nodePath: "pages.home.children[0]",
          requiresAny: ["cap://read/a", "cap://read/b"],
        },
        allowEngine,
      ),
    ).toEqual({ outcome: "allow" });
  });

  test("combines AND and OR requirements correctly", () => {
    const partialSession = {
      currentUser: {
        id: "user-1",
        capabilities: { "cap://read/b": "held-cap-b" },
      },
    };
    const fullSession = {
      currentUser: {
        id: "user-1",
        capabilities: {
          "cap://read/a": "held-cap-a",
          "cap://read/b": "held-cap-b",
        },
      },
    };

    expect(
      authorizeRequirements(
        ["cap://read/a"],
        partialSession,
        {
          scope: "projection",
          nodePath: "$",
          requiresAny: ["cap://read/b", "cap://read/c"],
        },
        allowEngine,
      ),
    ).toEqual({
      outcome: "deny",
      reason: "missing capabilities",
      missing: ["cap://read/a"],
      scope: "projection",
      nodePath: "$",
    });

    expect(
      authorizeRequirements(
        ["cap://read/a"],
        fullSession,
        {
          scope: "projection",
          nodePath: "$",
          requiresAny: ["cap://read/b", "cap://read/c"],
        },
        allowEngine,
      ),
    ).toEqual({ outcome: "allow" });
  });
});

describe("surveyCapabilityRequirements", () => {
  test("collects projection, binding, and action requirements with their scopes", () => {
    const doc: ProjectorDocument = {
      projector: "cap-survey",
      version: "0.1.0",
      session: { scope: "cap-survey" },
      bindsModel: "",
      conformsToKind: "ui.html.ws",
      requires: ["cap://projection/read"],
      pages: {
        home: {
          bind: {
            orders: {
              demand: "Order",
              requires: ["cap://binding/orders"],
            } as unknown,
          },
          children: [
            {
              component: "Button",
              props: { label: "Open" },
              onClick: {
                action: "OpenOrders",
                requiresAny: ["cap://action/open", "cap://action/admin"],
              } as any,
            },
          ],
        },
      },
      actions: [{ name: "OpenOrders", kind: "custom" }],
    };

    expect(surveyCapabilityRequirements(doc)).toEqual([
      {
        scope: "projection",
        nodePath: "$",
        caps: ["cap://projection/read"],
        combinator: "all",
      },
      {
        scope: "binding",
        nodePath: "pages.home.bind.orders",
        caps: ["cap://binding/orders"],
        combinator: "all",
      },
      {
        scope: "action",
        nodePath: "pages.home.children[0].onClick",
        caps: ["cap://action/open", "cap://action/admin"],
        combinator: "any",
      },
    ]);
  });

  test("preserves depth-first pre-order source order", () => {
    const doc: ProjectorDocument = {
      projector: "cap-order",
      version: "0.1.0",
      session: { scope: "cap-order" },
      bindsModel: "",
      conformsToKind: "ui.html.ws",
      requires: ["cap://projection"],
      pages: {
        home: {
          bind: {
            summary: {
              requires: ["cap://binding"],
            } as unknown,
          },
          children: [
            {
              component: "Card",
              requires: ["cap://component"],
              onClick: {
                action: "Inspect",
                requires: ["cap://action"],
              } as any,
            } as any,
          ],
        },
      },
      actions: [{ name: "Inspect", kind: "custom" }],
    };

    expect(
      surveyCapabilityRequirements(doc).map((entry) => `${entry.scope}:${entry.nodePath}`),
    ).toEqual([
      "projection:$",
      "binding:pages.home.bind.summary",
      "component:pages.home.children[0]",
      "action:pages.home.children[0].onClick",
    ]);
  });
});

// Traceability note: this test artifact was adopted into the current tree.
test("MetaProjectionKernel integrates authorize and surveyCapabilities", async () => {
  const projector = await createMetaProjectionKernel(null, {
    capabilityEngine: allowEngine,
    yamlPath: KERNEL_MODEL_PATH,
  });
  const doc: ProjectorDocument = {
    projector: "cap-projector",
    version: "0.1.0",
    session: { scope: "cap-projector" },
    bindsModel: "",
    conformsToKind: "ui.html.ws",
    pages: {
      home: {
        children: [
          {
            component: "Button",
            requires: ["cap://component/read"],
          } as any,
        ],
      },
    },
  };

  projector.loadDocument(doc);
  projector.setSession({
    currentUser: {
      id: "user-1",
      capabilities: { "cap://component/read": "held-cap-1" },
    },
  });

  expect(await projector.surveyCapabilities()).toEqual([
    {
      scope: "component",
      nodePath: "pages.home.children[0]",
      caps: ["cap://component/read"],
      combinator: "all",
    },
  ]);

  expect(
    await projector.authorize(["cap://component/read"], undefined, {
      scope: "component",
      nodePath: "pages.home.children[0]",
    }),
  ).toEqual({ outcome: "allow" });
});
