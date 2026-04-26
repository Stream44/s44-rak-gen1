import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";

export interface CliStdoutContext {
  ansi: boolean;
  renderChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, _ctx: CliStdoutContext): string {
  const text = String(node.props.text ?? "");
  const level = typeof node.props.level === "number" ? node.props.level : 2;
  const underline = (level === 1 ? "=" : level === 3 ? "~" : "-").repeat(text.length);
  return `${text}\n${underline}`;
}
