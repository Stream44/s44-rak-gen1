export interface OpenApiDoc {
  openapi: "3.1.0";
  info: { title: string; version: string };
  servers?: Array<{ url: string }>;
  paths: Record<string, Record<string, OpenApiOperation>>;
  components?: { schemas?: Record<string, unknown>; securitySchemes?: Record<string, unknown> };
  security?: Array<Record<string, string[]>>;
}

export interface OpenApiOperation {
  summary?: string;
  description?: string;
  parameters?: Array<{
    in: "path" | "query";
    name: string;
    required?: boolean;
    schema?: unknown;
    description?: string;
  }>;
  requestBody?: { required?: boolean; content: Record<string, { schema: unknown }> };
  responses: Record<
    string,
    { description?: string; content?: Record<string, { schema: unknown }> }
  >;
  security?: Array<Record<string, string[]>>;
}

export interface HandlerTableEntry {
  method: string;
  path: string;
  actionRef: string | null;
  paramMapping: { target?: string; payload?: Record<string, unknown>; read?: unknown };
  requires?: string[];
  requestSchema?: unknown;
}

export interface HandlerTable {
  routes: HandlerTableEntry[];
}

export interface OpenApiOutput {
  kind: "openapi";
  document: OpenApiDoc;
  handlers: HandlerTable;
  contentType: "application/json";
}

export interface EndpointFragment {
  kind: "endpoint";
  method: string;
  path: string;
  summary?: string;
  description?: string;
  onRequest?: {
    action?: string;
    target?: string;
    payload?: Record<string, unknown>;
    read?: unknown;
  };
  requires?: string[];
  children: unknown[];
}

export interface ParameterFragment {
  kind: "routeParam" | "queryParam";
  name: string;
  required?: boolean;
  schema?: unknown;
  description?: string;
}

export interface RequestBodyFragment {
  kind: "requestBody";
  contentType: string;
  schema: unknown;
  required?: boolean;
}

export interface ResponseFragment {
  kind: "response";
  status: string;
  contentType: string;
  schema: unknown;
  description?: string;
}

export interface AuthZFragment {
  kind: "authz";
  scheme?: string;
  scopes: string[];
}

export function normalizeOpenApiPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

export function isEndpointFragment(value: unknown): value is EndpointFragment {
  return !!value && typeof value === "object" && (value as { kind?: string }).kind === "endpoint";
}

export function isParameterFragment(value: unknown): value is ParameterFragment {
  const kind = (value as { kind?: string } | null)?.kind;
  return kind === "routeParam" || kind === "queryParam";
}

export function isRequestBodyFragment(value: unknown): value is RequestBodyFragment {
  return (
    !!value && typeof value === "object" && (value as { kind?: string }).kind === "requestBody"
  );
}

export function isResponseFragment(value: unknown): value is ResponseFragment {
  return !!value && typeof value === "object" && (value as { kind?: string }).kind === "response";
}

export function isAuthZFragment(value: unknown): value is AuthZFragment {
  return !!value && typeof value === "object" && (value as { kind?: string }).kind === "authz";
}
