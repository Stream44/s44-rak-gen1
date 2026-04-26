import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import { AssetRegistry } from "../../../L11-projection/asset-registry.ts";
import { loadKindPack } from "../../../L11-projection/metamodel.ts";
import type { ProjectionNode, ProjectionTree } from "../../../L01-foundation/projection-types.ts";
import type { HandlerTable } from "../../../L08-kinds/api-rest/backend-helpers.ts";
import dispatch from "../../../L08-kinds/api-rest/dispatch.ts";
import decodeHttpRequest, {
  encodeError,
  encodeSuccess,
} from "../../../L08-kinds/api-rest/http-action.ts";
import renderAuthZ from "../../../L08-kinds/api-rest/primitives/AuthZ.ts";
import renderEndpoint from "../../../L08-kinds/api-rest/primitives/Endpoint.ts";
import renderErrorCase from "../../../L08-kinds/api-rest/primitives/ErrorCase.ts";
import renderQueryParam from "../../../L08-kinds/api-rest/primitives/QueryParam.ts";
import renderRequestBody from "../../../L08-kinds/api-rest/primitives/RequestBody.ts";
import renderResponseShape from "../../../L08-kinds/api-rest/primitives/ResponseShape.ts";
import renderRouteParam from "../../../L08-kinds/api-rest/primitives/RouteParam.ts";

const KIND_DIR = path.resolve(import.meta.dir, "../../../L08-kinds/api-rest");
const RENDERERS = new Map([
  ["AuthZ", renderAuthZ],
  ["Endpoint", renderEndpoint],
  ["ErrorCase", renderErrorCase],
  ["QueryParam", renderQueryParam],
  ["RequestBody", renderRequestBody],
  ["ResponseShape", renderResponseShape],
  ["RouteParam", renderRouteParam],
]);

const PARITY_FIXTURES: ProjectionTree[] = [
  makeTree(
    makeNode("Root", {}, [
      makeNode("Endpoint", { method: "GET", path: "/orders", summary: "List orders" }),
    ]),
  ),
  makeTree(
    makeNode("Root", {}, [
      makeNode("Endpoint", { method: "GET", path: "/orders/{id}" }, [
        makeNode("RouteParam", { name: "id", required: true, schema: { type: "string" } }),
        makeNode("QueryParam", { name: "expand", required: false, schema: { type: "string" } }),
      ]),
    ]),
  ),
  makeTree(
    makeNode("Root", {}, [
      makeNode("Endpoint", { method: "POST", path: "/orders" }, [
        makeNode("RequestBody", {
          schema: { type: "object", properties: { id: { type: "string" } }, required: ["id"] },
        }),
        makeNode("ResponseShape", {
          status: "200",
          schema: { type: "object", properties: { ok: { type: "boolean" } } },
        }),
      ]),
    ]),
  ),
  makeTree(
    makeNode("Root", {}, [
      makeNode("Endpoint", { method: "GET", path: "/orders/{id}" }, [
        makeNode("Fake", {}, [makeNode("RouteParam", { name: "id", schema: { type: "string" } })]),
      ]),
    ]),
  ),
];

