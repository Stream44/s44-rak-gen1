import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeText } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};
const label = (tab: string) =>
  tab
    .replace(/([A-Z])/g, " $1")
    .replace(/-/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

export default function render(node: ProjectionNode, _ctx: Ctx): string {
  const p = node.props as { tabs?: string[]; active?: string; ctxPath?: string; path?: string };
  const tabs = (p.tabs ?? [])
    .map(
      (tab) =>
        `<button type="button" data-action-ref="ui.set" data-tab-trigger="${tab}" data-ctx-path="${p.ctxPath ?? "page"}" data-ui-set-path="${p.path ?? "activeTab"}" data-value="${tab}" aria-selected="${String(tab === p.active)}">${escapeText(label(tab))}</button>`,
    )
    .join("");
  return `<div role="tablist"${buildAttrs(node)}>${tabs}</div>`;
}
