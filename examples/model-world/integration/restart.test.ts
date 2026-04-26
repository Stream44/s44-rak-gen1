import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { test } from "bun:test";
import { bootNode } from "../../../L14-hosts/projection-runtime/index.ts";

const PACKAGE_ROOT = resolve(import.meta.dir, "../../..");
const SDS_PATH = resolve(PACKAGE_ROOT, "examples/model-world/sds.yaml");
const ORDERS_JSON = resolve(PACKAGE_ROOT, "examples/model-world/data/orders.json");
const ORDERS_NDJSON = resolve(PACKAGE_ROOT, "examples/model-world/data/orders.ndjson");
const ORDER_MACHINE = "sm://test.ecommerce.example/ecommerce/lifecycle/1.0.0";

async function waitFor<T>(
  read: () => Promise<T>,
  ready: (value: T) => boolean,
  timeoutMs = 5_000,
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const value = await read();
      if (ready(value)) return value;
    } catch (error) {
      lastError = error;
    }
    await Bun.sleep(50);
  }
  if (lastError) throw lastError;
  throw new Error("Timed out waiting for storage flush.");
}

test("model-world restart round-trip persists entity, aggregate, and journal state", async () => {
  await rm(ORDERS_JSON, { force: true });
  await rm(ORDERS_NDJSON, { force: true });

  const orderKey = "ord-restart-001";
  const runtime1 = bootNode(SDS_PATH);
  try {
    const create = await runtime1.app.submit("placeOrder", orderKey, {
      customer: "c-9",
      total: 150,
      items: [{ sku: "s-1", qty: 1 }],
    });
    assert.equal(create.success, true);

    // The example still initializes lifecycle state separately from the entity record.
    runtime1.app.setState(orderKey, { status: "pending" });

    const confirm = await runtime1.app.submit("confirm", orderKey);
    assert.equal(confirm.success, true);
    const pay = await runtime1.app.submit("pay", orderKey, { amount: 150 });
    assert.equal(pay.success, true);

    const onDisk = await waitFor(
      async () => JSON.parse(await readFile(ORDERS_JSON, "utf8")) as Record<string, any>,
      (value) =>
        Boolean(
          value["@bindings"]?.["order-records"]?.records?.[orderKey] &&
          value["@bindings"]?.["order-lifecycles"]?.records?.[orderKey],
        ),
    );
    assert.ok(onDisk["@context"]);
    assert.deepEqual(onDisk["@bindings"]["order-records"].records[orderKey], {
      customer: "c-9",
      total: 150,
      items: [{ sku: "s-1", qty: 1 }],
    });

    const lifecycle = onDisk["@bindings"]["order-lifecycles"].records[orderKey];
    assert.equal(lifecycle.currentState.status, "paid");
    assert.equal(lifecycle.transitionCount, 2);

    const journalLines = await waitFor(
      async () => (await readFile(ORDERS_NDJSON, "utf8")).trim().split("\n").filter(Boolean),
      (value) => value.length >= 3,
    );
    const events = journalLines.slice(1).map((line) => JSON.parse(line) as Record<string, any>);
    assert.equal(events.length, 2);
    assert.equal(events[0]?.verb, "confirm");
    assert.equal(events[0]?.afterState?.status, "confirmed");
    assert.equal(events[1]?.verb, "pay");
    assert.equal(events[1]?.afterState?.status, "paid");
  } finally {
    runtime1.dispose();
  }

  const runtime2 = bootNode(SDS_PATH);
  try {
    assert.deepEqual(runtime2.app.getState(orderKey), { status: "paid" });
    assert.ok(runtime2.app.listInstances().some((instance) => instance.key === orderKey));

    const aggregate = runtime2.app.currentStateForMachine(ORDER_MACHINE, orderKey) as
      | Record<string, any>
      | undefined;
    assert.equal(aggregate?.currentState?.status, "paid");
    assert.equal(aggregate?.transitionCount, 2);

    const ship = await runtime2.app.submit("ship", orderKey, { carrier: "DHL" });
    assert.equal(ship.success, true);
    assert.deepEqual(ship.newState, { status: "shipped" });
  } finally {
    runtime2.dispose();
  }
});
