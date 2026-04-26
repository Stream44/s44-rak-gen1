import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};

export default function render(node: ProjectionNode, _ctx: Ctx): string {
  const p = node.props ?? {},
    glyph = typeof p.glyph === "string" ? p.glyph : "",
    svg = typeof p.svg === "string" ? p.svg : "",
    label = typeof p.label === "string" ? p.label : "";
  if ((!glyph && !svg) || (glyph && svg))
    return '<span class="icon icon-error" title="Icon: expected exactly one of glyph|svg">?</span>';
  const attrs = buildAttrs({
    ...node,
    props: {
      ...p,
      "class": undefined,
      "role": undefined,
      "aria-label": undefined,
      "aria-hidden": undefined,
    },
  } as ProjectionNode);
  const a11y = label ? ` role="img" aria-label="${escapeAttr(label)}"` : ' aria-hidden="true"';
  return `<span class="icon"${a11y}${attrs}>${svg || escapeText(glyph)}</span>`;
}
