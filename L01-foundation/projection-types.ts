// PP-27: confirmed L01 home — pure shape contract; consumers L07-L14.
/**
 * Layer 27: Projection Metamodel types.
 *
 * TypeScript types corresponding to the YAML projector grammar described in
 * research/chains/15-TheProjectionLayer.md §4. These are the in-memory
 * representation produced by parsing a projector YAML document.
 */

import type { JsonSchema } from "./types.ts";
import type { MorphismAST } from "./morphism-ast.ts";
// SplitArtefact is consumer-defined (L08-kinds/ui-html-ws/split-pass.ts) and
// reaching upward from L00 into L07-kinds is forbidden by the layer audit.
// Keep this slot opaque — runtime carriers know the concrete shape.
type SplitArtefact = unknown;
import type { ProjectionSession } from "./projection-session.ts";

// ── Projector document ──────────────────────────────────────────────────

export interface ProjectionKind {
  /** A stable id, e.g. "ui.html.ws", "api.rest", "cli.stdout". Used in YAML. */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Semver. Kinds version independently of projection models. */
  version: string;
  /** The target category label. Informational; drives no behaviour. */
  targetCategory: string;
  /** Primitive asset CIDs this kind recognises. All must be registered. */
  primitives: string[];
  /** Backend asset CIDs. At least one. */
  backends: string[];
  /** Action semantics asset CID. Exactly one. */
  actionSemantics: string;
  /** JSON Schema for kind-specific options inside ProjectionModel. */
  optionsSchema?: JsonSchema;
  /** CID (computed from the encoded record). */
  cid: string;
  /** Origin of the registration (who published it). */
  origin?: string;
}

export type ProjectionAssetKind =
  | "primitive"
  | "adapter"
  | "backend"
  | "action-semantics"
  | "handler"
  | "layout"
  | "theme"
  | "navbar"
  | "shell"
  | "morphism-ref";

export interface ProjectionAsset {
  /** CID, computed from the encoded record (without this field). */
  cid: string;
  /** URL-style id, e.g. "asset://adk/primitive/ui.html.ws/Button/1.0". */
  id: string;
  /** Human-readable name. */
  name: string;
  /** Asset class. Drives what goes into `implementation`. */
  assetKind: ProjectionAssetKind;
  /** The ProjectionKind this asset belongs to, by id. A morphism-ref asset is kind-free. */
  conformsToKind?: string;
  /** Semver. */
  version: string;
  /** Origin (who published). */
  origin?: string;
  /** JSON Schema for the asset's props (for primitives) or options (for backends). */
  propSchema?: JsonSchema;
  argsShape?: JsonSchema;
  render?: MorphismAST | string | Record<string, unknown>;
  /** Formal contract, for acceptance generation. See §14. */
  contract?: ProjectionAssetContract;
  /** How to obtain the executable form. See §8.2. */
  implementation: AssetImplementation;
}

export type AssetImplementation =
  | { kind: "module"; module: string; export?: string }
  | { kind: "yaml"; path: string }
  | { kind: "morphism"; cid: string }
  | { kind: "template"; template: string };

export type ProjectionAssetContract = Record<string, unknown>;

export interface ProjectionModel {
  /** Either pages or morphism MUST be present. The kernel dispatches render based on which is set. */
  projector: string;
  version: string;
  origin?: string;
  conformsTo?: string;
  conformsToKind?: string;
  /** Session scope declaration. Required at load time. */
  session: ProjectionSessionDecl;
  extends?: string[];
  /** The model this projector binds to, e.g. "ecommerce@1.0.0". May be empty
   * for pure-shell projections (e.g. a root-frame tabbed UI that binds nothing).
   */
  bindsModel?: string;
  /** Reserved for future multi-model projections. */
  bindsModels?: Array<{ modelId: string }>;
  /** Human-readable title used for `{{title}}` substitution in shell.html. */
  title?: string;
  theme?: ThemeRef;

  /** Relative path (relative to the projector YAML directory) to shell.html. */
  shell?: string;
  /** Relative path to assets directory. Default: "./assets". */
  assets?: string;

