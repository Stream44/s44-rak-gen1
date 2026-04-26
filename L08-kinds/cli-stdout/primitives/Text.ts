import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";

export interface CliStdoutContext {
  ansi: boolean;
  renderChildren: (node: ProjectionNode) => string;
}

const ANSI_BY_TONE: Record<string, string> = {
  success: "\x1b[32m",
  warn: "\x1b[33m",
  error: "\x1b[31m",
  info: "\x1b[36m",
};

export default function render(node: ProjectionNode, ctx: CliStdoutContext): string {
  const text = String(node.props.text ?? "");
  const tone = typeof node.props.tone === "string" ? node.props.tone : undefined;
  const open = tone ? ANSI_BY_TONE[tone] : undefined;
  if (!ctx.ansi || !open) return text;
  return `${open}${text}\x1b[0m`;
}
