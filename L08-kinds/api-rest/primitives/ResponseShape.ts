import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";

export interface ApiRestContext {
  renderChildren: (node: ProjectionNode) => unknown[];
}

export default function render(node: ProjectionNode, _ctx: ApiRestContext): unknown {
  return {
    kind: "response",
    status: node.props.status,
    contentType: node.props.contentType ?? "application/json",
    schema: node.props.schema,
    description: node.props.description,
  };
}
