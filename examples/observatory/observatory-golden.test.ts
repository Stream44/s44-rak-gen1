import { afterAll, beforeAll, describe, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { JSDOM } from "jsdom";
import { listGoldenHtmlFiles, runGoldenExport } from "./golden-export.ts";

type SnapshotResult =
    | { status: "OK"; path: string; assertions: number }
    | { status: "FAIL"; path: string; issues: string[] }
    | { status: "ERR"; path: string; issues: string[] };

type SnapshotSignature = {
    debug: boolean;
    empty: boolean;
    rowCounts: number[];
    xrefCount: number;
    treeCount: number;
};

const rootDir = resolve(import.meta.dir, "../..");
const committedDir = resolve(rootDir, "stewardship/observatory-golden");
const themeCssPath = resolve(rootDir, "L08-kinds/ui-html-ws/theme.css");

let tmpDir = "";
let themeCss = "";
let committedFiles: string[] = [];

const cssHas = (pattern: RegExp) => pattern.test(themeCss);
const isDebugSnapshot = (path: string) => path.endsWith(".debug.html");
const isEmptySnapshot = (path: string) => path.includes("empty");
const isCrossRefSnapshot = (path: string) =>
    path.includes("types") ||
    path.includes("morphisms") ||
    path.includes("kernel-populated") ||
    path.includes("meta-populated");
const parseDom = (html: string) => new JSDOM(html);
const readSnapshot = (baseDir: string, relativePath: string) =>
    readFile(resolve(baseDir, relativePath), "utf8");

function inspectSnapshot(
    path: string,
    html: string,
): { assertions: number; issues: string[]; signature: SnapshotSignature } {
    const { window } = parseDom(html);
    const { document } = window;
    const issues: string[] = [];
    let assertions = 0;
    const ok = (condition: boolean, message: string) => {
        if (!condition) issues.push(message);
        else assertions += 1;
    };
    const rowCounts = Array.from(document.querySelectorAll("table tbody")).map(
        (tbody) => tbody.querySelectorAll("tr").length,
    );
    const xrefCount = document.querySelectorAll(
        "[data-xref], .xref-badge, .badge-conforms-to, .badge-referenced-by",
    ).length;
    const treeCount = document.querySelectorAll("[data-tree], [data-reflective-tree]").length;

    ok(!!document.body, "expected body element");
    ok(cssHas(/body\s*\{[^}]*overflow:\s*hidden/s), "expected body overflow: hidden rule");
    ok(!!document.querySelector("#root"), "expected #root element");
    ok(cssHas(/#root\s*\{[^}]*display:\s*(grid|flex)/s), "expected #root display: grid or flex rule");
    ok(
        cssHas(/#root[^{]*\{[^}]*(grid-template-rows:\s*[^;}]*1fr|flex-direction:\s*column)/s),
        "expected #root to cascade viewport height",
    );
    ok(document.querySelectorAll(".tab-panel").length > 0, "expected .tab-panel element");
    ok(
        document.querySelectorAll(".tab-panel > .panel-body").length > 0,
        "expected .tab-panel > .panel-body element",
    );
    ok(
        cssHas(/\.tab-panel\s*>\s*\.panel-body\s*\{[^}]*overflow-y:\s*auto/s),
        "expected .tab-panel > .panel-body overflow-y: auto rule",
    );

    if (isDebugSnapshot(path)) {
        ok(document.body.classList.contains("debug"), 'expected <body class="debug">');
        ok(
            cssHas(/body\.debug[\s\S]*outline:\s*1px dashed/s),
            "expected debug outline: 1px dashed rule",
        );
        ok(
            document.querySelectorAll('[class*="primitive-"]').length > 0,
            "expected primitive debug marker class",
        );
    }

    if (isEmptySnapshot(path)) {
        ok(
            !!document.querySelector(".empty-state, [data-empty-state]"),
            "expected .empty-state present",
        );
        ok(
            document.querySelectorAll("tbody tr").length === 0,
            "expected zero <tr> rows for empty snapshot",
        );
    } else {
        ok(rowCounts.length > 0, "expected at least one populated table");
        for (const count of rowCounts)
            ok(count >= 10, `expected populated table row floor >= 10, got ${count}`);
        if (isCrossRefSnapshot(path)) ok(xrefCount > 0, "expected cross-ref badges present");
    }

    if (path.startsWith("reflective/")) {
        ok(treeCount > 0, "expected reflective tree marker");
    }

    return {
        assertions,
        issues,
        signature: {
            debug: document.body.classList.contains("debug"),
            empty: !!document.querySelector(".empty-state, [data-empty-state]"),
            rowCounts,
            xrefCount,
            treeCount,
        },
    };
}

function compareSnapshots(path: string, committedHtml: string, freshHtml: string): SnapshotResult {
    try {
        const committed = inspectSnapshot(path, committedHtml);
        const fresh = inspectSnapshot(path, freshHtml);
        const issues = [
            ...committed.issues.map((issue) => `committed: ${issue}`),
            ...fresh.issues.map((issue) => `fresh: ${issue}`),
        ];
        if (JSON.stringify(committed.signature) !== JSON.stringify(fresh.signature)) {
            issues.push(
                `semantic signature mismatch: committed=${JSON.stringify(committed.signature)} fresh=${JSON.stringify(fresh.signature)}`,
            );
        }
        if (issues.length > 0) return { status: "FAIL", path, issues };
        return { status: "OK", path, assertions: committed.assertions + fresh.assertions };
    } catch (error) {
        return { status: "ERR", path, issues: [`JSDOM parse error: ${(error as Error).message}`] };
    }
}

function formatResults(results: SnapshotResult[]): string {
    const lines = results.flatMap((result) => {
        if (result.status === "OK")
            return [`[OK]    observatory-golden/${result.path} (${result.assertions} assertions passed)`];
        const head = [`[${result.status}]   observatory-golden/${result.path}`];
        return [...head, ...result.issues.map((issue) => `          - ${issue}`)];
    });
    const ok = results.filter((result) => result.status === "OK").length;
    const fail = results.filter((result) => result.status === "FAIL").length;
    const err = results.filter((result) => result.status === "ERR").length;
    return [...lines, `summary: ok=${ok} fail=${fail} error=${err}`].join("\n");
}

// Goldens live under `stewardship/observatory-golden/` which is generated by
// the steward and may not be present in every environment (e.g. fresh
// checkouts without the stewardship artefacts). When absent, treat the suite
// as a no-op rather than a hard failure so the rest of the test run is green.
const hasCommittedGoldens = existsSync(committedDir);

beforeAll(async () => {
    if (!hasCommittedGoldens) return;
    themeCss = await readFile(themeCssPath, "utf8");
    tmpDir = await mkdtemp(resolve(tmpdir(), "observatory-golden-"));
    await runGoldenExport(rootDir, tmpDir);
    committedFiles = await listGoldenHtmlFiles(rootDir);
});

afterAll(async () => {
    if (tmpDir) await rm(tmpDir, { recursive: true, force: true });
});

describe("observatory golden", () => {
    test("matches committed snapshots semantically", async () => {
        if (!hasCommittedGoldens) {
            console.log(`skipping observatory-golden: ${committedDir} not present`);
            return;
        }
        const results: SnapshotResult[] = [];
        for (const relativePath of committedFiles) {
            const [committedHtml, freshHtml] = await Promise.all([
                readSnapshot(committedDir, relativePath),
                readSnapshot(tmpDir, relativePath),
            ]);
            results.push(compareSnapshots(relativePath, committedHtml, freshHtml));
        }
        const report = formatResults(results);
        console.log(report);
        const failures = results.filter((result) => result.status !== "OK");
        if (failures.length > 0) throw new Error(report);
    });
});
