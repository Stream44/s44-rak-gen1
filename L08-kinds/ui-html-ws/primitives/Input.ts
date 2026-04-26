import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

export interface UiHtmlContext {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, _ctx: UiHtmlContext): string {
  const p = node.props;
  const valueAttr =
    p.value !== undefined && p.value !== null ? ` value="${escapeAttr(String(p.value))}"` : "";
  const checkedAttr = p.checked === true || p.checked === "true" ? " checked" : "";
  const autofocusAttr = p.autofocus === true || p.autofocus === "true" ? " autofocus" : "";
  return `<input name="${escapeAttr(String(p.name ?? ""))}" type="${escapeAttr(String(p.type ?? "text"))}" placeholder="${escapeAttr(String(p.placeholder ?? ""))}"${valueAttr}${checkedAttr}${autofocusAttr}${buildAttrs(node)}/>`;
}
