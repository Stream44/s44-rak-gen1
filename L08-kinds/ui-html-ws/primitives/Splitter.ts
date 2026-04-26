import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

export interface UiHtmlContext {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
}

const pane = (node: ProjectionNode, ctx: UiHtmlContext, child: ProjectionNode) =>
  ctx.renderChildren({ ...node, children: [child] } as ProjectionNode);

export default function render(node: ProjectionNode, ctx: UiHtmlContext): string {
  const p = node.props ?? {},
    kids = node.children ?? [],
    orientation = p.orientation === "vertical" ? "vertical" : "horizontal",
    initial = escapeAttr(String(typeof p.initial === "number" ? p.initial : 50));
  const cls = `splitter${p.class ? ` ${escapeAttr(String(p.class))}` : ""}`,
    attrs = buildAttrs({
      ...node,
      props: { ...p, "class": undefined, "data-orientation": undefined, "data-initial": undefined },
    } as ProjectionNode);
  if (kids.length !== 2)
    return `<div class="${cls} splitter-error" data-orientation="${orientation}" data-initial="${initial}" title="Splitter: expected exactly 2 children"${attrs}>${escapeText("Splitter: expected exactly 2 children")}</div>`;
  return `<div class="${cls}" data-orientation="${orientation}" data-initial="${initial}"${attrs}><div class="splitter-pane splitter-pane-a">${pane(node, ctx, kids[0] as ProjectionNode)}</div><div class="splitter-handle" role="separator" tabindex="0"></div><div class="splitter-pane splitter-pane-b">${pane(node, ctx, kids[1] as ProjectionNode)}</div></div>`;
}
