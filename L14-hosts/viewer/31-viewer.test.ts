/**
 * Layer 31: Viewer tests.
 *
 * Verifies the multi-mount HTTP + WebSocket surface:
 *   - mounts render shells on the correct paths
 *   - assets are served from the projection's assets dir
 *   - WebSocket frames route to the right projector
 *   - model action dispatch triggers a rerender broadcast
 *   - custom actions flow through customHandler
 *   - two projections on different mounts don't cross-talk
 */

import { describe, test, expect } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "path";
import type { ServerWebSocket } from "bun";
import { createViewer } from "./viewer.ts";
import type { ModelBoot } from "../../L09-demand/model-loader.ts";

const FIXTURES = resolve(import.meta.dir, "test-fixtures");
const modelPaths = [
  resolve(import.meta.dir, "../../tests/kernel-fixtures/core.model.yaml"),
  resolve(import.meta.dir, "../../tests/kernel-fixtures/commerce.model.yaml"),
];
const ORDER_SEEDS = [
  {
    targetKey: "ord-001",
    state: {
      customer: "cust-001",
      total: 39.97,
      items: [{ sku: "W-001", quantity: 2, unitPrice: 9.99 }],
      status: "pending",
    },
  },
  {
    targetKey: "ord-002",
    state: {
      customer: "cust-002",
      total: 99.99,
      items: [{ sku: "P-001", quantity: 1, unitPrice: 99.99 }],
      status: "pending",
    },
  },
] as const;

function seedOrders(app: ModelBoot): void {
  for (const seed of ORDER_SEEDS) {
    app.setState(seed.targetKey, seed.state);
  }
}

