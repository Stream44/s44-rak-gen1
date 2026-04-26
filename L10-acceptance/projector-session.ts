import type { ModelBoot } from "../L09-demand/model-loader.ts";
import { ProjectionKernel } from "../L11-projection/projection-kernel.ts";
import type { ProjectionModel, ProjectionTree } from "../L01-foundation/projection-types.ts";
import {
  evaluateApiResponseTemplate,
  extractRouteParams,
  findProjectionNode,
  getSurfaceHandlerSet,
  isCliHandler,
  isHandlerTable,
  isRequestHandler,
} from "./surface-evaluators.ts";

export interface ProjectorSessionOptions {
  kernel: ProjectionKernel;
  projection: ProjectionModel;
  surface: "ui.html.ws" | "api.rest" | "cli.stdout";
  sessionCaps: Record<string, string>;
}

type HttpRequest = {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
};

type HttpResponse = {
  status: number;
  body: unknown;
  headers: Record<string, string>;
};

export class ProjectorSession {
  readonly kernel: ProjectionKernel;
  readonly projection: ProjectionModel;
  readonly surface: "ui.html.ws" | "api.rest" | "cli.stdout";
  sessionCaps: Record<string, string>;

  private tree: ProjectionTree | null = null;
  private handlers: unknown = null;
  private cliOutput = "";
  private cliExitCode = 0;

  constructor(opts: ProjectorSessionOptions) {
    this.kernel = opts.kernel;
    this.projection = opts.projection;
    this.surface = opts.surface;
    this.sessionCaps = opts.sessionCaps;
    this.applySessionCaps();
    this.refresh();
  }

  /**
   * UI surfaces dispatch by DOM-like selector.
   * The rendered tree is the source of truth for action bindings.
   */
  async click(selector: string): Promise<void> {
    const tree = this.currentTree();
    if (!tree) return;
    const handler = this.findActionHandler(tree, selector);
    if (!handler) return;
    await this.kernel.dispatch({
      actionRef: handler.binding.action,
      target: typeof handler.binding.target === "string" ? handler.binding.target : undefined,
      payload: handler.binding.payload,
      origin: { kind: "ui.html.ws", source: { selector } },
    });
    this.refresh();
  }

  /**
   * Forms follow the same binding path as click(),
   * but merge submitted values into the bound payload.
   */
  async submitForm(selector: string, values: Record<string, unknown>): Promise<void> {
    if (this.surface !== "ui.html.ws") return;
    const tree = this.currentTree();
    if (!tree) return;
    const handler = this.findActionHandler(tree, selector);
    if (!handler) return;
    await this.kernel.dispatch({
      actionRef: handler.binding.action,
      target: typeof handler.binding.target === "string" ? handler.binding.target : undefined,
      payload: { ...(handler.binding.payload ?? {}), ...values },
      origin: { kind: "ui.html.ws", source: { selector } },
    });
    this.refresh();
  }

  /**
   * Acceptance waits are synchronous today;
   * the predicate still sees the latest rendered tree.
   */
  awaitUpdate(predicate: (tree: ProjectionTree) => boolean, _timeout?: number): void {
    const tree = this.currentTree();
    if (tree) predicate(tree);
  }

  /**
   * HTTP surfaces decode the request through the registered handler set,
   * dispatch through the projection kernel, then re-encode the response.
   */
  async requestHttp(req: HttpRequest): Promise<HttpResponse> {
    const handlerSet = getSurfaceHandlerSet("api.rest");
    const handlers = this.currentApiHandlers(handlerSet);
    if (isRequestHandler(handlers)) return await handlers.handle(req, this);
    if (!handlerSet?.decodeRequest || !isHandlerTable(handlers)) {
      return {
        status: 500,
        body: { error: "no_handler_table" },
        headers: { "content-type": "application/json" },
      };
    }
    const decoded = handlerSet.decodeRequest(
      { method: req.method, path: req.path, body: req.body, headers: req.headers ?? {} },
      handlers,
      this.sessionCaps,
    );
    if (!decoded || typeof decoded !== "object") {
      return {
        status: 500,
        body: { error: "invalid_handler_decode" },
        headers: { "content-type": "application/json" },
      };
    }
    if ("status" in decoded) return decoded as HttpResponse;
    const entry = (
      decoded as { entry: { actionRef?: string; path: string; paramMapping: { read?: unknown } } }
    ).entry;
    const frame = (decoded as { frame: Record<string, unknown> }).frame;
    const pathParams = extractRouteParams(entry.path, req.path);
    const responseOverlay = evaluateApiResponseTemplate(
      entry.paramMapping.read,
      this.sessionCaps,
      pathParams,
      req.body,
    );
    if (!entry.actionRef) {
      return {
        status: 200,
        body: responseOverlay ?? null,
        headers: { "content-type": "application/json" },
      };
    }
    const dispatchResult = await this.kernel.dispatch({
      ...(frame as Parameters<ProjectionKernel["dispatch"]>[0]),
      capabilityId: undefined,
    });
    this.refresh();
    const target = typeof frame.target === "string" ? frame.target : undefined;
    const baseBody = dispatchResult.success
      ? (dispatchResult.intentResult?.newState ?? dispatchResult.payload ?? null)
      : dispatchResult.error === "No matching transition"
        ? this.currentModelState(target)
        : null;
    if (!dispatchResult.success && dispatchResult.error !== "No matching transition") {
      return handlerSet.encodeError
        ? (handlerSet.encodeError(
            { status: 500, message: dispatchResult.error ?? "dispatch_failed" },
            entry,
          ) as HttpResponse)
        : {
            status: 500,
            body: { error: dispatchResult.error ?? "dispatch_failed" },
            headers: { "content-type": "application/json" },
          };
    }
    const body =
      responseOverlay && typeof responseOverlay === "object" && !Array.isArray(responseOverlay)
        ? {
            ...(baseBody && typeof baseBody === "object" && !Array.isArray(baseBody)
              ? baseBody
              : {}),
            ...responseOverlay,
          }
        : (responseOverlay ?? baseBody);
    return handlerSet.encodeSuccess
      ? (handlerSet.encodeSuccess(body, entry) as HttpResponse)
      : { status: 200, body, headers: { "content-type": "application/json" } };
  }

