import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bootNode } from "./boot-node.ts";

async function withTmpDir(run: (dir: string) => Promise<void> | void): Promise<void> {
  const dir = mkdtempSync(join(tmpdir(), "observatory-persistence-"));
  try {
    await run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const MODEL_YAML = `model: persisted
version: 1.0.0
origin: "https://github.com/Stream44/s44-rak-gen1@1.0/tests/persisted"
entities:
  PersistedRecord:
    attributes:
      id:
        type: string
      status:
        type: string
actions:
  FlushPersisted:
    verb: flush
    kind: mutate
    targetMachine: null
    inputSchema:
      type: object
      required: [id]
      properties:
        id:
          type: string
lifecycle:
  states: [idle, flushed]
  initial: idle
  terminal: [flushed]
  transitions:
    - from: idle
      to: flushed
      verb: flush
`;

test("bootNode hydrates persisted filesystem state from sds.yaml wiring", async () => {
  await withTmpDir(async (dir) => {
    writeFileSync(join(dir, "persisted.model.yaml"), MODEL_YAML, "utf8");
    writeFileSync(
      join(dir, "sds.yaml"),
      `name: persisted-node
version: 1.0.0
origin: "https://github.com/Stream44/s44-rak-gen1@1.0/tests/persisted-node"
persistence:
  kind: filesystem
  debounceMs: 0
models:
  - path: ./persisted.model.yaml
    initialBinding: true
`,
      "utf8",
    );

    const runtime = bootNode(dir);
    runtime.app.setState("a", { foo: 1 });
    await runtime.app.submit("flush", "flush-key", { id: "flush-key" });
    runtime.dispose();

    const rebooted = bootNode(dir);
    expect(rebooted.app.getState("a")).toEqual({ foo: 1 });
    rebooted.dispose();
  });
});

test("bootNode throws for unknown persistence kinds", () => {
  return withTmpDir((dir) => {
    writeFileSync(join(dir, "persisted.model.yaml"), MODEL_YAML, "utf8");
    writeFileSync(
      join(dir, "sds.yaml"),
      `name: bad-persistence-node
version: 1.0.0
origin: "https://github.com/Stream44/s44-rak-gen1@1.0/tests/bad-persistence-node"
persistence:
  kind: sqlite
models:
  - path: ./persisted.model.yaml
    initialBinding: true
`,
      "utf8",
    );

    expect(() => bootNode(dir)).toThrow("Unknown persistence kind: sqlite. Supported: filesystem.");
  });
});
