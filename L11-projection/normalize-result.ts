import type {
  ChildSpec,
  ProjectionNode,
  ProjectionTree,
  RenderContext,
} from "../L01-foundation/projection-types.ts";
import type { ProjectionSession } from "./session.ts";
import normalizeMorphismOutput from "./morphisms/normalize-morphism-output.ts";

type CapabilityEngine = {
  authorize(intent: unknown, capabilityId: string): { authorized: boolean };
  authorizeResource(
    capId: string,
    resourceId: string,
    subject: { id: string },
  ): { authorized: boolean };
};

export interface NormalizeResultContext {
  context: RenderContext;
  handlers: ProjectionTree["actionHandlers"];
  pageBindings: Map<string, unknown>;
  session: ProjectionSession;
  capabilityEngine?: CapabilityEngine;
  renderChild: (
    child: ChildSpec,
    context: RenderContext,
    handlers: ProjectionTree["actionHandlers"],
  ) => ProjectionNode[];
  materializeProjectionNode: (
    node: ProjectionNode,
    context: RenderContext,
    handlers: ProjectionTree["actionHandlers"],
  ) => ProjectionNode;
  resolveAsset: (ref: string, rawProps: Record<string, unknown> | undefined) => ProjectionNode;
}

export const normalizeMorphismResult = (
  value: unknown,
  input: NormalizeResultContext,
): ProjectionNode[] => normalizeMorphismOutput({ value, ...input });
