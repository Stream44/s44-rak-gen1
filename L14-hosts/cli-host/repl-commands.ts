import type { AlgebraicKernel } from "../../L13-facade/index.ts";
import type { ProjectionModel } from "../../L01-foundation/projection-types.ts";
import type { CliHostProjectionBinding } from "./host.ts";
import { LOGOUT_MORPHISM, REPL_LINE_MORPHISM } from "./repl.ts";

const HELP_TEXT =
  ":help\n:session <id>\n:sessions\n:use <name>\n:logout <scope?>\n:logout-all\n:quit\n:exit\n";

export interface ReplState {
  kernel: AlgebraicKernel;
  projections: Array<CliHostProjectionBinding & { projection: ProjectionModel }>;
  sessions: Map<string, string>;
  output: NodeJS.WritableStream;
  error: NodeJS.WritableStream;
  activeProjection: string | null;
}

export interface ReplLineResult {
  stdout?: string;
  stderr?: string;
  exitCode?: number;
  newSessions?: Record<string, string>;
  activeProjectionChange?: string;
}

const scopeFor = (state: ReplState): string | string[] | undefined =>
  state.projections.find((p) => p.name === state.activeProjection)?.projection.session.scope;

const firstScope = (scope: string | string[] | undefined): string | undefined =>
  Array.isArray(scope) ? scope[0] : scope;

async function logout(
  state: ReplState,
  scope: string | null,
  sessionId: string | null,
): Promise<void> {
  await state.kernel.morphisms.evaluate(
    LOGOUT_MORPHISM,
    { sessionId, scope },
    { store: null, jwtVerifier: null },
  );
}

export async function handleColonCommand(
  state: ReplState,
  line: string,
): Promise<{ exitCode?: number } | null> {
  if (line === ":help") {
    state.output.write(HELP_TEXT);
    return {};
  }
  if (line === ":sessions") {
    const entries = Array.from(state.sessions.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("\n");
    state.output.write(`${entries}\n`);
    return {};
  }
  if (line === ":quit" || line === ":exit") return { exitCode: 0 };
  if (line.startsWith(":use ")) {
    const name = line.slice(5).trim();
    if (state.projections.some((p) => p.name === name)) state.activeProjection = name;
    else state.error.write(`unknown projection: ${name}\n`);
    return {};
  }
  if (line.startsWith(":session ")) {
    const sessionId = line.slice(9).trim();
    const first = firstScope(scopeFor(state));
    if (sessionId && first) state.sessions.set(first, sessionId);
    return {};
  }
  if (line === ":logout-all") {
    for (const [scope, sessionId] of state.sessions) await logout(state, scope, sessionId);
    state.sessions.clear();
    return {};
  }
  if (line.startsWith(":logout")) {
    const explicit = line.slice(7).trim();
    const scope = explicit || firstScope(scopeFor(state)) || null;
    const sessionId = scope ? (state.sessions.get(scope) ?? null) : null;
    await logout(state, scope, sessionId);
    if (scope) state.sessions.delete(scope);
    return {};
  }
  return null;
}

export async function evaluateReplLine(state: ReplState, line: string): Promise<ReplLineResult> {
  return (await state.kernel.morphisms.evaluate(
    REPL_LINE_MORPHISM,
    {
      line,
      activeProjection: state.activeProjection,
      sessions: Object.fromEntries(state.sessions),
      projections: state.projections,
    },
    { store: null, jwtVerifier: null },
  )) as ReplLineResult;
}

export function applyReplResult(state: ReplState, result: ReplLineResult): number | null {
  if (result.stdout) state.output.write(`${result.stdout}\n`);
  if (result.stderr) state.error.write(`${result.stderr}\n`);
  if (result.newSessions)
    for (const [k, v] of Object.entries(result.newSessions)) state.sessions.set(k, v);
  if (result.activeProjectionChange) state.activeProjection = result.activeProjectionChange;
  return typeof result.exitCode === "number" ? result.exitCode : null;
}
