import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

export interface UiHtmlContext {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, _ctx: UiHtmlContext): string {
  const p = node.props;
  const level = Math.max(1, Math.min(6, (p.level as number) ?? 1));
  return `<h${level}${buildAttrs(node)}>${escapeText((p.text as string) ?? "")}</h${level}>`;
}
