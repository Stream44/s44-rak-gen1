import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};

export default function render(node: ProjectionNode, ctx: Ctx): string {
  const p = node.props as {
    class?: string;
    orientation?: "h" | "v";
    ratio?: string;
    style?: string;
  };
  const orient = p.orientation === "v" ? "v" : "h",
    flexDir = orient === "v" ? "column" : "row";
  const ratios = String(p.ratio ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .map(Number);
  const attrs = buildAttrs({
    ...node,
    props: { ...p, class: undefined, style: undefined },
  } as ProjectionNode);
  const children = ratios.length
    ? node.children
        .map(
          (child, index) =>
            `<div style="flex:${ratios[index] ?? 1} 1 0">${ctx.renderChildren({ ...node, children: [child] } as ProjectionNode)}</div>`,
        )
        .join("")
    : ctx.renderChildren(node);
  const cls = `split split-${orient}${p.class ? ` ${p.class}` : ""}`;
  const style = `display:flex;flex-direction:${flexDir};height:100%${p.style ? `;${p.style}` : ""}`;
  return `<div class="${escapeAttr(cls)}" style="${escapeAttr(style)}"${attrs}>${children}</div>`;
}
