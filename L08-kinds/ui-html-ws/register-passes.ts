import { renderPassRegistry } from "../../L11-projection/render-pass-registry.ts";
import { splitProjection } from "./split-pass.ts";

export function registerUiHtmlWsRenderPasses(): void {
  if (renderPassRegistry.byName("split").some((pass) => pass.run === splitProjection)) return;
  renderPassRegistry.register({ name: "split", run: splitProjection });
}

registerUiHtmlWsRenderPasses();
