import { createHash } from "node:crypto";
import type {
  CapabilityRequirement,
  ProjectionModel,
} from "../../L01-foundation/projection-types.ts";
import type {
  ActionManifest,
  CompiledProjection,
  DataRequirement,
  WalkedTree,
} from "../compile-types.ts";

type Input = ProjectionModel & {
  doc?: ProjectionModel;
  manifest?: ActionManifest;
  ast?: WalkedTree;
  walkedTree?: WalkedTree;
  dataReqs?: DataRequirement[];
  capReqs?: CapabilityRequirement[];
  staticCapabilities?: CapabilityRequirement[];
  byName?: ActionManifest["byName"];
  byUri?: ActionManifest["byUri"];
  kind?: WalkedTree["kind"];
  entries?: WalkedTree["entries"];
};

export default function emitCompiled(input: Input): CompiledProjection {
  const model = input.doc ?? input;
  const manifest = input.manifest ?? {
    byName: input.byName ?? new Map(),
    byUri: input.byUri ?? new Map(),
  };
  const ast =
    input.walkedTree ??
    input.ast ??
    ({
      kind: input.kind ?? "morphism",
      entries: input.entries ?? [],
    } as WalkedTree);
  const cid = createHash("sha256")
    .update(JSON.stringify({ model, manifest, ast }))
    .digest("hex")
    .slice(0, 16);
  return {
    cid,
    model,
    ast,
    manifest,
    staticRequirements: input.dataReqs ?? [],
    staticCapabilities: input.capReqs ?? input.staticCapabilities ?? [],
  };
}
