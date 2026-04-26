import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const configDir = dirname(fileURLToPath(import.meta.url));
const exampleDir = resolve(configDir, "..");
const packageDir = resolve(configDir, "../../..");
const serverPath = resolve(packageDir, "examples/observatory/e2e/server.ts");

if (!process.env.PW_MODEL_WORLD_PORT) {
  process.env.PW_MODEL_WORLD_PORT = String(46_000 + Math.floor(Math.random() * 1000));
}
const port = Number(process.env.PW_MODEL_WORLD_PORT);

export const perExample = {
  projects: [
    {
      name: "model-world-chromium",
      testDir: configDir,
      testMatch: "**/*.pw.ts",
      use: {
        baseURL: `http://127.0.0.1:${port}`,
        browserName: "chromium" as const,
      },
    },
  ],
  webServer: {
    command: `OBSERVATORY_SDS=${exampleDir} PORT=${port} bun ${serverPath}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
};

export default defineConfig({
  testDir: configDir,
  testMatch: "**/*.pw.ts",
  timeout: 30_000,
  workers: 1,
  outputDir: resolve(packageDir, ".~o/test-results/model-world"),
  use: { headless: true },
  ...perExample,
});
