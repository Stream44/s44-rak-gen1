import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import type { ViewerProjectionConfig } from "../../L14-hosts/viewer/viewer.ts";

export interface DiscoveredExample {
  name: string;
  sdsPath: string;
  projectorPath: string;
  mount: string;
  dir: string;
}

type ExampleDocument = {
  description?: unknown;
  extends?: unknown;
  mount?: unknown;
  name?: unknown;
  pages?: unknown;
  projector?: unknown;
};

type ExampleRecord = DiscoveredExample & {
  aliases: Array<{ name: string; projector?: string }>;
  description: string;
  exportDescription?: string;
  runExport?: (input: ExampleExportInput) => Promise<number>;
  viewerConfig?: (match: DiscoveredExample) => Promise<ViewerProjectionConfig>;
};

export type ExampleExportInput = {
  example: DiscoveredExample;
  rawArgs: string[];
  root: string;
};

export interface ExampleRegistrationContext {
  addAlias(name: string, projector?: string): void;
  setExportHandler(run: (input: ExampleExportInput) => Promise<number>, description?: string): void;
  setViewerConfig(run: (match: DiscoveredExample) => Promise<ViewerProjectionConfig>): void;
}

const DEFAULT_ROOT = resolve(import.meta.dir, "../..");
const DISCOVERY_CACHE = new Map<string, Promise<ExampleRecord[]>>();

export function clearDiscoveryCache(): void {
  DISCOVERY_CACHE.clear();
}

export async function discoverExamples(root: string): Promise<DiscoveredExample[]> {
  const resolvedRoot = resolve(root);
  const cached = DISCOVERY_CACHE.get(resolvedRoot);
  if (cached) return cached;
  const pending = loadExamples(resolvedRoot);
  DISCOVERY_CACHE.set(resolvedRoot, pending);
  return pending;
}

export async function listExampleNames(root: string = DEFAULT_ROOT): Promise<string[]> {
  return (await discoverExamples(root)).map((entry) => entry.name);
}

export async function listExampleDescriptions(
  root: string = DEFAULT_ROOT,
): Promise<Array<{ description: string; name: string }>> {
  return (await discoverExamples(root)).map((entry) => ({
    name: entry.name,
    description: (entry as ExampleRecord).description,
  }));
}

export async function listExportDescriptions(
  root: string = DEFAULT_ROOT,
): Promise<Array<{ description: string; name: string }>> {
  return (await discoverExamples(root))
    .map((entry) => ({
      name: entry.name,
      description: (entry as ExampleRecord).exportDescription ?? "",
    }))
    .filter((entry) => entry.description.length > 0);
}

export async function resolveSdsConfig(
  sdsDir: string,
  opts?: { mount?: string; root?: string },
): Promise<ViewerProjectionConfig> {
  const root = opts?.root ?? DEFAULT_ROOT;
  const entries = await discoverExamples(root);
  const match = entries.find((entry) => resolve(entry.sdsPath) === resolve(sdsDir)) as
    | ExampleRecord
    | undefined;
  if (match?.viewerConfig) {
    return match.viewerConfig({ ...match, mount: opts?.mount ?? match.mount });
  }

  const dir = resolve(sdsDir, "..");
  const document = parseExampleDocument(sdsDir);
  const projectorPath = resolveProjectorPath(document, dir, sdsDir);
  if (!projectorPath) throw new Error(`SDS at "${sdsDir}" has no usable projector.`);
  return { mount: opts?.mount ?? "/", projectorPath };
}

export async function resolveExampleConfig(
  name: string,
  opts?: { projector?: string; root?: string },
): Promise<ViewerProjectionConfig | undefined> {
  const root = opts?.root ?? DEFAULT_ROOT;
  const entries = await discoverExamples(root);
  const alias = entries
    .flatMap((entry) => (entry as ExampleRecord).aliases.map((item) => ({ entry, item })))
    .find(({ item }) => item.name === name);
  const resolvedName = alias?.entry.name ?? name;
  const projectorOverride = opts?.projector ?? alias?.item.projector;
  if (alias) {
    console.warn(
      `[rak] --example ${name} is deprecated; use --example ${alias.entry.name}${alias.item.projector ? ` --projector ${alias.item.projector}` : ""}`,
    );
  }

  const match = entries.find((entry) => entry.name === resolvedName) as ExampleRecord | undefined;
  if (!match) {
    const available = entries.map((entry) => entry.name).join(", ");
    throw new Error(`Unknown example "${name}". Available: ${available || "(none discovered)"}`);
  }

  const resolvedMatch = projectorOverride
    ? { ...match, projectorPath: resolveProjectorOverride(match, projectorOverride) }
    : match;
  if (resolvedMatch.viewerConfig) return resolvedMatch.viewerConfig(resolvedMatch);
  return { mount: resolvedMatch.mount, projectorPath: resolvedMatch.projectorPath };
}

export async function runExampleExport(
  name: string,
  rawArgs: string[],
  root: string = DEFAULT_ROOT,
): Promise<number> {
  const entries = await discoverExamples(root);
  const match = entries.find((entry) => entry.name === name) as ExampleRecord | undefined;
  if (!match?.runExport) {
    const available = entries
      .filter((entry) => Boolean((entry as ExampleRecord).runExport))
      .map((entry) => entry.name)
      .join(", ");
    throw new Error(
      `Unknown export target "${name}". Available: ${available || "(none discovered)"}`,
    );
  }
  return match.runExport({ example: match, rawArgs, root });
}

