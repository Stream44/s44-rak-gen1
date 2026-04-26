import type {
  ProjectionModel,
  ProjectionNode,
  ProjectionTree,
} from "../../L01-foundation/projection-types.ts";
import {
  getSurfaceHandlerSet,
  registerSurfaceHandlerSet,
} from "../../L10-acceptance/surface-evaluators.ts";
import apiDispatch from "./dispatch.ts";
import decodeHttpRequest, { encodeError, encodeSuccess } from "./http-action.ts";
import renderAuthZ from "./primitives/AuthZ.ts";
import renderEndpoint from "./primitives/Endpoint.ts";
import renderErrorCase from "./primitives/ErrorCase.ts";
import renderQueryParam from "./primitives/QueryParam.ts";
import renderRequestBody from "./primitives/RequestBody.ts";
import renderResponseShape from "./primitives/ResponseShape.ts";
import renderRouteParam from "./primitives/RouteParam.ts";

const API_RENDERERS = new Map([
  ["AuthZ", renderAuthZ],
  ["Endpoint", renderEndpoint],
  ["ErrorCase", renderErrorCase],
  ["QueryParam", renderQueryParam],
  ["RequestBody", renderRequestBody],
  ["ResponseShape", renderResponseShape],
  ["RouteParam", renderRouteParam],
] as const);

function renderFor(
  component: string,
):
  | ((node: ProjectionNode, ctx: { renderChildren: (n: ProjectionNode) => unknown[] }) => unknown)
  | null {
  return API_RENDERERS.get(component as never) ?? null;
}

export function registerApiRestSurfaceHandlers(): void {
  if (getSurfaceHandlerSet("api.rest")) return;
  registerSurfaceHandlerSet("api.rest", {
    computeHandlers: (tree: ProjectionTree, projection: ProjectionModel) =>
      apiDispatch(
        tree,
        { projector: { projector: projection.projector, version: projection.version } },
        renderFor,
      ).handlers,
    decodeRequest: (req, handlers, sessionCaps) =>
      decodeHttpRequest(
        { method: req.method, path: req.path, body: req.body, headers: req.headers ?? {} },
        handlers as Parameters<typeof decodeHttpRequest>[1],
        { capabilities: sessionCaps },
      ),
    encodeSuccess,
    encodeError,
  });
}

registerApiRestSurfaceHandlers();
