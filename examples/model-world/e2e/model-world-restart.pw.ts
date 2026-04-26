import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { test } from "@playwright/test";

const configDir = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = resolve(configDir, "../../..");
const BOOTNODE_URL = pathToFileURL(
  resolve(PACKAGE_ROOT, "L14-hosts/projection-runtime/index.ts"),
).href;
const SDS_PATH = resolve(PACKAGE_ROOT, "examples/model-world/sds.yaml");
const ORDERS_JSON = resolve(PACKAGE_ROOT, "examples/model-world/data/orders.json");
const ORDERS_NDJSON = resolve(PACKAGE_ROOT, "examples/model-world/data/orders.ndjson");
const ORDER_MACHINE = "sm://test.ecommerce.example/ecommerce/lifecycle/1.0.0";

function runInBun(
  script: string,
): Promise<{ code: number | null; stderr: string; stdout: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn("bun", ["--eval", script], {
      cwd: PACKAGE_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolveRun({ code, stderr, stdout });
    });
  });
}

test("model-world restart round-trip persists entity, aggregate, and journal state", async () => {
  const script = `
    import assert from "node:assert/strict";
    import { readFile, rm } from "node:fs/promises";
    const { bootNode } = await import(${JSON.stringify(BOOTNODE_URL)});
    const SDS_PATH = ${JSON.stringify(SDS_PATH)};
    const ORDERS_JSON = ${JSON.stringify(ORDERS_JSON)};
    const ORDERS_NDJSON = ${JSON.stringify(ORDERS_NDJSON)};
    const ORDER_MACHINE = ${JSON.stringify(ORDER_MACHINE)};

    async function waitFor(read, ready, timeoutMs = 5_000) {
      const deadline = Date.now() + timeoutMs;
      let lastError;
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

    await rm(ORDERS_JSON, { force: true });
    await rm(ORDERS_NDJSON, { force: true });

    const orderKey = "ord-restart-001";
    const app1 = bootNode(SDS_PATH);
    try {
      const create = await app1.app.submit("placeOrder", orderKey, {
        customer: "c-9",
        total: 150,
        items: [{ sku: "s-1", qty: 1 }],
      });
      assert.equal(create.success, true);
      app1.app.setState(orderKey, { status: "pending" });
      const confirm = await app1.app.submit("confirm", orderKey);
      assert.equal(confirm.success, true);
      const pay = await app1.app.submit("pay", orderKey, { amount: 150 });
      assert.equal(pay.success, true);

      const onDisk = await waitFor(
        async () => JSON.parse(await readFile(ORDERS_JSON, "utf8")),
        (value) => Boolean(value["@bindings"]?.["order-records"]?.records?.[orderKey] && value["@bindings"]?.["order-lifecycles"]?.records?.[orderKey]),
      );
      assert.ok(onDisk["@context"]);
      assert.deepEqual(onDisk["@bindings"]["order-records"].records[orderKey], {
        customer: "c-9",
        total: 150,
        items: [{ sku: "s-1", qty: 1 }],
      });
      assert.equal(onDisk["@bindings"]["order-lifecycles"].records[orderKey].currentState.status, "paid");
      assert.equal(onDisk["@bindings"]["order-lifecycles"].records[orderKey].transitionCount, 2);

      const journalLines = await waitFor(
        async () => (await readFile(ORDERS_NDJSON, "utf8")).trim().split("\\n").filter(Boolean),
        (value) => value.length >= 3,
      );
      const events = journalLines.slice(1).map((line) => JSON.parse(line));
      assert.equal(events.length, 2);
      assert.equal(events[0]?.verb, "confirm");
      assert.equal(events[0]?.afterState?.status, "confirmed");
      assert.equal(events[1]?.verb, "pay");
      assert.equal(events[1]?.afterState?.status, "paid");
    } finally {
      app1.dispose();
    }

    const app2 = bootNode(SDS_PATH);
    try {
      const aggregate = app2.app.currentStateForMachine(ORDER_MACHINE, orderKey);
      assert.deepEqual(app2.app.getState(orderKey), { status: "paid" });
      assert.ok(app2.app.listInstances().some((instance) => instance.key === orderKey));
      assert.equal(aggregate?.currentState?.status, "paid");
      const ship = await app2.app.submit("ship", orderKey, { carrier: "DHL" });
      assert.equal(ship.success, true);
      assert.deepEqual(ship.newState, { status: "shipped" });
    } finally {
      app2.dispose();
    }
  `;

  const result = await runInBun(script);
  assert.equal(
    result.code,
    0,
    `bun subprocess failed\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
  );
});
