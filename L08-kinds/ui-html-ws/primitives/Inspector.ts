import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeAttr, escapeText } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};
type Section = {
  heading?: unknown;
  kind?: unknown;
  items?: unknown;
  rows?: unknown;
  columns?: unknown;
  text?: unknown;
  emptyMessage?: unknown;
  hidden?: unknown;
};

const list = (value: unknown) => (Array.isArray(value) ? value : []);
const text = (value: unknown) =>
  escapeText(typeof value === "string" ? value : JSON.stringify(value ?? null));
const heading = (value: unknown) => (value == null ? "" : `<h3>${escapeText(value)}</h3>`);
const sectionBody = (section: Section) => {
  const items = list(section.items),
    rows = list(section.rows),
    cols = list(section.columns);
  if (section.kind === "table")
    return `<table><thead><tr>${cols.map((col) => `<th>${escapeText(col)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${(Array.isArray(row) ? row : cols.map((col) => (row as Record<string, unknown>)[String(col)])).map((cell) => `<td>${text(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  if (section.kind === "keyvalue")
    return `<dl>${items.map((item) => `<dt>${text((item as Record<string, unknown>).label)}</dt><dd>${text((item as Record<string, unknown>).value)}</dd>`).join("")}</dl>`;
  if (section.kind === "chain") return `<p>${items.map(text).join(" ▸ ")}</p>`;
  if (section.kind === "list")
    return `<ul>${items.map((item) => `<li>${text(item)}</li>`).join("")}</ul>`;
  if (section.kind === "text") return `<p>${text(section.text)}</p>`;
  if (section.kind === "code") return `<pre><code>${text(section.text)}</code></pre>`;
  if (section.kind === "empty")
    return `<div class="inspector-empty">${escapeText(String(section.emptyMessage ?? "Nothing to show"))}</div>`;
  return `<p>${escapeText(JSON.stringify(section))}</p>`;
};

export default function render(node: ProjectionNode, ctx: Ctx): string {
  const p = node.props ?? {},
    sections = list(p.sections).filter(
      (section): section is Section => !(section as Section).hidden,
    );
  if (p.selected == null)
    return `<section${buildAttrs(node, { baseClass: "inspector" })}>${escapeText(String(p.emptyState ?? p.emptyLabel ?? "Select an item to inspect"))}</section>`;
  const header = `<header>${p.title != null ? `<h2>${escapeText(p.title)}</h2>` : ""}${p.subtitle != null ? `<p>${escapeText(p.subtitle)}</p>` : ""}</header>`;
  const body =
    sections.length > 0
      ? sections
          .map(
            (section) =>
              `<div class="inspector-section" data-section-kind="${escapeAttr(String(section.kind ?? "text"))}">${heading(section.heading)}${sectionBody(section)}</div>`,
          )
          .join("")
      : ctx.renderChildren(node);
  return `<section data-inspector-kind="${escapeAttr(String(p.kind ?? ""))}"${buildAttrs(node, { baseClass: "inspector" })}>${header}${body}</section>`;
}
