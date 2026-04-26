/**
 * Layer 5: TypeGraph — tracks relationships between types.
 */

import { MetaLevel, TypeRelation } from "../L01-foundation/types.ts";
import type { TypeDef, TypeRef, TypeEdge } from "../L01-foundation/types.ts";
import { extractTypeRefs } from "../L01-foundation/utils.ts";

const META_ALIAS = "type://github.com/Stream44/s44-rak-gen1@1.0/meta/1.0";

export class TypeGraph {
  private outbound = new Map<TypeRef, TypeEdge[]>();
  private inbound = new Map<TypeRef, TypeEdge[]>();
  private typeLevels = new Map<TypeRef, MetaLevel>();
  private metaAliasTarget: TypeRef | null = null;

  addType(typeDef: TypeDef): void {
    const ref = typeDef.id;
    if (typeDef.aliases?.includes(META_ALIAS)) {
      this.metaAliasTarget = ref;
      this.retargetAlias(META_ALIAS, ref);
    }
    this.typeLevels.set(ref, typeDef.level);

    if (!this.outbound.has(ref)) this.outbound.set(ref, []);
    if (!this.inbound.has(ref)) this.inbound.set(ref, []);

    // conformsTo edge (vertical)
    const parentRef = this.normalizeRef(typeDef.conformsTo);
    if (parentRef !== ref) {
      this.addEdge(ref, parentRef, TypeRelation.ConformsTo);
    }

    // $typeRef edges from schema (horizontal)
    const schemaRefs = extractTypeRefs(typeDef.schema);
    for (const target of schemaRefs) {
      this.addEdge(ref, this.normalizeRef(target), TypeRelation.References);
    }

    // Declared refs
    if (typeDef.refs) {
      for (const r of typeDef.refs) {
        const rel = Object.values(TypeRelation).includes(r.rel as TypeRelation)
          ? (r.rel as TypeRelation)
          : TypeRelation.References;
        this.addEdge(ref, this.normalizeRef(r.target), rel);
      }
    }
  }

  removeType(ref: TypeRef): void {
    ref = this.normalizeRef(ref);
    // Remove all edges from this type
    const out = this.outbound.get(ref) ?? [];
    for (const edge of out) {
      const inList = this.inbound.get(edge.to);
      if (inList) {
        const idx = inList.findIndex((e) => e.from === ref);
        if (idx >= 0) inList.splice(idx, 1);
      }
    }

    // Remove all edges to this type
    const inEdges = this.inbound.get(ref) ?? [];
    for (const edge of inEdges) {
      const outList = this.outbound.get(edge.from);
      if (outList) {
        const idx = outList.findIndex((e) => e.to === ref);
        if (idx >= 0) outList.splice(idx, 1);
      }
    }

    this.outbound.delete(ref);
    this.inbound.delete(ref);
    this.typeLevels.delete(ref);
  }

  edgesFrom(ref: TypeRef): TypeEdge[] {
    return this.outbound.get(this.normalizeRef(ref)) ?? [];
  }

  edgesTo(ref: TypeRef): TypeEdge[] {
    return this.inbound.get(this.normalizeRef(ref)) ?? [];
  }

  referencedBy(ref: TypeRef): TypeRef[] {
    return this.edgesTo(ref)
      .filter((e) => e.rel === TypeRelation.References)
      .map((e) => e.from);
  }

  referencesTo(ref: TypeRef): TypeRef[] {
    return this.edgesFrom(ref)
      .filter((e) => e.rel === TypeRelation.References)
      .map((e) => e.to);
  }

  /**
   * Get the full dependency closure in topological order.
   */
  dependencyClosure(ref: TypeRef): TypeRef[] {
    ref = this.normalizeRef(ref);
    const visited = new Set<TypeRef>();
    const result: TypeRef[] = [];

    const visit = (r: TypeRef) => {
      if (visited.has(r)) return;
      visited.add(r);
      const edges = this.outbound.get(r) ?? [];
      for (const edge of edges) {
        visit(edge.to);
      }
      result.push(r);
    };

    visit(ref);
    // Return in dependency-first order (reverse of post-order)
    return result;
  }

  /**
   * Compute the impact set in reverse topological order.
   */
  impactSet(ref: TypeRef): TypeRef[] {
    ref = this.normalizeRef(ref);
    const visited = new Set<TypeRef>();
    const result: TypeRef[] = [];

    const visit = (r: TypeRef) => {
      if (visited.has(r)) return;
      visited.add(r);
      const edges = this.inbound.get(r) ?? [];
      for (const edge of edges) {
        visit(edge.from);
      }
      result.push(r);
    };

    visit(ref);
    // Remove the root
    return result.filter((r) => r !== ref);
  }

  byLevel(level: MetaLevel): TypeRef[] {
    const result: TypeRef[] = [];
    for (const [ref, lvl] of this.typeLevels) {
      if (lvl === level) result.push(ref);
    }
    return result;
  }

  byConformsTo(parentRef: TypeRef): TypeRef[] {
    return this.edgesTo(parentRef)
      .filter((e) => e.rel === TypeRelation.ConformsTo)
      .map((e) => e.from);
  }

  allEdges(): TypeEdge[] {
    const edges: TypeEdge[] = [];
    for (const list of this.outbound.values()) {
      edges.push(...list);
    }
    return edges;
  }

  allTypes(): TypeRef[] {
    return [...this.typeLevels.keys()];
  }

  /**
   * Check for cycles other than M3 self-reference.
   */
  hasCycle(): boolean {
    const WHITE = 0,
      GRAY = 1,
      BLACK = 2;
    const color = new Map<TypeRef, number>();
    for (const ref of this.typeLevels.keys()) {
      color.set(ref, WHITE);
    }

    const dfs = (ref: TypeRef): boolean => {
      color.set(ref, GRAY);
      for (const edge of this.outbound.get(ref) ?? []) {
        // Skip M3 self-reference
        if (edge.rel === TypeRelation.ConformsTo && edge.from === edge.to) {
          continue;
        }
        const c = color.get(edge.to);
        if (c === GRAY) return true;
        if (c === WHITE && dfs(edge.to)) return true;
      }
      color.set(ref, BLACK);
      return false;
    };

    for (const ref of this.typeLevels.keys()) {
      if (color.get(ref) === WHITE && dfs(ref)) return true;
    }
    return false;
  }

  // ── Private ────────────────────────────────────────────────────────

  private addEdge(from: TypeRef, to: TypeRef, rel: TypeRelation): void {
    const edge: TypeEdge = { from, to, rel };

    if (!this.outbound.has(from)) this.outbound.set(from, []);
    this.outbound.get(from)!.push(edge);

    if (!this.inbound.has(to)) this.inbound.set(to, []);
    this.inbound.get(to)!.push(edge);
  }

  private normalizeRef(ref: TypeRef): TypeRef {
    return ref === META_ALIAS && this.metaAliasTarget ? this.metaAliasTarget : ref;
  }

  private retargetAlias(alias: TypeRef, canonical: TypeRef): void {
    if (alias === canonical) return;

    const inbound = this.inbound.get(alias);
    if (inbound) {
      for (const edge of inbound) edge.to = canonical;
      const target = this.inbound.get(canonical) ?? [];
      target.push(...inbound);
      this.inbound.set(canonical, target);
      this.inbound.delete(alias);
    }

    const outbound = this.outbound.get(alias);
    if (outbound) {
      for (const edge of outbound) edge.from = canonical;
      const source = this.outbound.get(canonical) ?? [];
      source.push(...outbound);
      this.outbound.set(canonical, source);
      this.outbound.delete(alias);
    }
  }
}
