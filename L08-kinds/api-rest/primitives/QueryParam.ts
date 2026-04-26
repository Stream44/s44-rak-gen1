import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";

export interface ApiRestContext {
  renderChildren: (node: ProjectionNode) => unknown[];
}

export default function render(node: ProjectionNode, _ctx: ApiRestContext): unknown {
  return {
    kind: "queryParam",
    name: node.props.name,
    required: node.props.required ?? false,
    schema: node.props.schema ?? { type: "string" },
    description: node.props.description,
  };
}
