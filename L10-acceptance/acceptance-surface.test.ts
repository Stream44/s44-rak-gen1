import { describe, expect, test } from "bun:test";
import {
  ProjectorSession,
  hasSurfaceEvaluator,
  registerSurfaceEvaluator,
  type Assertion,
} from "./acceptance.ts";
import {
  makeApiSession,
  makeCliSession,
  makeNode,
  makeProjectionModel,
  makeStubKernel,
  makeTree,
  makeUiSession,
  runSurfaceAssertion,
} from "./test-support.ts";

describe("ProjectionSurfaceAssertion", () => {
  test("surface evaluator registry rejects duplicates and exposes built-ins", () => {
    expect(hasSurfaceEvaluator("ui.html.ws")).toBe(true);

    const surfaceId = `test.surface.${Date.now()}`;
    registerSurfaceEvaluator(surfaceId, () => ({
      kind: "test",
      passed: true,
      expected: "ok",
      actual: "ok",
    }));

    expect(hasSurfaceEvaluator(surfaceId)).toBe(true);
    expect(() =>
      registerSurfaceEvaluator(surfaceId, () => ({
        kind: "test",
        passed: true,
        expected: "ok",
        actual: "ok",
      })),
    ).toThrow(`Surface evaluator already registered: ${surfaceId}`);
    expect(() =>
      registerSurfaceEvaluator("ui.html.ws", () => ({
        kind: "test",
        passed: true,
        expected: "ok",
        actual: "ok",
      })),
    ).toThrow("Surface evaluator already registered: ui.html.ws");
  });

  test("projector-node present=true passes when data-testid exists", async () => {
    const session = makeUiSession(
      makeTree(makeNode("Stack", {}, [makeNode("Text", { "data-testid": "order-row" })])),
    );

    const result = await runSurfaceAssertion(
      {
        kind: "projector-node",
        surface: "ui.html.ws",
        selector: "[data-testid=order-row]",
        present: true,
      },
      session,
    );

    expect(result.passed).toBe(true);
  });

  test("projector-node present=false fails when the node exists", async () => {
    const session = makeUiSession(
      makeTree(makeNode("Stack", {}, [makeNode("Text", { "data-testid": "order-row" })])),
    );

    const result = await runSurfaceAssertion(
      {
        kind: "projector-node",
        surface: "ui.html.ws",
        selector: "[data-testid=order-row]",
        present: false,
      },
      session,
    );

    expect(result.passed).toBe(false);
  });

  test("projector-node attrs match passes for a redacted node", async () => {
    const session = makeUiSession(
      makeTree(
        makeNode("Stack", {}, [
          makeNode("Text", {
            "data-testid": "order-row",
            "data-redacted": "1",
          }),
        ]),
      ),
    );

    const result = await runSurfaceAssertion(
      {
        kind: "projector-node",
        surface: "ui.html.ws",
        selector: "[data-testid=order-row]",
        present: true,
        attrs: { "data-redacted": "1" },
      },
      session,
    );

    expect(result.passed).toBe(true);
  });

  test("projector-node attrs mismatch fails for an unredacted node", async () => {
    const session = makeUiSession(
      makeTree(
        makeNode("Stack", {}, [
          makeNode("Text", {
            "data-testid": "order-row",
            "data-redacted": "0",
          }),
        ]),
      ),
    );

    const result = await runSurfaceAssertion(
      {
        kind: "projector-node",
        surface: "ui.html.ws",
        selector: "[data-testid=order-row]",
        present: true,
        attrs: { "data-redacted": "1" },
      },
      session,
    );

    expect(result.passed).toBe(false);
  });

  test("api-response passes for a 200 response matching the expected body shape", async () => {
    const session = makeApiSession(
      makeTree(
        makeNode("Root", {}, [
          makeNode("Endpoint", {
            method: "GET",
            path: "/orders/{id}",
            onRequest: {
              read: {
                id: "$route.id",
                status: "confirmed",
              },
            },
          }),
        ]),
      ),
    );

    const result = await runSurfaceAssertion(
      {
        kind: "api-response",
        surface: "api.rest",
        method: "GET",
        path: "/orders/ord-001",
        expected: {
          status: 200,
          bodyShape: { id: "ord-001", status: "confirmed" },
        },
      },
      session,
    );

    expect(result.passed).toBe(true);
  });

  test("api-response fails when the expected status does not match", async () => {
    const session = makeApiSession(
      makeTree(
        makeNode("Root", {}, [
          makeNode("Endpoint", {
            method: "GET",
            path: "/orders/{id}",
            onRequest: {
              read: {
                id: "$route.id",
                status: "confirmed",
              },
            },
          }),
        ]),
      ),
    );

    const result = await runSurfaceAssertion(
      {
        kind: "api-response",
        surface: "api.rest",
        method: "GET",
        path: "/orders/ord-001",
        expected: {
          status: 404,
          bodyShape: { id: "ord-001", status: "confirmed" },
        },
      },
      session,
    );

    expect(result.passed).toBe(false);
  });

  test("cli-output passes when stdout matches the regex", async () => {
    const session = makeCliSession(makeTree(makeNode("Text", { text: "status: confirmed\n" })));

    const result = await runSurfaceAssertion(
      {
        kind: "cli-output",
        surface: "cli.stdout",
        match: /status:\s+confirmed/,
      },
      session,
    );

    expect(result.passed).toBe(true);
  });

  test("cli-output fails when stdout does not match the regex", async () => {
    const session = makeCliSession(makeTree(makeNode("Text", { text: "status: confirmed\n" })));

    const result = await runSurfaceAssertion(
      {
        kind: "cli-output",
        surface: "cli.stdout",
        match: /unknown/,
      },
      session,
    );

    expect(result.passed).toBe(false);
  });

  test("unregistered surfaces return a failing assertion result instead of throwing", async () => {
    const session = makeUiSession(makeTree(makeNode("Text", { "data-testid": "order-row" })));

    const result = await runSurfaceAssertion(
      {
        kind: "projector-node",
        surface: "foo.bar",
        selector: "[data-testid=order-row]",
        present: true,
      } as Assertion,
      session,
    );

    expect(result.passed).toBe(false);
    expect(result.actual).toContain('no evaluator for surface "foo.bar"');
  });

  test("ProjectorSession.click dispatches the bound action and refreshes the tree", async () => {
    const before = makeTree(
      makeNode(
        "Stack",
        {},
        [makeNode("Button", { "data-testid": "confirm-button" }, [], "n0")],
        "root",
      ),
      [
        {
          nodeId: "n0",
          binding: {
            action: "ConfirmOrder",
            target: "ord-001",
            payload: { id: "ord-001" },
          },
        },
      ],
    );
    const after = makeTree(
      makeNode(
        "Stack",
        {},
        [makeNode("Text", { "data-testid": "order-row", "status": "confirmed" }, [], "n1")],
        "root",
      ),
    );
    const stub = makeStubKernel(before, {
      onDispatch() {
        stub.setTree(after);
      },
    });
    const session = new ProjectorSession({
      kernel: stub.kernel,
      projection: makeProjectionModel(),
      surface: "ui.html.ws",
      sessionCaps: { confirm: "cid-confirm" },
    });

    await session.click("[data-testid=confirm-button]");

    expect(stub.dispatchCalls).toHaveLength(1);
    expect(stub.dispatchCalls[0]).toMatchObject({
      actionRef: "ConfirmOrder",
      target: "ord-001",
      payload: { id: "ord-001" },
    });
    expect(session.currentTree()?.root.children[0]?.props.status).toBe("confirmed");
  });
});