function parseExampleDocument(sdsPath: string): ExampleDocument {
  return (Bun.YAML.parse(readFileSync(sdsPath, "utf-8")) ?? {}) as ExampleDocument;
}

function readExampleName(document: ExampleDocument, fallbackName: string, dir: string): string {
  if (typeof document.name === "string" && document.name.length > 0) return document.name;
  console.warn(`[rak] example at ${dir}/sds.yaml has no name; falling back to directory name`);
  return fallbackName;
}

function resolveProjectorPath(
  document: ExampleDocument,
  dir: string,
  sdsPath: string,
): string | undefined {
  return resolveProjectorPathWithExtends(document, dir, sdsPath, new Set<string>());
}

function resolveProjectorPathWithExtends(
  document: ExampleDocument,
  dir: string,
  sdsPath: string,
  seen: Set<string>,
): string | undefined {
  seen.add(sdsPath);

  const explicitProjector =
    typeof document.projector === "string" && document.projector.length > 0
      ? resolve(dir, document.projector)
      : undefined;
  if (explicitProjector && existsSync(explicitProjector)) return explicitProjector;

  const pageProjector = readPageProjector(document.pages, dir);
  if (pageProjector && existsSync(pageProjector)) return pageProjector;

  const conventionalProjector = resolve(dir, "projection/projection.yaml");
  if (existsSync(conventionalProjector)) return conventionalProjector;

  const inheritedProjector = resolveExtendedProjector(document.extends, dir, seen);
  if (inheritedProjector) return inheritedProjector;

  console.warn(`[rak] example at ${sdsPath} has no usable projector; skipping`);
  return undefined;
}

function readPageProjector(pages: unknown, dir: string): string | undefined {
  if (!Array.isArray(pages)) return undefined;
  for (const page of pages) {
    if (!page || typeof page !== "object") continue;
    const path =
      typeof (page as { path?: unknown }).path === "string"
        ? (page as { path: string }).path
        : typeof (page as { projector?: unknown }).projector === "string"
          ? (page as { projector: string }).projector
          : undefined;
    if (path?.endsWith(".yaml")) return resolve(dir, path);
  }
  return undefined;
}

function resolveExtendedProjector(
  extendsValue: unknown,
  dir: string,
  seen: Set<string>,
): string | undefined {
  if (!Array.isArray(extendsValue)) return undefined;
  for (const entry of extendsValue) {
    if (typeof entry !== "string" || entry.length === 0) continue;
    const sdsPath = resolve(dir, entry);
    if (seen.has(sdsPath) || !existsSync(sdsPath)) continue;
    const document = parseExampleDocument(sdsPath);
    const inherited = resolveProjectorPathWithExtends(
      document,
      resolve(sdsPath, ".."),
      sdsPath,
      seen,
    );
    if (inherited) return inherited;
  }
  return undefined;
}

function resolveProjectorOverride(match: DiscoveredExample, projector: string): string {
  const projectorPath = projector.endsWith(".yaml")
    ? resolve(match.dir, projector)
    : resolve(match.dir, projector, "projection.yaml");
  if (!existsSync(projectorPath)) {
    throw new Error(
      `Unknown projector "${projector}" for example "${match.name}". Expected ${projectorPath}`,
    );
  }
  return projectorPath;
}

async function loadExamples(root: string): Promise<ExampleRecord[]> {
  const discovered: ExampleRecord[] = [];
  const examplesDir = resolve(root, "examples");
  for (const entry of readdirSync(examplesDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .sort((a, b) => a.name.localeCompare(b.name))) {
    const dir = resolve(examplesDir, entry.name);
    const sdsPath = resolve(dir, "sds.yaml");
    if (!existsSync(sdsPath) || sdsPath.endsWith("sds.test.yaml")) continue;

    const document = parseExampleDocument(sdsPath);
    const projectorPath = resolveProjectorPath(document, dir, sdsPath);
    if (!projectorPath) continue;

    const record: ExampleRecord = {
      name: readExampleName(document, entry.name, dir),
      sdsPath,
      projectorPath,
      mount: typeof document.mount === "string" && document.mount.length > 0 ? document.mount : "/",
      dir,
      description: typeof document.description === "string" ? document.description : "",
      aliases: [],
    };
    await loadRegistration(record);
    discovered.push(record);
  }
  return discovered;
}

async function loadRegistration(record: ExampleRecord): Promise<void> {
  const registrationPath = resolve(record.dir, "registration.ts");
  if (!existsSync(registrationPath)) return;
  const mod = (await import(pathToFileURL(registrationPath).href)) as {
    register?: (registry: ExampleRegistrationContext) => Promise<void> | void;
  };
  if (typeof mod.register !== "function") return;
  await mod.register({
    addAlias(name, projector) {
      record.aliases.push({ name, projector });
    },
    setExportHandler(run, description) {
      record.runExport = run;
      record.exportDescription = description;
    },
    setViewerConfig(run) {
      record.viewerConfig = run;
    },
  });
}
