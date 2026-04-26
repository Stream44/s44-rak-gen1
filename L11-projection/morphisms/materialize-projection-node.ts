import type {
  ActionBindingDef,
  ProjectionNode,
  ProjectionTree,
  RenderContext,
} from "../../L01-foundation/projection-types.ts";
import { resolveActionBinding, resolveProps } from "../binding-resolution.ts";
import { mergeUiContextFrame } from "../session-state.ts";

export interface MaterializeProjectionNodeInput {
  node: ProjectionNode;
  context: RenderContext;
  handlers: ProjectionTree["actionHandlers"];
  uiContextState: Map<string, Record<string, unknown>>;
  normalizeMorphismResult: (
    value: unknown,
    context: RenderContext,
    handlers: ProjectionTree["actionHandlers"],
  ) => ProjectionNode[];
}

export default function materializeProjectionNode(
  input: MaterializeProjectionNodeInput,
): ProjectionNode {
  const { node, context, handlers } = input;
  const props =
    node.component === "Endpoint"
      ? { ...(node.props ?? {}) }
      : resolveProps(node.props ?? {}, context);
  const rawChildren = props.children,
    rawOnClick = props.onClick,
    rawOnSubmit = props.onSubmit;
  delete props.children;
  delete props.onClick;
  delete props.onSubmit;
  let actionBinding = node.actionBinding;
  if (
    !actionBinding &&
    rawOnClick &&
    typeof rawOnClick === "object" &&
    !Array.isArray(rawOnClick)
  ) {
    actionBinding = resolveActionBinding(rawOnClick as unknown as ActionBindingDef, context);
  } else if (
    !actionBinding &&
    rawOnSubmit &&
    typeof rawOnSubmit === "object" &&
    !Array.isArray(rawOnSubmit)
  ) {
    actionBinding = resolveActionBinding(rawOnSubmit as unknown as ActionBindingDef, context);
  }
  const nodeId = node.nodeId ?? `n${context.nodeIdCounter.n++}`;
  const nextContext =
    node.component === "Context" && typeof props.scope === "string"
      ? {
          ...context,
          props: {
            ...context.props,
            __pp09ContextStack: mergeUiContextFrame(
              Array.isArray(context.props.__pp09ContextStack)
                ? (context.props.__pp09ContextStack as Array<Record<string, unknown>>)
                : [],
              String(props.scope),
              typeof props.initial === "object" &&
                props.initial !== null &&
                !Array.isArray(props.initial)
                ? (props.initial as Record<string, unknown>)
                : {},
              input.uiContextState,
            ),
          },
        }
      : context;
  const materialized: ProjectionNode = {
    ...node,
    props,
    children: [
      ...(node.children ?? []).flatMap((child) =>
        input.normalizeMorphismResult(child, nextContext, handlers),
      ),
      ...input.normalizeMorphismResult(rawChildren, nextContext, handlers),
    ],
    nodeId,
    ...(actionBinding ? { actionBinding } : {}),
  };
  if (actionBinding && !handlers.some((entry) => entry.nodeId === nodeId))
    handlers.push({ nodeId, binding: actionBinding });
  return materialized;
}