  /**
   * The action manifest. **Replaces** the built-in ActionRegistry. Every
   * `action:` reference in the page tree must appear here. Entries can be:
   *   - a short string ("ConfirmOrder")
   *   - a full URI ("action://origin/name/version")
   *   - a manifest entry object with explicit kind metadata.
   */
  actions?: Array<ActionManifestEntry>;
  requires?: string[];
  requiresAny?: string[];
  denyPage?: string;

  routes?: RouteDef[];
  pages?: Record<string, PageDef>;
  morphism?: MorphismAST;
  components?: Record<string, ComponentDef>;
}

// ── Action manifest ─────────────────────────────────────────────────────

export type ActionManifestEntry = string | ActionManifestEntryObject;

export interface ActionManifestEntryObject {
  name: string;
  kind?: "model" | "custom" | "ephemeral";
  /** Optional JSON Schema for payload validation on custom/ephemeral actions. */
  payloadSchema?: JsonSchema;
}

export interface ThemeRef {
  extends?: string;
  tokens?: string;
  mode?: "light" | "dark" | "system";
  override?: Record<string, string>;
}

export interface RouteDef {
  path: string;
  page: string;
  params?: Record<string, { type: string }>;
  query?: string[];
}

export interface ProjectionSessionDecl {
  scope: string | string[];
  ttlSec?: number;
}

// ── Page / Component definitions ────────────────────────────────────────

export interface PageDef {
  layout?: string;
  bind?: Record<string, BindingSpec>;
  regions?: Record<string, ChildSpec>;
  children?: ChildSpec[];
}

export interface ComponentDef {
  props?: Record<string, PropSpec>;
  bind?: Record<string, BindingSpec>;
  template: TemplateNode;
}

export interface PropSpec {
  type?: string;
  enum?: string[];
  required?: boolean;
  default?: unknown;
  $typeRef?: string;
}

/**
 * TemplateNode is either a primitive/component invocation ({component: "Button"}
 * or {use: "my-composite"}) or a control node (for/if).
 */
export type TemplateNode = ChildSpec | PrimitiveNode | CompositeUseNode | ListNode | IfNode;

// ── Common-algebra node types (kind-free; see spec §3.2, §13.1) ───

export interface PrimitiveNode {
  component: string;
  props?: Record<string, unknown>;
  bind?: Record<string, BindingSpec>;
  children?: ChildSpec[];
  onClick?: ActionBindingDef;
  onSubmit?: ActionBindingDef;
  onEditStart?: ActionBindingDef;
  onEditCommit?: ActionBindingDef;
  onEditCancel?: ActionBindingDef;
  onEditEnd?: ActionBindingDef;
}

export interface CompositeUseNode {
  use: string;
  bind?: Record<string, BindingSpec>;
  props?: Record<string, unknown>;
}

export interface ListNode {
  for: string; // a binding path like $bind.orders
  as?: string; // defaults to "item"
  template: ChildSpec;
}

export interface IfNode {
  if: unknown;
  then?: ChildSpec | ChildSpec[];
  else?: ChildSpec | ChildSpec[];
}

export type ChildSpec = PrimitiveNode | CompositeUseNode | ListNode | IfNode;

// ── Binding specs ───────────────────────────────────────────────────────

/**
 * A binding is one of:
 *  - a literal value (string/number/boolean/null/object/array),
 *  - a variable reference ("$bind.order.id", "$props.x", "$route.id",
 *    "$item", "$currentUser.id"),
 *  - a demand clause ({demand: "Order", key: "..."}),
 *  - a small expression ({eq: [...], not: ..., lte: [...]}).
 *
 * The engine's binding resolver is intentionally small (bindings.ts).
 */
export type BindingSpec = unknown;

// ── Action bindings ─────────────────────────────────────────────────────

