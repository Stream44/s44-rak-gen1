import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};
const tones = new Set(["info", "warning", "error", "success", "neutral"]);

export default function render(node: ProjectionNode, _ctx: Ctx): string {
  const p = node.props ?? {},
    label = typeof p.label === "string" ? p.label : "";
  if (!label) return '<span class="pill pill-error" title="Pill: label is required">?</span>';
  const tone = typeof p.tone === "string" && tones.has(p.tone) ? p.tone : "neutral";
  const fallback =
    typeof p.tone === "string" && tone === "neutral" && p.tone !== "neutral"
      ? ` data-tone-fallback="${escapeAttr(p.tone)}"`
      : "";
  const attrs = buildAttrs({ ...node, props: { ...p, class: undefined } } as ProjectionNode);
  return `<span class="pill pill-${tone}"${fallback}${attrs}>${escapeText(label)}</span>`;
}
