/**
 * Layer 19: ModelLoader — tests for YAML model document compilation.
 */

import { describe, test, expect } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { AlgebraicKernel } from "../L13-facade/index.ts";
import type { KernelExpression } from "../L13-facade/index.ts";
import {
  ModelLoader,
  compileAttributeType,
  parseClaim,
  type ModelDocument,
} from "./model-loader.ts";
import { IntentProcessor } from "../L07-agency/intent.ts";
import { buildTypeUri } from "../L01-foundation/utils.ts";

function loadInlineModel(yaml: string) {
  const ak = AlgebraicKernel.create();
  const loader = new ModelLoader(ak);
  const result = loader.loadModel(Bun.YAML.parse(yaml) as ModelDocument);
  if (result.errors.length > 0) {
    throw new Error(result.errors.join("; "));
  }
  return result;
}

function expectYamlLoadToThrow(yaml: string): () => void {
  return () => {
    const dir = mkdtempSync(join(tmpdir(), "rak-actiondef-"));
    const filePath = join(dir, "broken.model.yaml");
    writeFileSync(filePath, yaml);
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    const result = loader.loadYamlFile(filePath);
    if (result.errors.length > 0) {
      throw new Error(result.errors.join("; "));
    }
  };
}

describe("ModelLoader", () => {
  test("1. load simple model with 2 entities", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    const doc: ModelDocument = {
      model: "contacts",
      version: "1.0",
      origin: "example.com",
      entities: {
        Person: {
          attributes: {
            name: { type: "string", required: true },
            age: { type: "integer" },
          },
        },
        Address: {
          attributes: {
            street: { type: "string", required: true },
            city: { type: "string", required: true },
          },
        },
      },
    };

    const result = loader.loadModel(doc);
    expect(result.errors).toEqual([]);
    expect(result.typesRegistered).toHaveLength(2);
    expect(result.origin).toBe("example.com");

    // Both types exist in the kernel
    expect(ak.hasType("type://example.com/Person/1.0")).toBe(true);
    expect(ak.hasType("type://example.com/Address/1.0")).toBe(true);

    // Validate data against Person
    const valid = ak.validate("type://example.com/Person/1.0", {
      name: "Alice",
      age: 30,
    });
    expect(valid.valid).toBe(true);

    // Validate data against Address
    const addrValid = ak.validate("type://example.com/Address/1.0", {
      street: "123 Main St",
      city: "Springfield",
    });
    expect(addrValid.valid).toBe(true);
  });

  test("2. attribute types compile correctly", () => {
    const resolver = (ref: string) => `type://test/${ref}/1.0`;

    // string
    const str = compileAttributeType({ type: "string" }, "test", "1.0", resolver);
    expect(str).toEqual({ type: "string" });

    // integer with minimum/maximum
    const int = compileAttributeType(
      { type: "integer", minimum: 0, maximum: 100 },
      "test",
      "1.0",
      resolver,
    );
    expect(int).toEqual({ type: "integer", minimum: 0, maximum: 100 });

    // number
    const num = compileAttributeType({ type: "number" }, "test", "1.0", resolver);
    expect(num).toEqual({ type: "number" });

    // boolean
    const bool = compileAttributeType({ type: "boolean" }, "test", "1.0", resolver);
    expect(bool).toEqual({ type: "boolean" });

    // pattern
    const pat = compileAttributeType(
      { type: "string", pattern: "^[A-Z]+$" },
      "test",
      "1.0",
      resolver,
    );
    expect(pat).toEqual({ type: "string", pattern: "^[A-Z]+$" });

    // enum
    const en = compileAttributeType(
      { type: "string", enum: ["a", "b", "c"] },
      "test",
      "1.0",
      resolver,
    );
    expect(en).toEqual({ type: "string", enum: ["a", "b", "c"] });

    // minLength / maxLength
    const ml = compileAttributeType(
      { type: "string", minLength: 1, maxLength: 50 },
      "test",
      "1.0",
      resolver,
    );
    expect(ml).toEqual({ type: "string", minLength: 1, maxLength: 50 });
  });

  test("3. required vs optional: entity-level and attribute-level", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    const doc: ModelDocument = {
      model: "req-test",
      version: "1.0",
      origin: "example.com",
      entities: {
        Item: {
          attributes: {
            name: { type: "string", required: true },
            label: { type: "string" },
            code: { type: "string" },
          },
          required: ["code"],
        },
      },
    };

    const result = loader.loadModel(doc);
    expect(result.errors).toEqual([]);

    const typeDef = ak.resolveType("type://example.com/Item/1.0");
    // Both attribute-level required: true and entity-level required should be present
    expect(typeDef.schema.required).toContain("name");
    expect(typeDef.schema.required).toContain("code");
    expect(typeDef.schema.required).not.toContain("label");

    // Missing required field fails validation
    const invalid = ak.validate("type://example.com/Item/1.0", {
      label: "test",
    });
    expect(invalid.valid).toBe(false);
  });

  test("4. list<T> compiles to array schema with items", () => {
    const resolver = (ref: string) => `type://test/${ref}/1.0`;

    const listStr = compileAttributeType({ type: "list<string>" }, "test", "1.0", resolver);
    expect(listStr).toEqual({ type: "array", items: { type: "string" } });

    const listInt = compileAttributeType({ type: "list<integer>" }, "test", "1.0", resolver);
    expect(listInt).toEqual({ type: "array", items: { type: "integer" } });

    // list<EntityRef> where EntityRef is a bare name
    const listEntity = compileAttributeType({ type: "list<Product>" }, "myorigin", "2.0", resolver);
    expect(listEntity).toEqual({
      type: "array",
      items: { type: "string", $typeRef: "type://myorigin/Product/2.0" },
    });
  });

  test("5. prefix:Entity reference compiles to $typeRef", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    // Register a prefix for another model
    loader.registerPrefix("ecommerce", "shop.example.com");

    const resolver = (ref: string) => loader.resolveTypeRef(ref, "myapp.com", "1.0");

    const schema = compileAttributeType(
      { type: "ecommerce:Product" },
      "myapp.com",
      "1.0",
      resolver,
    );
    expect(schema).toEqual({
      type: "string",
      $typeRef: "type://shop.example.com/Product/1.0",
    });
  });

  test("6. enum type: values register via defineEnum", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    const doc: ModelDocument = {
      model: "colors",
      version: "1.0",
      origin: "example.com",
      enums: {
        Color: {
          values: ["red", "green", "blue"],
          description: "Primary colors",
        },
      },
    };

    const result = loader.loadModel(doc);
    expect(result.errors).toEqual([]);
    expect(result.typesRegistered).toHaveLength(1);

    // Enum is registered in the kernel (at ADK_ORIGIN since defineEnum uses it)
    const typeRef = result.typesRegistered[0];
    expect(ak.hasType(typeRef)).toBe(true);

    const typeDef = ak.resolveType(typeRef);
    expect(typeDef.schema.enum).toEqual(["red", "green", "blue"]);
  });

  test("7. relation type: roles compile to record with $typeRef properties", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    const doc: ModelDocument = {
      model: "social",
      version: "1.0",
      origin: "social.example.com",
      entities: {
        User: {
          attributes: { name: { type: "string" } },
        },
        Group: {
          attributes: { title: { type: "string" } },
        },
      },
      relations: {
        Membership: {
          description: "User belongs to Group",
          roles: {
            member: "User",
            group: "Group",
          },
        },
      },
    };

    const result = loader.loadModel(doc);
    expect(result.errors).toEqual([]);

    // Relation type is registered
    expect(ak.hasType("type://social.example.com/Membership/1.0")).toBe(true);

    const typeDef = ak.resolveType("type://social.example.com/Membership/1.0");
    const props = typeDef.schema.properties!;
    expect(props.member.$typeRef).toBe("type://social.example.com/User/1.0");
    expect(props.group.$typeRef).toBe("type://social.example.com/Group/1.0");
  });

  test("8. lifecycle compiles to StateMachineDef: step pending+confirm -> confirmed", async () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    const doc: ModelDocument = {
      model: "Order",
      version: "1.0",
      origin: "shop.example.com",
      lifecycle: {
        states: ["pending", "confirmed", "shipped", "delivered"],
        initial: "pending",
        terminal: ["delivered"],
        transitions: [
          { from: "pending", to: "confirmed", verb: "confirm" },
          { from: "confirmed", to: "shipped", verb: "ship" },
          { from: "shipped", to: "delivered", verb: "deliver" },
        ],
      },
    };

    const result = loader.loadModel(doc);
    expect(result.errors).toEqual([]);
    expect(result.statemachineId).toBeDefined();

    // Step the machine: pending + confirm -> confirmed
    const stepResult = ak.stepStateMachine(
      result.statemachineId!,
      { status: "pending" },
      { verb: "confirm" },
    );
    expect(stepResult.success).toBe(true);
    expect(stepResult.newState).toEqual({ status: "confirmed" });

    // Step again: confirmed + ship -> shipped
    const step2 = ak.stepStateMachine(
      result.statemachineId!,
      { status: "confirmed" },
      { verb: "ship" },
    );
    expect(step2.success).toBe(true);
    expect(step2.newState).toEqual({ status: "shipped" });

    // Invalid transition: pending + ship -> fails
    const step3 = ak.stepStateMachine(
      result.statemachineId!,
      { status: "pending" },
      { verb: "ship" },
    );
    expect(step3.success).toBe(false);
  });

  test("9. contract compiles to Proposition: total >= 0 verifiable", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    const doc: ModelDocument = {
      model: "billing",
      version: "1.0",
      origin: "billing.example.com",
      contracts: {
        "non-negative-total": {
          claim: "order.total >= 0",
        },
      },
    };

    const result = loader.loadModel(doc);
    expect(result.errors).toEqual([]);
    expect(result.propositionIds).toHaveLength(1);

    const propId = result.propositionIds[0];

    // Verify with valid value
    const proof = ak.verifyProof(propId, { total: 100 });
    expect(proof.valid).toBe(true);

    // Verify with invalid value
    const fail = ak.verifyProof(propId, { total: -5 });
    expect(fail.valid).toBe(false);
  });

  test("10. reloadModel with compatible change succeeds", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    const v1: ModelDocument = {
      model: "compat",
      version: "1.0",
      origin: "example.com",
      entities: {
        Thing: {
          attributes: {
            name: { type: "string", required: true },
          },
        },
      },
    };

    loader.loadModel(v1);

    // v2 adds an optional field — backward compatible
    const v2: ModelDocument = {
      model: "compat",
      version: "2.0",
      origin: "example.com",
      entities: {
        Thing: {
          attributes: {
            name: { type: "string", required: true },
            description: { type: "string" },
          },
        },
      },
    };

    const result = loader.reloadModel(v2);
    // Should succeed (no breaking errors blocking the load)
    // The reload may register the new version
    expect(result.modelId).toBe("compat");
    expect(ak.hasType("type://example.com/Thing/2.0")).toBe(true);
  });

  test("11. reloadModel with breaking change returns errors", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    const v1: ModelDocument = {
      model: "breaking",
      version: "1.0",
      origin: "example.com",
      entities: {
        Widget: {
          attributes: {
            name: { type: "string", required: true },
            color: { type: "string", required: true },
          },
        },
      },
    };

    loader.loadModel(v1);

    // v2 adds a new required field — breaking change for backward compat
    const v2: ModelDocument = {
      model: "breaking",
      version: "2.0",
      origin: "example.com",
      entities: {
        Widget: {
          attributes: {
            name: { type: "string", required: true },
            color: { type: "string", required: true },
            size: { type: "integer", required: true },
          },
        },
      },
    };

    const result = loader.reloadModel(v2);
    expect(result.errors.length).toBeGreaterThan(0);
    // Original types should still be the ones from v1
    expect(result.typesRegistered.some((r) => r.includes("Widget/1.0"))).toBe(true);
  });

  test("12. versionHistory tracks loaded versions", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    loader.loadModel({
      model: "versioned",
      version: "1.0",
      origin: "example.com",
      entities: {
        Foo: { attributes: { x: { type: "string" } } },
      },
    });

    loader.loadModel({
      model: "versioned",
      version: "2.0",
      origin: "example.com",
      entities: {
        Foo: { attributes: { x: { type: "string" }, y: { type: "string" } } },
      },
    });

    const history = loader.versionHistory("versioned");
    expect(history).toEqual(["1.0", "2.0"]);
  });

  test("13. resolveTypeRef for prefix:Entity returns full origin-qualified URI", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    loader.registerPrefix("ecommerce", "shop.example.com");

    const resolved = loader.resolveTypeRef("ecommerce:Product", "myapp.com", "3.0");
    expect(resolved).toBe("type://shop.example.com/Product/3.0");

    // Bare name resolves with current origin
    const bare = loader.resolveTypeRef("Order", "myapp.com", "3.0");
    expect(bare).toBe("type://myapp.com/Order/3.0");
  });

  test("14. load model, validate sample data against loaded types", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    const doc: ModelDocument = {
      model: "inventory",
      version: "1.0",
      origin: "inventory.example.com",
      entities: {
        Product: {
          attributes: {
            sku: { type: "string", required: true, minLength: 1 },
            price: { type: "number", required: true, minimum: 0 },
            tags: { type: "list<string>" },
            inStock: { type: "boolean" },
          },
        },
      },
    };

    const result = loader.loadModel(doc);
    expect(result.errors).toEqual([]);

    const typeRef = "type://inventory.example.com/Product/1.0";

    // Valid data
    const valid = ak.validate(typeRef, {
      sku: "ABC-123",
      price: 29.99,
      tags: ["electronics", "sale"],
      inStock: true,
    });
    expect(valid.valid).toBe(true);

    // Missing required field
    const missingRequired = ak.validate(typeRef, {
      price: 10,
    });
    expect(missingRequired.valid).toBe(false);

    // Price below minimum
    const negativePrice = ak.validate(typeRef, {
      sku: "X",
      price: -1,
    });
    expect(negativePrice.valid).toBe(false);

    // Empty sku (minLength: 1)
    const emptySku = ak.validate(typeRef, {
      sku: "",
      price: 10,
    });
    expect(emptySku.valid).toBe(false);
  });

  test("15. getLoadedModel returns the load result", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    expect(loader.getLoadedModel("nonexistent")).toBeUndefined();

    const doc: ModelDocument = {
      model: "simple",
      version: "1.0",
      origin: "example.com",
      entities: {
        Foo: { attributes: { x: { type: "string" } } },
      },
    };

    const result = loader.loadModel(doc);
    const retrieved = loader.getLoadedModel("simple");

    expect(retrieved).toBeDefined();
    expect(retrieved!.modelId).toBe("simple");
    expect(retrieved!.origin).toBe("example.com");
    expect(retrieved!.typesRegistered).toEqual(result.typesRegistered);
  });
});

