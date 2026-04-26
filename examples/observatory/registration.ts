import { resolve } from "node:path";
import { bootNode } from "../../L14-hosts/projection-runtime/index.ts";
import type { ExampleRegistrationContext } from "../../L15-cli/commands/example-registry.ts";
import { runGoldenExport } from "./golden-export.ts";
import { buildObsViewerConfig } from "./viewer-config.ts";

export function register(registry: ExampleRegistrationContext): void {
  registry.setViewerConfig(async (match) =>
    buildObsViewerConfig({
      mount: match.mount,
      runtime: bootNode(resolve(match.dir, "../model-world")),
    }),
  );
  registry.setExportHandler(async ({ rawArgs, root }) => {
    const outFlag = rawArgs.findIndex((value) => value === "--out");
    const outDir = resolve(
      root,
      outFlag >= 0
        ? (rawArgs[outFlag + 1] ?? "stewardship/observatory-golden")
        : "stewardship/observatory-golden",
    );
    const summary = await runGoldenExport(root, outDir);
    console.log(`rak export wrote ${summary.snapshotCount} snapshots to ${outDir}`);
    console.log(`errorCount=${summary.errorCount} failedNames=${summary.failedNames.length}`);
    return summary.errorCount === 0 ? 0 : 1;
  }, "Write static review snapshots.");
}
