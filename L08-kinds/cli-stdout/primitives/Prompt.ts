import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";

export interface CliStdoutContext {
  ansi: boolean;
  renderChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, _ctx: CliStdoutContext): string {
  return `${String(node.props.label ?? "")}: `;
}
