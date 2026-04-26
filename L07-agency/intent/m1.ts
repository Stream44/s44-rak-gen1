import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as MorphismDocumentModule from "../../L02-metamodels/morphism-document.ts";

/**
 * Co-located M1 instance; conforms to adk:MorphismDocument/1.0.
 * Side-effect registers at import time; 4-bootstrap.ts pulls in via
 * `import "./23-intent/m1.ts";` with no named export reference.
 */
const registry = (
  MorphismDocumentModule as {
    MorphismDocumentRegistry?: { register(document: unknown): void };
  }
).MorphismDocumentRegistry;
const YAML_PATH = fileURLToPath(new URL("./intent.model.yaml", import.meta.url));
const doc = Bun.YAML.parse(readFileSync(YAML_PATH, "utf-8")) as {
  id: string;
  version: string;
  morphisms: unknown;
  types: unknown;
};

export const INTENT_MORPHISMS = Object.freeze({
  conformsTo: "adk:MorphismDocument/1.0" as const,
  discriminator: "intent" as const,
  id: doc.id,
  version: doc.version,
  morphisms: doc.morphisms,
  types: doc.types,
});

registry?.register(INTENT_MORPHISMS);

export type IntentMorphismsDocument = typeof INTENT_MORPHISMS;
