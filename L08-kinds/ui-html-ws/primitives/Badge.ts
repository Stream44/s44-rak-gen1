import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

export interface UiHtmlContext {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, _ctx: UiHtmlContext): string {
  const p = node.props;
  return `<span class="badge" data-tone="${escapeAttr(String(p.tone ?? "neutral"))}"${buildAttrs(node)}>${escapeText((p.label as string) ?? "")}</span>`;
}
