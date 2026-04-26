import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";

export interface CliStdoutContext {
  ansi: boolean;
  renderChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, _ctx: CliStdoutContext): string {
  const pairs = Array.isArray(node.props.pairs) ? node.props.pairs : [];
  const keys = pairs.map((pair) =>
    typeof pair === "object" && pair !== null && "key" in pair ? String(pair.key) : "",
  );
  const width = Math.max(0, ...keys.map((key) => key.length));
  return pairs
    .map((pair) => {
      const key =
        typeof pair === "object" && pair !== null && "key" in pair ? String(pair.key) : "";
      const value =
        typeof pair === "object" && pair !== null && "value" in pair
          ? String(pair.value ?? "")
          : "";
      return `  ${key.padEnd(width, " ")}: ${value}`;
    })
    .join("\n");
}
