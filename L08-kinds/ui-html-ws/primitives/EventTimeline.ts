import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};
type Event = {
  ts?: unknown;
  label?: unknown;
  tone?: unknown;
  detail?: unknown;
  [key: string]: unknown;
};

const key = (ts: string, mode: string) =>
  mode === "day" ? ts.slice(0, 10) : mode === "hour" ? ts.slice(0, 13) : "";
const clock = (ts: string) =>
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(ts) ? ts.slice(11, 19) : ts;
const item = (event: Event, p: Record<string, unknown>) => {
  const ts = String(event.ts ?? ""),
    click =
      p.clickable &&
      p.onClickSelect &&
      typeof (p.onClickSelect as { path?: unknown }).path === "string" &&
      typeof (p.onClickSelect as { valueField?: unknown }).valueField === "string";
  const action = click
    ? ` data-action-ref="ui.set" data-action-payload="${escapeAttr(JSON.stringify({ path: (p.onClickSelect as { path: string }).path, value: event[(p.onClickSelect as { valueField: string }).valueField] }))}"`
    : "";
  return `<li class="timeline-event"${event.tone ? ` data-tone="${escapeAttr(String(event.tone))}"` : ""}${action}><time datetime="${escapeAttr(ts)}">${escapeText(clock(ts))}</time><span class="label">${escapeText(event.label ?? "")}</span>${event.detail ? `<span class="detail">${escapeText(event.detail)}</span>` : ""}</li>`;
};

export default function render(node: ProjectionNode, _ctx: Ctx): string {
  const p = node.props ?? {},
    groupBy = p.groupBy === "day" || p.groupBy === "hour" ? p.groupBy : "none",
    events = (Array.isArray(p.events) ? p.events : []).map((event) => event as Event);
  if (events.length === 0)
    return `<div${buildAttrs(node, { baseClass: "event-timeline-empty" })}>${escapeText(String(p.emptyMessage ?? "No events"))}</div>`;
  const ordered = p.reverseOrder ? [...events].reverse() : events,
    groups = new Map<string, Event[]>();
  for (const event of ordered) {
    const group = key(String(event.ts ?? ""), groupBy);
    groups.set(group, [...(groups.get(group) ?? []), event]);
  }
  const body =
    groupBy === "none"
      ? ordered.map((event) => item(event, p)).join("")
      : [...groups.entries()]
          .map(
            ([group, batch]) =>
              `<li class="timeline-group"><h4>${escapeText(group)}</h4><ul>${batch.map((event) => item(event, p)).join("")}</ul></li>`,
          )
          .join("");
  return `<ol data-group-by="${escapeAttr(groupBy)}"${buildAttrs(node, { baseClass: "event-timeline" })}>${body}</ol>`;
}
