import { describe, expect, test } from "bun:test";
import { AcceptanceEngine, type Scenario } from "./acceptance.ts";
import { bootTestApp, buildSuite, makeNode, makeTree, makeUiSession } from "./test-support.ts";

describe("acceptance capabilities", () => {
  test("unauthorized persona (no capability for verb) → step fails with authorization error", async () => {
    const engine = new AcceptanceEngine(bootTestApp());
    const scenario: Scenario = {
      id: "sc-unauth",
      name: "unauth",
      seedKeys: ["ord-001"],
      root: {
        id: "alice-ships",
        personaId: "alice",
        verb: "ship",
        targetKey: "ord-001",
        assertions: [],
      },
    };
    engine.setSuite(buildSuite([scenario]));
    const res = await engine.run();
    expect(res.passed).toBe(false);
    const step = res.useCases[0].scenarios[0].traces[0].steps[0];
    expect(step.passed).toBe(false);
  });

  test("persona capabilities are copied verbatim into ProjectorSession.sessionCaps", () => {
    const sessionCaps = {
      "confirm": "cid-confirm",
      "cap://pii/view/1.0": "cid-pii",
    };
    const session = makeUiSession(
      makeTree(makeNode("Text", { "data-testid": "order-row" })),
      sessionCaps,
    );

    expect(session.sessionCaps).toEqual(sessionCaps);
  });
});
