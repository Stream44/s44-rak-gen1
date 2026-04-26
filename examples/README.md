# ADK Examples

## Start here — Observatory

Start with the observatory because it is the widest review surface in the package.
Run `bun bin/rak.ts serve --example observatory` from `packages/04-ReflexiveAlgebraicKernel/`.
The viewer opens the ADK observatory and projects every kernel entity in one place: types, morphisms, operators, machines, actions, metamodels, audit, pluggables, and the acceptance suite.
Use it when you want a reviewer-facing browser entry point that mirrors the golden export and interactive runtime.
The default route lands on the main observatory page, and the projection also carries the reflective `model-world-v2` route used by the golden export.

## Running any example

`rak serve` supports a positional projector path for ad hoc runs and a named alias for the registered examples.
The full surface is `rak serve <path> [--port N] [--models a.yaml,b.yaml] [--mount /]` and `rak serve --example <name> [--port N]`.
Use `--models` when a projection binds one or more model YAML files and `--mount` when you want the viewer mounted somewhere other than `/`.
Worked positional example: `bun bin/rak.ts serve examples/model-world/projection/projection.yaml --models examples/model-world/models/core.model.yaml,examples/model-world/models/ecommerce.model.yaml --port 3302 --mount /`.
Worked named example: `bun bin/rak.ts serve --example model-world --port 3303`.
If you omit `--port`, the viewer host will bind an available port automatically and print the listening URL.
Each registered alias already carries its own mount and model configuration, so `--example` is the shortest path for reviewers.
The positional form is still useful when you are iterating on an unregistered projection or testing a temporary YAML variant.

## Catalog

All registered aliases below should boot from a clean checkout with a single `bun bin/rak.ts serve --example <name>` command.

| Name                  | Path                                                       | What it demonstrates                                                                             |
| --------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| observatory           | examples/observatory/projection/projection.yaml            | Kernel entities, runtime state, metamodels, audit trails, pluggables, and acceptance playback.   |
| model-world           | examples/model-world/projection/projection.yaml            | Seeded ecommerce orders with stateful actions, badges, and button-driven transitions.            |
| model-world-engine    | examples/model-world/projection-engine/projection.yaml     | Projection engine rendering the same orders flow through cross-product projection machinery.     |
| reflective-projection | examples/model-world/reflective-projection/projection.yaml | Reflective browser for categorized records, tree expansion, search, breadcrumbs, and inspection. |

`observatory` is the broadest browser review surface and is the recommended first stop.
`model-world` shows the seeded ecommerce flow with interactive order actions and status badges.
`model-world-engine` exercises the projection-engine composition path over the same seeded orders.
`reflective-projection` is the model browser for records, categories, and inspector-driven drilling.
The catalog is limited to the `ui.html.ws` aliases that boot standalone via `rak serve`.
Host-kind projections (`projection-api/` = `api.rest`, `projection-auth/` = `host.auth`, `projection-cli/` = `cli.stdout`) compose inside `rak demo hosts` below — they are not standalone browser surfaces.
If a projection is not listed here, use the positional `rak serve <path>` form instead.

## Tri-host composition

Use `bun bin/rak.ts demo hosts` to boot the tri-host demo composition.
That command starts the viewer on port `3000`, the api-host on port `3100`, and then opens the CLI host REPL in the terminal.
The composed surface is built from `examples/model-world/projection/`, `examples/model-world/projection-api/`, `examples/model-world/projection-auth/`, and `examples/model-world/projection-cli/`.
Those host-specific projections belong to the multi-host composition and are not intended as standalone browser examples.
The viewer gives you the browser surface, the API host answers the authenticated HTTP flow, and the CLI host exercises the same world through REPL commands.
Keep this demo running only while you are reviewing the composition because the REPL holds the terminal session open until you exit or send `SIGINT`.

## HTML projection review

Use `bun bin/rak.ts export --out stewardship/observatory-golden/` to generate static HTML review snapshots.
The export writes an index plus snapshot files under `stewardship/observatory-golden/`.
Open `stewardship/observatory-golden/index.html` when you want a review surface without running a browser websocket session.
This is the fastest way to compare the observatory output against recorded golden HTML from a clean checkout.
The export path is useful for reviewers who only need rendered HTML and not the live websocket interaction surface.
It also gives you a stable artifact path to attach to review notes when discussing a specific observatory pane.
Use the generated `index.html` as the entry point because it links the curated observatory snapshot set in one place.
If you need to regenerate after projection changes, rerun the same command from the package root and refresh the exported files.