describe("parseClaim", () => {
  test("parses field >= value", () => {
    const expr = parseClaim("total >= 0");
    expect(expr).toEqual({
      op: "call",
      fn: "gte",
      args: [
        { op: "var", name: "total" },
        { op: "const", value: 0 },
      ],
    });
  });

  test("parses dotted path field >= value", () => {
    const expr = parseClaim("order.total >= 0");
    expect(expr).toEqual({
      op: "call",
      fn: "gte",
      args: [
        { op: "var", name: "total" },
        { op: "const", value: 0 },
      ],
    });
  });

  test("parses length(field) > value", () => {
    const expr = parseClaim("length(name) > 0");
    expect(expr).toEqual({
      op: "call",
      fn: "gt",
      args: [
        { op: "call", fn: "length", args: [{ op: "var", name: "name" }] },
        { op: "const", value: 0 },
      ],
    });
  });

  test("returns null for unparseable claims", () => {
    expect(parseClaim("some complex thing")).toBeNull();
  });
});

describe("ActionDef schema kinds", () => {
  test("defaults ActionDef.kind to 'mutate'", () => {
    const result = loadInlineModel(`
model: t
version: 1.0.0
origin: https://example/t
entities:
  X:
    attributes: { id: { type: string } }
actions:
  FlipX:
    verb: flip
    targetField: id
    inputSchema: { type: object, required: [id], properties: { id: { type: string } } }
`);

    expect(result.document.actions?.FlipX.kind).toBe("mutate");
  });

  test("create without action-level keyField loads (keyField moved to binding.aspect)", () => {
    const result = loadInlineModel(`
model: t
version: 1.0.0
origin: https://example/t
entities:
  X:
    attributes: { id: { type: string } }
actions:
  CreateX:
    verb: create
    kind: create
    inputSchema: { type: object, properties: { id: { type: string } } }
`);
    expect(result.document.actions?.CreateX.kind).toBe("create");
    expect(result.document.actions?.CreateX.keyStrategy).toBe("uuid");
  });

  test("batch without selector throws", () => {
    expect(
      expectYamlLoadToThrow(`
model: t
version: 1.0.0
origin: https://example/t
entities:
  X:
    attributes: { id: { type: string } }
actions:
  BatchX:
    verb: batch
    kind: batch
    submit: { verb: flip, target: X }
    inputSchema: { type: object, properties: {} }
`),
    ).toThrow(/broken\.model\.yaml: action BatchX requires selector/);
  });

  test("fixture model YAMLs load unchanged", () => {
    const modelPaths = [
      resolve(import.meta.dir, "../tests/kernel-fixtures/core.model.yaml"),
      resolve(import.meta.dir, "../tests/kernel-fixtures/commerce.model.yaml"),
      resolve(import.meta.dir, "../tests/kernel-fixtures/commerce-v2.model.yaml"),
      resolve(import.meta.dir, "../tests/kernel-fixtures/playback.model.yaml"),
      resolve(import.meta.dir, "../tests/kernel-fixtures/inventory.model.yaml"),
    ];

    for (const modelPath of modelPaths) {
      const ak = AlgebraicKernel.create();
      const loader = new ModelLoader(ak);
      const result = loader.loadYamlFile(modelPath);
      expect(result.errors).toEqual([]);
    }
  });
});

