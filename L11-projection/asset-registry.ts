/** Layer 27: Asset Registry (spec §8). CID-addressed, kind-scoped. */

import type { ProjectionAsset, ProjectionKind } from "../L01-foundation/projection-types.ts";

export class AssetRegistry {
  private byCid = new Map<string, ProjectionAsset>();
  private byId = new Map<string, ProjectionAsset>();
  private byKindAndRole = new Map<string, Set<string>>();
  private byIdSuffix = new Map<string, Set<string>>();
  private kinds = new Map<string, ProjectionKind>();

  register(asset: ProjectionAsset): void {
    const existingByCid = this.byCid.get(asset.cid);
    if (existingByCid) return;

    const existingById = this.byId.get(asset.id);
    if (existingById && existingById.cid !== asset.cid) {
      this.unregister(existingById.cid);
    }

    this.byCid.set(asset.cid, asset);
    this.byId.set(asset.id, asset);

    const kindRoleKey = `${asset.conformsToKind ?? "*"}:${asset.assetKind}`;
    let kindRoleCids = this.byKindAndRole.get(kindRoleKey);
    if (!kindRoleCids) {
      kindRoleCids = new Set<string>();
      this.byKindAndRole.set(kindRoleKey, kindRoleCids);
    }
    kindRoleCids.add(asset.cid);

    const suffix = extractIdSuffix(asset.id);
    let suffixCids = this.byIdSuffix.get(suffix);
    if (!suffixCids) {
      suffixCids = new Set<string>();
      this.byIdSuffix.set(suffix, suffixCids);
    }
    suffixCids.add(asset.cid);
  }

  unregister(cid: string): void {
    const asset = this.byCid.get(cid);
    if (!asset) return;

    this.byCid.delete(cid);
    this.byId.delete(asset.id);

    const kindRoleKey = `${asset.conformsToKind ?? "*"}:${asset.assetKind}`;
    const kindRoleCids = this.byKindAndRole.get(kindRoleKey);
    if (kindRoleCids) {
      kindRoleCids.delete(cid);
      if (kindRoleCids.size === 0) this.byKindAndRole.delete(kindRoleKey);
    }

    const suffix = extractIdSuffix(asset.id);
    const suffixCids = this.byIdSuffix.get(suffix);
    if (suffixCids) {
      suffixCids.delete(cid);
      if (suffixCids.size === 0) this.byIdSuffix.delete(suffix);
    }
  }

  resolve(ref: string, activeKind?: string): ProjectionAsset | null {
    if (ref.startsWith("bafy")) {
      return this.byCid.get(ref) ?? null;
    }

    if (ref.startsWith("asset://")) {
      return this.byId.get(ref) ?? null;
    }

    const cids = this.byIdSuffix.get(ref);
    if (!cids || cids.size === 0) return null;

    if (activeKind) {
      for (const cid of cids) {
        const asset = this.byCid.get(cid);
        if (asset?.conformsToKind === activeKind) return asset;
      }
    }

    const firstCid = cids.values().next().value as string | undefined;
    return firstCid ? (this.byCid.get(firstCid) ?? null) : null;
  }

  list(filter: { kind?: string; assetKind?: string } = {}): ProjectionAsset[] {
    const out: ProjectionAsset[] = [];
    for (const asset of this.byCid.values()) {
      if (filter.kind && asset.conformsToKind !== filter.kind) continue;
      if (filter.assetKind && asset.assetKind !== filter.assetKind) continue;
      out.push(asset);
    }
    return out;
  }

  has(cid: string): boolean {
    return this.byCid.has(cid);
  }

  registerKind(kind: ProjectionKind): void {
    if (this.kinds.has(kind.id)) return;
    this.kinds.set(kind.id, kind);
  }

  resolveKind(id: string): ProjectionKind | null {
    return this.kinds.get(id) ?? null;
  }

  listKinds(): ProjectionKind[] {
    return [...this.kinds.values()];
  }
}

function extractIdSuffix(id: string): string {
  if (!id.startsWith("asset://")) return id;
  const parts = id.split("/");
  return parts.length >= 2 ? `${parts[parts.length - 2]}/${parts[parts.length - 1]}` : id;
}