describe("Viewer — single mount", () => {
  test("boots and serves the rendered shell on GET /", async () => {
    const viewer = await createViewer({
      port: 0,
      projections: [
        {
          mount: "/",
          projectorPath: resolve(FIXTURES, "minimal/projection.yaml"),
          modelPaths,
          seedFn: seedOrders,
        },
      ],
    });
    try {
      const port = viewer.server.port;
      const res = await fetch(`http://localhost:${port}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const html = await res.text();
      expect(html).toContain("Minimal Orders");
      expect(html).toContain("Confirm ord-001");
      expect(html).toContain('id="root"');
    } finally {
      await viewer.stop();
    }
  });

  test("serves GET /api/body (body fragment only)", async () => {
    const viewer = await createViewer({
      port: 0,
      projections: [
        {
          mount: "/",
          projectorPath: resolve(FIXTURES, "minimal/projection.yaml"),
          modelPaths,
          seedFn: seedOrders,
        },
      ],
    });
    try {
      const port = viewer.server.port;
      const res = await fetch(`http://localhost:${port}/api/body`);
      expect(res.status).toBe(200);
      const body = await res.text();
      // api/body returns just the tree body — not the full shell.
      expect(body).not.toContain("<!DOCTYPE html>");
      expect(body).toContain("Confirm ord-001");
    } finally {
      await viewer.stop();
    }
  });

  test("serves static assets from the projection assets dir", async () => {
    const viewer = await createViewer({
      port: 0,
      projections: [
        {
          mount: "/",
          projectorPath: resolve(FIXTURES, "minimal/projection.yaml"),
          modelPaths,
          seedFn: seedOrders,
        },
      ],
    });
    try {
      const port = viewer.server.port;
      const res = await fetch(`http://localhost:${port}/assets/style.css`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/css");
      const body = await res.text();
      expect(body).toContain("background");
    } finally {
      await viewer.stop();
    }
  });

  test("serves CSS assets from a second projection fixture", async () => {
    const viewer = await createViewer({
      port: 0,
      projections: [
        {
          mount: "/",
          projectorPath: resolve(FIXTURES, "minimal/projection.yaml"),
          modelPaths,
          seedFn: seedOrders,
        },
      ],
    });
    try {
      const port = viewer.server.port;
      const res = await fetch(`http://localhost:${port}/assets/style.css`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toBe("text/css");
      const body = await res.text();
      expect(body).toContain("background");
    } finally {
      await viewer.stop();
    }
  });

  test("404 on unknown asset path", async () => {
    const viewer = await createViewer({
      port: 0,
      projections: [
        {
          mount: "/",
          projectorPath: resolve(FIXTURES, "minimal/projection.yaml"),
          modelPaths,
          seedFn: seedOrders,
        },
      ],
    });
    try {
      const port = viewer.server.port;
      const res = await fetch(`http://localhost:${port}/assets/nonexistent.css`);
      expect(res.status).toBe(404);
    } finally {
      await viewer.stop();
    }
  });
});

describe("Viewer — WebSocket", () => {
  test("model action dispatch triggers a rerender broadcast", async () => {
    const originalServe = Bun.serve;
    let captured!: {
      websocket: {
        open(ws: ServerWebSocket<unknown>): void;
        message(ws: ServerWebSocket<unknown>, msg: string): Promise<void>;
      };
    };
    try {
      Bun.serve = ((config: unknown) => (
        (captured = config as typeof captured),
        { port: 0, stop: async () => {} } as ReturnType<typeof Bun.serve>
      )) as typeof Bun.serve;
      const viewer = await createViewer({
        port: 0,
        projections: [
          {
            mount: "/",
            projectorPath: resolve(FIXTURES, "minimal/projection.yaml"),
            modelPaths,
            seedFn: seedOrders,
          },
        ],
      });
      const sent: string[] = [],
        ws = {
          data: { mount: "" },
          send(value: string) {
            sent.push(value);
          },
        } as unknown as ServerWebSocket<unknown>;
      captured.websocket.open(ws);
      await captured.websocket.message(
        ws,
        JSON.stringify({
          type: "action",
          ref: "ConfirmOrder",
          target: "ord-001",
          payload: { id: "ord-001" },
        }),
      );
      const msg = JSON.parse(sent.find((value) => value.includes('"rerender"')) ?? "{}");
      expect(msg.type).toBe("rerender");
      expect(typeof msg.html).toBe("string");
      await viewer.stop();
    } finally {
      Bun.serve = originalServe;
    }
  });

  test("batch commits trigger a single rerender broadcast", async () => {
    const originalServe = Bun.serve;
    let captured!: { websocket: { open(ws: ServerWebSocket<unknown>): void } };
    let appRef: ModelBoot | undefined;
    try {
      Bun.serve = ((config: unknown) => (
        (captured = config as typeof captured),
        { port: 0, stop: async () => {} } as ReturnType<typeof Bun.serve>
      )) as typeof Bun.serve;
      const viewer = await createViewer({
        port: 0,
        projections: [
          {
            mount: "/",
            projectorPath: resolve(FIXTURES, "minimal/projection.yaml"),
            modelPaths,
            seedFn(app) {
              appRef = app;
              seedOrders(app);
            },
          },
        ],
      });
      const sent: string[] = [];
      const ws = {
        data: { mount: "" },
        send(value: string) {
          sent.push(value);
        },
      } as unknown as ServerWebSocket<unknown>;
      captured.websocket.open(ws);

      await appRef?.batch([
        { verb: "confirm", target: "ord-001", payload: { id: "ord-001" } },
        { verb: "confirm", target: "ord-004", payload: { id: "ord-004" } },
      ]);

      expect(sent.filter((value) => value.includes('"rerender"'))).toHaveLength(1);
      await viewer.stop();
    } finally {
      Bun.serve = originalServe;
    }
  });

  test("customHandler intercepts frames before the framework", async () => {
    let sawCustom = false;
    const originalServe = Bun.serve;
    let captured!: {
      websocket: {
        open(ws: ServerWebSocket<unknown>): void;
        message(ws: ServerWebSocket<unknown>, msg: string): Promise<void>;
      };
    };
    try {
      Bun.serve = ((config: unknown) => (
        (captured = config as typeof captured),
        { port: 0, stop: async () => {} } as ReturnType<typeof Bun.serve>
      )) as typeof Bun.serve;
      const viewer = await createViewer({
        port: 0,
        projections: [
          {
            mount: "/",
            projectorPath: resolve(FIXTURES, "shell-only/projection.yaml"),
            customHandler: (ws, frame) => {
              if (frame.type === "custom-ping") {
                sawCustom = true;
                ws.send(JSON.stringify({ type: "custom-pong" }));
                return true;
              }
              return false;
            },
          },
        ],
      });
      const sent: string[] = [],
        ws = {
          data: { mount: "" },
          send(value: string) {
            sent.push(value);
          },
        } as unknown as ServerWebSocket<unknown>;
      captured.websocket.open(ws);
      await captured.websocket.message(ws, JSON.stringify({ type: "custom-ping" }));
      const pong = JSON.parse(sent[0] ?? "{}");
      expect(pong.type).toBe("custom-pong");
      expect(sawCustom).toBe(true);
      await viewer.stop();
    } finally {
      Bun.serve = originalServe;
    }
  });

  test("custom action kinds fall through to customHandler after dispatchAction declines them", async () => {
    let customCalls = 0;
    const tmp = mkdtempSync(`${FIXTURES}/wp259-`);
    const customModelPath = resolve(tmp, "commerce-custom.model.yaml");
    writeFileSync(
      customModelPath,
      `${readFileSync(resolve(import.meta.dir, "../../tests/kernel-fixtures/commerce.model.yaml"), "utf-8")}
  OpenInspector:
    verb: open-inspector
    kind: custom
`,
    );
    const originalServe = Bun.serve;
    let captured!: {
      websocket: {
        open(ws: ServerWebSocket<unknown>): void;
        message(ws: ServerWebSocket<unknown>, msg: string): Promise<void>;
      };
    };
    try {
      Bun.serve = ((config: unknown) => (
        (captured = config as typeof captured),
        { port: 0, stop: async () => {} } as ReturnType<typeof Bun.serve>
      )) as typeof Bun.serve;
      const viewer = await createViewer({
        port: 0,
        projections: [
          {
            mount: "/",
            projectorPath: resolve(FIXTURES, "minimal/projection.yaml"),
            modelPaths: [
              resolve(import.meta.dir, "../../tests/kernel-fixtures/core.model.yaml"),
              customModelPath,
            ],
            seedFn: seedOrders,
            customHandler: (ws, frame) => {
              if (frame.type === "action" && frame.ref === "OpenInspector") {
                customCalls += 1;
                ws.send(JSON.stringify({ type: "custom-pong" }));
                return true;
              }
              return false;
            },
          },
        ],
      });
      const sent: string[] = [];
      const ws = {
        data: { mount: "" },
        send(value: string) {
          sent.push(value);
        },
      } as unknown as ServerWebSocket<unknown>;
      captured.websocket.open(ws);

      await captured.websocket.message(
        ws,
        JSON.stringify({ type: "action", ref: "OpenInspector", payload: { id: "ord-001" } }),
      );

      expect(customCalls).toBe(1);
      expect(sent.map((value) => JSON.parse(value).type)).toContain("custom-pong");
      expect(sent.some((value) => value.includes('"rerender"'))).toBe(false);
      await viewer.stop();
    } finally {
      Bun.serve = originalServe;
      rmSync(tmp, { recursive: true, force: true });
    }
  });

  test("generic ui-set runs only after customHandler declines it", async () => {
    const tmp = mkdtempSync(`${FIXTURES}/wp257-`);
    const projectionPath = resolve(tmp, "projection.yaml");
    writeFileSync(
      projectionPath,
      `projector: wp257-ui-set
version: 0.1.0
session:
  scope: wp257
bindsModel: ""
pages:
  index:
    children:
      - component: Context
        props:
          scope: page
          initial:
            activeTab: overview
        children:
          - component: Text
            props:
              text: "$ctx.activeTab"
`,
    );
    const originalServe = Bun.serve;
    let captured!: {
      websocket: {
        open(ws: ServerWebSocket<unknown>): void;
        message(ws: ServerWebSocket<unknown>, msg: string): Promise<void>;
      };
    };
    let customCalls = 0;
    try {
      Bun.serve = ((config: unknown) => (
        (captured = config as typeof captured),
        { port: 0, stop: async () => {} } as ReturnType<typeof Bun.serve>
      )) as typeof Bun.serve;
      const viewer = await createViewer({
        port: 0,
        projections: [
          {
            mount: "/",
            projectorPath: projectionPath,
            customHandler: (_ws, frame) => {
              if (
                frame.type === "ui-set" &&
                frame.path === "activeTab" &&
                frame.value === "custom"
              ) {
                customCalls++;
                return true;
              }
              return false;
            },
          },
        ],
      });
      const sent: string[] = [],
        ws = {
          data: { mount: "" },
          send(value: string) {
            sent.push(value);
          },
        } as unknown as ServerWebSocket<unknown>;
      captured.websocket.open(ws);
      await captured.websocket.message(
        ws,
        JSON.stringify({ type: "ui-set", ctxPath: "page", path: "activeTab", value: "custom" }),
      );
      expect(customCalls).toBe(1);
      expect(sent).toEqual([]);
      await captured.websocket.message(
        ws,
        JSON.stringify({ type: "ui-set", ctxPath: "page", path: "activeTab", value: "runtime" }),
      );
      const rerender = JSON.parse(sent.find((value) => value.includes('"rerender"')) ?? "{}");
      expect(rerender.type).toBe("rerender");
      expect(rerender.html).toContain("runtime");
      await viewer.stop();
    } finally {
      Bun.serve = originalServe;
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("Viewer — multi-mount isolation", () => {
  test("two mounts serve distinct projector pages", async () => {
    const viewer = await createViewer({
      port: 0,
      projections: [
        {
          mount: "/first",
          projectorPath: resolve(FIXTURES, "minimal/projection.yaml"),
          modelPaths,
          seedFn: seedOrders,
        },
        {
          mount: "/second",
          projectorPath: resolve(FIXTURES, "shell-only/projection.yaml"),
        },
      ],
    });
    try {
      const port = viewer.server.port;
      const a = await fetch(`http://localhost:${port}/first/`).then((r) => r.text());
      const b = await fetch(`http://localhost:${port}/second/`).then((r) => r.text());
      expect(a).toContain("Minimal Orders");
      expect(b).toContain("Shell-Only Tabs");
      // Cross-contamination check.
      expect(a).not.toContain("Shell-Only Tabs");
      expect(b).not.toContain("Minimal Orders");
    } finally {
      await viewer.stop();
    }
  });

  test("WebSocket frames on one mount do not trigger the other mount", async () => {
    let customCallsA = 0;
    let customCallsB = 0;
    const originalServe = Bun.serve;
    let captured!: {
      websocket: {
        open(ws: ServerWebSocket<unknown>): void;
        message(ws: ServerWebSocket<unknown>, msg: string): Promise<void>;
      };
    };
    try {
      Bun.serve = ((config: unknown) => (
        (captured = config as typeof captured),
        { port: 0, stop: async () => {} } as ReturnType<typeof Bun.serve>
      )) as typeof Bun.serve;
      const viewer = await createViewer({
        port: 0,
        projections: [
          {
            mount: "/a",
            projectorPath: resolve(FIXTURES, "shell-only/projection.yaml"),
            customHandler: () => {
              customCallsA++;
              return true;
            },
          },
          {
            mount: "/b",
            projectorPath: resolve(FIXTURES, "shell-only/projection.yaml"),
            customHandler: () => {
              customCallsB++;
              return true;
            },
          },
        ],
      });
      const wsA = { data: { mount: "/a" }, send() {} } as unknown as ServerWebSocket<unknown>;
      captured.websocket.open(wsA);
      await captured.websocket.message(wsA, JSON.stringify({ type: "ping" }));
      expect(customCallsA).toBe(1);
      expect(customCallsB).toBe(0);
      await viewer.stop();
    } finally {
      Bun.serve = originalServe;
    }
  });

  test("root mount ('/') is matched after longer prefixes", async () => {
    const viewer = await createViewer({
      port: 0,
      projections: [
        {
          mount: "/",
          projectorPath: resolve(FIXTURES, "shell-only/projection.yaml"),
        },
        {
          mount: "/nested",
          projectorPath: resolve(FIXTURES, "minimal/projection.yaml"),
          modelPaths,
          seedFn: seedOrders,
        },
      ],
    });
    try {
      const port = viewer.server.port;
      const nested = await fetch(`http://localhost:${port}/nested/`).then((r) => r.text());
      const root = await fetch(`http://localhost:${port}/`).then((r) => r.text());
      expect(nested).toContain("Minimal Orders");
      expect(root).toContain("Shell-Only Tabs");
    } finally {
      await viewer.stop();
    }
  });

  test("shell-only projection (no bindsModel) renders on its mount", async () => {
    const viewer = await createViewer({
      port: 0,
      projections: [
        {
          mount: "/",
          projectorPath: resolve(FIXTURES, "shell-only/projection.yaml"),
        },
      ],
    });
    try {
      const port = viewer.server.port;
      const res = await fetch(`http://localhost:${port}/`);
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("Shell-Only Tabs");
      expect(html).toContain("__adkCustomAction");
    } finally {
      await viewer.stop();
    }
  });
});

describe("Viewer — drain", () => {
  test("stop({drain:true}) awaits in-flight websocket sends before server stop", async () => {
    const originalServe = Bun.serve;
    const marks: string[] = [];
    let readyResolve!: () => void;
    const ready = new Promise<void>((resolve) => {
      readyResolve = resolve;
    });
    let captured: { websocket?: { open?: (ws: ServerWebSocket<unknown>) => void } } | undefined;
    Bun.serve = ((config: unknown) => {
      captured = config as { websocket?: { open?: (ws: ServerWebSocket<unknown>) => void } };
      return {
        port: 0,
        stop: async () => {
          marks.push("server-stop");
        },
      } as ReturnType<typeof Bun.serve>;
    }) as typeof Bun.serve;
    try {
      const viewer = await createViewer({
        port: 0,
        projections: [
          { mount: "/", projectorPath: resolve(FIXTURES, "shell-only/projection.yaml") },
        ],
      });
      captured?.websocket?.open?.({ data: { mount: "" }, ready } as ServerWebSocket<unknown>);
      const stop = viewer.stop({ drain: true }).then(() => marks.push("viewer-stop"));
      await Bun.sleep(20);
      expect(marks).toEqual([]);
      marks.push("ready");
      readyResolve();
      await stop;
      expect(marks).toEqual(["ready", "server-stop", "viewer-stop"]);
    } finally {
      Bun.serve = originalServe;
    }
  });
});
