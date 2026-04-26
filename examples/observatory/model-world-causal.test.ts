import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createMetaProjectionKernel } from "../../L11-projection/bootstrap.ts";
import { registerModelIntrospectionMorphisms } from "../../L11-projection/model-introspection-m1.ts";
import {
  AlgebraicKernel,
  IntentProcessor,
  ModelLoader,
  type ModelDocument,
} from "../../L13-facade/index.ts";
import { createObsCustomHandler, selectModelWorldModel } from "./custom-handler.ts";

const ROOT = import.meta.dir;
const ECOMMERCE_PATH = resolve(ROOT, "../model-world/models/ecommerce.model.yaml");
const CORE_PATH = resolve(ROOT, "../model-world/models/core.model.yaml");
const OBSERVATORY_PROJECTION = resolve(ROOT, "projection/projection.yaml");
const KERNEL_MODEL = resolve(ROOT, "../../L00-model/kernel.model.yaml");

describe("model world causal connection", () => {
  test("hash-diff end-to-end updates Types while leaving Contracts unchanged", async () => {
    const { loader } = createHarness();
    loader.loadYamlFile(CORE_PATH);
    const initial = loader.loadYamlFile(ECOMMERCE_PATH);
    const initialCid = loader.getLoadResult("ecommerce")?.cid;
    const before = await renderSelectedModel(loader, "ecommerce");
    const hashA = sha256(extractSectionHtml(before, "Types"));
    const hashAUnchanged = sha256(extractSectionHtml(before, "Contracts"));

    const updated = structuredClone(initial.document);
    updated.entities = {
      ...(updated.entities ?? {}),
      Order: {
        ...(updated.entities?.Order ?? { attributes: {} }),
        description: "Order record updated in place for causal proof",
      },
    };
    loader.loadModel(updated);

    expect(loader.getLoadResult("ecommerce")?.cid).not.toBe(initialCid);

    const after = await renderSelectedModel(loader, "ecommerce");
    const hashB = sha256(extractSectionHtml(after, "Types"));
    const hashBUnchanged = sha256(extractSectionHtml(after, "Contracts"));

    expect(hashA).not.toBe(hashB);
    expect(hashAUnchanged).toBe(hashBUnchanged);
  });

  test("CID history remains append-only after re-register", () => {
    const { loader } = createHarness();
    loader.loadYamlFile(CORE_PATH);
    const first = loader.loadYamlFile(ECOMMERCE_PATH).cid;
    const updated = Bun.YAML.parse(readFileSync(ECOMMERCE_PATH, "utf-8")) as ModelDocument;
    updated.entities = {
      ...(updated.entities ?? {}),
      Customer: {
        ...(updated.entities?.Customer ?? { attributes: {} }),
        description: "Updated customer description",
      },
    };
    const second = loader.loadModel(updated).cid;

    expect(loader.listCids("ecommerce")).toEqual([first, second]);
  });

  test("selectModelWorldModel round-trip observes updated document payload", async () => {
    const { loader } = createHarness();
    loader.loadYamlFile(CORE_PATH);
    loader.bootYamlFile(ECOMMERCE_PATH);

    const first = structuredClone((await selectModelWorldModel(loader, "ecommerce"))?.document);
    expect(first).toBeDefined();

    const updated = structuredClone(loader.getLoadResult("ecommerce")!.document);
    updated.entities = {
      ...(updated.entities ?? {}),
      Product: {
        ...(updated.entities?.Product ?? { attributes: {} }),
        description: "Updated product description",
      },
    };
    loader.loadModel(updated);

    const second = structuredClone((await selectModelWorldModel(loader, "ecommerce"))?.document);
    expect(second).toBeDefined();
    expect(first!.entities!.Product.description ?? "").not.toBe(
      second!.entities!.Product.description ?? "",
    );
    expect({
      ...second!,
      entities: {
        ...second!.entities,
        Product: {
          ...second!.entities!.Product,
          description: first!.entities!.Product.description,
        },
      },
    }).toEqual(first!);
  });

  test("loader listLoadedModels observes re-registers without restart", async () => {
    const { loader } = createHarness();
    loader.loadYamlFile(CORE_PATH);
    loader.bootYamlFile(ECOMMERCE_PATH);

    const listBefore = await loader.listLoadedModels();
    const before = loader.getLoadResult("ecommerce")!.cid;

    const updated = structuredClone(loader.getLoadResult("ecommerce")!.document);
    updated.entities = {
      ...(updated.entities ?? {}),
      Invoice: {
        ...(updated.entities?.Invoice ?? { attributes: {} }),
        description: "Invoice description update",
      },
    };
    loader.loadModel(updated);

    const listAfter = await loader.listLoadedModels();
    expect(loader.getLoadResult("ecommerce")!.cid).not.toBe(before);
    expect(listBefore).toHaveLength(listAfter.length);
  });

  test("circular type refs return within 50ms and include both entities", async () => {
    const kernel = AlgebraicKernel.create();
    registerModelIntrospectionMorphisms(kernel);
    const loader = new ModelLoader(kernel);
    loader.loadModel({
      model: "cycle-demo",
      version: "1.0.0",
      origin: "https://cycle.example",
      entities: {
        A: { attributes: { id: { type: "string", required: true } } },
        B: { attributes: { id: { type: "string", required: true } } },
      },
      relations: {
        AToB: { roles: { a: "A", b: "B" } },
        BToA: { roles: { b: "B", a: "A" } },
      },
    });

    const start = performance.now();
    const result = await loader.walkCrossRefs("cycle-demo");
    expect(performance.now() - start).toBeLessThanOrEqual(50);
    expect(result).toBeDefined();
    expect(result?.typeToRelations.A).toEqual(["AToB", "BToA"]);
    expect(result?.typeToRelations.B).toEqual(["AToB", "BToA"]);
  });
});

function createHarness() {
  const kernel = AlgebraicKernel.create();
  registerModelIntrospectionMorphisms(kernel);
  const loader = new ModelLoader(kernel);
  loader.setIntentProcessor(new IntentProcessor(kernel));
  return { kernel, loader };
}

async function renderSelectedModel(loader: ModelLoader, modelId: string): Promise<string> {
  const selected = await selectModelWorldModel(loader, modelId);
  return [
    `<section><header>Types</header>${JSON.stringify(selected?.view?.types ?? [])}</section>`,
    `<section><header>Contracts</header>${JSON.stringify(selected?.view?.contracts ?? [])}</section>`,
  ].join("");
}

function extractSectionHtml(html: string, title: string): string {
  const match = html.match(
    new RegExp(`<section[^>]*><header>${title}</header>([\\s\\S]*?)</section>`),
  );
  if (!match) throw new Error(`Missing section: ${title}`);
  return match[0];
}

function sha256(value: string): string {
  const hasher = new Bun.CryptoHasher("sha256");
  hasher.update(value);
  return hasher.digest("hex");
}

function fakeSocket() {
  return {
    messages: [] as Array<any>,
    send(payload: string) {
      this.messages.push(JSON.parse(payload));
    },
  };
}
