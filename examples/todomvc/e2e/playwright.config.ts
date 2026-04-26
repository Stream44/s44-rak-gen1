import { defineConfig } from "@playwright/test";

import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const configDir = dirname(fileURLToPath(import.meta.url));
const packageDir = resolve(configDir, "../../..");

type PerExampleConfig = {
  projects: Array<{
    name: string;
    testDir: string;
    testMatch: string;
    use: {
      browserName: "chromium" | "firefox" | "webkit";
    };
  }>;
  webServer?: {
    command: string;
    url: string;
    reuseExistingServer: boolean;
    timeout: number;
  };
};

const projects: PerExampleConfig["projects"] = [
  {
    name: "todomvc-chromium",
    testDir: configDir,
    testMatch: "**/*.pw.ts",
    use: {
      browserName: "chromium" as const,
    },
  },
];

export const perExample = { projects } satisfies PerExampleConfig;

export default defineConfig({
  testDir: configDir,
  testMatch: "**/*.pw.ts",
  timeout: 30_000,
  workers: 1,
  outputDir: resolve(packageDir, ".~o/test-results/todomvc"),
  use: { headless: true },
  ...perExample,
});
