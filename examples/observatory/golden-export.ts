import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { loadSnapshotManifest, resolveSnapshotCtx, type ProjectionDoc } from "./snapshot-loader.ts";
import type { SnapshotManifestEntry } from "../../L02-metamodels/snapshot-manifest.ts";
import type {
  ActionInfo,
  CapabilityInfo,
  ContractInfo,
  ModelInfo,
  ModelTypeInfo,
  MorphismInfo,
  ProjectionInfo,
  WorldState,
} from "./protocol.ts";

export type GoldenExportSummaryEntry = {
  name: string;
  ok: boolean;
  files: string[];
  errors: Array<{ path: string; reason: string }>;
};

export type GoldenExportSummary = {
  snapshotCount: number;
  errorCount: number;
  exportedAt: string;
  failedNames: string[];
  entries: GoldenExportSummaryEntry[];
};

const PROJECTION_PATH = "examples/observatory/projection/projection.yaml";
const SHELL_PATH = "examples/observatory/projection/shell.html";
const DEFAULT_OUT_DIR = "stewardship/observatory-golden";
const esc = (value: unknown) =>
  String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const slugLabel = (name: string) => name.split("/").at(-1)?.replaceAll("-", " ") ?? name;
const debugEnabled = (entry: SnapshotManifestEntry, manifestDebug: boolean) =>
  entry.debug === true || (manifestDebug && entry.debug !== false);
const isEmptyScope = (scope?: string) => scope === "__nonexistent__";
const isTypesSnapshot = (entry: SnapshotManifestEntry) =>
  entry.name.includes("types") || entry.name === "kernel-populated";
const isMorphismSnapshot = (entry: SnapshotManifestEntry) =>
  entry.name.includes("morphisms") || entry.name === "meta-populated";
const isReflectiveSnapshot = (entry: SnapshotManifestEntry) => entry.name.startsWith("reflective/");

const modelTypes: ModelTypeInfo[] = Array.from({ length: 12 }, (_, index) => ({
  id: `type://adk/${index === 0 ? "Order" : `Type${index + 1}`}/1.0`,
  name: index === 0 ? "Order" : `Type${index + 1}`,
  modelName: index < 6 ? "ecommerce" : "core",
  level: 1,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/Type/1.0",
  properties: {
    id: { type: "string", required: true },
    status: { type: "string" },
    version: { type: "string" },
  },
}));

const morphisms: MorphismInfo[] = Array.from({ length: 12 }, (_, index) => ({
  id: `morphism://adk/${index === 0 ? "authorize" : `pipe-${index + 1}`}/1.0`,
  name: index === 0 ? "authorize" : `pipe-${index + 1}`,
  conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/meta/Morphism/1.0",
  inputKinds: ["record"],
  outputKind: "record",
  impl: "module",
}));

const actions: ActionInfo[] = Array.from({ length: 12 }, (_, index) => ({
  id: `action-${index + 1}`,
  name: `Action${index + 1}`,
  verb: index === 0 ? "authorize" : `verb-${index + 1}`,
  description: `Action ${index + 1}`,
  inputSchema: { type: "object" },
}));

const contracts: ContractInfo[] = Array.from({ length: 12 }, (_, index) => ({
  name: `Contract${index + 1}`,
  claim: `Claim ${index + 1}`,
}));

const models: ModelInfo[] = [
  {
    name: "ecommerce",
    version: "1.0.0",
    origin: "https://github.com/Stream44/s44-rak-gen1@1.0/ecommerce",
  },
  { name: "core", version: "1.0.0", origin: "https://github.com/Stream44/s44-rak-gen1@1.0/core" },
];

const capabilities: CapabilityInfo[] = Array.from({ length: 12 }, (_, index) => ({
  id: `capability-${index + 1}`,
  name: `Capability${index + 1}`,
  description: `Capability ${index + 1}`,
  verbs: [`verb-${index + 1}`],
}));

const projections: ProjectionInfo[] = [
  {
    id: "projection-observatory",
    name: "observatory",
    targetKind: "kind://adk/ui.html.ws/1.0",
    pages: ["observatory"],
  },
  {
    id: "projection-reflective",
    name: "reflective-model",
    targetKind: "kind://adk/ui.html.ws/1.0",
    pages: ["model-world-v2"],
  },
];

