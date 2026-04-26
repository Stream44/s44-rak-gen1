import type {
  ProjectionNode,
  ProjectionTree,
  RenderContext,
} from "../../L01-foundation/projection-types.ts";
import {
  ANSI_RE,
  type CliFrame,
  type CliStdoutContext,
  type StdoutOutput,
  type StdoutRenderOptions,
} from "./backend-helpers.ts";

export default function dispatch(
  tree: ProjectionTree,
  _ctx: RenderContext,
  opts: StdoutRenderOptions,
  lookupRender: (
    component: string,
  ) => ((node: ProjectionNode, ctx: CliStdoutContext) => string) | null,
): StdoutOutput {
  const ansi = opts.ansi ?? true;
  const renderChildren = (n: ProjectionNode): string => n.children.map(renderNode).join("\n");
  function renderNode(n: ProjectionNode): string {
    if (n.component === "_guarded") {
      const rendered = n.children[0] ? renderNode(n.children[0]) : "";
      return ansi ? `\x1b[2m${rendered}\x1b[22m` : `[redacted: ${rendered.replace(ANSI_RE, "")}]`;
    }
    const r = lookupRender(n.component);
    return r ? r(n, { ansi, renderChildren }) : renderChildren(n);
  }
  const text = renderNode(tree.root);
  const frames: CliFrame[] = [{ stream: "stdout", text }];
  return { stdout: text, exitCode: 0, frames };
}
