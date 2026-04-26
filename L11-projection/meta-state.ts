import { existsSync } from "node:fs";
import { resolve } from "node:path";
import type { ProjectionModel } from "../L01-foundation/projection-types.ts";
import type { ProjectionSession } from "./session.ts";

export function applySessionPatch(
  session: ProjectionSession,
  patch: Partial<ProjectionSession>,
): void {
  if (patch.currentUser) session.currentUser = patch.currentUser;
  if (patch.route) session.route = patch.route;
  if (patch.ephemeral) session.ephemeral = patch.ephemeral;
  if (patch.kindExt) session.kindExt = patch.kindExt;
}

export function setUiContextValue(
  state: Map<string, Record<string, unknown>>,
  ctxPath: string,
  path: string,
  value: unknown,
): void {
  const scope = String(ctxPath);
  const values = { ...(state.get(scope) ?? {}) };
  values[String(path)] = value;
  state.set(scope, values);
}

export function resolveDefaultPageName(doc: ProjectionModel): string | null {
  if (doc.morphism && !doc.pages) return null;
  if ((doc.routes ?? []).length > 0) return doc.routes![0].page;
  if (doc.pages?.index) return "index";
  const first = Object.keys(doc.pages ?? {})[0];
  if (!first) throw new Error("Projector has no pages.");
  return first;
}

export function resolveAssetsDir(
  doc: ProjectionModel | null,
  yamlDir: string | null,
): string | null {
  if (!doc || !yamlDir) return null;
  const abs = resolve(yamlDir, doc.assets ?? "./assets");
  return existsSync(abs) ? abs : null;
}