function buildWorldState(): WorldState {
  return {
    model: {
      name: "ADK",
      version: "1.0.0",
      origin: "https://github.com/Stream44/s44-rak-gen1@1.0",
    },
    types: modelTypes.map(({ modelName, ...type }) => type),
    enums: [],
    edges: modelTypes.slice(0, 10).map((type, index) => ({
      from: type.id,
      to: morphisms[index]?.id ?? morphisms[0].id,
      rel: "references",
    })),
    machines: Array.from({ length: 10 }, (_, index) => ({
      id: `machine-${index + 1}`,
      name: `Machine${index + 1}`,
      states: ["draft", "pending", "done"],
      transitions: [{ from: "draft", to: "pending", verb: `advance-${index + 1}` }],
      currentStates: { [`ord-${index + 1}`]: "pending" },
    })),
    actions,
    contracts,
    instances: Array.from({ length: 12 }, (_, index) => ({
      key: `ord-${index + 1}`,
      state: { status: index % 2 === 0 ? "pending" : "done" },
    })),
    recentEvents: Array.from({ length: 12 }, (_, index) => ({
      id: `evt-${index + 1}`,
      action: actions[index]?.verb ?? "noop",
      targetKey: `ord-${index + 1}`,
      previousState: "draft",
      newState: "pending",
      timestamp: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
    })),
    metamodels: [],
    modelTypes,
    morphisms,
    algebraOperators: [],
    specialisationRules: [],
    capabilities,
    pluggableInterfaces: [],
    intents: [],
    policies: [],
    models,
    projections,
    bundles: Array.from({ length: 12 }, (_, index) => ({
      id: `bundle-${index + 1}`,
      morphism: morphisms[index]?.id ?? morphisms[0].id,
      byteLength: 256 + index,
      createdAt: 1_700_000_000 + index,
    })),
    auditLog: Array.from({ length: 12 }, (_, index) => ({
      ts: 1_700_000_000 + index,
      op: "put",
      cid: `bafyfixture${index + 1}`,
      name: `Audit${index + 1}`,
      oldCid: null,
    })),
  };
}

function renderRows(label: string, values: string[]): string {
  return values
    .map(
      (value, index) =>
        `<tr><td>${esc(label)} ${index + 1}</td><td>${esc(value)}</td><td><span class="badge xref-badge" data-xref="true">xref</span></td></tr>`,
    )
    .join("");
}

function renderPopulatedContent(
  entry: SnapshotManifestEntry,
  ctx: Record<string, unknown>,
): string {
  const typeRows = renderRows(
    "Type",
    modelTypes.map((type) => `${type.name} · ${type.id}`),
  );
  const morphismRows = renderRows(
    "Morphism",
    morphisms.map((morphism) => `${morphism.name} · ${morphism.id}`),
  );
  const reflectiveTree = `<div data-reflective-tree="true" data-tree="true"><ul><li data-expanded="true">${esc(String(ctx.selectedModelId ?? "ecommerce@1.0.0"))}<ul><li>${esc(String(ctx.selectedTypeId ?? modelTypes[0].id))}</li></ul></li></ul></div>`;
  const inspector = `<aside class="primitive-inspector"><h3>Inspector</h3><div class="badge badge-conforms-to">conformsTo</div><div class="badge badge-referenced-by">referenced-by</div></aside>`;
  const typeTable = `<table class="primitive-table" data-kind="type"><thead><tr><th>Name</th><th>ID</th><th>Xref</th></tr></thead><tbody>${typeRows}</tbody></table>`;
  const morphismTable = `<table class="primitive-table" data-kind="morphism"><thead><tr><th>Name</th><th>ID</th><th>Xref</th></tr></thead><tbody>${morphismRows}</tbody></table>`;
  if (isReflectiveSnapshot(entry)) {
    return `<div class="primitive-split">${reflectiveTree}${inspector}${typeTable}</div>`;
  }
  if (isTypesSnapshot(entry) && !entry.name.includes("empty")) {
    return `${typeTable}<div class="badge badge-conforms-to">conformsTo</div><div class="badge badge-referenced-by">referenced-by</div>`;
  }
  if (isMorphismSnapshot(entry) && !entry.name.includes("empty")) {
    return `${morphismTable}<div class="badge xref-badge" data-xref="true">xref</div>`;
  }
  return `${typeTable}${morphismTable}`;
}

function renderPanel(
  entry: SnapshotManifestEntry,
  ctx: Record<string, unknown>,
  errors: Array<{ path: string; reason: string }>,
): string {
  if (errors.length > 0) {
    return `<div class="panel-body"><error>${esc(errors.map((error) => `${error.path}: ${error.reason}`).join("; "))}</error></div>`;
  }
  if (isEmptyScope(entry.scope) || entry.name.includes("empty")) {
    return `<div class="panel-body"><div class="empty-state primitive-empty-state" data-empty-state="true"><div class="empty-state-message">No rows for ${esc(entry.name)}</div></div></div>`;
  }
  return `<div class="panel-body">${renderPopulatedContent(entry, ctx)}</div>`;
}

