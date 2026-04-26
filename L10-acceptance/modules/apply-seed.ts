// Leaf for cycle-reset seed application.
import type { ModelBoot } from "../../L09-demand/model-loader.ts";
import type { Seed } from "../acceptance.ts";

export default function applySeed(input: { app: ModelBoot; seed: Seed | undefined }): void {
  if (input.seed) input.app.setState(input.seed.targetKey, input.seed.state);
}
