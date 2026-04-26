import { SchemaValidator } from "../../L01-foundation/validator.ts";
import type { DispatchFrame } from "../../L01-foundation/dispatch-types.ts";
import type { HandlerTable, HandlerTableEntry } from "./backend-helpers.ts";

export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
}

export interface HttpResponse {
  status: number;
  headers: Record<string, string>;
  body: unknown;
}

export default function decodeHttpRequest(
  req: HttpRequest,
  handlers: HandlerTable,
  session: { capabilities?: Record<string, string> } = {},
  validator: SchemaValidator = new SchemaValidator(),
): { frame: DispatchFrame; entry: HandlerTableEntry } | HttpResponse {
  const normalizedMethod = req.method.toUpperCase();
  for (const entry of handlers.routes) {
    if (entry.method.toUpperCase() !== normalizedMethod) continue;
    const match = req.path.match(buildRoutePattern(entry.path));
    if (!match) continue;
    const pathParams = Object.fromEntries(
      Object.entries(match.groups ?? {}).map(([key, value]) => [key, decodeURIComponent(value)]),
    );
    if (
      (entry.requires?.length ?? 0) > 0 &&
      !hasRequiredCapabilities(session, entry.requires ?? [])
    ) {
      return jsonResponse(403, { error: "forbidden", required: entry.requires });
    }
    if (entry.requestSchema && req.method.toUpperCase() !== "GET") {
      const validation = validator.validate(req.body, entry.requestSchema as never);
      if (!validation.valid)
        return jsonResponse(400, { error: "validation_failed", issues: validation });
    }
    return {
      frame: {
        actionRef: entry.actionRef ?? "",
        target: substitute(entry.paramMapping.target, pathParams) as string | undefined,
        payload: substitute(entry.paramMapping.payload, pathParams, req.body) as
          | Record<string, unknown>
          | undefined,
        capabilityId: pickCapability(session, entry.requires),
        origin: { kind: "api.rest", source: { method: req.method, path: req.path } },
      },
      entry,
    };
  }
  return jsonResponse(404, { error: "not_found", path: req.path, method: req.method });
}

export function encodeSuccess(result: unknown, _entry: HandlerTableEntry): HttpResponse {
  return jsonResponse(200, result);
}

export function encodeError(err: unknown, _entry?: HandlerTableEntry): HttpResponse {
  const status =
    typeof err === "object" &&
    err !== null &&
    typeof (err as { status?: unknown }).status === "number"
      ? (err as { status: number }).status
      : 500;
  const message =
    typeof err === "object" &&
    err !== null &&
    typeof (err as { message?: unknown }).message === "string"
      ? (err as { message: string }).message
      : "internal_error";
  return jsonResponse(status, { error: message });
}

function buildRoutePattern(path: string): RegExp {
  const pattern = path
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      const colonMatch = /^:([A-Za-z0-9_]+)$/.exec(segment);
      if (colonMatch) return `(?<${colonMatch[1]}>[^/]+)`;
      const braceMatch = /^\{([A-Za-z0-9_]+)\}$/.exec(segment);
      if (braceMatch) return `(?<${braceMatch[1]}>[^/]+)`;
      return escapeRegex(segment);
    })
    .join("/");
  return new RegExp(`^/${pattern}$`);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function hasRequiredCapabilities(
  session: { capabilities?: Record<string, string> },
  required: string[],
): boolean {
  const capabilities = session.capabilities ?? {};
  return required.every((capabilityId) => capabilityId in capabilities);
}

function pickCapability(
  session: { capabilities?: Record<string, string> },
  required?: string[],
): string | undefined {
  if (!required || required.length === 0) return undefined;
  const capabilities = session.capabilities ?? {};
  return required.find((capabilityId) => capabilityId in capabilities);
}

function substitute(
  value: unknown,
  pathParams: Record<string, string>,
  requestBody?: unknown,
): unknown {
  if (typeof value === "string") {
    return value.replace(
      /\$route\.([A-Za-z0-9_]+)/g,
      (_full, key: string) => pathParams[key] ?? "",
    );
  }
  if (Array.isArray(value)) return value.map((entry) => substitute(entry, pathParams, requestBody));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>))
      out[key] = substitute(entry, pathParams, requestBody);
    return out;
  }
  return value === undefined ? requestBody : value;
}

function jsonResponse(status: number, body: unknown): HttpResponse {
  return { status, headers: { "content-type": "application/json" }, body };
}
