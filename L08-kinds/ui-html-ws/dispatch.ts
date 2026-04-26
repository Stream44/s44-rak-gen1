import type { ProjectionNode, ProjectionTree } from "../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr } from "./backend-helpers.ts";
import emitHandlersJs from "./ws-action.ts";

export interface HtmlOutput {
  html: string;
  handlersJs: string;
}

export default function dispatch(
  tree: ProjectionTree,
  lookupRender: (component: string) =>
    | ((
        node: ProjectionNode,
        ctx: {
          renderChildren: (n: ProjectionNode) => string;
          renderListChildren: (n: ProjectionNode) => string;
        },
      ) => string)
    | null,
): HtmlOutput {
  const renderChildren = (n: ProjectionNode): string => n.children.map(renderNode).join("");
  // Mirror top-level `class` from the child onto the <li> wrapper so CSS can
  // target list items directly (e.g. `li.editing`). The class is kept on the
  // child too, so inner-tag selectors (e.g. `li a.selected`) still match.
  const renderListChildren = (n: ProjectionNode): string =>
    n.children
      .map((c) => {
        const cls = typeof c.props?.class === "string" ? (c.props.class as string).trim() : "";
        const liAttrs = cls ? ` class="${escapeAttr(cls)}"` : "";
        return `<li${liAttrs}>${renderNode(c)}</li>`;
      })
      .join("");
  function renderNode(n: ProjectionNode): string {
    const r = lookupRender(n.component);
    return r
      ? r(n, { renderChildren, renderListChildren })
      : `<div data-unknown-primitive="${escapeAttr(n.component)}"${buildAttrs(n)}>${renderChildren(n)}</div>`;
  }
  return { html: renderNode(tree.root), handlersJs: emitHandlersJs(tree) };
}
