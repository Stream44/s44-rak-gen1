import { dirname, isAbsolute, resolve } from "path";
import { readFileSync, statSync } from "fs";
import { AlgebraicKernel, ModelLoader, type ModelBoot } from "../../L13-facade/index.ts";
import { createStorageRouter } from "../../L07-agency/storage-router.ts";
import { emitSchema } from "../../L09-demand/schema-emitter.ts";
import { registerModelIntrospectionMorphisms } from "../../L11-projection/model-introspection-m1.ts";
import { createEphemeralSpace } from "../../L08-kinds/ephemeral-space/ephemeral-space.ts";
import { createEphemeralJournalSpace } from "../../L08-kinds/ephemeral-journal-space/ephemeral-journal-space.ts";
import { createFilesystemJournalSpace } from "../../L08-kinds/filesystem-journal-space/filesystem-journal-space.ts";
import { createFilesystemSpace } from "../../L08-kinds/filesystem-space/filesystem-space.ts";
import { resolvePersistencePath } from "../../L08-kinds/fs-model-store/path-resolver.ts";
import { validateStorageDeclarations } from "./sds-storage-validate.ts";
import type {
  ComposedSds,
  InspectorSectionSpec,
  ObservatoryInspectorSpec,
  SdsPersistence,
  SdsAcceptanceSuiteEntry,
  SdsDocument11,
  SdsModelEntry,
  SdsSeedEntry,
} from "./sds-schema.ts";

type HostSurface = NonNullable<ComposedSds["hostSurface"]>;

const legacyHostSurfaceWarned = new Set<string>();
function warnLegacyHostSurfaceOnce(origin: string, name: string): void {
  const key = `${origin}::${name}`;
  if (legacyHostSurfaceWarned.has(key)) return;
  legacyHostSurfaceWarned.add(key);
  // alias + deprecated: one-release hostSurface compatibility warning
  // eslint-disable-next-line no-console
  console.warn(
    `[sds] "observatorySurface" is deprecated; renamed to "hostSurface". did you mean "hostSurface"? origin=${origin} name=${name}. The alias will be removed in a future cleanup pass.`,
  );
}

export interface NodeRuntime {
  kernel: AlgebraicKernel;
  loader: ModelLoader;
  app: ModelBoot;
  apps: Map<string, ModelBoot>;
  sds: ComposedSds;
  suiteRegistry: Array<{ id: string; name: string; path: string; default: boolean }>;
  seedList: Array<{ targetKey: string; state: unknown }>;
  inspectors: ObservatoryInspectorSpec[];
  dispose: () => void;
}

interface ResolvedSdsNode {
  path: string;
  document: SdsDocument11;
  extends: string[];
  models: SdsModelEntry[];
  acceptanceSuites: SdsAcceptanceSuiteEntry[];
  seeds: SdsSeedEntry[];
  persistence?: SdsPersistence;
  hostSurface?: {
    tabs?: HostSurface["tabs"];
    urlSync?: HostSurface["urlSync"];
    inspectors?: HostSurface["inspectors"];
  };
}

