import { expect, test } from "@playwright/test";

type FrameEvent = { payload: string };
type PageWebSocket = { on(event: "framesent", listener: (event: FrameEvent) => void): void };
type PageWithWebSocketEvents = {
  on(event: "websocket", listener: (ws: PageWebSocket) => void): void;
};

const captureSentFrames = async (page: PageWithWebSocketEvents, run: () => Promise<void>) => {
  const sentFrames: Array<Record<string, unknown>> = [];
  page.on("websocket", (ws: PageWebSocket) => {
    ws.on("framesent", (event: FrameEvent) => {
      try {
        sentFrames.push(JSON.parse(event.payload));
      } catch {}
    });
  });
  await run();
  return sentFrames;
};

test("S12 pathStyle deep-link applies #/active as filter=active", async ({ page }) => {
  const sentFrames = await captureSentFrames(
    page as unknown as PageWithWebSocketEvents,
    async () => {
      await page.goto("/pathstyle#/active");
    },
  );
  await expect(page.locator("[data-connection-state]")).toHaveText("connected");
  await expect(page).toHaveURL(/\/pathstyle#\/active$/);
  await expect
    .poll(() =>
      sentFrames.some(
        (frame) => frame.type === "ui-set" && frame.path === "filter" && frame.value === "active",
      ),
    )
    .toBe(true);
});

test("S13 pathStyle writes #/completed from a ui.set filter change", async ({ page }) => {
  const sentFrames = await captureSentFrames(
    page as unknown as PageWithWebSocketEvents,
    async () => {
      await page.goto("/pathstyle#/");
    },
  );
  await expect(page.locator("[data-connection-state]")).toHaveText("connected");

  await page.click("#filter-completed");

  await expect(page).toHaveURL(/\/pathstyle#\/completed$/);
  await expect
    .poll(() =>
      sentFrames.some(
        (frame) =>
          frame.type === "ui-set" && frame.path === "filter" && frame.value === "completed",
      ),
    )
    .toBe(true);
});
