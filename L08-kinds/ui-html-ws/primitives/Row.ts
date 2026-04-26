import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

export interface UiHtmlContext {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, ctx: UiHtmlContext): string {
  return `<div${buildAttrs(node, { baseClass: "row" })}>${ctx.renderChildren(node)}</div>`;
}
