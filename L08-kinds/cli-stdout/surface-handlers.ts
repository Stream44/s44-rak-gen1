import type {
  ProjectionModel,
  ProjectionNode,
  ProjectionTree,
  RenderContext,
} from "../../L01-foundation/projection-types.ts";
import {
  getSurfaceHandlerSet,
  registerSurfaceHandlerSet,
} from "../../L10-acceptance/surface-evaluators.ts";
import type { ProjectorSession } from "../../L10-acceptance/projector-session.ts";
import cliDispatch from "./dispatch.ts";
import renderCliBadge from "./primitives/Badge.ts";
import renderCliHeading from "./primitives/Heading.ts";
import renderCliKV from "./primitives/KV.ts";
import renderCliPrompt from "./primitives/Prompt.ts";
import renderCliSpinner from "./primitives/Spinner.ts";
import renderCliTable from "./primitives/Table.ts";
import renderCliText from "./primitives/Text.ts";

const CLI_RENDERERS = new Map([
  ["Badge", renderCliBadge],
  ["Heading", renderCliHeading],
  ["KV", renderCliKV],
  ["Prompt", renderCliPrompt],
  ["Spinner", renderCliSpinner],
  ["Table", renderCliTable],
  ["Text", renderCliText],
] as const);

function renderFor(
  component: string,
):
  | ((
      node: ProjectionNode,
      ctx: { ansi: boolean; renderChildren: (n: ProjectionNode) => string },
    ) => string)
  | null {
  return CLI_RENDERERS.get(component as never) ?? null;
}

export function registerCliStdoutSurfaceHandlers(): void {
  if (getSurfaceHandlerSet("cli.stdout")) return;
  registerSurfaceHandlerSet("cli.stdout", {
    computeHandlers: () => null,
    renderCli: (
      tree: ProjectionTree,
      _projection: ProjectionModel,
      session: ProjectorSession,
      pageName: string,
    ) =>
      cliDispatch(
        tree,
        {
          pageName,
          route: session.kernel.getSession().route,
          currentUser: session.kernel.getSession().currentUser,
          bindings: new Map(),
          props: {},
          nodeIdCounter: { n: 0 },
          session: session.kernel.getSession(),
        } satisfies RenderContext,
        { ansi: false },
        renderFor,
      ),
  });
}

registerCliStdoutSurfaceHandlers();
