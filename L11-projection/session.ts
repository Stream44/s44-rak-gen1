/** Layer 27: Session and scope types (spec §7.3, §13.2). */

import type { AssetRegistry } from "./asset-registry.ts";
import type { EphemeralStore, ProjectionSession } from "../L01-foundation/projection-session.ts";
export type {
  CurrentUser,
  EphemeralStore,
  ProjectionSession,
} from "../L01-foundation/projection-session.ts";

export function createDefaultSession(opts?: {
  ephemeralRef?: { ref: string; registry: AssetRegistry; instance?: EphemeralStore };
}): ProjectionSession {
  const ephemeralRef = opts?.ephemeralRef;
  if (ephemeralRef && !ephemeralRef.instance) {
    throw new Error(
      "createDefaultSession: ephemeralRef requires pre-resolved instance (sync factory); use createDefaultSessionAsync() to resolve a ref at boot",
    );
  }
  return {
    currentUser: { id: "anonymous", capabilities: {} },
    route: { path: "/", params: {}, query: {} },
    ephemeral: ephemeralRef?.instance ?? new Map(),
  };
}

export async function createDefaultSessionAsync(opts: {
  ephemeralRef: { ref: string; registry: AssetRegistry };
}): Promise<ProjectionSession> {
  const asset = opts.ephemeralRef.registry.resolve(opts.ephemeralRef.ref, "ephemeral-store");
  if (!asset)
    throw new Error(
      `EphemeralStore asset not found for ref "${opts.ephemeralRef.ref}" and kind "ephemeral-store"`,
    );
  if (asset.implementation.kind !== "module")
    throw new Error(
      `EphemeralStore asset "${opts.ephemeralRef.ref}" must use a module implementation`,
    );
  const modulePath = new URL(
    `../L08-kinds/${asset.conformsToKind}/${asset.implementation.module.replace("./", "")}`,
    import.meta.url,
  ).pathname;
  const mod = await import(modulePath);
  const exportName = asset.implementation.export ?? "default";
  const Ctor = mod[exportName as keyof typeof mod] as (new () => EphemeralStore) | undefined;
  if (typeof Ctor !== "function")
    throw new Error(
      `EphemeralStore asset "${opts.ephemeralRef.ref}" missing export "${exportName}"`,
    );
  return createDefaultSession({ ephemeralRef: { ...opts.ephemeralRef, instance: new Ctor() } });
}
