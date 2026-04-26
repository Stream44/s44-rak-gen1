import { resolve } from "node:path";
import { AssetRegistry } from "./asset-registry.ts";
import { loadKindPack } from "./metamodel.ts";

const ROOT = import.meta.dir;

export class KindRegistry {
  private readonly assets = new AssetRegistry();

  constructor() {
    for (const name of ["host-api", "host-auth"]) {
      const kind = loadKindPack(resolve(ROOT, "..", "L08-kinds", name));
      this.assets.registerKind({ ...kind, cid: kind.cid ?? `builtin:${name}` } as never);
    }
  }

  getKind(id: string) {
    return this.assets.resolveKind(id);
  }

  listKinds() {
    return this.assets.listKinds();
  }
}

export function createKindRegistry(): KindRegistry {
  return new KindRegistry();
}
