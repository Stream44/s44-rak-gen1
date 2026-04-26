import { beforeEach, describe, expect, test } from "bun:test";
import { AcceptanceEngine } from "./acceptance.ts";
import { bootTestApp, createTempDir, writeYaml } from "./test-support.ts";

describe("AcceptanceEngine.loadSuite (YAML)", () => {
  let engine: AcceptanceEngine;
  let tmpDir: string;

  beforeEach(() => {
    engine = new AcceptanceEngine(bootTestApp());
    tmpDir = createTempDir("adk-acceptance");
  });

  test("loads personas, seeds, scenarios from YAML with relative path references", () => {
    writeYaml(
      tmpDir,
      "personas.yaml",
      `- id: alice
  name: Alice
  role: customer
  verbs: [confirm, cancel]
- id: admin
  name: Admin
  role: admin
  verbs: [confirm, pay, ship, deliver, cancel]
`,
    );
    writeYaml(
      tmpDir,
      "seeds.yaml",
      `- targetKey: ord-001
  state: { status: pending }
`,
    );
    const suitePath = writeYaml(
      tmpDir,
      "suite.yaml",
      `suite: simple
model: mini-ecom
version: 1.0.0
personas: ./personas.yaml
seeds: ./seeds.yaml
useCases:
  - id: uc-1
    name: UC1
    scenarios:
      - id: sc-1
        name: SC1
        seeds: [ord-001]
        steps:
          - id: s1
            persona: alice
            verb: confirm
            targetKey: ord-001
            assertions:
              - kind: state-equals
                targetKey: ord-001
                expected: { status: confirmed }
`,
    );

    const suite = engine.loadSuite(suitePath);
    expect(suite.id).toBe("simple");
    expect(suite.personas).toHaveLength(2);
    expect(suite.seeds).toHaveLength(1);
    expect(suite.useCases).toHaveLength(1);

    const alice = suite.personas.find((p) => p.id === "alice")!;
    expect(Object.keys(alice.capabilities).sort()).toEqual(["cancel", "confirm"]);
    expect(alice.capabilities.confirm).toMatch(/^cid:sha256:/);
  });
});
