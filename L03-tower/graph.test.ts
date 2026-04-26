import { describe, test, expect } from "bun:test";
import {
  MetaLevel,
  TypeRelation,
  TypeGraph,
  M3_META,
  M2_RECORD,
  M2_ENUM,
  BOOTSTRAP_TYPES,
} from "../L13-facade/index.ts";
import type { TypeDef } from "../L13-facade/index.ts";

describe("Layer 6: TypeGraph", () => {
  test("tracks conformsTo edges", () => {
    const graph = new TypeGraph();
    graph.addType(M3_META);
    graph.addType(M2_RECORD);

    const edges = graph.edgesFrom(M2_RECORD.id);
    expect(edges.length).toBe(1);
    expect(edges[0].rel).toBe(TypeRelation.ConformsTo);
    expect(edges[0].to).toBe(M3_META.id);
  });

  test("tracks inbound edges", () => {
    const graph = new TypeGraph();
    graph.addType(M3_META);
    graph.addType(M2_RECORD);
    graph.addType(M2_ENUM);

    const inbound = graph.edgesTo(M3_META.id);
    expect(inbound.length).toBe(2);
  });

  test("byLevel returns types at specified level", () => {
    const graph = new TypeGraph();
    for (const t of BOOTSTRAP_TYPES) graph.addType(t);

    expect(graph.byLevel(MetaLevel.MetaMetamodel).length).toBe(1);
    expect(graph.byLevel(MetaLevel.Metamodel).length).toBe(
      BOOTSTRAP_TYPES.filter((typeDef) => typeDef.level === MetaLevel.Metamodel).length,
    );
  });

  test("byConformsTo finds children", () => {
    const graph = new TypeGraph();
    for (const t of BOOTSTRAP_TYPES) graph.addType(t);

    const children = graph.byConformsTo(M3_META.id);
    expect(children.length).toBe(
      BOOTSTRAP_TYPES.filter((typeDef) => typeDef.level === MetaLevel.Metamodel).length,
    );
  });

  test("dependencyClosure includes transitive deps", () => {
    const graph = new TypeGraph();
    for (const t of BOOTSTRAP_TYPES) graph.addType(t);

    const closure = graph.dependencyClosure(M2_RECORD.id);
    expect(closure).toContain(M2_RECORD.id);
    expect(closure).toContain(M3_META.id);
  });

  test("impactSet finds reverse deps", () => {
    const graph = new TypeGraph();
    for (const t of BOOTSTRAP_TYPES) graph.addType(t);

    const impact = graph.impactSet(M3_META.id);
    expect(impact).not.toContain(M3_META.id);
    for (const child of graph.byConformsTo(M3_META.id)) expect(impact).toContain(child);
  });

  test("hasCycle returns false for valid tower", () => {
    const graph = new TypeGraph();
    for (const t of BOOTSTRAP_TYPES) graph.addType(t);
    expect(graph.hasCycle()).toBe(false);
  });

  test("removeType cleans edges", () => {
    const graph = new TypeGraph();
    graph.addType(M3_META);
    graph.addType(M2_RECORD);
    graph.removeType(M2_RECORD.id);
    expect(graph.allTypes()).not.toContain(M2_RECORD.id);
    expect(graph.edgesTo(M3_META.id).length).toBe(0);
  });

  test("tracks $typeRef as References edges", () => {
    const graph = new TypeGraph();
    graph.addType(M3_META);
    graph.addType(M2_RECORD);

    const typeDef: TypeDef = {
      id: "type://Order/1.0",
      level: MetaLevel.Model,
      conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0",
      schema: {
        type: "object",
        properties: {
          customer: { type: "string", $typeRef: "type://Customer/1.0" },
        },
      },
    };
    graph.addType(typeDef);

    const refs = graph.referencesTo("type://Order/1.0");
    expect(refs).toContain("type://Customer/1.0");
  });
});
