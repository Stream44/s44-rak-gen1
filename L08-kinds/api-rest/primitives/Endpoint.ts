import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";

export interface ApiRestContext {
  renderChildren: (node: ProjectionNode) => unknown[];
}

export default function render(node: ProjectionNode, ctx: ApiRestContext): unknown {
  return {
    kind: "endpoint",
    method: node.props.method,
    path: node.props.path,
    summary: node.props.summary,
    description: node.props.description,
    onRequest: node.props.onRequest,
    requires: node.props.requires,
    children: ctx.renderChildren(node),
  };
}
