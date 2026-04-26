import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};

export default function render(node: ProjectionNode, _ctx: Ctx): string {
  const p = node.props ?? {},
    value = String(p.value ?? ""),
    text =
      p.truncate === false || value.length <= 14
        ? value
        : `${value.slice(0, 8)}…${value.slice(-4)}`;
  const attrs = buildAttrs({
    ...node,
    props: { ...p, class: undefined, title: undefined },
  } as ProjectionNode);
  const title = ` title="${escapeAttr(value)}"`;
  return p.block
    ? `<pre class="code code-block"${attrs}><code${title}>${escapeText(text)}</code></pre>`
    : `<code class="code code-inline"${attrs}${title}>${escapeText(text)}</code>`;
}
