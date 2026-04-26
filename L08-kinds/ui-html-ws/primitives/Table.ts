import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

export interface UiHtmlContext {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
}

const attrs = (node: ProjectionNode, extra = "") => {
  const p = node.props ?? {},
    cls = `table${p.class ? ` ${String(p.class)}` : ""}`;
  return ` class="${escapeAttr(cls)}"${extra}${buildAttrs({ ...node, props: { ...p, class: undefined } } as ProjectionNode)}`;
};

export default function render(node: ProjectionNode, ctx: UiHtmlContext): string {
  const p = node.props ?? {},
    cols = (
      Array.isArray(p.columns)
        ? p.columns
        : node.children.filter((child) => child.component === "TableColumn")
    ).map((col) =>
      typeof col === "string"
        ? col
        : ((col as ProjectionNode).props?.label ?? (col as { label?: unknown }).label ?? ""),
    );
  const bodyNode = {
    ...node,
    children: node.children.filter((child) => child.component !== "TableColumn"),
  } as ProjectionNode;
  const flags = `${p.sortable ? ' data-sortable="true"' : ""}${p.filterable ? ' data-filterable="true"' : ""}`;
  const body = bodyNode.children.some(
    (child) => typeof (child as ProjectionNode).props?.html === "string",
  )
    ? bodyNode.children.map((child) => String((child as ProjectionNode).props?.html ?? "")).join("")
    : ctx.renderChildren(bodyNode);
  return `<table${attrs(node, flags)}><thead><tr>${cols.map((label) => `<th>${escapeText(label)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
}
