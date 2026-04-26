import type { Morphism } from "../../L05-morphism/registry.ts";
import type { ProjectionNode, ProjectionTree } from "../../L01-foundation/projection-types.ts";

export type SlotId = string;
export type BindingPath = string;
export type SlotKind = "text" | "attr" | "html";
export interface Slot {
  id: SlotId;
  path: BindingPath;
  renderer: Morphism;
  kind: SlotKind;
  attrName?: string;
  contextScope?: string;
}
export interface SplitArtefact {
  skeleton: string;
  slots: Slot[];
  dependents: Map<BindingPath, Set<SlotId>>;
  ctxScopes: Array<{
    scopePath: string;
    scope: string;
    initial?: Record<string, unknown>;
    mirror?: string[];
    key?: unknown;
  }>;
}

type State = {
  n: number;
  slots: Slot[];
  dependents: Map<string, Set<string>>;
  ctxScopes: SplitArtefact["ctxScopes"];
};
type MetaNode = ProjectionNode & {
  splitMeta?: { control?: "iter" | "cond"; path?: string; rowKey?: string; renderer?: unknown };
  contextScope?: string;
};
const TAGS: Record<string, string> = {
  Badge: "span",
  Button: "button",
  Card: "div",
  Column: "div",
  Form: "form",
  Grid: "div",
  Heading: "h2",
  Iframe: "iframe",
  Input: "input",
  Link: "a",
  List: "ul",
  Row: "div",
  Section: "section",
  Stack: "div",
  StatusDot: "span",
  Text: "span",
};
const VOID = new Set(["iframe", "input"]);
const esc = (v: unknown) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
const rid = (s: State, scopes: string[], prefix?: string) =>
  prefix ? `${prefix}s${s.n++}` : `${scopes.length ? `${scopes.join(".")}.` : ""}s${s.n++}`;
const morph = (name: string, meta: Record<string, unknown>): Morphism =>
  ({
    id: `morphism://adk/${name}/1.0`,
    name,
    sourceType: "type://adk/Any/0.1.0",
    targetType: "type://adk/Any/0.1.0",
    expr: { op: "literal", value: meta } as never,
    isIsomorphism: false,
    cid: `pp09:${name}`,
  }) as Morphism;
const addDep = (deps: Map<string, Set<string>>, raw: string, full: string, id: string) => {
  for (const key of new Set([raw, full]))
    (deps.get(key) ?? deps.set(key, new Set()).get(key)!).add(id);
};
const longPath = (path: string, scope?: string) =>
  path.startsWith("$ctx.") && scope ? `$ui.${scope}.${path.slice(5)}` : path;
const staticText = (node: ProjectionNode) =>
  node.component === "Text" ? esc(node.props.text ?? node.props.value ?? "") : "";

function compile(node: MetaNode, s: State, scopes: string[] = [], prefix = ""): string {
  const nextScopes =
    node.component === "Context" && typeof node.props.scope === "string"
      ? [...scopes, String(node.props.scope)]
      : scopes;
  const scope = node.contextScope ?? nextScopes.at(-1);
  const slotScopes = scope ? scope.split(".") : nextScopes;
  if (node.component === "Context") {
    if (typeof node.props.scope === "string")
      s.ctxScopes.push({
        scopePath: ["page", ...nextScopes].join("/"),
        scope: String(node.props.scope),
        ...(node.props.initial && typeof node.props.initial === "object"
          ? { initial: node.props.initial as Record<string, unknown> }
          : {}),
        ...(Array.isArray(node.props.mirror) ? { mirror: node.props.mirror as string[] } : {}),
        ...(node.props.key !== undefined ? { key: node.props.key } : {}),
      });
    return node.children.map((child) => compile(child as MetaNode, s, nextScopes, prefix)).join("");
  }
  if (node.splitMeta?.control === "cond" && node.splitMeta.path) {
    const id = rid(s, slotScopes, prefix),
      path = longPath(node.splitMeta.path, scope);
    s.slots.push({
      id,
      path,
      kind: "html",
      renderer: morph("cond-slot", { branches: node.splitMeta.renderer }),
      contextScope: scope,
    });
    addDep(s.dependents, node.splitMeta.path, path, id);
    for (const branch of Object.values(
      (node.splitMeta.renderer ?? {}) as Record<string, ProjectionNode[]>,
    ))
      for (const child of branch ?? []) compile(child as MetaNode, s, nextScopes, `${id}/`);
    return `<span data-slot-id="${id}"></span>`;
  }
  if (node.splitMeta?.control === "iter" && node.splitMeta.path) {
    const id = rid(s, slotScopes, prefix),
      path = longPath(node.splitMeta.path, scope);
    s.slots.push({
      id,
      path,
      kind: "html",
      renderer: morph("list-slot", { rows: node.splitMeta.renderer }),
      contextScope: scope,
    });
    addDep(s.dependents, node.splitMeta.path, path, id);
    for (const row of (node.splitMeta.renderer ?? []) as Array<{
      key: string;
      nodes: ProjectionNode[];
    }>)
      for (const child of row.nodes)
        compile(child as MetaNode, s, nextScopes, `list:${node.splitMeta.path}:${row.key}/`);
    return `<${TAGS[node.component] ?? "div"} data-slot-id="${id}"></${TAGS[node.component] ?? "div"}>`;
  }
  const tag = TAGS[node.component] ?? "div",
    attrs: string[] = [],
    markers: string[] = [];
  for (const [key, value] of Object.entries(node.props)) {
    const raw = node.bindingPaths?.[key];
    if (raw && key !== "text" && !String(value).startsWith("module://")) {
      const id = rid(s, slotScopes, prefix),
        path = longPath(raw, scope);
      s.slots.push({
        id,
        path,
        kind: "attr",
        attrName: key,
        renderer: morph("attr-slot", { attrName: key }),
        contextScope: scope,
      });
      addDep(s.dependents, raw, path, id);
      markers.push(`<!--slot:${id}-->`);
      continue;
    }
    if (["text", "children", "scope"].includes(key) || typeof value === "object" || value == null)
      continue;
    attrs.push(`${key}="${esc(value)}"`);
  }
  if (
    (node.bindingPaths?.text || node.bindingPaths?.value) &&
    !String(node.props.text ?? node.props.value ?? "").startsWith("module://")
  ) {
    const raw = (node.bindingPaths?.text ?? node.bindingPaths?.value)!,
      id = rid(s, slotScopes, prefix),
      path = longPath(raw, scope);
    s.slots.push({
      id,
      path,
      kind: "text",
      renderer: morph("text-slot", { text: node.props.text ?? node.props.value ?? "" }),
      contextScope: scope,
    });
    addDep(s.dependents, raw, path, id);
    return `<span data-slot-id="${id}">${staticText(node)}</span>`;
  }
  const inner =
    node.component === "Text"
      ? staticText(node)
      : node.children.map((child) => compile(child as MetaNode, s, nextScopes, prefix)).join("");
  return `<${tag}${attrs.length ? ` ${attrs.join(" ")}` : ""}>${VOID.has(tag) ? "" : inner}</${tag}>${markers.join("")}`;
}

export function splitProjection(tree: ProjectionTree): SplitArtefact {
  const s: State = { n: 0, slots: [], dependents: new Map(), ctxScopes: [] };
  return {
    skeleton: compile(tree.root as MetaNode, s),
    slots: s.slots,
    dependents: s.dependents,
    ctxScopes: s.ctxScopes,
  };
}
