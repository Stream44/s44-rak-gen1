type Child = { htmlFragment?: string };

export type ProjectionTreeNode = {
  kind: "ctxScope";
  scope: string;
  initial: Record<string, unknown>;
  mirror: string[];
  key?: unknown;
  children: Child[];
  ctxMeta: { scope: string; initial: Record<string, unknown>; mirror: string[]; key?: unknown };
  htmlFragment: string;
};

export default function render(
  props: {
    scope: string;
    initial?: Record<string, unknown>;
    mirror?: string[];
    key?: unknown;
    children?: unknown[];
  },
  renderChildren: (children: unknown[]) => Child[],
): ProjectionTreeNode {
  const scope = props.scope,
    initial = props.initial ?? {},
    mirror = props.mirror ?? [],
    key = props.key,
    children = renderChildren(props.children ?? []);
  const childrenHtml = children.map((child) => child.htmlFragment ?? "").join("");
  return {
    kind: "ctxScope",
    scope,
    initial,
    mirror,
    key,
    children,
    ctxMeta: { scope, initial, mirror, key },
    htmlFragment: `<!--ctx-scope:${scope}-->${childrenHtml}<!--/ctx-scope:${scope}-->`,
  };
}
