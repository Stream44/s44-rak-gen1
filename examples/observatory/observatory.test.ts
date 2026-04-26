import { resolve } from "node:path";
import { describe, test, expect } from "bun:test";
import { createViewer } from "../../L14-hosts/viewer/viewer.ts";
import { bootNode } from "../../L14-hosts/projection-runtime/index.ts";
import { buildObsViewerConfig } from "./viewer-config.ts";
const longTest = (name: string, fn: () => Promise<void> | void) =>
  test(name, { timeout: 20000 }, fn);
const FIXTURE = resolve(import.meta.dir, "fixtures/boot-sds");

async function withObservatory<T>(fn: (port: number) => Promise<T>): Promise<T> {
  const obs = await createViewer({
    port: 0,
    projections: [await buildObsViewerConfig({ mount: "/", runtime: bootNode(FIXTURE) })],
  });
  try {
    return await fn(obs.server.port);
  } finally {
    await obs.stop();
  }
}

describe("Observatory Smoke Test", () => {
  longTest("server starts and serves HTML on GET /", async () => {
    await withObservatory(async (port) => {
      const res = await fetch(`http://localhost:${port}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
      const html = await res.text();
      expect(html).toContain("ADK Observatory");
      expect(html).toContain("Kernel");
      expect(html).toContain("Reflective");
    });
  });
});

describe("Observatory Acceptance Integration", () => {
  longTest("viewer serves observatory body fragment on GET /api/body", async () => {
    await withObservatory(async (port) => {
      const body = await fetch(`http://localhost:${port}/api/body`).then((res) => res.text());
      expect(body).toContain("ADK Observatory");
      expect(body).toContain("Acceptance");
      expect(body).not.toContain("<!DOCTYPE html>");
    });
  });
});
