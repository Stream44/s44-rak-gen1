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
        (child) => child.component === "KV" || (child as { kind?: string }).kind === "KV",
      );

export default function render(node: ProjectionNode, ctx: UiHtmlContext): string {
  const p = node.props ?? {},
    attrs = buildAttrs({ ...node, props: { ...p, class: undefined } } as ProjectionNode);
  const body = rows(node)
    .map(
      (row) =>
        `<dt>${escapeText((row as ProjectionNode).props?.label ?? (row as { label?: unknown }).label ?? "")}</dt><dd>${escapeText((row as ProjectionNode).props?.value ?? (row as { value?: unknown }).value ?? "")}</dd>`,
    )
    .join("");
  return `<dl class="kv-list${p.class ? ` ${escapeAttr(String(p.class))}` : ""}"${attrs}>${body}</dl>`;
}
