import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";

export interface ApiRestContext {
  renderChildren: (node: ProjectionNode) => unknown[];
}

export default function render(node: ProjectionNode, _ctx: ApiRestContext): unknown {
  return {
    kind: "response",
    status: node.props.status,
    contentType: "application/json",
    schema: node.props.schema ?? {
      type: "object",
      properties: { error: { type: "string" }, code: { type: "string" } },
    },
    description: node.props.message,
  };
}
