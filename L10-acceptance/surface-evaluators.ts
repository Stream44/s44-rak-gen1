import type { ProjectionModel, ProjectionTree } from "../L01-foundation/projection-types.ts";
import type { ProjectionNode } from "../L01-foundation/projection-types.ts";
import type {
  AssertionResult,
  ProjectionSurfaceAssertion,
  StepContext,
} from "./acceptance-types.ts";
import type { ProjectorSession } from "./projector-session.ts";

type HandlerTable = { routes: unknown[] };

export type SurfaceEvaluator = (
  assertion: ProjectionSurfaceAssertion,
  ctx: StepContext,
  session: ProjectorSession,
) => AssertionResult | Promise<AssertionResult>;

export interface SurfaceHandlerSet {
  computeHandlers(tree: ProjectionTree, projection: ProjectionModel): unknown;
  decodeRequest?(
    req: { method: string; path: string; body?: unknown; headers?: Record<string, string> },
    handlers: unknown,
    sessionCaps: Record<string, string>,
  ): unknown;
  encodeSuccess?(body: unknown, entry: unknown): unknown;
  encodeError?(error: { status: number; message: string }, entry: unknown): unknown;
  renderCli?(
    tree: ProjectionTree,
    projection: ProjectionModel,
    session: ProjectorSession,
    pageName: string,
  ): { stdout: string; exitCode: number };
}

const surfaceEvaluators = new Map<string, SurfaceEvaluator>();
const surfaceHandlerSets = new Map<string, SurfaceHandlerSet>();

export function registerSurfaceEvaluator(surface: string, evaluator: SurfaceEvaluator): void {
  if (surfaceEvaluators.has(surface))
    throw new Error(`Surface evaluator already registered: ${surface}`);
  surfaceEvaluators.set(surface, evaluator);
}

export function hasSurfaceEvaluator(surface: string): boolean {
  return surfaceEvaluators.has(surface);
}

export function getSurfaceEvaluator(surface: string): SurfaceEvaluator | undefined {
  return surfaceEvaluators.get(surface);
}

export function registerSurfaceHandlerSet(surface: string, handlers: SurfaceHandlerSet): void {
  if (surfaceHandlerSets.has(surface))
    throw new Error(`Surface handler set already registered: ${surface}`);
  surfaceHandlerSets.set(surface, handlers);
}

export function getSurfaceHandlerSet(surface: string): SurfaceHandlerSet | undefined {
  return surfaceHandlerSets.get(surface);
}

export function registerDefaultSurfaceEvaluators(
  registerSurfaceEvaluator: (surface: string, evaluator: SurfaceEvaluator) => void,
): void {
  registerSurfaceEvaluator("ui.html.ws", (assertion, _ctx, session) => {
    if (assertion.kind !== "projector-node") return wrongKind(assertion, "projector-node");
    const tree = session.currentTree();
    if (!tree) return noTree(assertion);
    const node = findProjectionNode(tree.root, assertion.selector);
    const attrsPassed =
      !!node &&
      Object.entries(assertion.attrs ?? {}).every(
        ([key, value]) => String(node.props[key] ?? "") === value,
      );
    return {
      kind: assertion.kind,
      passed: assertion.present ? !!node && attrsPassed : !node,
      expected: JSON.stringify({
        selector: assertion.selector,
        present: assertion.present,
        attrs: assertion.attrs ?? null,
      }),
      actual: node
        ? JSON.stringify({
            nodeId: node.nodeId ?? null,
            props: node.props,
            attrsMatched: attrsPassed,
          })
        : "not found",
    };
  });

  registerSurfaceEvaluator("api.rest", async (assertion, _ctx, session) => {
    if (assertion.kind !== "api-response") return wrongKind(assertion, "api-response");
    const response = await session.requestHttp({ method: assertion.method, path: assertion.path });
    const headersMatch = Object.entries(assertion.expected.headers ?? {}).every(
      ([key, value]) => response.headers[key] === value,
    );
    return {
      kind: assertion.kind,
      passed:
        response.status === assertion.expected.status &&
        headersMatch &&
        matchesShape(assertion.expected.bodyShape, response.body),
      expected: JSON.stringify(assertion.expected),
      actual: JSON.stringify(response),
    };
  });

  registerSurfaceEvaluator("cli.stdout", (assertion, _ctx, session) => {
    if (assertion.kind !== "cli-output") return wrongKind(assertion, "cli-output");
    const output = session.typeCommand([]);
    const matched =
      typeof assertion.match === "string"
        ? output.stdout.includes(assertion.match)
        : assertion.match.test(output.stdout);
    return {
      kind: assertion.kind,
      passed:
        matched && (assertion.exitCode === undefined || output.exitCode === assertion.exitCode),
      expected: JSON.stringify({
        match: typeof assertion.match === "string" ? assertion.match : assertion.match.toString(),
        exitCode: assertion.exitCode ?? null,
      }),
      actual: JSON.stringify(output),
    };
  });
}

