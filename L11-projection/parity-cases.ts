import { expect } from "bun:test";
import { resolve } from "node:path";
import type { ProjectionModel } from "../L01-foundation/projection-types.ts";
import type { ParityCase } from "./parity-harness.ts";

export type ParityMethod = "compile" | "dispatch" | "render" | "authorize";

export type ParityInput =
  | { method: "compile"; yamlPath: string }
  | {
      method: "dispatch";
      doc?: ProjectionModel;
      yamlPath?: string;
      sessionKey: string;
      frame: {
        ref: string;
        target?: string;
        payload?: Record<string, unknown>;
        capabilityId?: string;
      };
      stateOverrides?: Record<string, { status: string }>;
    }
  | {
      method: "render";
      doc?: ProjectionModel;
      yamlPath?: string;
      pageName: string;
      sessionKey: string;
      bindings?: Record<string, unknown>;
    }
  | {
      method: "authorize";
      requires?: string[];
      sessionKey: string;
      ctx: {
        scope: "projection" | "page" | "route" | "component" | "asset" | "binding" | "action";
        nodePath: string;
        requiresAny?: string[];
      };
    };

const FIXTURE = (relativePath: string) => resolve(import.meta.dir, relativePath);

const PROJECTION_ENGINE_YAML = FIXTURE("../tests/kernel-fixtures/projections/engine.yaml");
const DASHBOARD_YAML = FIXTURE("../tests/kernel-fixtures/projections/dashboard.yaml");
const API_YAML = FIXTURE("../tests/kernel-fixtures/projections/api.yaml");
const INSPECTOR_YAML = FIXTURE("../tests/kernel-fixtures/projections/inspector.yaml");
const VIEWER_YAML = FIXTURE("../31-viewer/projection/projection.yaml");

const CUSTOM_ACTION_DOC: ProjectionModel = {
  projector: "custom-dispatch",
  version: "0.1.0",
  session: { scope: "custom-dispatch" },
  bindsModel: "commerce@1.0.0",
  routes: [],
  actions: [{ name: "tab.select", kind: "custom" }],
  pages: { home: { children: [] } },
};

const EPHEMERAL_ACTION_DOC: ProjectionModel = {
  projector: "ephemeral-dispatch",
  version: "0.1.0",
  session: { scope: "ephemeral-dispatch" },
  bindsModel: "commerce@1.0.0",
  routes: [],
  actions: [{ name: "ui.toggle", kind: "ephemeral" }],
  pages: { home: { children: [] } },
};

const GATED_RENDER_DOC: ProjectionModel = {
  projector: "gated-render",
  version: "0.1.0",
  session: { scope: "gated-render" },
  bindsModel: "commerce@1.0.0",
  routes: [{ path: "/", page: "home" }],
  actions: ["CancelOrder"],
  pages: {
    home: {
      children: [
        {
          component: "Button",
          props: { label: "Cancel" },
          onClick: {
            action: "CancelOrder",
            target: "ord-001",
            payload: { id: "ord-001" },
            hideIfUnauthorized: true,
          },
        },
      ],
    },
  },
};

const REDACTED_RENDER_DOC: ProjectionModel = {
  projector: "redacted-render",
  version: "0.1.0",
  session: { scope: "redacted-render" },
  bindsModel: "",
  routes: [{ path: "/", page: "home" }],
  pages: {
    home: {
      children: [
        {
          component: "Text",
          props: {
            text: {
              if: { capability: "cap://pii/view/1.0" },
              then: "ada@example.com",
              else: "(redacted)",
            },
          },
        },
      ],
    },
  },
};

export function stripNodeIds<T>(value: T): T {
  if (Array.isArray(value)) return value.map((entry) => stripNodeIds(entry)) as T;
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (key === "nodeId" && typeof entry === "string" && /^n\d+$/.test(entry)) {
      out[key] = "<node-id>";
      continue;
    }
    out[key] = stripNodeIds(entry);
  }
  return out as T;
}

export function bySection(kind: ParityMethod): ParityCase<ParityInput, unknown>[] {
  return CANONICAL_PARITY_CASES.filter((entry) => entry.input.method === kind);
}

function normalizeManifest(manifest: unknown) {
  const typed = manifest as { byName?: Map<string, unknown>; byUri?: Map<string, unknown> };
  return {
    byName: [...(typed.byName ?? new Map()).entries()].sort(([a], [b]) => a.localeCompare(b)),
    byUri: [...(typed.byUri ?? new Map()).entries()].sort(([a], [b]) => a.localeCompare(b)),
  };
}

function normalizeCompile(result: unknown) {
  const typed = result as { cid?: string; manifest?: unknown };
  return stripNodeIds({
    ...(typed as Record<string, unknown>),
    cid: typed.cid ? "<compiled-cid>" : typed.cid,
    manifest: normalizeManifest(typed.manifest),
  });
}

function normalizeDispatch(result: unknown) {
  const typed = result as {
    success?: boolean;
    error?: string;
    value?: {
      kind?: string;
      success?: boolean;
      error?: string;
      name?: string;
      payload?: Record<string, unknown>;
      intentResult?: unknown;
    };
    kind?: string;
    name?: string;
    payload?: Record<string, unknown>;
    intentResult?: unknown;
  };
  const inner =
    typed.value && typeof typed.value === "object" && "kind" in typed.value ? typed.value : typed;
  return stripNodeIds({
    error: inner.error ?? typed.error,
    intentResult: inner.intentResult,
    name: inner.name,
    payload: inner.payload,
    success: inner.success ?? typed.success,
  });
}

const sameCompile = (left: unknown, right: unknown) =>
  expect(normalizeCompile(left)).toEqual(normalizeCompile(right));