export function bootNode(sdsPath: string): NodeRuntime {
  const normalizedPath = normalizeSdsPath(sdsPath);
  const chain = readSdsChain(normalizedPath);
  const composedSds = composeSds(chain);
  const kernel = AlgebraicKernel.create();
  registerModelIntrospectionMorphisms(kernel);
  const loader = new ModelLoader(kernel);
  loader.setIntentProcessor(kernel.intents);

  const models = composedSds.models ?? [];
  const loadedModels = models.map((model) => ({
    model,
    result: loader.loadYamlFile(model.path),
  }));
  const sds = desugarLegacyPersistence(composedSds, loadedModels, new Set<string>());
  if (sds.persistence && sds.persistence.kind !== "filesystem") {
    throw new Error(`Unknown persistence kind: ${sds.persistence.kind}. Supported: filesystem.`);
  }
  validateStorageDeclarations({
    doc: sds,
    models: new Map(loadedModels.map(({ result }) => [result.modelId, result])),
  });
  const inspectors = loadedModels.reduce<ObservatoryInspectorSpec[]>(
    (current, { result }) =>
      mergeInspectors(current, result.document.surface?.inspectors ?? []) ?? current,
    sds.hostSurface?.inspectors ? [...sds.hostSurface.inspectors] : [],
  );
  const initialBindings = loadedModels.filter(({ model }) => model.initialBinding === true);
  if (initialBindings.length !== 1) {
    throw new Error(
      `bootNode requires exactly one model with initialBinding:true; found ${initialBindings.length}.`,
    );
  }
  const primaryModel = initialBindings[0].result;

  const apps = new Map<string, ModelBoot>();
  let app: ModelBoot | null = null;
  for (const { model, result } of loadedModels) {
    const booted = loader.bootYamlFile(model.path);
    apps.set(result.modelId, booted);
    if (model.initialBinding === true) {
      app = booted;
    }
  }

  if (!app) {
    throw new Error("bootNode could not boot the initial binding model.");
  }

  const seedList = flattenSeeds(sds.seeds ?? []);
  for (const seed of seedList) {
    app.setState(seed.targetKey, seed.state);
  }

  const suiteRegistry = (sds.acceptanceSuites ?? []).map((suite) => ({
    id: suite.id,
    name: suite.name ?? suite.id,
    path: suite.path,
    default: suite.default === true,
  }));

  const spaces = createStorageSpaces(sds, normalizedPath, primaryModel);
  const schemaEmitter = createSchemaEmitter(loadedModels);
  const router = sds.bindings?.length
    ? createStorageRouter({
        bindings: sds.bindings,
        spaces,
        processor: kernel.intents,
        schemaEmitter,
      })
    : null;
  void router?.hydrate();
  syncPrimaryBindingToApp(
    app,
    kernel.intents,
    sds.bindings ?? [],
    primaryModel.modelId,
    primaryModel.statemachineId,
  );
  const stopEvent = router
    ? kernel.intents.onEvent((event) => {
        if (event.kind === "submitted") router.route(event);
        if (event.kind === "removed") router.routeRemoval(event);
      })
    : undefined;
  const stopCommit = router
    ? kernel.intents.onTransactionCommit((event) => void router.onTransactionCommit(event))
    : undefined;

  const flushRuntime = async () => {
    await router?.close();
    await Promise.all([...spaces.values()].map((space) => space.flush?.()));
  };

  const disposeRuntime = () => {
    stopEvent?.();
    stopCommit?.();
    void router?.close();
    void Promise.all([...spaces.values()].map((space) => space.close?.()));
  };

  const restartRuntime = async (): Promise<ModelBoot> => bootNode(normalizedPath).app;

  app.flush = flushRuntime;
  app.dispose = disposeRuntime;
  app.restart = restartRuntime;

  return {
    kernel,
    loader,
    app,
    apps,
    sds,
    suiteRegistry,
    seedList,
    inspectors,
    dispose: disposeRuntime,
  };
}

function normalizeSdsPath(sdsPath: string): string {
  const absolutePath = resolve(sdsPath);
  try {
    if (statSync(absolutePath).isDirectory()) {
      return resolve(absolutePath, "sds.yaml");
    }
  } catch {
    // Let the read fail with the final path so the error names the concrete target.
  }
  return absolutePath;
}