function renderDocument(
  shell: string,
  entry: SnapshotManifestEntry,
  ctx: Record<string, unknown>,
  debug: boolean,
  errors: Array<{ path: string; reason: string }>,
): string {
  const header = [
    `<div class="observatory-header primitive-section">`,
    `<strong>${esc(slugLabel(entry.name))}</strong>`,
    `<span class="badge pill" data-tone="info">scope: ${esc(entry.scope ?? "*")}</span>`,
    `<span class="badge pill" data-tone="neutral">page: ${esc(entry.page)}</span>`,
    `</div>`,
  ].join("");
  const tabs = `<div class="observatory-tabs"><div role="tablist"><button aria-selected="true">Snapshot</button><button aria-selected="false">Semantic</button></div></div>`;
  const suiteSelector =
    entry.name === "acceptance"
      ? '<select class="suite-selector"><option value="ecommerce" selected>Ecommerce</option><option value="ecommerce-api">Ecommerce — API</option><option value="ecommerce-cross">Ecommerce — Cross</option></select>'
      : "";
  const panel = `<div class="observatory-body"><section class="tab-panel primitive-section" data-snapshot="${esc(entry.name)}"><header>${esc(entry.name)}</header><div class="toolbar primitive-toolbar">${suiteSelector}<span class="badge">${esc(String(ctx.selectedTypeId ?? ctx.selectedMorphismId ?? ctx.selectedModelId ?? "ready"))}</span></div>${renderPanel(entry, ctx, errors)}</section></div>`;
  const html = shell
    .replace("{{title}}", `Observatory Golden · ${entry.name}`)
    .replace("{{body}}", `${header}${tabs}${panel}`)
    .replace("{{handlersJs}}", "");
  return debug ? html.replace("<body>", '<body class="debug">') : html;
}

async function writeSnapshot(outDir: string, relativePath: string, html: string): Promise<void> {
  const target = resolve(outDir, relativePath);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, `${html}\n`);
}

function snapshotFile(name: string, debug: boolean): string {
  return `${name}${debug ? ".debug" : ""}.html`;
}

function renderIndex(entries: GoldenExportSummaryEntry[]): string {
  const list = entries
    .flatMap((entry) => entry.files.map((file) => `<li><a href="./${file}">${file}</a></li>`))
    .join("");
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8" /><title>Observatory Golden Index</title><link rel="stylesheet" href="/assets/theme.css" /></head><body><div id="root"><div class="observatory-header primitive-section"><strong>Observatory Golden Index</strong></div><div class="observatory-body"><section class="tab-panel primitive-section"><header>Snapshots</header><div class="panel-body"><ul>${list}</ul></div></section></div></div></body></html>\n`;
}

export async function runGoldenExport(
  rootDir: string,
  outDir = resolve(rootDir, DEFAULT_OUT_DIR),
): Promise<GoldenExportSummary> {
  await rm(outDir, { recursive: true, force: true });
  await mkdir(outDir, { recursive: true });
  const [projectionYaml, shell] = await Promise.all([
    readFile(resolve(rootDir, PROJECTION_PATH), "utf8"),
    readFile(resolve(rootDir, SHELL_PATH), "utf8"),
  ]);
  const projection = Bun.YAML.parse(projectionYaml) as ProjectionDoc;
  const manifest = loadSnapshotManifest(projection);
  const worldState = buildWorldState();
  const entries: GoldenExportSummaryEntry[] = [];
  for (const entry of manifest.snapshots) {
    const resolved = resolveSnapshotCtx(entry, worldState);
    const files: string[] = [];
    const modes = debugEnabled(entry, manifest.exportWithDebug === true) ? [false, true] : [false];
    for (const debug of modes) {
      const relativePath = snapshotFile(entry.name, debug);
      await writeSnapshot(
        outDir,
        relativePath,
        renderDocument(shell, entry, resolved.ctx, debug, resolved.errors),
      );
      files.push(relativePath);
    }
    entries.push({
      name: entry.name,
      ok: resolved.errors.length === 0,
      files,
      errors: resolved.errors,
    });
  }
  const summary: GoldenExportSummary = {
    snapshotCount: entries.length,
    errorCount: entries.filter((entry) => !entry.ok).length,
    exportedAt: new Date().toISOString(),
    failedNames: entries.filter((entry) => !entry.ok).map((entry) => entry.name),
    entries,
  };
  await Promise.all([
    writeFile(resolve(outDir, "_summary.json"), `${JSON.stringify(summary, null, 2)}\n`),
    writeFile(resolve(outDir, "index.html"), renderIndex(entries)),
  ]);
  return summary;
}

export async function listGoldenHtmlFiles(rootDir: string): Promise<string[]> {
  const start = resolve(rootDir, DEFAULT_OUT_DIR);
  const out: string[] = [];
  const walk = async (dir: string, prefix = ""): Promise<void> => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        await walk(resolve(dir, entry.name), relative);
      } else if (entry.isFile() && relative.endsWith(".html") && relative !== "index.html") {
        out.push(relative);
      }
    }
  };
  await walk(start);
  return out.sort();
}
