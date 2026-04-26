import type { JsonSchema } from "../../L01-foundation/types.ts";
import { SchemaValidator } from "../../L01-foundation/validator.ts";
import type {
  DispatchFrame,
  ResolvedManifest,
  ResolvedManifestEntry,
} from "../../L01-foundation/dispatch-types.ts";
import type { IntentResult } from "../../L07-agency/intent.ts";

export interface CliInvocation {
  command: string[];
  flags: Record<string, string>;
}

export interface ArgActionContext {
  stdin?: NodeJS.ReadStream;
}

export type CliDispatchFrame = DispatchFrame & {
  type: "action";
  ref: string;
  requestId: string;
};

export type ArgDecodeResult =
  | { ok: true; frame: CliDispatchFrame }
  | {
      ok: false;
      reason: "no-match" | "validation-failed" | "capability-denied";
      message: string;
    };

const validator = new SchemaValidator();

export function decode(
  invocation: CliInvocation,
  manifest?: ResolvedManifest,
  session?: { currentUser: { id: string; capabilities: Record<string, string> } },
): ArgDecodeResult {
  if (!manifest || !session) {
    throw new Error("decode() requires a manifest and session.");
  }

  const matched = matchEntry(invocation.command, manifest);
  if (!matched) {
    return {
      ok: false,
      reason: "no-match",
      message: `no matching action for ${invocation.command.join(" ")}`,
    };
  }

  const payload: Record<string, unknown> = {};
  let target = matched.rest[0] ?? invocation.flags.target;
  const positional = matched.rest.slice(target ? 1 : 0);
  if (positional.length > 0) payload._positional = positional;
  for (const [key, value] of Object.entries(invocation.flags)) {
    if (key === "target" && target === value) continue;
    payload[key] = value;
  }

  const required =
    (matched.entry as ResolvedManifestEntry & { requires?: string[] }).requires ?? [];
  for (const cap of required) {
    if (!session.currentUser.capabilities[cap]) {
      return { ok: false, reason: "capability-denied", message: `capability denied: ${cap}` };
    }
  }

  const schema = matched.entry.action?.inputSchema ?? matched.entry.payloadSchema;
  if (
    target &&
    matched.entry.kind === "model" &&
    matched.entry.action?.inputSchema &&
    schemaRequiresId(matched.entry.action.inputSchema) &&
    payload.id === undefined
  ) {
    payload.id = target;
  }
  const normalizedPayload = Object.keys(payload).length > 0 ? payload : undefined;
  if (schema) {
    const validation = validator.validate(normalizedPayload ?? {}, schema as JsonSchema);
    if (!validation.valid) {
      return {
        ok: false,
        reason: "validation-failed",
        message: validation.errors.map((error) => error.message).join("; "),
      };
    }
  }

  const ref = matched.uri;
  return {
    ok: true,
    frame: {
      type: "action",
      ref,
      requestId: `cli-${Date.now()}`,
      actionRef: ref,
      target,
      payload: normalizedPayload,
    },
  };
}

export function formatIntentResult(result: IntentResult, ansi: boolean): string {
  if (result.success) {
    return ansi ? "\x1b[32mok\x1b[0m" : "ok";
  }
  const text = `error: ${result.error ?? "unknown error"}`;
  return ansi ? `\x1b[31m${text}\x1b[0m` : text;
}

function matchEntry(
  command: string[],
  manifest: ResolvedManifest,
): { entry: ResolvedManifestEntry; uri: string; rest: string[] } | null {
  const uris = [...manifest.byUri.entries()];
  const names = [...manifest.byName.entries()];
  for (let end = command.length; end >= 1; end--) {
    const prefix = command.slice(0, end).join(".").toLowerCase();
    const match = uris.find(([, entry]) =>
      entryCommandAliases(entry).some((candidate) => candidate.toLowerCase() === prefix),
    );
    if (match) {
      return { uri: match[0], entry: match[1], rest: command.slice(end) };
    }
    const nameMatch = names.find(([, entry]) =>
      entryCommandAliases(entry).some((candidate) => candidate.toLowerCase() === prefix),
    );
    if (nameMatch) {
      return {
        uri: nameMatch[1].action?.id ?? nameMatch[0],
        entry: nameMatch[1],
        rest: command.slice(end),
      };
    }
  }
  return null;
}

function toDottedAlias(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1.$2")
    .replace(/[_\-\s]+/g, ".")
    .toLowerCase();
}

function entryCommandAliases(entry: ResolvedManifestEntry): string[] {
  const aliases = [entry.name, toDottedAlias(entry.name)];
  if (entry.action?.verb) aliases.push(entry.action.verb);
  return aliases;
}

function schemaRequiresId(schema: unknown): boolean {
  if (!schema || typeof schema !== "object" || Array.isArray(schema)) return false;
  const required = (schema as { required?: unknown }).required;
  return Array.isArray(required) && required.includes("id");
}

export default decode;
