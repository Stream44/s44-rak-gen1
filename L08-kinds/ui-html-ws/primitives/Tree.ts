import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};
type TreeNode = {
  label?: unknown;
  name?: unknown;
  title?: unknown;
  id?: unknown;
  children?: unknown[];
};
const label = (node: TreeNode) => String(node.label ?? node.name ?? node.title ?? node.id ?? "");
const branch = (items: unknown[]) =>
  items
    .map((item) => {
      const text = label((item ?? {}) as TreeNode);
      return `<li><button type="button" data-tree-leaf="${escapeAttr(text)}">${escapeText(text)}</button></li>`;
    })
    .join("");

export default function render(node: ProjectionNode, _ctx: Ctx): string {
  const p = node.props as {
    node?: TreeNode;
    expandable?: boolean;
    expanded?: boolean;
    fetchChildren?: string;
    childrenData?: unknown[];
  };
  const kids = p.childrenData ?? p.node?.children ?? [],
    open = !!p.expandable && !!p.expanded;
  const toggle = p.expandable
    ? `<button type="button" data-tree-toggle="true"${p.fetchChildren ? ` data-fetch-children="${escapeAttr(p.fetchChildren)}"` : ""}>${open ? "▾" : "▸"}</button>`
    : "";
  return `<div class="tree" data-tree-open="${open ? "true" : "false"}"${buildAttrs(node)}>${toggle}<span>${escapeText(label(p.node ?? {}))}</span><ul style="display:${open ? "block" : "none"}">${branch(Array.isArray(kids) ? kids : [])}</ul></div>`;
}
