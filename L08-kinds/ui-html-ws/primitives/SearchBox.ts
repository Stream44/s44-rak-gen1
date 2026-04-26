import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};
const ctxPath = (bind: unknown, raw?: unknown) => {
  const source = typeof raw === "string" ? raw : bind;
  return typeof source === "string" && source.startsWith("$ctx.") ? source.slice(5) : "query";
};

export default function render(node: ProjectionNode, _ctx: Ctx): string {
  const p = node.props as {
    "bind"?: unknown;
    "placeholder"?: string;
    "debounceMs"?: number;
    "value"?: string;
    "data-ui-set-path"?: string;
  };
  return `<input type="search" placeholder="${escapeAttr(p.placeholder ?? "")}" value="${escapeAttr(String(p.value ?? ""))}" data-ui-set="true" data-ctx-path="page" data-ui-set-path="${escapeAttr(p["data-ui-set-path"] ?? ctxPath(p.bind, node.bindingPaths?.bind))}" data-adapter="animation-timing" data-debounce-ms="${escapeAttr(String(p.debounceMs ?? 0))}"${buildAttrs(node)}/>`;
}
