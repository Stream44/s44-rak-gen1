import { afterEach, expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { runGoldenExport } from "./golden-export.ts";

const rootDir = resolve(import.meta.dir, "../..");
const tmpDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tmpDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

async function exportGoldens() {
  const outDir = await mkdtemp(resolve(tmpdir(), "rak-export-"));
  tmpDirs.push(outDir);
  const summary = await runGoldenExport(rootDir, outDir);
  return { outDir, summary };
}

test("runGoldenExport reports snapshot summary fields", async () => {
  const { summary } = await exportGoldens();
  expect(summary.snapshotCount).toBeGreaterThanOrEqual(20);
  expect(summary.errorCount).toBe(0);
  expect(summary.failedNames).toEqual([]);
  expect(Date.parse(summary.exportedAt)).not.toBeNaN();
});

test("runGoldenExport writes summary and index files", async () => {
  const { outDir, summary } = await exportGoldens();
  const [summaryJson, indexHtml] = await Promise.all([
    readFile(resolve(outDir, "_summary.json"), "utf8"),
    readFile(resolve(outDir, "index.html"), "utf8"),
  ]);
  expect(summaryJson).toContain('"snapshotCount"');
  expect(summaryJson).toContain(`"snapshotCount": ${summary.snapshotCount}`);
  expect(indexHtml).toContain("Observatory Golden Index");
  expect(indexHtml).toContain("./reflective/core.html");
});

test("runGoldenExport writes debug companions for curated snapshots", async () => {
  const { outDir } = await exportGoldens();
  const [html, debugHtml] = await Promise.all([
    readFile(resolve(outDir, "kernel/types.html"), "utf8"),
    readFile(resolve(outDir, "kernel/types.debug.html"), "utf8"),
  ]);
  expect(html).toContain('data-snapshot="kernel/types"');
  expect(debugHtml).toContain('<body class="debug">');
});

test("runGoldenExport writes reflective model snapshots", async () => {
  const { outDir } = await exportGoldens();
  const [coreHtml, ecommerceHtml] = await Promise.all([
    readFile(resolve(outDir, "reflective/core.html"), "utf8"),
    readFile(resolve(outDir, "reflective/ecommerce.html"), "utf8"),
  ]);
  expect(coreHtml).toContain('data-reflective-tree="true"');
  expect(coreHtml).toContain("type://adk/Type7/1.0");
  expect(ecommerceHtml).toContain('data-reflective-tree="true"');
  expect(ecommerceHtml).toContain("type://adk/Order/1.0");
});