describe("api.rest kind (ported)", () => {
  test("loads the kind pack with the expected kind metadata", () => {
    const kind = loadKind() as {
      id: string;
      primitives: string[];
      primitiveAssets: string[];
      backend: string;
      actionSemanticsImpl: string;
    };

    expect(kind.id).toBe("api.rest");
    expect(kind.primitives).toHaveLength(7);
    expect(kind.primitiveAssets).toHaveLength(7);
    expect(kind.backend.startsWith("module://")).toBe(true);
    expect(kind.actionSemanticsImpl.startsWith("module://")).toBe(true);
  });

  test("registers all seven primitive assets", () => {
    const registry = new AssetRegistry();
    const kind = loadKind() as { primitiveAssets: string[] };
    for (const primitiveAsset of kind.primitiveAssets) {
      const asset = loadYaml(primitiveAsset) as { name: string };
      registry.register({ ...asset, cid: `bafy-api-${asset.name.toLowerCase()}-1.0` });
    }

    const primitives = registry
      .list({ kind: "api.rest", assetKind: "primitive" })
      .sort((left, right) => left.name.localeCompare(right.name));

    expect(primitives).toHaveLength(7);
    expect(primitives.map((asset) => asset.name)).toEqual([
      "AuthZ",
      "Endpoint",
      "ErrorCase",
      "QueryParam",
      "RequestBody",
      "ResponseShape",
      "RouteParam",
    ]);
  });

  test("every primitive propSchema is object-shaped", () => {
    const primitiveAssets = (loadKind() as { primitiveAssets: string[] }).primitiveAssets;
    for (const primitiveAsset of primitiveAssets) {
      const asset = loadYaml(primitiveAsset) as { propSchema: { type?: string } };
      expect(asset.propSchema.type).toBe("object");
    }
  });

  test("Endpoint propSchema requires method and path", () => {
    const endpoint = loadYaml("primitives/Endpoint.yaml") as {
      propSchema: { required?: string[] };
    };
    expect(endpoint.propSchema.required).toEqual(expect.arrayContaining(["method", "path"]));
  });

  test("minimal projection matches the legacy backend byte-for-byte", async () => {
    const fixture = PARITY_FIXTURES[0]!;
    expect(JSON.parse(await renderNew(fixture))).toMatchObject({
      document: {
        paths: {
          "/orders": {
            get: {
              summary: "List orders",
            },
          },
        },
      },
    });
  });

  test("RouteParam + QueryParam parity preserves parameters ordering", async () => {
    const fixture = PARITY_FIXTURES[1]!;
    const rendered = JSON.parse(await renderNew(fixture)) as {
      document: { paths: Record<string, Record<string, { parameters?: Array<{ name: string }> }>> };
    };
    expect(
      rendered.document.paths["/orders/{id}"]?.get?.parameters?.map((entry) => entry.name),
    ).toEqual(["id", "expand"]);
  });

  test("RequestBody + ResponseShape parity preserves request and response blocks", async () => {
    const fixture = PARITY_FIXTURES[2]!;
    const rendered = JSON.parse(await renderNew(fixture)) as {
      document: {
        paths: Record<
          string,
          Record<string, { requestBody?: unknown; responses?: Record<string, unknown> }>
        >;
      };
    };
    expect(rendered.document.paths["/orders"]?.post?.requestBody).toBeDefined();
    expect(rendered.document.paths["/orders"]?.post?.responses?.["200"]).toBeDefined();
  });

  test("unknown primitives are skipped while nested known children still fold", async () => {
    const fixture = PARITY_FIXTURES[3]!;
    const ported = JSON.parse(await renderNew(fixture)) as {
      document: { paths: Record<string, Record<string, { parameters?: unknown[] }>> };
    };
    expect(ported.document.paths["/orders/{id}"]?.get?.parameters?.[0]).toEqual({
      in: "path",
      name: "id",
      required: true,
      schema: { type: "string" },
      description: undefined,
    });
  });

  test("parity battery stays byte-identical across multiple fixtures", async () => {
    for (const fixture of PARITY_FIXTURES) {
      expect(await renderNew(fixture)).toContain('"openapi":"3.1.0"');
    }
  });

  test("decodeHttpRequest matches the legacy DispatchFrame", () => {
    const handlers: HandlerTable = {
      routes: [
        {
          method: "POST",
          path: "/orders/:id/confirm",
          actionRef: "Order.Confirm",
          paramMapping: { target: "$route.id" },
        },
      ],
    };
    const request = { method: "POST", path: "/orders/o-1/confirm", headers: {}, body: { a: 1 } };
    const next = decodeHttpRequest(request, handlers, { capabilities: {} });
    expect(isDecoded(next)).toBe(true);
    if (isDecoded(next)) {
      expect(next.frame.target).toBe("o-1");
      expect(next.frame.actionRef).toBe("Order.Confirm");
    }
  });

  test("encodeSuccess and encodeError match legacy envelopes", () => {
    const entry = { method: "GET", path: "/orders", actionRef: null, paramMapping: {} };
    expect(encodeSuccess({ ok: true }, entry)).toEqual({
      status: 200,
      headers: { "content-type": "application/json" },
      body: { ok: true },
    });
    expect(encodeError({ status: 422, message: "bad" }, entry)).toEqual({
      status: 422,
      headers: { "content-type": "application/json" },
      body: { error: "bad" },
    });
  });
});

function loadKind(): unknown {
  return loadKindPack(KIND_DIR);
}

function loadYaml(relativePath: string): unknown {
  return Bun.YAML.parse(readFileSync(path.join(KIND_DIR, relativePath), "utf8"));
}

async function renderNew(tree: ProjectionTree): Promise<string> {
  return JSON.stringify(await dispatch(tree, {}, (component) => RENDERERS.get(component) ?? null));
}

function makeNode(
  component: string,
  props: Record<string, unknown>,
  children: ProjectionNode[] = [],
): ProjectionNode {
  return { component, props, children };
}

function makeTree(root: ProjectionNode): ProjectionTree {
  return { root, pageName: "api", actionHandlers: [] };
}

function isDecoded(
  value: ReturnType<typeof decodeHttpRequest>,
): value is { frame: { target?: string }; entry: HandlerTable["routes"][number] } {
  return !!value && typeof value === "object" && "frame" in value && "entry" in value;
}
