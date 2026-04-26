import type { ActionType } from "../../L13-facade/index.ts";
import { normalizeManifestEntry } from "../dispatch.ts";
import type { ProjectionModel } from "../../L01-foundation/projection-types.ts";
import type { ActionManifest } from "../compile-types.ts";

type Input = ProjectionModel & { doc?: ProjectionModel; modelActions?: Map<string, ActionType> };

export default function buildManifest(
  input: Input,
): ActionManifest & ProjectionModel & { doc: ProjectionModel; manifest: ActionManifest } {
  const doc = input.doc ?? input;
  const modelActions = input.modelActions ?? new Map<string, ActionType>();
  const manifest: ActionManifest = { byName: new Map(), byUri: new Map() };
  const modelByUri = new Map<string, ActionType>();
  for (const action of modelActions.values()) modelByUri.set(action.id, action);
  const errors: string[] = [];
  for (const raw of doc.actions ?? []) {
    let entry;
    try {
      entry = normalizeManifestEntry(raw);
    } catch (error) {
      errors.push((error as Error).message);
      continue;
    }
    const kind = entry.kind ?? "model";
    const ref = entry.name;
    if (kind === "model") {
      const action = ref.startsWith("action://") ? modelByUri.get(ref) : modelActions.get(ref);
      if (!action && input.modelActions) {
        errors.push(`actions: "${ref}" (kind: model) — not found in bindsModel actions.`);
        continue;
      }
      const resolved = action
        ? { name: action.name, kind: "model" as const, action, payloadSchema: entry.payloadSchema }
        : {
            name: ref.split("/").at(-2) ?? ref,
            kind: "model" as const,
            payloadSchema: entry.payloadSchema,
          };
      manifest.byName.set(resolved.name, resolved);
      manifest.byUri.set(
        action?.id ??
          (ref.startsWith("action://")
            ? ref
            : `action://${doc.bindsModel ?? "adk"}/${resolved.name}/${doc.version}`),
        resolved,
      );
      if (ref !== resolved.name) manifest.byName.set(ref, resolved);
      continue;
    }
    manifest.byName.set(ref, { name: ref, kind, payloadSchema: entry.payloadSchema });
  }
  if (errors.length > 0)
    throw new Error(`Projector manifest errors:\n  - ${errors.join("\n  - ")}`);
  return { ...doc, doc, manifest, byName: manifest.byName, byUri: manifest.byUri };
}
