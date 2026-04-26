import type { ProjectionNode } from "../../L01-foundation/projection-types.ts";

const passthrough = new Set(["id", "class", "style", "role", "title"]);

export function buildAttrs(node: ProjectionNode, opts?: { baseClass?: string }): string {
  const attrs: string[] = [];
  if (node.nodeId) attrs.push(`data-node-id="${escapeAttr(node.nodeId)}"`);
  if (node.actionBinding) {
    attrs.push(`data-action-ref="${escapeAttr(node.actionBinding.action)}"`);
    attrs.push(`data-action="${escapeAttr(node.actionBinding.action)}"`);
    if (node.actionBinding.target !== undefined) {
      attrs.push(`data-action-target="${escapeAttr(String(node.actionBinding.target))}"`);
    }
    if (node.actionBinding.payload && Object.keys(node.actionBinding.payload).length > 0) {
      attrs.push(`data-action-payload="${escapeAttr(JSON.stringify(node.actionBinding.payload))}"`);
    }
  }
  if (node.disabled) attrs.push("disabled");
  const propClass =
    typeof (node.props ?? {}).class === "string"
      ? ((node.props as Record<string, unknown>).class as string)
      : "";
  const mergedClass = opts?.baseClass
    ? propClass
      ? `${opts.baseClass} ${propClass}`
      : opts.baseClass
    : propClass;
  if (mergedClass) attrs.push(`class="${escapeAttr(mergedClass)}"`);
  for (const [key, value] of Object.entries(node.props ?? {})) {
    if (value === undefined || value === null) continue;
    if (key === "class") continue; // handled above
    if (!passthrough.has(key) && !key.startsWith("data-") && !key.startsWith("aria-")) continue;
    if (typeof value === "boolean") {
      if (value) attrs.push(key);
      continue;
    }
    attrs.push(`${key}="${escapeAttr(String(value))}"`);
  }

  return attrs.length > 0 ? " " + attrs.join(" ") : "";
}

export function escapeText(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function escapeAttr(s: unknown): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
}
