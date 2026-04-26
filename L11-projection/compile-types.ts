import type { ProjectionModel, CapabilityRequirement } from "../L01-foundation/projection-types.ts";
import type { ResolvedManifest } from "./dispatch.ts";

export type ActionManifest = ResolvedManifest;

export interface PageWalk {
  pageName: string;
  bindings: Record<string, unknown>;
  children: unknown[];
}

export interface MorphismWalk {
  root: unknown;
}

export type WalkedTree =
  | { kind: "pages"; entries: PageWalk[] }
  | { kind: "morphism"; entries: MorphismWalk[] };

export interface DataRequirement {
  model: string;
  selector: string;
  nodePath: string;
}

export interface CompiledProjection {
  cid: string;
  model: ProjectionModel;
  manifest: ActionManifest;
  ast: WalkedTree;
  staticRequirements: DataRequirement[];
  staticCapabilities: CapabilityRequirement[];
}
