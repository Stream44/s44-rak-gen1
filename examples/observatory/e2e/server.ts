import { resolve } from "node:path";
import { createViewer } from "../../../L14-hosts/viewer/viewer.ts";
import { bootNode } from "../../../L14-hosts/projection-runtime/index.ts";
import { buildObsViewerConfig } from "../viewer-config.ts";

const port = Number(process.env.PORT ?? "3211");
const sdsPath = process.env.OBSERVATORY_SDS ?? resolve(import.meta.dir, "../fixtures/boot-sds");
const pathstyleProjectorPath = resolve(import.meta.dir, "fixtures/pathstyle-app/projection.yaml");

const renderPathstyleHtml = (filter: string) => `
  <h1>PathStyle Filter Demo</h1>
  <p data-testid="current-filter">Current filter: ${filter}</p>
  <button id="filter-all" data-action-ref="ui.set" data-ctx-path="page" data-ui-set-path="filter" data-value="all">All</button>
  <button id="filter-active" data-action-ref="ui.set" data-ctx-path="page" data-ui-set-path="filter" data-value="active">Active</button>
  <button id="filter-completed" data-action-ref="ui.set" data-ctx-path="page" data-ui-set-path="filter" data-value="completed">Completed</button>
`;

const observatory = await buildObsViewerConfig({ runtime: bootNode(sdsPath) });
let currentFilter = "all";
await createViewer({
  port,
  projections: [
    observatory!,
    { ...observatory!, mount: "/observatory" },
    {
      mount: "/pathstyle",
      projectorPath: pathstyleProjectorPath,
      customHandler: async (_ws, frame, ctx) => {
        if (frame.type !== "ui-set" || frame.path !== "filter") return false;
        currentFilter = String(frame.value ?? "all") || "all";
        ctx.broadcast({
          type: "rerender",
          html: renderPathstyleHtml(currentFilter),
          handlersJs: "",
        });
        return true;
      },
    },
  ],
});
await new Promise(() => {});
