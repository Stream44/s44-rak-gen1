/**
 * E-commerce model v2 — loaded from YAML.
 */
import { readFileSync } from "fs";
import { resolve } from "path";
import type { ModelDocument } from "../../L09-demand/model-loader.ts";

const yamlPath = resolve(import.meta.dir, "models/ecommerce-v2.model.yaml");
export const ECOMMERCE_V2_MODEL: ModelDocument = Bun.YAML.parse(
  readFileSync(yamlPath, "utf-8"),
) as ModelDocument;
