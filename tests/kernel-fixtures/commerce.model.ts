import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { ModelDocument } from "../../L09-demand/model-loader.ts";

const yamlPath = resolve(import.meta.dir, "commerce.model.yaml");

export const COMMERCE_MODEL_FIXTURE: ModelDocument = Bun.YAML.parse(
  readFileSync(yamlPath, "utf-8"),
) as ModelDocument;
