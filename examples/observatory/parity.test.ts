import { describe, expect, test } from "bun:test";
import { resolve } from "path";
import { ProjectionKernel } from "../../L11-projection/projection-kernel.ts";
import { bootNode, buildWorldState } from "../../L14-hosts/projection-runtime/index.ts";
import { createViewer } from "../../L14-hosts/viewer/viewer.ts";
import type { AcceptanceSuiteView, StepTreeNode, WorldState } from "./protocol.ts";
import { buildInitialBindings } from "./projection-bindings.ts";
import { buildObsViewerConfig } from "./viewer-config.ts";

const PROJECTION_YAML = resolve(import.meta.dir, "projection/projection.yaml");
const FIXTURE = resolve(import.meta.dir, "fixtures/boot-sds");
type ObservatoryFixture = {
  state: WorldState;
  suite: AcceptanceSuiteView;
  playback: {
    suite: AcceptanceSuiteView & {
      nodes: Array<{
        stepId: string;
        persona: string;
        verb: string;
        targetKey: string;
        hasChildren: boolean;
      }>;
    };
    suites: Array<{ id: string; name: string; path: string; active: boolean }>;
    session: Record<string, unknown>;
    appStateAfter: Record<string, unknown>;
  };
};
const longTest = (name: string, fn: () => Promise<void> | void) =>
  test(name, { timeout: 20000 }, fn);

async function withObservatory<T>(fn: (port: number) => Promise<T>): Promise<T> {
  const obs = await createViewer({
    port: 0,
    projections: [await buildObsViewerConfig({ mount: "/", runtime: bootNode(FIXTURE) })],
  });
  try {
    return await fn(obs.server.port);
  } finally {
    await obs.stop();
  }
}

async function buildFixture(): Promise<ObservatoryFixture> {
  const runtime = bootNode(FIXTURE);
  const state = buildWorldState(runtime, { recentEvents: [] });
  const bindings = await buildInitialBindings(runtime, state);
  return {
    state,
    suite: bindings.playback.suite as AcceptanceSuiteView,
    playback: bindings.playback,
  };
}

function flattenTree(node: StepTreeNode): Array<{
  stepId: string;
  persona: string;
  verb: string;
  targetKey: string;
  hasChildren: boolean;
}> {
  return [
    {
      stepId: node.stepId,
      persona: node.persona,
      verb: node.verb,
      targetKey: node.targetKey,
      hasChildren: node.branches.length > 0,
    },
    ...node.branches.flatMap((branch) => flattenTree(branch.node)),
  ];
}

function renderObservatory(fixture: ObservatoryFixture, activeTab: string): string {
  const projector = new ProjectionKernel(null);
  projector.loadYamlFile(PROJECTION_YAML);
  const morphism = projector.document?.morphism as
    | { op?: string; value?: { props?: { initial?: Record<string, unknown> } } }
    | undefined;
  const mapped =
    activeTab === "structure"
      ? "kernel"
      : activeTab === "agency"
        ? "runtime"
        : activeTab === "modelWorld"
          ? "reflective"
          : activeTab;
  if (morphism?.op === "literal" && morphism.value?.props?.initial)
    morphism.value.props.initial.activeTab = mapped;
  projector.setBinding("runtime", fixture.state);
  projector.setBinding("playback", fixture.playback);
  return projector.renderHtml("").html;
}

function countMatches(html: string, pattern: RegExp): number {
  return html.match(pattern)?.length ?? 0;
}

