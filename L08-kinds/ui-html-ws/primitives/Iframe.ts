import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

export interface UiHtmlContext {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, _ctx: UiHtmlContext): string {
  const p = node.props;
  const src = escapeAttr(String(p.src ?? "about:blank"));
  const title = escapeAttr(String(p.title ?? ""));
  const styleAttr = p.style ? ` style="${escapeAttr(String(p.style))}"` : "";
  return `<iframe src="${src}" title="${title}"${styleAttr}${buildAttrs(node)}></iframe>`;
}
