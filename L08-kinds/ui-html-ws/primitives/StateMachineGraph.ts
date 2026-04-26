import type { ProjectionNode } from "../../../L01-foundation/projection-types.ts";
import { buildAttrs, escapeText } from "../backend-helpers.ts";

type Ctx = {
  renderChildren: (node: ProjectionNode) => string;
  renderListChildren: (node: ProjectionNode) => string;
};
type Transition = { from: string; to: string; verb: string; when?: string };

export default function render(node: ProjectionNode, _ctx: Ctx): string {
  const p = node.props ?? {},
    states = Array.isArray(p.states) ? p.states.map(String) : [],
    transitions = Array.isArray(p.transitions) ? (p.transitions as Transition[]) : [];
  const currentStates =
    typeof p.currentStates === "object" && p.currentStates
      ? (p.currentStates as Record<string, unknown>)
      : {};
  const cell = (from: string, to: string) =>
    transitions.find((transition) => transition.from === from && transition.to === to)?.verb ?? "";
  const head = states.map((state) => `<th>${escapeText(state)}</th>`).join("");
  const body = states
    .map(
      (state) =>
        `<tr${Object.prototype.hasOwnProperty.call(currentStates, state) ? ' data-has-instance="true"' : ""}><th>${escapeText(state)}</th>${states.map((target) => `<td>${escapeText(cell(state, target))}</td>`).join("")}</tr>`,
    )
    .join("");
  const caption = p.title == null ? "" : `<caption>${escapeText(p.title)}</caption>`;
  return `<table${buildAttrs(node, { baseClass: "state-machine-graph" })}>${caption}<thead><tr><th>from ⟶ to</th>${head}</tr></thead><tbody>${body}</tbody></table>`;
}
