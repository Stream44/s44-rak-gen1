import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

export interface UiHtmlContext {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
}

const btn = (item: { id?: unknown; label?: unknown }, active: string, data = "") =>
  `<button class="tab"${data ? ` ${data}` : ""} data-tab-id="${escapeAttr(String(item.id ?? ""))}" aria-selected="${String(String(item.id ?? "") === active)}">${escapeText(item.label ?? item.id ?? "")}</button>`;

export default function render(node: ProjectionNode, _ctx: UiHtmlContext): string {
  const p = node.props ?? {},
    groups = Array.isArray(p.groups)
      ? (p.groups as Array<{
          id?: unknown;
          label?: unknown;
          children?: Array<{ id?: unknown; label?: unknown }>;
        }>)
      : [];
  const activeParent = String(p.activeParent ?? ""),
    activeChild = String(p.activeChild ?? ""),
    activeGroup = groups.find((group) => String(group.id ?? "") === activeParent);
  const attrs = buildAttrs({
    ...node,
    props: { ...p, "class": undefined, "data-parent": undefined, "data-child": undefined },
  } as ProjectionNode);
  if (p.ctxPath === undefined && p.parentPath === undefined && p.childPath === undefined) {
    const parents = groups.map((group) => btn(group, activeParent)).join(""),
      children = (activeGroup?.children ?? []).map((child) => btn(child, activeChild)).join("");
    return `<div class="tabs-nested${p.class ? ` ${escapeAttr(String(p.class))}` : ""}" data-parent="${escapeAttr(activeParent)}" data-child="${escapeAttr(activeChild)}"${attrs}><div class="tabs-row tabs-row-parent">${parents}</div><div class="tabs-row tabs-row-child">${children}</div></div>`;
  }
  const ctxPath = escapeAttr(String(p.ctxPath ?? "page"));
  const parentPath = escapeAttr(String(p.parentPath ?? "activeTab"));
  const childPath = escapeAttr(String(p.childPath ?? "activeNestedTab"));
  const parents = groups
    .map((group) =>
      btn(
        group,
        activeParent,
        `data-action-ref="ui.set" data-tab-trigger="${escapeAttr(String(group.id ?? ""))}" data-ctx-path="${ctxPath}" data-ui-set-path="${parentPath}" data-value="${escapeAttr(String(group.id ?? ""))}"`,
      ),
    )
    .join("");
  const children = (activeGroup?.children ?? [])
    .map((child) =>
      btn(
        child,
        activeChild,
        `data-action-ref="ui.set" data-tab-trigger="${escapeAttr(String(child.id ?? ""))}" data-ctx-path="${ctxPath}" data-ui-set-path="${childPath}" data-value="${escapeAttr(String(child.id ?? ""))}"`,
      ),
    )
    .join("");
  return `<div class="tabs-nested${p.class ? ` ${escapeAttr(String(p.class))}` : ""}" data-parent="${escapeAttr(activeParent)}" data-child="${escapeAttr(activeChild)}"${attrs}><div class="tabs-row tabs-row-parent">${parents}</div><div class="tabs-row tabs-row-child">${children}</div></div>`;
}
