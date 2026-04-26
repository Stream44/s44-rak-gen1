import { existsSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";
import type { PlaywrightTestConfig } from "@playwright/test";

const configDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(configDir, "../..");
const examplesDir = resolve(packageDir, "examples");
const RESERVED_PORTS = new Set<number>([3211]); // Historical fixed-port reservation retained for stability.

type PerExampleConfig = {
  projects: NonNullable<PlaywrightTestConfig["projects"]>;
  webServer?: PlaywrightTestConfig["webServer"];
};

type WebServerEntry =
  Extract<NonNullable<PlaywrightTestConfig["webServer"]>, Array<unknown>> extends Array<infer Entry>
    ? Entry
    : never;

const discovered = readdirSync(examplesDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .sort((left, right) => right.name.localeCompare(left.name))
  .map((entry) => ({
    name: entry.name,
    configPath: resolve(examplesDir, entry.name, "e2e/playwright.config.ts"),
  }))
  .filter(({ configPath }) => existsSync(configPath));

console.log(
  `[playwright] composite discovered: ${discovered.map((entry) => entry.name).join(", ") || "(none)"}`,
);

const loaded = await Promise.all(
  discovered.map(async ({ name, configPath }) => {
    const mod = await import(configPath);
    const cfg: PerExampleConfig = mod.perExample ?? mod.default ?? mod;
    return { name, cfg };
  }),
);

const portOwners = new Map<number, string>();

const projects: NonNullable<PlaywrightTestConfig["projects"]> = [];
const webServers: WebServerEntry[] = [];

for (const { name, cfg } of loaded) {
  for (const project of cfg.projects ?? []) projects.push(project);
  const servers = Array.isArray(cfg.webServer)
    ? cfg.webServer
    : cfg.webServer
      ? [cfg.webServer]
      : [];
  for (const server of servers) {
    const url = String(server.url ?? "");
    const match = url.match(/:(\d+)(\/|$)/);
    if (match) {
      const port = Number(match[1]);
      const previousOwner = portOwners.get(port);
      if (previousOwner) {
        throw new Error(
          `[playwright] port collision on :${port} between "${name}" and "${previousOwner}"`,
        );
      }
      portOwners.set(port, name);
    }
    webServers.push(server);
  }
}

export default defineConfig({
  testDir: ".",
  testMatch: "**/examples/*/e2e/**/*.pw.ts",
  timeout: 30_000,
  workers: 1,
  outputDir: resolve(packageDir, ".~o/test-results"),
  use: {
    headless: true,
  },
  projects,
  webServer: webServers,
});
