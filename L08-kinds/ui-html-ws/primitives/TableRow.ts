import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};

// A TableRow carrying a ui-set action-ref or a data-action is selectable — the
// primitive auto-annotates `data-selectable="true"` so theme.css can target it
// for hover / cursor / selection visuals uniformly, without every projection
// having to duplicate the class on each row.
function isSelectable(node: ProjectionNode): boolean {
  const props = (node.props ?? {}) as Record<string, unknown>;
  const actionRef = props["data-action-ref"];
  const uiSetPath = props["data-ui-set-path"];
  const action = props["data-action"];
  return (
    (typeof actionRef === "string" && actionRef.length > 0) ||
    (typeof uiSetPath === "string" && uiSetPath.length > 0) ||
    (typeof action === "string" && action.length > 0) ||
    node.actionBinding != null
  );
}

export default function render(node: ProjectionNode, ctx: Ctx): string {
  const selectable = isSelectable(node);
  return `<tr${buildAttrs(node, selectable ? { baseClass: "selectable" } : undefined)}>${ctx.renderChildren(node)}</tr>`;
}
