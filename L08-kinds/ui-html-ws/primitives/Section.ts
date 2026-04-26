import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

export interface UiHtmlContext {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, ctx: UiHtmlContext): string {
  const p = node.props;
  const title = p.title as string | undefined;
  const header = title ? `<header>${escapeText(title)}</header>` : "";
  return `<section${buildAttrs(node)}>${header}${ctx.renderChildren(node)}</section>`;
}