  /**
   * CLI surfaces can either expose an imperative handler
   * or render from the registered surface handler set.
   */
  typeCommand(args: string[]): { stdout: string; exitCode: number } {
    if (this.surface !== "cli.stdout") return { stdout: "", exitCode: 0 };
    const handlers = this.currentHandlers();
    if (isCliHandler(handlers)) {
      const result = handlers.execute(args, this);
      this.cliOutput = result.stdout;
      this.cliExitCode = result.exitCode;
      return result;
    }
    this.refresh();
    return { stdout: this.cliOutput, exitCode: this.cliExitCode };
  }

  /**
   * Session capability changes are mirrored into the projection session
   * so downstream kind handlers can read the latest authorization context.
   */
  currentTree(): ProjectionTree | null {
    return this.tree;
  }

  currentHandlers(): unknown {
    return this.handlers;
  }

  lastCliOutput(): string {
    return this.cliOutput;
  }

  lastCliExitCode(): number {
    return this.cliExitCode;
  }

  setSessionCaps(sessionCaps: Record<string, string>): void {
    this.sessionCaps = sessionCaps;
    this.applySessionCaps();
    this.refresh();
  }

  /**
   * Refresh renders the current page and lets the active surface,
   * if any, compute handlers and materialized CLI output.
   */
  private refresh(): void {
    const pageName = this.resolvePageName();
    this.tree = this.kernel.render(pageName);
    const handlerSet = getSurfaceHandlerSet(this.surface);
    this.handlers = handlerSet?.computeHandlers
      ? handlerSet.computeHandlers(this.tree, this.projection)
      : null;
    if (handlerSet?.renderCli && this.surface === "cli.stdout") {
      const output = handlerSet.renderCli(this.tree, this.projection, this, pageName);
      this.cliOutput = output.stdout;
      this.cliExitCode = output.exitCode;
    }
  }

  /**
   * The kernel session stores the surface capability map under currentUser,
   * matching the existing acceptance-session contract.
   */
  private applySessionCaps(): void {
    this.kernel.setSession({
      currentUser: {
        ...this.kernel.getSession().currentUser,
        capabilities: this.sessionCaps,
      },
    });
  }

  private currentApiHandlers(handlerSet = getSurfaceHandlerSet(this.surface)): unknown {
    if (isHandlerTable(this.handlers) || isRequestHandler(this.handlers)) return this.handlers;
    const tree = this.currentTree();
    return tree && handlerSet?.computeHandlers
      ? handlerSet.computeHandlers(tree, this.projection)
      : null;
  }

  /**
   * Acceptance prefers the kernel default page when available
   * and otherwise falls back to the first declared page key.
   */
  private resolvePageName(): string {
    try {
      return this.kernel.defaultPageName() ?? "";
    } catch {
      return Object.keys(this.projection.pages ?? {})[0] ?? "";
    }
  }

  /**
   * Selector lookup supports both explicit action selectors
   * and node-id lookup through the rendered projection tree.
   */
  private findActionHandler(
    tree: ProjectionTree,
    selector: string,
  ): ProjectionTree["actionHandlers"][number] | undefined {
    if (selector.startsWith("[data-action=") && selector.endsWith("]")) {
      const action = selector.slice("[data-action=".length, -1);
      return tree.actionHandlers.find((entry) => entry.binding.action === action);
    }
    const node = findProjectionNode(tree.root, selector);
    return node?.nodeId
      ? tree.actionHandlers.find((entry) => entry.nodeId === node.nodeId)
      : undefined;
  }

  /**
   * API surfaces use the backing app state when a transition
   * rejects with the "no matching transition" sentinel.
   */
  private currentModelState(targetKey?: string): unknown {
    if (!targetKey) return null;
    const maybeKernel = this.kernel as unknown as { app?: ModelBoot | null };
    return maybeKernel.app?.getState(targetKey) ?? null;
  }
}
