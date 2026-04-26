import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeText } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};

export default function render(node: ProjectionNode, ctx: Ctx): string {
  const p = node.props ?? {},
    action = ctx.renderChildren(node);
  const attrs = buildAttrs({ ...node, props: { ...p, class: undefined } } as ProjectionNode);
  return `<div class="empty-state"${attrs}><div class="empty-state-message">${escapeText((p.message as string) ?? "")}</div>${action ? `<div class="empty-state-action">${action}</div>` : ""}</div>`;
}