// ── ModelBoot + YAML + Capability tests ─────────────────────────────────

const TEST_MODEL: ModelDocument = {
  model: "test",
  version: "1.0.0",
  origin: "https://test.example",
  entities: {
    Thing: {
      attributes: {
        id: { type: "string", required: true },
        status: { type: "string", required: true, enum: ["a", "b", "c"] },
      },
    },
  },
  lifecycle: {
    states: ["a", "b", "c"],
    initial: "a",
    terminal: ["c"],
    transitions: [
      { from: "a", to: "b", verb: "advance" },
      { from: "b", to: "c", verb: "finish" },
    ],
  },
  actions: {
    AdvanceThing: {
      verb: "advance",
      inputSchema: {
        type: "object",
        required: ["id"],
        properties: { id: { type: "string" } },
      },
    },
    FinishThing: {
      verb: "finish",
      inputSchema: {
        type: "object",
        required: ["id", "amount"],
        properties: {
          id: { type: "string" },
          amount: { type: "number" },
        },
      },
    },
  },
};

describe("ModelBoot + YAML Loading + Capability Authorization", () => {
  test("1. boot() throws if setIntentProcessor() was not called", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    expect(() => loader.boot(TEST_MODEL)).toThrow(/IntentProcessor/);
  });

  test("2. boot() returns a ModelBoot handle with expected shape", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);

    expect(app.origin).toBe("test.example");
    expect(Array.isArray(app.types)).toBe(true);
    expect(app.stateMachineId).toBeDefined();
    expect(typeof app.actions).toBe("object");
    expect(typeof app.submit).toBe("function");
    expect(typeof app.setState).toBe("function");
    expect(typeof app.getState).toBe("function");
    expect(typeof app.onEvent).toBe("function");
    expect(typeof app.issueCapability).toBe("function");
  });

  test("3. boot() registers actions with verb→actionId entries", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);

    expect(app.actions.advance).toBeDefined();
    expect(app.actions.finish).toBeDefined();
    expect(app.actions.advance).toContain("AdvanceThing");
    expect(app.actions.finish).toContain("FinishThing");
  });

  test("4. app.submit(verb, targetKey) without capability executes transition", async () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);

    const result = await app.submit("advance", "thing-1");
    expect(result.success).toBe(true);
    expect(result.newState).toEqual({ status: "b" });
    expect(app.getState("thing-1")).toEqual({ status: "b" });
  });

  test("5. app.submit with valid capability authorizes and executes", async () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);

    const capId = app.issueCapability("advance", "admin-root");
    const result = await app.submit("advance", "thing-1", {}, capId);
    expect(result.success).toBe(true);
    expect(result.newState).toEqual({ status: "b" });
  });

  test("6. app.submit with capability for wrong action is denied, state unchanged", async () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);

    // Issue cap for "finish" but try to use it on "advance"
    const wrongCap = app.issueCapability("finish", "admin-root");
    const result = await app.submit("advance", "thing-1", {}, wrongCap);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Authorization denied/);
    expect(app.getState("thing-1")).toBeUndefined();
  });

  test("7. app.submit with caveat: amount < 1000 — passes for 500, denies for 5000", async () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);

    const maxAmountCaveat: KernelExpression = {
      op: "call",
      fn: "lt",
      args: [
        { op: "get", path: "amount" },
        { op: "const", value: 1000 },
      ],
    };

    // Use finish verb (has amount in schema). Advance thing-A and thing-B first.
    await app.submit("advance", "thing-A");
    await app.submit("advance", "thing-B");

    const capId = app.issueCapability("finish", "admin-root", [maxAmountCaveat]);

    // amount=500 succeeds
    const okResult = await app.submit("finish", "thing-A", { amount: 500 }, capId);
    expect(okResult.success).toBe(true);
    expect(okResult.newState).toEqual({ status: "c" });

    // amount=5000 denied
    const denyResult = await app.submit("finish", "thing-B", { amount: 5000 }, capId);
    expect(denyResult.success).toBe(false);
    expect(denyResult.error).toMatch(/Authorization denied/);
    // thing-B should still be in state "b" (unchanged from advance)
    expect(app.getState("thing-B")).toEqual({ status: "b" });
  });

  test("8. app.submit with non-existent capability ID returns error", async () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);

    const result = await app.submit("advance", "thing-1", {}, "cid:sha256:nonexistent");
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Authorization denied/);
    expect(result.error).toMatch(/Capability not found/);
  });

  test("9. app.issueCapability returns a CID string usable by submit", async () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);

    const capId = app.issueCapability("advance", "admin-root");
    expect(typeof capId).toBe("string");
    expect(capId).toMatch(/^cid:sha256:/);

    const result = await app.submit("advance", "thing-1", {}, capId);
    expect(result.success).toBe(true);
  });

  test("10. app.issueCapability throws for unknown verb", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);

    expect(() => app.issueCapability("teleport", "admin-root")).toThrow(/teleport/);
  });

  test("11. app.setState / app.getState round-trip; unknown key is undefined", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);

    expect(app.getState("missing")).toBeUndefined();

    app.setState("thing-X", { status: "b" });
    expect(app.getState("thing-X")).toEqual({ status: "b" });
  });

  test("12. app.onEvent subscribes to state change events", async () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);

    const events: Array<{
      id: string;
      action: string;
      targetKey: string;
      previousState: unknown;
      newState: unknown;
    }> = [];
    app.onEvent((e) => events.push(e));

    await app.submit("advance", "thing-1");

    expect(events).toHaveLength(1);
    expect(events[0].id).toBeDefined();
    expect(events[0].action).toBeDefined();
    expect(events[0].targetKey).toBe("thing-1");
    expect(events[0].previousState).toEqual({ status: "a" });
    expect(events[0].newState).toEqual({ status: "b" });
  });

  test("13. app.onEvent returns unsubscribe — handler not called after unsub", async () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);

    let calls = 0;
    const unsub = app.onEvent(() => {
      calls++;
    });

    await app.submit("advance", "thing-1");
    expect(calls).toBe(1);

    unsub();
    await app.submit("advance", "thing-2");
    expect(calls).toBe(1);
  });

  test("14. loadYamlFile loads a YAML model from disk", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);

    const yamlPath = resolve(import.meta.dir, "../tests/kernel-fixtures/core.model.yaml");
    const result = loader.loadYamlFile(yamlPath);

    expect(result.errors).toEqual([]);
    expect(result.modelId).toBe("core");
    expect(result.typesRegistered.length).toBeGreaterThan(0);
    // The core model registers a few entity types
    expect(result.typesRegistered.some((r) => r.includes("Model"))).toBe(true);
  });

  test("15. bootYamlFile loads + boots a commerce model with confirm action", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const yamlPath = resolve(import.meta.dir, "../tests/kernel-fixtures/commerce.model.yaml");
    const app = loader.bootYamlFile(yamlPath);

    expect(app.actions.confirm).toBeDefined();
    expect(app.actions.confirm).toContain("ConfirmOrder");
    expect(app.stateMachineId).toBeDefined();
  });

  test("16. ModelLoader.loadSeedFile loads an array of customer objects", () => {
    const yamlPath = resolve(import.meta.dir, "../tests/kernel-fixtures/seeds/customers.yaml");
    const seeds = ModelLoader.loadSeedFile(yamlPath);

    expect(Array.isArray(seeds)).toBe(true);
    expect(seeds).toHaveLength(3);
    expect((seeds[0] as { name: string }).name).toBe("Ada Lovelace");
  });

  test("17. ModelBoot.listStateKeys and listInstances start empty", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);
    expect(app.listStateKeys()).toEqual([]);
    expect(app.listInstances()).toEqual([]);
  });

  test("18. ModelBoot.listStateKeys and listInstances preserve insertion order", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);
    app.setState("k1", { a: 1 });
    app.setState("k2", { b: 2 });

    expect(app.listStateKeys()).toEqual(["k1", "k2"]);
    expect(app.listInstances()).toEqual([
      { key: "k1", state: { a: 1 } },
      { key: "k2", state: { b: 2 } },
    ]);
  });

  test("19. ModelBoot.listInstances keeps one entry per key with latest state", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);
    app.setState("k1", { a: 1 });
    app.setState("k1", { a: 2 });

    expect(app.listStateKeys()).toEqual(["k1"]);
    expect(app.listInstances()).toEqual([{ key: "k1", state: { a: 2 } }]);
  });

  test("20. ModelBoot.listInstances returns a snapshot", () => {
    const ak = AlgebraicKernel.create();
    const loader = new ModelLoader(ak);
    loader.setIntentProcessor(new IntentProcessor(ak));

    const app = loader.boot(TEST_MODEL);
    app.setState("k1", { a: 1 });
    const instances = app.listInstances();
    instances.push({ key: "k2", state: { b: 2 } });

    expect(app.listInstances()).toEqual([{ key: "k1", state: { a: 1 } }]);
  });
});