export function getSurfaceEvaluatorResult(
  assertion: ProjectionSurfaceAssertion,
  ctx: StepContext,
  getSurfaceEvaluator: (surface: string) => SurfaceEvaluator | undefined,
): AssertionResult | Promise<AssertionResult> {
  const session = ctx.projectorSession;
  if (!session) {
    return {
      kind: assertion.kind,
      passed: false,
      expected: `${assertion.surface} assertion evaluated`,
      actual: "no projectorSession attached to step",
    };
  }
  const evaluator = getSurfaceEvaluator(assertion.surface);
  if (!evaluator) {
    return {
      kind: assertion.kind,
      passed: false,
      expected: `${assertion.surface} evaluator registered`,
      actual: `no evaluator for surface "${assertion.surface}"`,
    };
  }
  return evaluator(assertion, ctx, session);
}

export function findProjectionNode(node: ProjectionNode, selector: string): ProjectionNode | null {
  if (matchesProjectionSelector(node, selector)) return node;
  for (const child of node.children) {
    const match = findProjectionNode(child, selector);
    if (match) return match;
  }
  return null;
}

export function matchesShape(expected: unknown, actual: unknown): boolean {
  if (expected === undefined) return true;
  if (expected === null || typeof expected !== "object")
    return JSON.stringify(expected) === JSON.stringify(actual);
  if (Array.isArray(expected))
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((entry, index) => matchesShape(entry, actual[index]))
    );
  return (
    !!actual &&
    typeof actual === "object" &&
    !Array.isArray(actual) &&
    Object.entries(expected as Record<string, unknown>).every(([key, value]) =>
      matchesShape(value, (actual as Record<string, unknown>)[key]),
    )
  );
}

export function evaluateApiResponseTemplate(
  value: unknown,
  sessionCaps: Record<string, string>,
  pathParams: Record<string, string>,
  requestBody?: unknown,
): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return substituteSurfaceValue(value, pathParams, requestBody);
  const guard = value as { op?: unknown; requires?: unknown; f?: unknown; fallback?: unknown };
  if (guard.op === "guard") {
    const required = Array.isArray(guard.requires)
      ? guard.requires.filter((entry): entry is string => typeof entry === "string")
      : [];
    const allowed = required.every((capabilityId) => capabilityId in sessionCaps);
    return evaluateApiResponseTemplate(
      allowed ? guard.f : guard.fallback,
      sessionCaps,
      pathParams,
      requestBody,
    );
  }
  const projection = value as {
    source?: unknown;
    projections?: unknown;
    requires?: unknown;
    requiresAny?: unknown;
  };
  if ("source" in projection && Array.isArray(projection.projections)) {
    const requires = Array.isArray(projection.requires)
      ? projection.requires.filter((entry): entry is string => typeof entry === "string")
      : [];
    const requiresAny = Array.isArray(projection.requiresAny)
      ? projection.requiresAny.filter((entry): entry is string => typeof entry === "string")
      : [];
    if (
      !requires.every((capabilityId) => capabilityId in sessionCaps) ||
      (requiresAny.length > 0 && !requiresAny.some((capabilityId) => capabilityId in sessionCaps))
    )
      return null;
    let current = evaluateApiResponseTemplate(
      projection.source,
      sessionCaps,
      pathParams,
      requestBody,
    );
    for (const entry of projection.projections) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const step = entry as {
        requires?: unknown;
        requiresAny?: unknown;
        path?: unknown;
        fallback?: unknown;
      };
      const stepRequires = Array.isArray(step.requires)
        ? step.requires.filter(
            (capabilityId): capabilityId is string => typeof capabilityId === "string",
          )
        : [];
      const stepRequiresAny = Array.isArray(step.requiresAny)
        ? step.requiresAny.filter(
            (capabilityId): capabilityId is string => typeof capabilityId === "string",
          )
        : [];
      if (
        !stepRequires.every((capabilityId) => capabilityId in sessionCaps) ||
        (stepRequiresAny.length > 0 &&
          !stepRequiresAny.some((capabilityId) => capabilityId in sessionCaps))
      ) {
        current = Object.prototype.hasOwnProperty.call(step, "fallback")
          ? evaluateApiResponseTemplate(step.fallback, sessionCaps, pathParams, requestBody)
          : null;
        break;
      }
      current = walkResponsePath(
        current,
        typeof step.path === "string" ? step.path.split(".").filter(Boolean) : [],
      );
    }
    return current;
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value))
    out[key] = evaluateApiResponseTemplate(entry, sessionCaps, pathParams, requestBody);
  return out;
}