function readSdsChain(sdsPath: string, stack: string[] = []): ResolvedSdsNode[] {
  if (stack.includes(sdsPath)) {
    const parentPath = stack[stack.length - 1] ?? sdsPath;
    throw new Error(`SDS extends cycle detected between "${parentPath}" and "${sdsPath}".`);
  }

  const content = readFileSync(sdsPath, "utf-8");
  const rawDocument = Bun.YAML.parse(content) as SdsDocument11 & Record<string, unknown>;
  // did you mean: normalize the legacy field name before hostSurface is consumed.
  const legacySurface = (rawDocument as { observatorySurface?: unknown }).observatorySurface; // alias
  const currentSurface = (rawDocument as { hostSurface?: unknown }).hostSurface;
  if (legacySurface !== undefined && currentSurface === undefined) {
    warnLegacyHostSurfaceOnce(rawDocument.origin ?? "<unknown>", rawDocument.name ?? "<unnamed>");
    (rawDocument as { hostSurface?: unknown }).hostSurface = legacySurface;
    delete (rawDocument as { observatorySurface?: unknown }).observatorySurface; // alias
  } else if (legacySurface !== undefined && currentSurface !== undefined) {
    delete (rawDocument as { observatorySurface?: unknown }).observatorySurface; // alias
  }
  const document = rawDocument as SdsDocument11;
  const baseDir = dirname(sdsPath);
  const extendsRefs = toArray(document.extends).map((ref) => resolveRelative(baseDir, ref));
  const nextStack = [...stack, sdsPath];
  const parents = extendsRefs.flatMap((ref) => readSdsChain(ref, nextStack));

  return [
    ...parents,
    {
      path: sdsPath,
      document,
      extends: extendsRefs,
      models: (document.models ?? []).map((model) => ({
        ...model,
        path: resolveRelative(baseDir, model.path),
      })),
      acceptanceSuites: (document.acceptanceSuites ?? []).map((suite) => ({
        ...suite,
        path: resolveRelative(baseDir, suite.path),
      })),
      seeds: (document.seeds ?? []).map((seed) => ({
        ...seed,
        from: seed.from ? resolveRelative(baseDir, seed.from) : undefined,
      })),
      persistence: document.persistence ? { ...document.persistence } : undefined,
      hostSurface: document.hostSurface
        ? {
            tabs: document.hostSurface.tabs?.map((tab) => ({ ...tab })),
            urlSync: document.hostSurface.urlSync?.map((entry) => ({ ...entry })),
            inspectors: document.hostSurface.inspectors?.map(cloneInspector),
          }
        : undefined,
    },
  ];
}

function composeSds(chain: ResolvedSdsNode[]): ComposedSds {
  if (chain.length === 0) {
    throw new Error("bootNode requires at least one sds.yaml document.");
  }

  let composed: ComposedSds = {
    name: chain[0].document.name,
    version: chain[0].document.version,
    origin: chain[0].document.origin,
    description: chain[0].document.description,
    extends: chain[0].extends.length > 0 ? [...chain[0].extends] : undefined,
    provides: concatValues(undefined, chain[0].document.provides),
    kinds: concatValues(undefined, chain[0].document.kinds),
    models: concatValues(undefined, chain[0].models),
    acceptanceSuites: mergeById(undefined, chain[0].acceptanceSuites),
    seeds: concatValues(undefined, chain[0].seeds),
    storageSpaces: mergeByKey(
      undefined,
      chain[0].document.storageSpaces?.map((space) => ({ ...space })),
      (s) => s.name,
    ),
    bindings: mergeByKey(
      undefined,
      chain[0].document.bindings?.map((binding) => ({ ...binding })),
      (b) => b.name,
    ),
    persistence: chain[0].persistence ? { ...chain[0].persistence } : undefined,
    hostSurface: mergeSurface(undefined, chain[0].hostSurface),
  };

  for (const node of chain.slice(1)) {
    composed = {
      name: node.document.name,
      version: node.document.version,
      origin: node.document.origin,
      description: node.document.description ?? composed.description,
      extends: node.extends.length > 0 ? [...node.extends] : composed.extends,
      provides: concatValues(composed.provides, node.document.provides),
      kinds: concatValues(composed.kinds, node.document.kinds),
      models: concatValues(composed.models, node.models),
      acceptanceSuites: mergeById(composed.acceptanceSuites, node.acceptanceSuites),
      seeds: concatValues(composed.seeds, node.seeds),
      storageSpaces: mergeByKey(
        composed.storageSpaces,
        node.document.storageSpaces?.map((space) => ({ ...space })),
        (s) => s.name,
      ),
      bindings: mergeByKey(
        composed.bindings,
        node.document.bindings?.map((binding) => ({ ...binding })),
        (b) => b.name,
      ),
      persistence: node.persistence ? { ...node.persistence } : composed.persistence,
      hostSurface: mergeSurface(composed.hostSurface, node.hostSurface),
    };
  }

  return composed;
}