export interface ActionBindingDef {
  action: string; // short name, full URI, or built-in
  target?: BindingSpec; // targetKey (usually $bind.*)
  payload?: Record<string, BindingSpec>;
  capability?: CapabilityHint;
  hideIfUnauthorized?: boolean;
  optimistic?: { patch?: { path?: BindingSpec; set?: Record<string, unknown> } };
  onSuccess?: ActionBindingDef;
  onError?: ActionBindingDef;
  // Built-in action params (e.g. navigate's `to:`)
  to?: { path: string; params?: Record<string, BindingSpec> };
}

export interface CapabilityHint {
  base?: BindingSpec;
  caveats?: unknown[];
}

// ── Interface tree — the rendered, resolved output ──────────────────────

export interface UiHtmlExtensions {
  disabled?: boolean;
  hidden?: boolean;
  nodeId?: string;
}

export interface CoreProjectionNode {
  component: string; // primitive name (Button, Text, Stack, ...)
  props: Record<string, unknown>;
  children: ProjectionNode[];
  actionBinding?: ActionBindingDef;
  // Preserve original binding metadata for the split compile pass.
  bindingPaths?: Record<string, string>;
  contextScope?: string;
  splitMeta?: {
    control?: "iter" | "cond";
    path?: string;
    rowKey?: string;
    renderer?: unknown;
  };
}

export type ProjectionNode = CoreProjectionNode & Partial<UiHtmlExtensions>;

export interface ProjectionTree {
  root: ProjectionNode;
  pageName: string;
  actionHandlers: Array<{
    nodeId: string;
    binding: ActionBindingDef;
    /** Manifest kind — injected by the projection runtime so the HTML
     * backend can emit a custom-action-aware handler.  */
    kind?: "model" | "custom" | "ephemeral";
  }>;
  // Additive compile artefact for the reactive runtime.
  splitArtefact?: SplitArtefact;
}

// ── Render context passed down the tree ────────────────────────────────

export interface RenderContext {
  pageName: string;
  route: { path: string; params: Record<string, string>; query: Record<string, string> };
  currentUser: { id: string; capabilities: Record<string, string> };
  bindings: Map<string, unknown>; // page-level bindings ($bind.*)
  props: Record<string, unknown>; // current composite's props ($props.*)
  iteration?: { item: unknown; index: number; name: string };
  nodeIdCounter: { n: number };
  session?: ProjectionSession;
}

export type { ProjectionSession as ProjectorSession } from "./projection-session.ts";

// ── Capability enforcement types (spec §7.1, §9.1, §9.4) ──

export type AuthScope =
  | "projection"
  | "page"
  | "route"
  | "component"
  | "asset"
  | "binding"
  | "action";

export type AuthorizeVerdict =
  | { outcome: "allow" }
  | {
      outcome: "deny";
      reason: string;
      missing: string[];
      scope: AuthScope;
      nodePath: string;
    };

export interface CapabilityRequirement {
  scope: AuthScope;
  nodePath: string;
  caps: string[];
  combinator: "all" | "any";
}

// ── Built-in JsonSchema for ProjectorDocument (used to validate shape) ──

export const PROJECTOR_SCHEMA: JsonSchema = {
  type: "object",
  required: ["projector", "version", "bindsModel", "session"],
  properties: {
    projector: { type: "string" },
    version: { type: "string" },
    origin: { type: "string" },
    conformsTo: { type: "string" },
    conformsToKind: { type: "string" },
    session: {
      type: "object",
      required: ["scope"],
      properties: {
        scope: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] },
        ttlSec: { type: "number" },
      },
    },
    extends: { type: "array", items: { type: "string" } },
    bindsModel: { type: "string" },
    bindsModels: {
      type: "array",
      items: {
        type: "object",
        required: ["modelId"],
        properties: {
          modelId: { type: "string" },
        },
      },
    },
    title: { type: "string" },
    shell: { type: "string" },
    assets: { type: "string" },
    theme: { type: "object" },
    routes: { type: "array" },
    pages: { type: "object" },
    morphism: { type: "object" },
    components: { type: "object" },
    actions: { type: "array" },
  },
};

export type ProjectorDocument = ProjectionModel;
