import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};

export default function render(node: ProjectionNode, ctx: Ctx): string {
  return `<td${buildAttrs(node)}>${ctx.renderChildren(node)}</td>`;
}