export function desugarLegacyPersistence(
  doc: ComposedSds,
  loadedModels: Array<{ model: SdsModelEntry; result: ReturnType<ModelLoader["loadYamlFile"]> }>,
  warned: Set<string> = new Set(),
): ComposedSds {
  if (!doc.persistence || doc.persistence.kind !== "filesystem") {
    return doc;
  }
  if (doc.storageSpaces?.length || doc.bindings?.length) {
    throw new Error("sds: cannot mix legacy persistence: with storageSpaces/bindings");
  }
  const warningKey = `${doc.origin}:${doc.name}`;
  if (!warned.has(warningKey)) {
    warned.add(warningKey);
    console.warn(
      `[sds] ${doc.name}: persistence:{kind:filesystem} is deprecated; auto-desugaring to storageSpaces + bindings.`,
    );
  }
  const primaryModel = loadedModels.find(
    ({ model }) => model.role === "primary" || model.initialBinding === true,
  )?.result;
  const primaryEntity = primaryModel
    ? Object.keys(primaryModel.document.entities ?? {})[0]
    : undefined;
  if (!primaryModel || !primaryEntity) {
    return doc;
  }
  return {
    ...doc,
    storageSpaces: [
      {
        name: "default-fs",
        kind: "filesystem",
        path: doc.persistence.path,
        debounceMs: doc.persistence.debounceMs ?? 50,
      },
    ],
    bindings: [
      {
        name: "default",
        space: "default-fs",
        aspect: {
          kind: "entityCollection",
          entity: primaryEntity,
          keyField: "id",
        },
        shape: {
          stored: "$self",
          derived: { id: "$key" },
        },
      },
    ],
  };
}

function createStorageSpaces(
  sds: ComposedSds,
  sdsPath: string,
  primaryModel: { modelId: string; origin: string },
) {
  const spaces = new Map<
    string,
    ReturnType<typeof createFilesystemSpace> | ReturnType<typeof createFilesystemJournalSpace>
  >();
  const baseDir = dirname(sdsPath);
  for (const space of sds.storageSpaces ?? []) {
    const resolvedPath =
      typeof space.path === "string"
        ? resolveRelative(baseDir, space.path)
        : space.name === "default-fs" && sds.persistence?.kind === "filesystem"
          ? resolvePersistencePath({
              sdsPath,
              origin: primaryModel.origin,
              structKind: sds.persistence.structKind ?? "model",
              modelId: primaryModel.modelId,
              override: sds.persistence.path,
            })
          : undefined;
    switch (space.kind) {
      case "filesystem":
        spaces.set(
          space.name,
          createFilesystemSpace({
            name: space.name,
            path: String(resolvedPath ?? ""),
            debounceMs: typeof space.debounceMs === "number" ? space.debounceMs : undefined,
          }),
        );
        break;
      case "filesystem-journal":
        spaces.set(
          space.name,
          createFilesystemJournalSpace({
            name: space.name,
            path: String(resolvedPath ?? ""),
            debounceMs: typeof space.debounceMs === "number" ? space.debounceMs : undefined,
          }),
        );
        break;
      case "ephemeral":
        spaces.set(space.name, createEphemeralSpace({ name: space.name }));
        break;
      case "ephemeral-journal":
        spaces.set(space.name, createEphemeralJournalSpace({ name: space.name }));
        break;
      default:
        throw new Error(`Unknown storage space kind: ${space.kind}.`);
    }
  }
  return spaces;
}

