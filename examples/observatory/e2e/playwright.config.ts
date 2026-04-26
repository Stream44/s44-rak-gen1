import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "@playwright/test";

const configDir = dirname(fileURLToPath(import.meta.url));
const exampleDir = resolve(configDir, "..");
const packageDir = resolve(exampleDir, "../..");
const serverPath = resolve(configDir, "server.ts");
const observatorySdsPath =
  process.env.OBSERVATORY_SDS ?? resolve(packageDir, "examples/observatory/fixtures/boot-sds");
if (!process.env.PW_OBSERVATORY_PORT) {
  process.env.PW_OBSERVATORY_PORT = String(48_000 + Math.floor(Math.random() * 1000));
}
const observatoryPort = Number(process.env.PW_OBSERVATORY_PORT);

export const perExample = {
  projects: [
    {
      name: "observatory-chromium",
      testDir: configDir,
      testMatch: "**/*.pw.ts",
      use: {
        baseURL: `http://127.0.0.1:${observatoryPort}`,
        browserName: "chromium" as const,
      },
    },
  ],
  webServer: {
    command: `OBSERVATORY_SDS=${observatorySdsPath} PORT=${observatoryPort} bun ${serverPath}`,
    url: `http://127.0.0.1:${observatoryPort}`,
    reuseExistingServer: false,
    timeout: 20_000,
  },
};

export default defineConfig({
  testDir: configDir,
  testMatch: "**/*.pw.ts",
  timeout: 30_000,
  workers: 1,
  outputDir: resolve(packageDir, ".~o/test-results/observatory"),
  use: { headless: true },
  ...perExample,
});
