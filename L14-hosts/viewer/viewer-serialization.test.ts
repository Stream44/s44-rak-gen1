import { expect, test } from "bun:test";
import { chainOnSocket } from "./viewer.ts";

type FakeSocket = { id: string };

test("per-socket ordering: handler N completes before handler N+1 starts on same socket", async () => {
  const socketQueues = new WeakMap<FakeSocket, Promise<unknown>>();
  const ws = { id: "solo" };
  const order: Array<{ ev: "start" | "end"; n: number }> = [];

  const tasks = Array.from({ length: 5 }, (_, n) =>
    chainOnSocket(socketQueues, ws, async () => {
      order.push({ ev: "start", n });
      if (n === 2) throw new Error("boom");
      await Bun.sleep(30 - n * 5);
      order.push({ ev: "end", n });
    }).catch(() => undefined),
  );

  await Promise.all(tasks);

  for (let n = 0; n < 2; n += 1) {
    const endN = order.findIndex((entry) => entry.ev === "end" && entry.n === n);
    const startNext = order.findIndex((entry) => entry.ev === "start" && entry.n === n + 1);
    expect(endN).toBeGreaterThanOrEqual(0);
    expect(startNext).toBeGreaterThan(endN);
  }
  expect(order.findIndex((entry) => entry.ev === "start" && entry.n === 3)).toBeGreaterThan(
    order.findIndex((entry) => entry.ev === "start" && entry.n === 2),
  );
  expect(order.findIndex((entry) => entry.ev === "start" && entry.n === 4)).toBeGreaterThan(
    order.findIndex((entry) => entry.ev === "start" && entry.n === 3),
  );
  expect(order.some((entry) => entry.ev === "start" && entry.n === 3)).toBe(true);
  expect(order.some((entry) => entry.ev === "start" && entry.n === 4)).toBe(true);
});

test("cross-socket concurrency: slow handler on socket A does not block socket B", async () => {
  const socketQueues = new WeakMap<FakeSocket, Promise<unknown>>();
  const wsA = { id: "A" };
  const wsB = { id: "B" };
  let aStarted = false,
    aFinished = false,
    bFinished = false;

  const taskA = chainOnSocket(socketQueues, wsA, async () => {
    aStarted = true;
    await Bun.sleep(300);
    aFinished = true;
  });

  await Bun.sleep(40);

  const taskB = chainOnSocket(socketQueues, wsB, async () => {
    expect(aStarted).toBe(true);
    expect(aFinished).toBe(false);
    bFinished = true;
  });

  await Promise.all([taskA, taskB]);

  expect(bFinished).toBe(true);
  expect(aFinished).toBe(true);
});
