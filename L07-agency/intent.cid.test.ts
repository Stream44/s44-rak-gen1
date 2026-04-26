import { describe, expect, test } from "bun:test";
import { AlgebraicKernel, IntentProcessor, ModelLoader } from "../L13-facade/index.ts";
import { COMMERCE_MODEL_FIXTURE } from "../tests/kernel-fixtures/commerce.model.ts";
import { validatePayload } from "./intent/modules/validate-payload.ts";

const schema = { type: "object" as const, properties: { foo: { type: "string" as const } } };
const proc = () => new IntentProcessor(AlgebraicKernel.create());
const action = (
  p = proc(),
  version = "1.0",
  extra: { preconditions?: unknown[]; targetMachine?: string | null } = {},
) =>
  p.defineAction("TestAction", version, {
    verb: "go",
    inputSchema: schema,
    targetMachine: extra.targetMachine,
    preconditions: extra.preconditions as never,
  });
const intent = (p = proc(), payload: object = { foo: "x" }, target = "m") => {
  const a = action(p);
  return validatePayload({ action: a.id, target, targetKey: "k", payload }, { $processor: p })
    .intent;
};

describe("23-intent CID coverage", () => {
  test("1. identical ActionTypes share CID", () => expect(action().cid).toBe(action().cid));
  test("2. version changes ActionType CID", () =>
    expect(action(proc(), "1.0").cid).not.toBe(action(proc(), "2.0").cid));
  test("3. preconditions change ActionType CID", () =>
    expect(action(proc(), "1.0", { preconditions: [] }).cid).not.toBe(
      action(proc(), "1.0", { preconditions: [{ op: "const", value: true }] }).cid,
    ));
  test("4. undefined/null targetMachine normalize equally", () =>
    expect(action(proc(), "1.0", { targetMachine: undefined }).cid).toBe(
      action(proc(), "1.0", { targetMachine: null }).cid,
    ));
  test("5. identical payload + actionId share Intent CID", () =>
    expect(intent().cid).toBe(intent().cid));
  test("6. payload changes Intent CID", () =>
    expect(intent(proc(), { foo: "x" }).cid).not.toBe(intent(proc(), { foo: "y" }).cid));
  test("7. Intent CID is deterministic across constructor calls", () =>
    expect(intent(proc(), { foo: "same" }).cid).toBe(intent(proc(), { foo: "same" }).cid));
  test("8. Intent CID format is sha256 CID", () =>
    expect(intent().cid).toMatch(/^cid:sha256:[0-9a-f]{64}$/));
  test("9. commerce fixture registers ActionType CIDs", () => {
    const ak = AlgebraicKernel.create(),
      loader = new ModelLoader(ak),
      ip = new IntentProcessor(ak);
    loader.setIntentProcessor(ip);
    const app = loader.boot(COMMERCE_MODEL_FIXTURE);
    for (const id of Object.values(app.actions))
      expect(ip.resolveAction(id).cid).toMatch(/^cid:sha256:/);
  });
  test("10. JSON round-trip preserves cid fields", () => {
    const a = action(),
      i = intent();
    expect(JSON.parse(JSON.stringify(a)).cid).toBe(a.cid);
    expect(JSON.parse(JSON.stringify(i)).cid).toBe(i.cid);
  });
});
