import { expect, test } from "@playwright/test";

test("S3 acceptance play dispatches the standard action frame", async ({ page }) => {
  await page.addInitScript(() => {
    const NativeWebSocket = window.WebSocket;
    const sent: unknown[] = [];
    class TrackingWebSocket extends NativeWebSocket {
      override send(data: string | ArrayBufferLike | Blob | ArrayBufferView) {
        if (typeof data === "string") {
          try {
            sent.push(JSON.parse(data));
          } catch {
            sent.push(data);
          }
        }
        return super.send(data);
      }
    }
    Object.defineProperty(window, "__adkActionFrames", {
      configurable: true,
      value: sent,
      writable: false,
    });
    window.WebSocket = TrackingWebSocket;
  });
  await page.goto("/observatory");
  await expect(page.locator("[data-connection-state]")).toHaveText("connected");
  await page.locator('[data-tab-trigger="acceptance"]').click();
  const rows = page.locator('[data-tab="acceptance"] [data-use-case-id]');
  await expect(rows.first()).toBeVisible();
  const play = rows.first().locator("[data-acceptance-trace-play]").first();
  await expect(play).toHaveAttribute("data-action-ref", "acceptance.play");
  await play.click();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as Window & { __adkActionFrames?: unknown[] }).__adkActionFrames ?? [],
      ),
    )
    .toContainEqual(
      expect.objectContaining({
        type: "custom",
        name: "acceptance.play",
        payload: expect.objectContaining({ traceIndex: 0 }),
      }),
    );
});
