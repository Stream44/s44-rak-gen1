export interface SdsModelEntry {
  path: string;
  role?: "foundation" | "primary" | "reducer" | string;
  initialBinding?: boolean;
}

export interface SdsAcceptanceSuiteEntry {
  id: string;
  name?: string;
  path: string;
  default?: boolean;
}

export interface SdsSeedEntry {
  targetKey: string;
  state: unknown;
  from?: string;
}

export interface SdsPersistence {
  kind: "filesystem" | string;
  path?: string;
  debounceMs?: number;
  structKind?: string;
}

export type LegacyPersistenceBlock = SdsPersistence;

export interface StorageSpaceDef {
  name: string;
  kind: string;
  path?: string;
  format?: "json" | "ndjson" | "yaml";
  debounceMs?: number;
  baseDir?: string;
  [extra: string]: unknown;
}

export type ShapeExpr = string | string[] | Record<string, unknown>;

export interface ShapeDef {
  stored: ShapeExpr;
  derived?: ShapeExpr;
}

export type AspectDef =
  | { kind: "entityCollection"; entity: string; keyField: string }
  | { kind: "stateMachineAggregate"; machine: string; keyField: string; snapshotEvery?: number }
  | { kind: "eventJournal"; machine?: string; entity?: string };

export interface StorageBindingDef {
  name: string;
  space: string;
  aspect: AspectDef;
  shape: ShapeDef;
}

export interface ObservatoryTabSpec {
  id: string;
  from: string;
  splitRatio?: string;
}

export interface ObservatoryUrlSyncSpec {
  key: string;
  alias?: string;
  scope?: string;
}

export interface InspectorSectionSpec {
  heading: string;
  kind: "table" | "keyvalue" | "chain" | "list" | "text" | "code" | "empty";
  items?: string;
  rows?: string;
  columns?: string[];
  text?: string;
  emptyMessage?: string;
  hidden?: boolean;
}

export interface ObservatoryInspectorSpec {
  kind: string;
  selectionKey: string;
  selectedBinding: string;
  tabs?: string[];
  autoSelectFirst?: boolean;
  sections: InspectorSectionSpec[];
}

export interface SdsDoc {
  name: string;
  version: string;
  origin: string;
  description?: string;
  extends?: string | string[];
  provides?: string[];
  kinds?: string[];
  models?: SdsModelEntry[];
  acceptanceSuites?: SdsAcceptanceSuiteEntry[];
  seeds?: SdsSeedEntry[];
  storageSpaces?: StorageSpaceDef[];
  bindings?: StorageBindingDef[];
  persistence?: LegacyPersistenceBlock;
  hostSurface?: {
    tabs?: ObservatoryTabSpec[];
    urlSync?: ObservatoryUrlSyncSpec[];
    inspectors?: ObservatoryInspectorSpec[];
  };
}

export type SdsDocument11 = SdsDoc;

export interface ComposedSds extends Omit<SdsDoc, "extends"> {
  extends?: string[];
}