export function extractRouteParams(routePath: string, actualPath: string): Record<string, string> {
  const routeSegments = routePath.split("/").filter(Boolean);
  const actualSegments = actualPath.split("/").filter(Boolean);
  if (routeSegments.length !== actualSegments.length) return {};
  const out: Record<string, string> = {};
  routeSegments.forEach((segment, index) => {
    const actual = actualSegments[index] ?? "";
    const colonMatch = /^:([A-Za-z0-9_]+)$/.exec(segment);
    if (colonMatch) {
      out[colonMatch[1]] = decodeURIComponent(actual);
      return;
    }
    const braceMatch = /^\{([A-Za-z0-9_]+)\}$/.exec(segment);
    if (braceMatch) out[braceMatch[1]] = decodeURIComponent(actual);
  });
  return out;
}

export function isHandlerTable(value: unknown): value is HandlerTable {
  return (
    !!value && typeof value === "object" && Array.isArray((value as { routes?: unknown }).routes)
  );
}

export function isRequestHandler(value: unknown): value is {
  handle: (
    req: { method: string; path: string; body?: unknown; headers?: Record<string, string> },
    session: ProjectorSession,
  ) => { status: number; body: unknown; headers: Record<string, string> };
} {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { handle?: unknown }).handle === "function"
  );
}

export function isCliHandler(value: unknown): value is {
  execute: (args: string[], session: ProjectorSession) => { stdout: string; exitCode: number };
} {
  return (
    !!value &&
    typeof value === "object" &&
    typeof (value as { execute?: unknown }).execute === "function"
  );
}

function matchesProjectionSelector(node: ProjectionNode, selector: string): boolean {
  if (selector.startsWith("[data-testid=") && selector.endsWith("]")) {
    const testId = selector.slice("[data-testid=".length, -1);
    return String(node.props["data-testid"] ?? "") === testId;
  }
  if (selector.startsWith("[data-redacted=") && selector.endsWith("]")) {
    const value = selector.slice("[data-redacted=".length, -1);
    return String(node.props["data-redacted"] ?? "") === value;
  }
  return node.nodeId === selector;
}

function substituteSurfaceValue(
  value: unknown,
  pathParams: Record<string, string>,
  requestBody?: unknown,
): unknown {
  if (typeof value === "string")
    return value.replace(
      /\$route\.([A-Za-z0-9_]+)/g,
      (_full, key: string) => pathParams[key] ?? "",
    );
  if (Array.isArray(value))
    return value.map((entry) => substituteSurfaceValue(entry, pathParams, requestBody));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>))
      out[key] = substituteSurfaceValue(entry, pathParams, requestBody);
    return out;
  }
  return value === undefined ? requestBody : value;
}

function walkResponsePath(value: unknown, path: string[]): unknown {
  let current = value;
  for (const segment of path) {
    if (!current || typeof current !== "object" || Array.isArray(current)) return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

function wrongKind(assertion: ProjectionSurfaceAssertion, expected: string): AssertionResult {
  return {
    kind: assertion.kind,
    passed: false,
    expected: `${expected} assertion`,
    actual: `wrong assertion kind for ${assertion.surface}: ${assertion.kind}`,
  };
}

function noTree(
  assertion: Extract<ProjectionSurfaceAssertion, { kind: "projector-node" }>,
): AssertionResult {
  return {
    kind: assertion.kind,
    passed: false,
    expected: `${assertion.selector} present=${String(assertion.present)}`,
    actual: "no projection tree available",
  };
}
