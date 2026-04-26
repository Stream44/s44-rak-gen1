import { dirname, resolve } from "node:path";

export interface PathResolverInput {
  sdsPath: string;
  origin: string;
  structKind: string;
  modelId: string;
  override?: string;
}

export function resolvePersistencePath(input: PathResolverInput): string {
  if (input.override) return resolve(dirname(input.sdsPath), input.override);

  let namespace = "local";
  try {
    const url = new URL(input.origin);
    const normalized = `${url.hostname}${url.pathname}`.replace(/\/+$/, "");
    const versionedNamespaceRe = /^([^/]+(?:\/[^/]+)*?\/[^/]+@\d+(?:\.\d+)*)/;
    namespace = versionedNamespaceRe.exec(normalized)?.[1] ?? normalized ?? "local";
  } catch {
    namespace = "local";
  }

  const structKind = input.structKind || "model";
  return resolve(
    dirname(input.sdsPath),
    ".o",
    namespace,
    structKind,
    `${input.modelId}.state.json`,
  );
}
