import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr } from "../backend-helpers.ts";

export interface UiHtmlContext {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, ctx: UiHtmlContext): string {
  const p = node.props ?? {},
    align =
      p.align === "start" || p.align === "end" || p.align === "between"
        ? ` data-align="${escapeAttr(String(p.align))}"`
        : "";
  const attrs = buildAttrs({
    ...node,
    props: { ...p, "class": undefined, "role": undefined, "data-align": undefined },
  } as ProjectionNode);
  return `<div class="toolbar${p.class ? ` ${escapeAttr(String(p.class))}` : ""}" role="toolbar"${align}${attrs}>${ctx.renderChildren(node)}</div>`;
}
