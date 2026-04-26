import type { ProjectionNode, ProjectionTree } from "../../L01-foundation/projection-types.ts";
import {
  normalizeOpenApiPath,
  isEndpointFragment,
  isParameterFragment,
  isRequestBodyFragment,
  isResponseFragment,
  isAuthZFragment,
  type HandlerTable,
  type HandlerTableEntry,
  type OpenApiDoc,
  type OpenApiOperation,
  type OpenApiOutput,
} from "./backend-helpers.ts";

export default function dispatch(
  tree: ProjectionTree,
  ctx: { projector?: { projector?: string; version?: string }; options?: { servers?: unknown[] } },
  lookupRender: (
    component: string,
  ) =>
    | ((node: ProjectionNode, ctx: { renderChildren: (n: ProjectionNode) => unknown[] }) => unknown)
    | null,
): OpenApiOutput {
  const doc: OpenApiDoc = {
    openapi: "3.1.0",
    info: {
      title: ctx?.projector?.projector ?? "api",
      version: ctx?.projector?.version ?? "1.0.0",
    },
    paths: {},
  };
  const servers = ctx?.options?.servers;
  if (Array.isArray(servers))
    doc.servers = servers
      .filter(
        (entry): entry is { url: string } =>
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as { url?: unknown }).url === "string",
      )
      .map((entry) => ({ url: entry.url }));
  const handlers: HandlerTable = { routes: [] };
  const renderNode = (node: ProjectionNode): unknown => {
    const render = lookupRender(node.component);
    return render ? render(node, { renderChildren }) : renderChildren(node);
  };
  const renderChildren = (node: ProjectionNode): unknown[] =>
    node.children.flatMap((child) => {
      const rendered = renderNode(child);
      return Array.isArray(rendered) ? rendered : [rendered];
    });
  const foldEndpoint = (node: ProjectionNode): void => {
    const endpoint = renderNode(node);
    if (!isEndpointFragment(endpoint)) return;
    const operation: OpenApiOperation = { responses: {} };
    if (endpoint.summary) operation.summary = endpoint.summary;
    if (endpoint.description) operation.description = endpoint.description;
    const routeEntry: HandlerTableEntry = {
      method: endpoint.method,
      path: endpoint.path,
      actionRef: endpoint.onRequest?.action ?? null,
      paramMapping: {
        target: endpoint.onRequest?.target,
        payload: endpoint.onRequest?.payload,
        read: endpoint.onRequest?.read,
      },
      requires: endpoint.requires,
    };
    for (const child of endpoint.children) {
      if (isParameterFragment(child)) {
        (operation.parameters ??= []).push({
          in: child.kind === "routeParam" ? "path" : "query",
          name: child.name,
          required: child.kind === "routeParam" ? (child.required ?? true) : child.required,
          schema: child.schema,
          description: child.description,
        });
        continue;
      }
      if (isRequestBodyFragment(child)) {
        operation.requestBody = {
          required: child.required,
          content: { [child.contentType]: { schema: child.schema } },
        };
        routeEntry.requestSchema = child.schema;
        continue;
      }
      if (isResponseFragment(child)) {
        operation.responses[child.status] = {
          description: child.description,
          content: { [child.contentType]: { schema: child.schema } },
        };
        continue;
      }
      if (isAuthZFragment(child) && child.scheme) {
        (operation.security ??= []).push({ [child.scheme]: child.scopes });
        doc.components ??= {};
        doc.components.securitySchemes ??= {};
        doc.components.securitySchemes[child.scheme] ??= {};
      }
    }
    const path = normalizeOpenApiPath(endpoint.path);
    doc.paths[path] ??= {};
    doc.paths[path][endpoint.method.toLowerCase()] = operation;
    handlers.routes.push(routeEntry);
  };
  const walkTree = (node: ProjectionNode): void =>
    node.component === "Endpoint" ? foldEndpoint(node) : node.children.forEach(walkTree);
  walkTree(tree.root);
  return { kind: "openapi", document: doc, handlers, contentType: "application/json" };
}
