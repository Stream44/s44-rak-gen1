import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr } from "../backend-helpers.ts";

export interface UiHtmlContext {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, ctx: UiHtmlContext): string {
  const p = node.props ?? {},
    raw = Number(p.cols),
    cols = Number.isFinite(raw) ? Math.max(1, Math.min(12, raw)) : 4;
  const style = `--cols: ${cols}; grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr))${p.style ? `; ${String(p.style)}` : ""}`;
  return `<div class="grid-dense${p.class ? ` ${escapeAttr(String(p.class))}` : ""}" style="${escapeAttr(style)}"${buildAttrs({ ...node, props: { ...p, class: undefined, style: undefined } } as ProjectionNode)}>${ctx.renderChildren(node)}</div>`;
}