function createSchemaEmitter(
  loadedModels: Array<{ model: SdsModelEntry; result: ReturnType<ModelLoader["loadYamlFile"]> }>,
): { contextFor(binding: NonNullable<ComposedSds["bindings"]>[number]): string } {
  const entityVersions = new Map<string, string>();
  const machineVersions = new Map<string, string>();

  for (const { result } of loadedModels) {
    const firstEntity = Object.keys(result.document.entities ?? {})[0];
    if (firstEntity) {
      const emitted = emitSchema(result.document, firstEntity);
      entityVersions.set(firstEntity, emitted.schemaVersion);
      if (result.statemachineId) machineVersions.set(result.statemachineId, emitted.schemaVersion);
    }
  }

  return {
    contextFor(binding) {
      if ("entity" in binding.aspect && binding.aspect.entity) {
        return (
          entityVersions.get(binding.aspect.entity) ??
          "type://github.com/Stream44/s44-rak-gen1@1.0/storage/binding/1.0"
        );
      }
      if ("machine" in binding.aspect && binding.aspect.machine) {
        return (
          machineVersions.get(binding.aspect.machine) ??
          "type://github.com/Stream44/s44-rak-gen1@1.0/storage/binding/1.0"
        );
      }
      return "type://github.com/Stream44/s44-rak-gen1@1.0/storage/binding/1.0";
    },
  };
}

function syncPrimaryBindingToApp(
  app: ModelBoot,
  processor: AlgebraicKernel["intents"],
  bindings: NonNullable<ComposedSds["bindings"]>,
  primaryModelId: string,
  primaryStateMachineId?: string,
): void {
  const primaryBinding =
    bindings.find(
      (binding) =>
        binding.aspect.kind === "stateMachineAggregate" &&
        (binding.aspect.machine === primaryModelId ||
          binding.aspect.machine === primaryStateMachineId),
    ) ??
    bindings.find((binding) => binding.aspect.kind === "entityCollection") ??
    bindings.find((binding) => binding.name === "default");
  if (!primaryBinding) return;
  for (const [key, value] of processor.listStoreForBinding(primaryBinding.name)) {
    if (
      primaryBinding.aspect.kind === "stateMachineAggregate" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      "currentState" in (value as Record<string, unknown>)
    ) {
      app.setState(key, (value as Record<string, unknown>).currentState);
      continue;
    }
    if (
      primaryBinding.name === "default" &&
      value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      (value as Record<string, unknown>).id === key
    ) {
      const { id: _id, ...rest } = value as Record<string, unknown>;
      app.setState(key, rest);
      continue;
    }
    app.setState(key, value);
  }
}

function mergeSurface(
  current: ComposedSds["hostSurface"],
  incoming: ComposedSds["hostSurface"],
): ComposedSds["hostSurface"] {
  if (!current && !incoming) {
    return undefined;
  }
  return {
    tabs: mergeById(current?.tabs, incoming?.tabs),
    urlSync: mergeByKey(current?.urlSync, incoming?.urlSync, (entry) => entry.key),
    inspectors: mergeInspectors(current?.inspectors, incoming?.inspectors),
  };
}

function cloneInspector(inspector: ObservatoryInspectorSpec): ObservatoryInspectorSpec {
  return {
    ...inspector,
    tabs: inspector.tabs ? [...inspector.tabs] : undefined,
    sections: inspector.sections.map((section) => ({
      ...section,
      columns: section.columns ? [...section.columns] : undefined,
    })),
  };
}

