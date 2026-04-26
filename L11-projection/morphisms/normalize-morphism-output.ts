import { compileMorphism } from "../algebra.ts";
import type { MorphismAST } from "../../L01-foundation/morphism-ast.ts";
import type {
  ChildSpec,
  ProjectionNode,
  ProjectionTree,
  RenderContext,
} from "../../L01-foundation/projection-types.ts";
import type { ProjectionSession } from "../session.ts";
import evaluateProjectionMorphism from "./evaluate-projection-morphism.ts";

type CapabilityEngine = {
  authorize(intent: unknown, capabilityId: string): { authorized: boolean };
  authorizeResource(
    capId: string,
    resourceId: string,
    subject: { id: string },
  ): { authorized: boolean };
};

export interface NormalizeMorphismOutputInput {
  value: unknown;
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

const isProjectionNode = (value: unknown): value is ProjectionNode =>
  !!value && typeof value === "object" && "component" in value;
const isPrimitiveNodeLike = (value: unknown): value is ProjectionNode => isProjectionNode(value);
const isChildSpecLike = (value: unknown): value is ChildSpec =>
  isPrimitiveNodeLike(value) ||
  (!!value && typeof value === "object" && ("use" in value || "for" in value || "if" in value));
const isProductNode = (
  value: unknown,
): value is { kind: "product"; left: unknown; right: unknown } =>
  !!value && typeof value === "object" && (value as { kind?: unknown }).kind === "product";
const isMorphismLike = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && "op" in (value as Record<string, unknown>);

export default function normalizeMorphismOutput(
  input: NormalizeMorphismOutputInput,
): ProjectionNode[] {
  const { value, context, handlers } = input;
  if (value === null || value === undefined) return [];
  if (Array.isArray(value))
    return value.flatMap((entry) => normalizeMorphismOutput({ ...input, value: entry }));
  if (isPrimitiveNodeLike(value) || isChildSpecLike(value))
    return input.renderChild(value as ChildSpec, context, handlers);
  if (isProjectionNode(value)) return [input.materializeProjectionNode(value, context, handlers)];
  if (isProductNode(value)) {
    return [
      ...normalizeMorphismOutput({ ...input, value: value.left }),
      ...normalizeMorphismOutput({ ...input, value: value.right }),
    ];
  }
  if (isMorphismLike(value)) {
    return normalizeMorphismOutput({
      ...input,
      value: evaluateProjectionMorphism({
        compiledMorphism: compileMorphism(value) as MorphismAST,
        context,
        handlers,
        pageBindings: input.pageBindings,
        session: input.session,
        capabilityEngine: input.capabilityEngine,
        resolveAsset: input.resolveAsset,
      }),
    });
  }
  return [
    {
      component: "Text",
      props: { text: String(value) },
      children: [],
      nodeId: `n${context.nodeIdCounter.n++}`,
    },
  ];
}
