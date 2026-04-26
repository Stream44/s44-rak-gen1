import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

type UiHtmlContext = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};

type ActionBinding = {
  action?: string;
  target?: unknown;
  payload?: Record<string, unknown>;
};

const actionAttrs = (
  binding: ActionBinding | undefined,
  attr: string,
  payloadAttr: string,
  targetAttr?: string,
): string => {
  if (!binding?.action) return "";
  const attrs = [`${attr}="${escapeAttr(binding.action)}"`];
  if (binding.payload && Object.keys(binding.payload).length > 0) {
    attrs.push(`${payloadAttr}="${escapeAttr(JSON.stringify(binding.payload))}"`);
  }
  if (targetAttr && binding.target !== undefined && binding.target !== null) {
    attrs.push(`${targetAttr}="${escapeAttr(String(binding.target))}"`);
  }
  return ` ${attrs.join(" ")}`;
};

export default function render(node: ProjectionNode, _ctx: UiHtmlContext): string {
  const p = node.props as {
    value?: unknown;
    editing?: unknown;
    id?: unknown;
    as?: unknown;
    placeholder?: unknown;
    onEditStart?: ActionBinding;
    onEditCommit?: ActionBinding;
    onEditCancel?: ActionBinding;
    onEditEnd?: ActionBinding;
  };
  const value = String(p.value ?? "");
  const id = String(p.id ?? "");

  if (p.editing === true) {
    return `<input type="text" value="${escapeAttr(value)}" placeholder="${escapeAttr(String(p.placeholder ?? ""))}" autofocus data-editable-input="true" data-editable-id="${escapeAttr(id)}"${actionAttrs(p.onEditCommit, "data-editable-commit", "data-editable-commit-payload", "data-editable-commit-target")}${actionAttrs(p.onEditCancel, "data-editable-cancel", "data-editable-cancel-payload", "data-editable-cancel-target")}${actionAttrs(p.onEditEnd, "data-editable-end", "data-editable-end-payload", "data-editable-end-target")}${buildAttrs(node, { baseClass: "edit" })}/>`;
  }

  const tag = p.as === "label" ? "label" : "span";
  return `<${tag}${actionAttrs(p.onEditStart, "data-editable-start", "data-editable-start-payload")}${buildAttrs(node)}>${escapeText(value)}</${tag}>`;
}
