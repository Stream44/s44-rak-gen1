import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";

export interface CliStdoutContext {
  ansi: boolean;
  renderChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, ctx: CliStdoutContext): string {
  const label = String(node.props.label ?? "");
  const state = String(node.props.state ?? "running");
  if (state === "done") return `${ctx.ansi ? "[✓]" : "[OK]"} ${label}`;
  if (state === "failed") return `${ctx.ansi ? "[✗]" : "[X]"} ${label}`;
  return `${ctx.ansi ? "[…]" : "[...]"} ${label}`;
}
