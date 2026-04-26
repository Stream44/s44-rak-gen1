import type {
  ProjectionNode,
  ProjectionTree,
  RenderContext,
} from "../L01-foundation/projection-types.ts";
import materializeProjectionNodeImpl from "./morphisms/materialize-projection-node.ts";

export const materializeProjectionNode = (
  node: ProjectionNode,
  context: RenderContext,
  handlers: ProjectionTree["actionHandlers"],
  uiContextState: Map<string, Record<string, unknown>>,
  normalizeMorphismResult: (
    value: unknown,
    context: RenderContext,
    handlers: ProjectionTree["actionHandlers"],
  ) => ProjectionNode[],
): ProjectionNode =>
  materializeProjectionNodeImpl({
    node,
    context,
    handlers,
    uiContextState,
    normalizeMorphismResult,
  });
