import type {
  ProjectionModel,
  ProjectionNode,
  ProjectionTree,
  RenderContext,
} from "../L01-foundation/projection-types.ts";
import type { MorphismAST } from "../L01-foundation/morphism-ast.ts";
import type { ProjectionSession } from "./session.ts";
import evaluateProjectionMorphism from "./morphisms/evaluate-projection-morphism.ts";

type CapabilityEngine = {
  authorize(intent: unknown, capabilityId: string): { authorized: boolean };
  authorizeResource(
    capId: string,
    resourceId: string,
    subject: { id: string },
  ): { authorized: boolean };
};

type NormalizeResult = (
  value: unknown,
  context: RenderContext,
  handlers: ProjectionTree["actionHandlers"],
) => ProjectionNode[];

export function renderMorphism(input: {
  doc: ProjectionModel;
  pageName: string;
  props: Record<string, unknown>;
  pageBindings: Map<string, unknown>;
  session: ProjectionSession;
  capabilityEngine?: CapabilityEngine;
  resolveAsset: (
    ref: string,
    rawProps: Record<string, unknown> | undefined,
    context: RenderContext,
    handlers: ProjectionTree["actionHandlers"],
  ) => ProjectionNode;
  normalizeResult: NormalizeResult;
}): ProjectionTree {
  const context: RenderContext = {
    pageName: input.pageName,
    route: input.session.route,
    currentUser: input.session.currentUser,
    bindings: input.pageBindings,
    props: input.props,
    nodeIdCounter: { n: 0 },
    session: input.session,
  };
  const actionHandlers: ProjectionTree["actionHandlers"] = [];
  const children = input.normalizeResult(
    evaluateProjectionMorphism({
      compiledMorphism: input.doc.morphism! as MorphismAST,
      context,
      handlers: actionHandlers,
      pageBindings: input.pageBindings,
      session: input.session,
      capabilityEngine: input.capabilityEngine,
      resolveAsset: (ref, rawProps) => input.resolveAsset(ref, rawProps, context, actionHandlers),
    }),
    context,
    actionHandlers,
  );
  return {
    root: { component: "Stack", props: {}, children },
    pageName: input.pageName,
    actionHandlers,
  };
}