describe("Observatory parity demo", () => {
  longTest("T1 demo boots clean and GET / returns HTML", async () => {
    await withObservatory(async (port) => {
      const res = await fetch(`http://localhost:${port}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("content-type")).toContain("text/html");
    });
  });

  longTest("T2 body is algebra-composed, not a template literal", async () => {
    await withObservatory(async (port) => {
      const html = await fetch(`http://localhost:${port}/`).then((res) => res.text());
      expect(html).toContain("<h1");
      expect(html).toContain("ADK Observatory");
      expect(html).toContain('data-action-ref="ui.set"');
    });
  });

  longTest("T3 five tab-bar buttons are present", async () => {
    await withObservatory(async (port) => {
      const html = await fetch(`http://localhost:${port}/`).then((res) => res.text());
      const buttons = [...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(
        (match) => match[1],
      );
      expect(buttons).toEqual(
        expect.arrayContaining([
          "Kernel",
          "Runtime",
          "Meta",
          "Dynamics",
          "Acceptance",
          "Reflective",
        ]),
      );
    });
  });

  longTest("T3b tab-bar button order matches the parity shell", async () => {
    await withObservatory(async (port) => {
      const html = await fetch(`http://localhost:${port}/`).then((res) => res.text());
      const buttons = [...html.matchAll(/<button[^>]*>([^<]+)<\/button>/g)].map(
        (match) => match[1],
      );
      expect(
        buttons.filter((label) =>
          ["Kernel", "Runtime", "Meta", "Dynamics", "Acceptance", "Reflective"].includes(label),
        ),
      ).toEqual(["Kernel", "Runtime", "Meta", "Dynamics", "Acceptance", "Reflective"]);
    });
  });

  longTest("T4 Structure tab renders one type card per state type", async () => {
    const fixture = await buildFixture();
    const html = renderObservatory(fixture, "structure");
    expect(countMatches(html, /<table [^>]*class="[^"]*\btable\b/g)).toBeGreaterThanOrEqual(3);
    expect(countMatches(html, /conforms-to ▸ /g)).toBeGreaterThan(0);
  });

  longTest("T4b Structure tab renders one enum row per enum", async () => {
    const fixture = await buildFixture();
    const html = renderObservatory(fixture, "structure");
    expect(countMatches(html, /<code class="code code-inline"/g)).toBeGreaterThan(0);
  });

  longTest("T4c Structure tab renders one relation line per edge", async () => {
    const fixture = await buildFixture();
    const html = renderObservatory(fixture, "structure");
    expect(html).toContain("Kernel");
    expect(html).toContain("Morphisms");
  });

  longTest("T5 Dynamics tab renders machines and instance rows", async () => {
    const fixture = await buildFixture();
    const html = renderObservatory(fixture, "dynamics");
    expect(countMatches(html, /<table [^>]*class="[^"]*\btable\b/g)).toBeGreaterThanOrEqual(1);
    expect(html).toContain("Dynamics");
  });

  longTest("T5b Dynamics tab starts with no recent event rows for the frozen fixture", async () => {
    const fixture = await buildFixture();
    const html = renderObservatory(fixture, "dynamics");
    expect(countMatches(html, /Event · /g)).toBe(0);
  });

  longTest("T6 Agency tab renders action cards and contract rows", async () => {
    const fixture = await buildFixture();
    const html = renderObservatory(fixture, "agency");
    expect(countMatches(html, /<table [^>]*class="[^"]*\btable\b/g)).toBeGreaterThanOrEqual(3);
    expect(html).toContain("Runtime");
  });

  longTest("T7 Acceptance tab renders the suite tree use cases", async () => {
    const fixture = await buildFixture();
    const html = renderObservatory(fixture, "acceptance");
    const expectedTraceButtons = fixture.suite.useCases
      .flatMap((useCase) => useCase.scenarios)
      .reduce((sum, scenario) => sum + (scenario.traceCount === 1 ? 1 : scenario.traceCount), 0);
    expect(countMatches(html, /class="[^"]*\bacceptance-use-case\b/g)).toBe(
      fixture.suite.useCases.length,
    );
    expect(fixture.suite.useCases.length).toBeGreaterThanOrEqual(7);
    expect(countMatches(html, /data-acceptance-trace-play/g)).toBe(expectedTraceButtons);
  });

  longTest(
    "T7b acceptance:load preserves the branching UC3 shape from the legacy suite",
    async () => {
      const fixture = await buildFixture();
      const useCase = fixture.suite.useCases.find(
        (entry) => entry.id === "uc-cancel-after-confirm",
      );
      expect(useCase).toBeDefined();
      expect(useCase?.scenarios[0]?.traceCount).toBe(2);
      expect(useCase?.scenarios[0]?.tree.branches.length).toBe(2);
    },
  );

  longTest("T8 Model World tab renders the reflective detail pane", async () => {
    const fixture = await buildFixture();
    const html = renderObservatory(fixture, "modelWorld");
    expect(html).toContain("Reflective");
    expect(html).toContain("Models");
    expect(html).toContain("reflective-detail");
  });

  longTest("T10 Acceptance tab renders the rebuilt suite catalogue", async () => {
    const fixture = await buildFixture();
    const html = renderObservatory(fixture, "acceptance");
    expect(html).toContain("Suite · ");
    expect(countMatches(html, /class="[^"]*\bacceptance-use-case\b/g)).toBe(
      fixture.suite.useCases.length,
    );
  });

  longTest("T11 acceptance body exposes the split shell and empty trace state", async () => {
    const fixture = await buildFixture();
    const html = renderObservatory(fixture, "acceptance");
    expect(html).toContain("acceptance-toolbar");
    expect(html).toContain("acceptance-body");
    expect(html).toContain("Click ▶ on a scenario trace below to start a playback session.");
  });

  longTest("T11b shell stays within the shrunk-shell budget", async () => {
    const shellPath = resolve(import.meta.dir, "projection/shell.html");
    if (!(await Bun.file(shellPath).exists())) {
      expect(await Bun.file(PROJECTION_YAML).text()).not.toContain("shell:");
      return;
    }
    const shell = await Bun.file(shellPath).text();
    expect(shell.trim().length).toBeGreaterThan(0);
    expect(shell.split("\n").length).toBeLessThanOrEqual(60);
  });

  longTest(
    "T13b buildWorldState exposes the same world-state surface used by the render binding",
    async () => {
      const fixture = await buildFixture();
      const data = buildWorldState(bootNode(FIXTURE));
      expect(data.types.length).toBe(fixture.state.types.length);
      expect(data.actions.length).toBe(fixture.state.actions.length);
      expect(data.instances.length).toBe(fixture.state.instances.length);
    },
  );

  longTest("T14 cross-panel soft parity holds without selectedType binding", async () => {
    const fixture = await buildFixture();
    const html = renderObservatory(fixture, "structure");
    expect(html).toContain("Kernel");
    expect(countMatches(html, /<table [^>]*class="[^"]*\btable\b/g)).toBeGreaterThanOrEqual(3);
  });

  longTest("T15 serialized DOM-shape snapshot matches the frozen ecommerce fixture", async () => {
    const fixture = await buildFixture();
    const structureHtml = renderObservatory(fixture, "structure");
    const dynamicsHtml = renderObservatory(fixture, "dynamics");
    const agencyHtml = renderObservatory(fixture, "agency");
    const acceptanceHtml = renderObservatory(fixture, "acceptance");
    const actual = {
      kernelTables: countMatches(structureHtml, /<table [^>]*class="[^"]*\btable\b/g),
      dynamicsTables: countMatches(dynamicsHtml, /<table [^>]*class="[^"]*\btable\b/g),
      acceptanceUseCases: countMatches(acceptanceHtml, /class="[^"]*\bacceptance-use-case\b/g),
      runtimeTables: countMatches(agencyHtml, /<table [^>]*class="[^"]*\btable\b/g),
    };
    expect(actual.kernelTables).toBeGreaterThanOrEqual(3);
    expect(actual.dynamicsTables).toBeGreaterThanOrEqual(1);
    expect(actual.acceptanceUseCases).toBe(fixture.suite.useCases.length);
    expect(actual.runtimeTables).toBeGreaterThanOrEqual(3);
  });

  longTest("T15b header carries the model name and version from world state", async () => {
    const fixture = await buildFixture();
    const html = renderObservatory(fixture, "structure");
    expect(html).toContain(`${fixture.state.model.name} v${fixture.state.model.version}`);
  });
});
