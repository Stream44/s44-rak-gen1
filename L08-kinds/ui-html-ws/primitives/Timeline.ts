import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};
type TimelineEvent = {
  ts: string;
  label: string;
  tone?: "ok" | "warn" | "error" | "accent" | "muted";
  detail?: string;
};
type TimelineRow = { timestamp: number | string; op: string; subject: string; detail?: string };

const toneForOp = (op: string): TimelineEvent["tone"] =>
  op === "type:defined"
    ? "ok"
    : op === "registry:rebound"
      ? "accent"
      : op.includes("error")
        ? "error"
        : op.includes("warn")
          ? "warn"
          : "muted";
const groupKey = (ts: string, mode: "day" | "hour" | "none") =>
  mode === "day" ? ts.slice(0, 10) : mode === "hour" ? ts.slice(0, 13) : "";
const toIso = (value: number | string) =>
  typeof value === "number" ? new Date(value).toISOString() : String(value);

export default function render(node: ProjectionNode, _ctx: Ctx): string {
  const p = node.props ?? {},
    groupBy = p.groupBy === "day" || p.groupBy === "hour" ? p.groupBy : "none";
  const source = Array.isArray(p.events)
    ? (p.events as TimelineEvent[])
    : Array.isArray(p.rows)
      ? (p.rows as TimelineRow[]).map((row) => ({
          ts: toIso(row.timestamp),
          label: `${row.op} ${row.subject}`.trim(),
          tone: toneForOp(row.op),
          detail: row.detail,
        }))
      : [];
  const events = p.reverseOrder ? [...source].reverse() : source;
  let lastGroup = "";
  const body = events
    .map((event) => {
      const currentGroup = groupKey(String(event.ts ?? ""), groupBy);
      const group =
        currentGroup && currentGroup !== lastGroup
          ? `<li class="timeline-group-label">${escapeText(currentGroup)}</li>`
          : "";
      lastGroup = currentGroup || lastGroup;
      const detail = event.detail
        ? `<div class="timeline-detail">${escapeText(event.detail)}</div>`
        : "";
      const tone = event.tone ? ` data-tone="${escapeAttr(event.tone)}"` : "";
      return `${group}<li class="timeline-row"${tone}><time class="timeline-ts" datetime="${escapeAttr(String(event.ts ?? ""))}">${escapeText(event.ts)}</time><span class="timeline-label">${escapeText(event.label)}</span>${detail}</li>`;
    })
    .join("");
  return `<ol${buildAttrs(node, { baseClass: events.length > 0 ? "timeline" : "timeline timeline-empty" })}>${body}</ol>`;
}
