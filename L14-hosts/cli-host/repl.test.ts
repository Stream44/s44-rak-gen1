import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { makePackageTmpDir } from "../../L01-foundation/tmp.ts";
import { PassThrough } from "node:stream";
import { AlgebraicKernel } from "../../L13-facade/index.ts";
import { createCliHost } from "./host.ts";
import { runRepl } from "./repl.ts";

const tempDirs: string[] = [];
afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { force: true, recursive: true });
});

describe("runRepl", () => {
  test("prints the banner and echoes a placeholder pipeline line", async () => {
    const { stdout, code } = await scripted(["hello"], { sessions: { "catalogue-read": "s-a" } });
    expect(stdout).toContain("adk repl — :help for commands");
    expect(stdout).toContain("<echo: hello>");
    expect(code).toBe(0);
  });

  test(":sessions prints the seeded session map exactly", async () => {
    const { stdout } = await scripted([":sessions"], { sessions: { "catalogue-read": "s-a" } });
    expect(stdout.split("\n")).toContain("catalogue-read=s-a");
  });

  test(":use with a valid projection changes activeProjection for the next dispatch", async () => {
    const kernel = AlgebraicKernel.create(),
      seen: unknown[] = [];
    const host = await boot(kernel);
    kernel.morphisms.evaluate = (async (id, input, context) => {
      seen.push({ id, input, context });
      return id.includes("cliReplLinePipeline")
        ? { stdout: "ok", stderr: "", exitCode: null }
        : { ok: true };
    }) as never;
    await scripted([":use orders", "go"], {}, host);
    expect(
      seen.find((call) => (call as { id: string }).id.includes("cliReplLinePipeline")),
    ).toMatchObject({ input: expect.objectContaining({ activeProjection: "orders" }) });
  });

  test(":use with an unknown projection prints a diagnostic and keeps state unchanged", async () => {
    const kernel = AlgebraicKernel.create(),
      seen: unknown[] = [];
    const host = await boot(kernel);
    kernel.morphisms.evaluate = (async (id, input, context) => {
      seen.push({ id, input, context });
      return id.includes("cliReplLinePipeline")
        ? { stdout: "ok", stderr: "", exitCode: null }
        : { ok: true };
    }) as never;
    const { stderr } = await scripted([":use nope", "go"], {}, host);
    expect(stderr).toContain("unknown projection: nope");
    expect(
      seen.find((call) => (call as { id: string }).id.includes("cliReplLinePipeline")),
    ).toMatchObject({ input: expect.objectContaining({ activeProjection: "catalogue" }) });
  });

  test("EOF exits with code 0", async () => {
    expect((await scripted([], {})).code).toBe(0);
  });

  test(":logout <scope> dispatches logoutSession and removes the scope", async () => {
    const kernel = AlgebraicKernel.create(),
      seen: unknown[] = [];
    const host = await boot(kernel);
    kernel.morphisms.evaluate = (async (id, input) => (
      seen.push({ id, input }),
      id.includes("logoutSession") ? { ok: true } : { stdout: "ok", stderr: "", exitCode: null }
    )) as never;
    const { stdout } = await scripted(
      [":logout catalogue-read", ":sessions"],
      { sessions: { "catalogue-read": "s-a" } },
      host,
    );
    expect(
      seen.find((call) => (call as { id: string }).id.includes("logoutSession")),
    ).toMatchObject({ input: { sessionId: "s-a", scope: "catalogue-read" } });
    expect(stdout.split("\n").filter((line) => line === "catalogue-read=s-a")).toHaveLength(0);
  });

  test("pipeline newSessions merge original entries and last-wins collisions", async () => {
    const kernel = AlgebraicKernel.create(),
      host = await boot(kernel);
    kernel.morphisms.evaluate = (async (id) =>
      id.includes("cliReplLinePipeline")
        ? {
            stdout: "merged",
            stderr: "",
            exitCode: null,
            newSessions: { "catalogue-read": "s-z", "orders-write": "s-b" },
          }
        : { ok: true }) as never;
    const { stdout } = await scripted(
      ["merge", ":sessions"],
      { sessions: { "catalogue-read": "s-a" } },
      host,
    );
    expect(stdout).toContain("catalogue-read=s-z");
    expect(stdout).toContain("orders-write=s-b");
  });

  test(":logout-all dispatches once per session and clears the map", async () => {
    const kernel = AlgebraicKernel.create(),
      seen: unknown[] = [];
    const host = await boot(kernel);
    kernel.morphisms.evaluate = (async (id, input) => (
      seen.push({ id, input }),
      id.includes("logoutSession") ? { ok: true } : { stdout: "ok", stderr: "", exitCode: null }
    )) as never;
    const { stdout } = await scripted(
      [":logout-all", ":sessions"],
      { sessions: { "catalogue-read": "s-a", "orders-write": "s-b" } },
      host,
    );
    expect(
      seen.filter((call) => (call as { id: string }).id.includes("logoutSession")),
    ).toHaveLength(2);
    expect(stdout).not.toContain("catalogue-read=s-a");
    expect(stdout).not.toContain("orders-write=s-b");
  });

  test("repl.ts stays within 60 lines and contains the session map type", () => {
    const source = readFileSync(resolve(import.meta.dir, "repl.ts"), "utf-8");
    expect(source.split("\n").length).toBeLessThanOrEqual(60);
    expect(source).toContain("Map<string, string>");
  });

  test("repl.ts references the REPL and logout morphism URIs", async () => {
    expect(
      Number(
        (
          await Bun.$`grep -c "morphism://github.com/Stream44/s44-rak-gen1@1.0/cliReplLinePipeline/1.0" ${resolve(import.meta.dir, "repl.ts")}`.text()
        ).trim(),
      ),
    ).toBeGreaterThanOrEqual(1);
    expect(
      Number(
        (
          await Bun.$`grep -c "morphism://github.com/Stream44/s44-rak-gen1@1.0/logoutSession/1.0" ${resolve(import.meta.dir, "repl.ts")}`.text()
        ).trim(),
      ),
    ).toBeGreaterThanOrEqual(1);
  });
});

async function scripted(
  lines: string[],
  opts: { sessions?: Record<string, string> } = {},
  existing?: Awaited<ReturnType<typeof createCliHost>>,
) {
  const host = existing ?? (await boot()),
    input = new PassThrough(),
    output = new PassThrough(),
    error = new PassThrough();
  let stdout = "",
    stderr = "";
  output.on("data", (chunk) => (stdout += chunk.toString()));
  error.on("data", (chunk) => (stderr += chunk.toString()));
  Object.assign(host as object, { input, output, error });
  const run = runRepl(host, opts);
  input.end(lines.join("\n"));
  return { code: await run, stdout, stderr, host };
}

async function boot(kernel = AlgebraicKernel.create()) {
  const dir = makePackageTmpDir("cli-repl-");
  tempDirs.push(dir);
  const a = join(dir, "catalogue.yaml"),
    b = join(dir, "orders.yaml");
  writeFileSync(a, projectionYaml("catalogue", "catalogue-read"));
  writeFileSync(b, projectionYaml("orders", "orders-write"));
  return createCliHost({
    kernel,
    projections: [
      { name: "catalogue", projectorPath: a, bindsModelPath: "" },
      { name: "orders", projectorPath: b, bindsModelPath: "" },
    ],
  });
}

function projectionYaml(name: string, scope: string) {
  return `projector: ${name}\nversion: 1.0.0\nsession:\n  scope: ${scope}\nbindsModel: ""\npages:\n  index:\n    children: []\n`;
}
