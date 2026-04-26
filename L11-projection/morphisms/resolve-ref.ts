import { resolveManifestRef } from "../dispatch.ts";

export default function resolveRef(input: {
  frame?: { actionRef?: string; ref?: string };
  manifest: Parameters<typeof resolveManifestRef>[0];
  [key: string]: unknown;
}) {
  const frame = (input.frame ?? input) as { actionRef?: string; ref?: string };
  const actionRef = frame.actionRef ?? frame.ref;
  const resolved = actionRef ? resolveManifestRef(input.manifest, actionRef) : null;
  if (!resolved) throw new Error(`Unknown action ref: "${actionRef}" — not declared in actions:`);
  return { ...input, ...resolved, frame };
}