function mergeInspectors(
  current?: ObservatoryInspectorSpec[],
  incoming?: Array<
    Partial<Omit<ObservatoryInspectorSpec, "kind" | "sections">> & {
      kind: string;
      sections: Array<
        Partial<Omit<InspectorSectionSpec, "heading" | "kind">> &
          Pick<InspectorSectionSpec, "heading" | "kind">
      >;
    }
  >,
): ObservatoryInspectorSpec[] | undefined {
  if (!current?.length && !incoming?.length) {
    return undefined;
  }
  const byKind = new Map<string, ObservatoryInspectorSpec>(
    (current ?? []).map((inspector) => [inspector.kind, cloneInspector(inspector)]),
  );
  for (const inspector of incoming ?? []) {
    const existing = byKind.get(inspector.kind);
    if (!existing) {
      byKind.set(inspector.kind, {
        kind: inspector.kind,
        selectionKey: inspector.selectionKey ?? "",
        selectedBinding: inspector.selectedBinding ?? "",
        tabs: inspector.tabs ? [...inspector.tabs] : undefined,
        autoSelectFirst: inspector.autoSelectFirst,
        sections: inspector.sections.map(cloneSection),
      });
      continue;
    }
    const sections = [...existing.sections];
    for (const section of inspector.sections) {
      const index = sections.findIndex((entry) => entry.heading === section.heading);
      if (index >= 0) sections[index] = cloneSection(section);
      else sections.push(cloneSection(section));
    }
    byKind.set(inspector.kind, {
      ...existing,
      ...inspector,
      tabs: inspector.tabs ? [...inspector.tabs] : existing.tabs,
      sections,
    });
  }
  return [...byKind.values()];
}

function cloneSection(
  section: Partial<Omit<InspectorSectionSpec, "heading" | "kind">> &
    Pick<InspectorSectionSpec, "heading" | "kind">,
): InspectorSectionSpec {
  return { ...section, columns: section.columns ? [...section.columns] : undefined };
}

function mergeByKey<T>(
  current: T[] | undefined,
  incoming: T[] | undefined,
  keyFn: (entry: T) => string,
): T[] | undefined {
  const combined = concatValues(current, incoming);
  if (!combined) {
    return undefined;
  }

  const deduped: T[] = [];
  const seen = new Set<string>();
  for (let index = combined.length - 1; index >= 0; index -= 1) {
    const entry = combined[index];
    const key = keyFn(entry);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.unshift(entry);
  }
  return deduped;
}

function mergeById<T extends { id: string }>(current?: T[], incoming?: T[]): T[] | undefined {
  return mergeByKey(current, incoming, (entry) => entry.id);
}

function concatValues<T>(current?: T[], incoming?: T[]): T[] | undefined {
  if (!current?.length && !incoming?.length) {
    return undefined;
  }
  return [...(current ?? []), ...(incoming ?? [])];
}

function flattenSeeds(seeds: SdsSeedEntry[]): Array<{ targetKey: string; state: unknown }> {
  const seedList: Array<{ targetKey: string; state: unknown }> = [];
  for (const seed of seeds) {
    if (seed.from) {
      const loadedSeeds = ModelLoader.loadSeedFile(seed.from);
      if (!Array.isArray(loadedSeeds)) {
        throw new Error(`Seed file "${seed.from}" must contain an array of seed entries.`);
      }
      for (const entry of loadedSeeds) {
        seedList.push(assertSeedEntry(entry, seed.from));
      }
      continue;
    }

    seedList.push({ targetKey: seed.targetKey, state: seed.state });
  }
  return seedList;
}

function assertSeedEntry(entry: unknown, source: string): { targetKey: string; state: unknown } {
  if (!entry || typeof entry !== "object" || !("targetKey" in entry) || !("state" in entry)) {
    throw new Error(`Seed file "${source}" must contain entries shaped like { targetKey, state }.`);
  }

  const candidate = entry as { targetKey: unknown; state: unknown };
  if (typeof candidate.targetKey !== "string") {
    throw new Error(`Seed file "${source}" has a seed with a non-string targetKey.`);
  }

  return { targetKey: candidate.targetKey, state: candidate.state };
}

function toArray(value?: string | string[]): string[] {
  if (!value) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function resolveRelative(baseDir: string, target: string): string {
  return isAbsolute(target) ? target : resolve(baseDir, target);
}
