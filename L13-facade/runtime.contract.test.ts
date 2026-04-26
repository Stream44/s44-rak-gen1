import { expect, test } from "bun:test";

import * as facade from "./runtime.ts";
import type {
  ActionBindingDef,
  ActionManifestEntry,
  ActionManifestEntryObject,
  ComponentDef,
  DispatchOutcome,
  LoadKernelModelOptions,
  MetaProjectionKernel,
  MetaProjectionKernelOptions,
  PageDef,
  ProjectionAsset,
  ProjectionKind,
  ProjectionKernelRuntime,
  ProjectionModel,
  ProjectionNode,
  ProjectionSession,
  ProjectionTree,
  ProjectorDocument,
  ProjectorSession,
  RenderContext,
} from "./runtime.ts";

void (0 as
  | ActionBindingDef
  | ActionManifestEntry
  | ActionManifestEntryObject
  | ComponentDef
  | DispatchOutcome
  | LoadKernelModelOptions
  | MetaProjectionKernel
  | MetaProjectionKernelOptions
  | PageDef
  | ProjectionAsset
  | ProjectionKind
  | ProjectionKernelRuntime
  | ProjectionModel
  | ProjectionNode
  | ProjectionSession
  | ProjectionTree
  | ProjectorDocument
  | ProjectorSession
  | RenderContext
  | undefined);

const EXPECTED_EXPORTS = [
  "AssetRegistry",
  "PrimitiveRegistry",
  "bootNodeTree",
  "createMetaProjectionKernel",
  "loadKernelModel",
];

test("runtime facade - runtime exports match the contract", () => {
  const actual = Object.keys(facade)
    .filter((key) => key !== "default")
    .sort();
  expect(actual).toEqual(EXPECTED_EXPORTS);
});

test("runtime facade - SLOC cap (DC7)", async () => {
  const text = await Bun.file(import.meta.dir + "/runtime.ts").text();
  expect(text.split("\n").length).toBeLessThanOrEqual(100);
});

test("runtime facade - no implementation logic", async () => {
  const text = await Bun.file(import.meta.dir + "/runtime.ts").text();
  expect(text).not.toMatch(/^\s*(export\s+)?function\s+/m);
  expect(text).not.toMatch(/^\s*(export\s+)?class\s+/m);
});
