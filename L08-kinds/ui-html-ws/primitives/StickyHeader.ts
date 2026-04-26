import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr } from "../backend-helpers.ts";

export interface UiHtmlContext {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, ctx: UiHtmlContext): string {
  const p = node.props ?? {},
    attrs = buildAttrs({ ...node, props: { ...p, class: undefined } } as ProjectionNode);
  return `<div class="sticky-header${p.class ? ` ${escapeAttr(String(p.class))}` : ""}"${attrs}>${ctx.renderChildren(node)}</div>`;
}
