import type { JsonSchema } from "../../L13-facade/index.ts";

export default function inferMetamodelRef(schema: JsonSchema): string {
  if (schema && typeof schema === "object" && "oneOf" in schema)
    return "type://github.com/Stream44/s44-rak-gen1@1.0/union/1.0";
  if (schema && typeof schema === "object" && schema.type === "array")
    return "type://github.com/Stream44/s44-rak-gen1@1.0/collection/1.0";
  return "type://github.com/Stream44/s44-rak-gen1@1.0/record/1.0";
}
