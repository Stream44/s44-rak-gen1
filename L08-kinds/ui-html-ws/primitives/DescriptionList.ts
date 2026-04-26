import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

export interface UiHtmlContext {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
}

const rows = (node: ProjectionNode) =>
  Array.isArray(node.props?.items)
    ? node.props.items
    : node.children.filter(
        (child) =>
          child.component === "DescriptionRow" ||
          (child as { kind?: string }).kind === "DescriptionRow",
      );

export default function render(node: ProjectionNode, ctx: UiHtmlContext): string {
  const p = node.props ?? {},
    attrs = buildAttrs({ ...node, props: { ...p, class: undefined } } as ProjectionNode);
  const body = rows(node)
    .map(
      (row) =>
        `<dt>${escapeText((row as ProjectionNode).props?.term ?? (row as { term?: unknown }).term ?? "")}</dt><dd>${escapeText((row as ProjectionNode).props?.detail ?? (row as { detail?: unknown }).detail ?? "")}</dd>`,
    )
    .join("");
  return `<dl class="description-list${p.class ? ` ${escapeAttr(String(p.class))}` : ""}"${attrs}>${body}</dl>`;
}
