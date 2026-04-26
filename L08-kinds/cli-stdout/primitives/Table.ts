import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";

export interface CliStdoutContext {
  ansi: boolean;
  renderChildren: (node: ProjectionNode) => string;
}

export default function render(node: ProjectionNode, _ctx: CliStdoutContext): string {
  const columns = Array.isArray(node.props.columns)
    ? node.props.columns.map((value) => String(value))
    : [];
  const rows = Array.isArray(node.props.rows)
    ? node.props.rows.map((row) =>
        Array.isArray(row) ? row.map((value) => String(value ?? "")) : [],
      )
    : [];
  const widths = columns.map((column, index) =>
    Math.max(column.length, ...rows.map((row) => (row[index] ?? "").length)),
  );
  const formatRow = (cells: string[]) =>
    widths.map((width, index) => (cells[index] ?? "").padEnd(width, " ")).join("  ");
  const header = formatRow(columns);
  const divider = widths.map((width) => "-".repeat(width)).join("  ");
  return [header, divider, ...rows.map(formatRow)].join("\n");
}
