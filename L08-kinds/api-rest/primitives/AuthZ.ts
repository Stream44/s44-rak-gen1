import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";

export interface ApiRestContext {
  renderChildren: (node: ProjectionNode) => unknown[];
}

export default function render(node: ProjectionNode, _ctx: ApiRestContext): unknown {
  return { kind: "authz", scheme: node.props.scheme, scopes: node.props.scopes ?? [] };
}
