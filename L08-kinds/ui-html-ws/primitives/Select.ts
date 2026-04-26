import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};
type Option = { value?: unknown; label?: unknown };

export default function render(node: ProjectionNode, _ctx: Ctx): string {
  const p = node.props as {
    "value"?: unknown;
    "options"?: Option[];
    "onChange"?: { action?: string; payload?: Record<string, unknown> };
    "actionRef"?: string;
    "payloadKey"?: string;
    "data-ui-set-path"?: string;
  };
  const payloadKey =
    p.payloadKey ??
    Object.entries(p.onChange?.payload ?? {}).find(([, value]) => value === "$event.value")?.[0] ??
    "value";
  const actionRef = p.actionRef ?? p.onChange?.action ?? "";
  const options = (Array.isArray(p.options) ? p.options : [])
    .map((option) => {
      const value = String(option.value ?? "");
      return `<option value="${escapeAttr(value)}"${value === String(p.value ?? "") ? " selected" : ""}>${escapeText(option.label ?? value)}</option>`;
    })
    .join("");
  return `<select data-ui-set="true" data-ctx-path="page" data-ui-set-path="${escapeAttr(p["data-ui-set-path"] ?? "suiteId")}" data-action-ref="${escapeAttr(actionRef)}" data-action-payload-key="${escapeAttr(payloadKey)}"${buildAttrs(node)}>${options}</select>`;
}
