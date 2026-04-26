import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};
type Segment = {
  label?: unknown;
  href?: unknown;
  current?: unknown;
  onClick?: { action?: unknown; payload?: unknown };
};

export default function render(node: ProjectionNode, _ctx: Ctx): string {
  const p = node.props ?? {},
    stack = Array.isArray(p.stack) ? (p.stack as Segment[]) : [],
    trail = (
      Array.isArray(p.trail)
        ? p.trail
        : stack.map((frame, index) => ({
            label:
              (frame as { label?: unknown; scope?: unknown }).label ??
              (frame as { scope?: unknown }).scope ??
              "Root",
            current: index === stack.length - 1,
            onClick:
              index < stack.length - 1
                ? { action: "ctx.pop-to", payload: { depth: index } }
                : undefined,
          }))
    ) as Segment[];
  return `<nav${buildAttrs(node, { baseClass: "breadcrumb" })}>${trail
    .map((segment, index) => {
      const attrs = `${segment.current ? ' data-current="true"' : ` data-breadcrumb="${escapeAttr(String(segment.label ?? "")).toLowerCase()}"`}${segment.onClick?.action ? ` data-action-ref="${escapeAttr(segment.onClick.action)}" data-action-payload="${escapeAttr(JSON.stringify(segment.onClick.payload ?? {}))}"` : ""}${segment.href ? ` href="${escapeAttr(segment.href)}"` : ""}`;
      const tag = segment.href ? "a" : "span";
      return `<${tag} class="breadcrumb-segment"${attrs}>${escapeText(segment.label ?? "")}</${tag}>${index < trail.length - 1 ? '<span class="breadcrumb-separator">▸</span>' : ""}`;
    })
    .join("")}</nav>`;
}
