import { evaluateMorphism } from "../algebra.ts";
import { makeCapabilityGate } from "../capability-enforcement.ts";
import type { MorphismAST } from "../../L01-foundation/morphism-ast.ts";
import type { ProjectionNode, RenderContext } from "../../L01-foundation/projection-types.ts";
import type { ProjectionSession } from "../session.ts";

type CapabilityEngine = {
  authorize(intent: unknown, capabilityId: string): { authorized: boolean };
  authorizeResource(
    capId: string,
    resourceId: string,
    subject: { id: string },
  ): { authorized: boolean };
};

export interface EvaluateProjectionMorphismInput {
  compiledMorphism: MorphismAST;
  context: RenderContext;
  handlers: Array<{ nodeId: string; binding: unknown; kind?: string }>;
  pageBindings: Map<string, unknown>;
  session: ProjectionSession;
  capabilityEngine?: CapabilityEngine;
  resolveAsset: (ref: string, rawProps: Record<string, unknown> | undefined) => ProjectionNode;
}

export default function evaluateProjectionMorphism(
  input: EvaluateProjectionMorphismInput,
): ProjectionNode[] {
  return evaluateMorphism(input.compiledMorphism, {
    bindings: input.pageBindings,
    props: input.context.props,
    route: input.session.route,
    currentUser: input.session.currentUser,
    capabilityGate: makeCapabilityGate(input.session, input.capabilityEngine),
    resolveAsset: input.resolveAsset,
  }) as ProjectionNode[];
}