const sameDispatch = (left: unknown, right: unknown) =>
  expect(normalizeDispatch(left)).toEqual(normalizeDispatch(right));
const sameRender = (left: unknown, right: unknown) =>
  expect(stripNodeIds(left)).toEqual(stripNodeIds(right));
const sameAuthorize = (left: unknown, right: unknown) => expect(left).toEqual(right);

export const CANONICAL_PARITY_CASES: ParityCase<ParityInput, unknown>[] = [
  // compile
  {
    name: "compile: projection-engine sample",
    input: { method: "compile", yamlPath: PROJECTION_ENGINE_YAML },
    assert: sameCompile,
  },
  {
    name: "compile: commerce dashboard",
    input: { method: "compile", yamlPath: DASHBOARD_YAML },
    assert: sameCompile,
  },
  {
    name: "compile: commerce api",
    input: { method: "compile", yamlPath: API_YAML },
    assert: sameCompile,
  },
  {
    name: "compile: inspector",
    input: { method: "compile", yamlPath: INSPECTOR_YAML },
    assert: sameCompile,
  },
  {
    name: "compile: viewer root",
    input: { method: "compile", yamlPath: VIEWER_YAML },
    assert: sameCompile,
  },

  // dispatch
  {
    name: "dispatch: ConfirmOrder happy path",
    input: {
      method: "dispatch",
      yamlPath: DASHBOARD_YAML,
      sessionKey: "model-alice",
      frame: { ref: "ConfirmOrder", target: "ord-001", payload: { id: "ord-001" } },
    },
    assert: sameDispatch,
  },
  {
    name: "dispatch: PayOrder happy path",
    input: {
      method: "dispatch",
      yamlPath: DASHBOARD_YAML,
      sessionKey: "model-alice",
      stateOverrides: { "ord-001": { status: "confirmed" } },
      frame: { ref: "PayOrder", target: "ord-001", payload: { id: "ord-001", amount: 100 } },
    },
    assert: sameDispatch,
  },
  {
    name: "dispatch: ShipOrder happy path",
    input: {
      method: "dispatch",
      yamlPath: DASHBOARD_YAML,
      sessionKey: "model-alice",
      stateOverrides: { "ord-001": { status: "paid" } },
      frame: { ref: "ShipOrder", target: "ord-001", payload: { id: "ord-001" } },
    },
    assert: sameDispatch,
  },
  {
    name: "dispatch: CancelOrder happy path",
    input: {
      method: "dispatch",
      yamlPath: DASHBOARD_YAML,
      sessionKey: "model-alice",
      frame: { ref: "CancelOrder", target: "ord-001", payload: { id: "ord-001" } },
    },
    assert: sameDispatch,
  },
  {
    name: "dispatch: custom action happy path",
    input: {
      method: "dispatch",
      doc: CUSTOM_ACTION_DOC,
      sessionKey: "anonymous",
      frame: { ref: "tab.select", payload: { tab: "viewer", url: "/viewer" } },
    },
    assert: sameDispatch,
  },
  {
    name: "dispatch: ephemeral action happy path",
    input: {
      method: "dispatch",
      doc: EPHEMERAL_ACTION_DOC,
      sessionKey: "anonymous",
      frame: { ref: "ui.toggle", payload: { value: true } },
    },
    assert: sameDispatch,
  },
  {
    name: "dispatch: unknown ref error path",
    input: {
      method: "dispatch",
      yamlPath: DASHBOARD_YAML,
      sessionKey: "model-alice",
      frame: { ref: "NoSuchAction" },
    },
    assert: sameDispatch,
  },
  {
    name: "dispatch: validation failure path",
    input: {
      method: "dispatch",
      yamlPath: DASHBOARD_YAML,
      sessionKey: "model-alice",
      frame: { ref: "ConfirmOrder", payload: { id: 42 as unknown as string } },
    },
    assert: sameDispatch,
  },

  // render
  {
    name: "render: commerce orders panel",
    input: {
      method: "render",
      yamlPath: DASHBOARD_YAML,
      pageName: "orders",
      sessionKey: "model-alice",
      bindings: {
        orders: [
          { id: "ord-001", status: "pending" },
          { id: "ord-002", status: "paid" },
        ],
      },
    },
    assert: sameRender,
  },
  {
    name: "render: inspector page",
    input: {
      method: "render",
      yamlPath: INSPECTOR_YAML,
      pageName: "home",
      sessionKey: "anonymous",
    },
    assert: sameRender,
  },
  {
    name: "render: capability-gated component authorized",
    input: { method: "render", doc: GATED_RENDER_DOC, pageName: "home", sessionKey: "model-alice" },
    assert: sameRender,
  },
  {
    name: "render: redacted value without pii capability",
    input: { method: "render", doc: REDACTED_RENDER_DOC, pageName: "home", sessionKey: "api-bob" },
    assert: sameRender,
  },

  // authorize
  {
    name: "authorize: empty requirements allow",
    input: {
      method: "authorize",
      sessionKey: "anonymous",
      requires: [],
      ctx: { scope: "projection", nodePath: "$", requiresAny: [] },
    },
    assert: sameAuthorize,
  },
  {
    name: "authorize: single missing cap denies",
    input: {
      method: "authorize",
      sessionKey: "anonymous",
      requires: ["cap://a/read"],
      ctx: { scope: "component", nodePath: "pages.home.children[0]" },
    },
    assert: sameAuthorize,
  },
  {
    name: "authorize: full caps allow",
    input: {
      method: "authorize",
      sessionKey: "auth-abc",
      requires: ["cap://a/read", "cap://b/read"],
      ctx: {
        scope: "action",
        nodePath: "pages.home.children[0].onClick",
        requiresAny: ["cap://c/read"],
      },
    },
    assert: sameAuthorize,
  },
];
