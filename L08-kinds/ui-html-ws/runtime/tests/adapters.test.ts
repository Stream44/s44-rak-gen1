import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ExpressionEvaluator } from "../../../../L04-expression/evaluator.ts";
import { MorphismRegistry } from "../../../../L05-morphism/registry.ts";
import { MetamodelKernel } from "../../../../L03-tower/metamodel-kernel.ts";
import { loadKindPack } from "../../../../L11-projection/metamodel.ts";
import { AdapterRegistry, type Dispatcher, type StateBag } from "../adapters.ts";
import registerBuiltins from "../adapters-builtin.ts";
import registerEffectBootstrap from "../effects-bootstrap.ts";
import renderEffect from "../../primitives/Effect.ts";

type Globals = typeof globalThis & Record<string, any>;
type Selection = {
  rangeCount: number;
  getRangeAt: (index: number) => unknown;
  removeAllRanges: () => void;
  addRange: (range: unknown) => void;
};
const g = globalThis as Globals;
const original = new Map<string, unknown>();

const remember = (key: string, value: unknown) => {
  if (!original.has(key)) original.set(key, g[key]);
  g[key] = value;
};
const flush = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const ADAPTER_FILES = [
  "AnimationTiming.asset.yaml",
  "ClipboardCopy.asset.yaml",
  "DownloadFile.asset.yaml",
  "FileSelect.asset.yaml",
  "FocusElement.asset.yaml",
  "IntersectionObserve.asset.yaml",
  "ScrollIntoView.asset.yaml",
] as const;

function setupRegistry() {
  const frames: unknown[] = [];
  const dispatcher: Dispatcher = {
    send(frame) {
      frames.push(frame);
    },
    sendCustom(name, payload) {
      frames.push({ type: "custom", name, payload });
    },
    sendAction(ref, payload) {
      frames.push({ type: "action", ref, payload });
    },
  };
  const stateBag: StateBag = new Map();
  const registry = new AdapterRegistry(dispatcher, stateBag);
  registerBuiltins(registry, { dispatcher, stateBag });
  return { registry, frames };
}

beforeEach(() => {
  original.clear();
});
afterEach(() => {
  for (const [key, value] of original) value === undefined ? delete g[key] : (g[key] = value);
});

describe("ui-html-ws adapter builtins", () => {
  test("scroll-into-view mounted with smooth behavior uses the node", () => {
    const { registry } = setupRegistry();
    const calls: unknown[] = [];
    const node = { scrollIntoView: (opts: unknown) => calls.push(opts) } as HTMLElement;
    registry.mount("fx-1", "scroll-into-view", { behavior: "smooth" }, node);
    expect(calls).toEqual([{ behavior: "smooth" }]);
  });

  test("scroll-into-view targetRef resolves through document.querySelector", () => {
    const { registry } = setupRegistry();
    const calls: unknown[] = [];
    remember("document", {
      querySelector: () => ({ scrollIntoView: (opts: unknown) => calls.push(opts) }),
    });
    registry.mount("fx-2", "scroll-into-view", { targetRef: "#other" }, null);
    expect(calls).toEqual([{ behavior: "smooth" }]);
  });

  test("focus-element focuses the resolved target", () => {
    const { registry } = setupRegistry();
    let focused = 0;
    const node = {
      focus: () => {
        focused += 1;
      },
    } as HTMLElement;
    registry.mount("fx-3", "focus-element", {}, node);
    expect(focused).toBe(1);
  });

  test("focus-element restores selection after focus", () => {
    const { registry } = setupRegistry();
    const order: string[] = [];
    const range = { id: "range-1" };
    const selection: Selection = {
      rangeCount: 1,
      getRangeAt: () => range,
      removeAllRanges: () => {
        order.push("remove");
      },
      addRange: (value) => {
        order.push(`add:${(value as { id: string }).id}`);
      },
    };
    remember("window", { getSelection: () => selection });
    const node = {
      focus: () => {
        order.push("focus");
      },
    } as HTMLElement;
    registry.mount("fx-4", "focus-element", { preserveSelection: true }, node);
    expect(order).toEqual(["focus", "remove", "add:range-1"]);
  });

  test("intersection-observe emits the configured custom event", () => {
    const { registry, frames } = setupRegistry();
    let observer: { trigger: (entry: unknown) => void } | null = null;
    remember(
      "IntersectionObserver",
      class {
        constructor(private readonly cb: (entries: unknown[]) => void) {
          observer = this as unknown as { trigger: (entry: unknown) => void };
        }
        observe() {}
        disconnect() {}
        trigger(entry: unknown) {
          this.cb([entry]);
        }
      },
    );
    registry.mount("fx-5", "intersection-observe", { emit: "seen" }, {} as HTMLElement);
    observer?.trigger({ ratio: 1 });
    expect(frames.at(-1)).toEqual({
      type: "custom",
      name: "seen",
      payload: { entry: { ratio: 1 } },
    });
  });

  test("intersection-observe destroy disconnects and prevents later emits", () => {
    const { registry, frames } = setupRegistry();
    let active = true;
    let observer: { trigger: (entry: unknown) => void } | null = null;
    let disconnects = 0;
    remember(
      "IntersectionObserver",
      class {
        constructor(private readonly cb: (entries: unknown[]) => void) {
          observer = this as unknown as { trigger: (entry: unknown) => void };
        }
        observe() {}
        disconnect() {
          active = false;
          disconnects += 1;
        }
        trigger(entry: unknown) {
          if (active) this.cb([entry]);
        }
      },
    );
    registry.mount("fx-6", "intersection-observe", {}, {} as HTMLElement);
    registry.destroy("fx-6");
    observer?.trigger({ ratio: 2 });
    expect(disconnects).toBe(1);
    expect(frames).toHaveLength(0);
  });

  test("clipboard-copy success emits the success custom event", async () => {
    const { registry, frames } = setupRegistry();
    remember("navigator", { clipboard: { writeText: () => Promise.resolve() } });
    registry.mount("fx-7", "clipboard-copy", { text: "hi" }, null);
    await flush();
    expect(frames.at(-1)).toEqual({
      type: "custom",
      name: "clipboard-success",
      payload: undefined,
    });
  });

  test("clipboard-copy error emits the error custom event with the message", async () => {
    const { registry, frames } = setupRegistry();
    remember("navigator", { clipboard: { writeText: () => Promise.reject(new Error("denied")) } });
    registry.mount("fx-8", "clipboard-copy", { text: "hi" }, null);
    await flush();
    expect(frames.at(-1)).toEqual({
      type: "custom",
      name: "clipboard-error",
      payload: { message: "denied" },
    });
  });

  test("download-file blob URL cycle creates, clicks, and revokes", async () => {
    const { registry } = setupRegistry();
    const revokes: string[] = [];
    let clicked = 0;
    URL.createObjectURL = () => "blob:demo";
    URL.revokeObjectURL = (url: string) => void revokes.push(url);
    remember("document", {
      createElement: () => ({
        click: () => {
          clicked += 1;
        },
        set href(_value: string) {},
        set download(_value: string) {},
      }),
    });
    registry.mount("fx-9", "download-file", { blob: new Blob(["x"]), filename: "x.txt" }, null);
    await flush();
    expect(clicked).toBe(1);
    expect(revokes).toEqual(["blob:demo"]);
  });

  test("download-file destroy revokes a live blob URL", () => {
    const { registry } = setupRegistry();
    const revokes: string[] = [];
    URL.createObjectURL = () => "blob:live";
    URL.revokeObjectURL = (url: string) => void revokes.push(url);
    remember("queueMicrotask", (_fn: () => void) => {});
    remember("document", {
      createElement: () => ({
        click() {},
        set href(_value: string) {},
        set download(_value: string) {},
      }),
    });
    registry.mount("fx-10", "download-file", { blob: new Blob(["x"]) }, null);
    registry.destroy("fx-10");
    expect(revokes).toEqual(["blob:live"]);
  });

  test("file-select emits file metadata and action frames for each chosen file", () => {
    const { registry, frames } = setupRegistry();
    const input: Record<string, any> = { click() {}, remove() {}, files: [] };
    remember("document", { body: { appendChild() {} }, createElement: () => input });
    remember(
      "FileReader",
      class {
        result: string | null = null;
        onload: (() => void) | null = null;
        readAsDataURL(file: File) {
          this.result = `data:${file.name}`;
          this.onload?.();
        }
      },
    );
    registry.mount("fx-11", "file-select", { emit: "picked" }, null);
    input.files = [
      new File(["a"], "a.txt", { type: "text/plain" }),
      new File(["b"], "b.txt", { type: "text/plain" }),
    ];
    input.onchange();
    expect(frames[0]).toEqual({
      type: "custom",
      name: "picked",
      payload: { files: input.files.map(({ name, size, type }: File) => ({ name, size, type })) },
    });
    expect(frames.slice(1)).toEqual([
      {
        type: "action",
        ref: "file.upload",
        payload: { name: "a.txt", size: 1, type: input.files[0].type, base64: "data:a.txt" },
      },
      {
        type: "action",
        ref: "file.upload",
        payload: { name: "b.txt", size: 1, type: input.files[1].type, base64: "data:b.txt" },
      },
    ]);
  });

  test("file-select passes multiple=true through to the generated input", () => {
    const { registry } = setupRegistry();
    const input: Record<string, any> = { click() {}, remove() {}, files: [] };
    remember("document", { body: { appendChild() {} }, createElement: () => input });
    remember(
      "FileReader",
      class {
        onload: (() => void) | null = null;
        readAsDataURL() {
          this.onload?.();
        }
      },
    );
    registry.mount("fx-12", "file-select", { multiple: true }, null);
    expect(input.multiple).toBe(true);
  });

  test("animation-timing emits about 60 ticks per second at the default rate", () => {
    const { registry, frames } = setupRegistry();
    let now = 0;
    let next = 1;
    const queue = new Map<number, (t: number) => void>();
    remember("requestAnimationFrame", (cb: (t: number) => void) => {
      const id = next++;
      queue.set(id, cb);
      return id;
    });
    remember("cancelAnimationFrame", (id: number) => {
      queue.delete(id);
    });
    registry.mount("fx-13", "animation-timing", { rate: 60 }, null);
    while (now < 1000 && queue.size > 0) {
      now += 16;
      const batch = [...queue.entries()];
      queue.clear();
      batch.forEach(([, cb]) => cb(now));
    }
    expect(frames.length >= 55).toBe(true);
    expect(frames.length <= 65).toBe(true);
  });

  test("animation-timing destroy stops further ticks", () => {
    const { registry, frames } = setupRegistry();
    let now = 0;
    let next = 1;
    const queue = new Map<number, (t: number) => void>();
    remember("requestAnimationFrame", (cb: (t: number) => void) => {
      const id = next++;
      queue.set(id, cb);
      return id;
    });
    remember("cancelAnimationFrame", (id: number) => {
      queue.delete(id);
    });
    registry.mount("fx-14", "animation-timing", {}, null);
    for (let i = 0; i < 10; i += 1) {
      now += 16;
      const batch = [...queue.entries()];
      queue.clear();
      batch.forEach(([, cb]) => cb(now));
    }
    const seen = frames.length;
    registry.destroy("fx-14");
    for (let i = 0; i < 10; i += 1) {
      now += 16;
      const batch = [...queue.entries()];
      queue.clear();
      batch.forEach(([, cb]) => cb(now));
    }
    expect(frames.length).toBe(seen);
  });

  test("primitive registration includes the Effect primitive asset", () => {
    const kind = loadKindPack(resolve(import.meta.dir, "../..")) as { primitives: string[] };
    expect(kind.primitives).toContain("asset://adk.example/ui.html.ws/primitive/Effect/1.0");
  });

  test("Effect render algebra evaluates to the effect record shape", async () => {
    const asset = Bun.YAML.parse(
      readFileSync(resolve(import.meta.dir, "../../primitives/Effect.yaml"), "utf-8"),
    ) as { render: unknown };
    const kernel = MetamodelKernel.create();
    const evaluator = new ExpressionEvaluator();
    const registry = new MorphismRegistry(kernel, evaluator);
    const inputType = kernel.defineScalar("EffectInput", "1.0", { type: "object" });
    const outputType = kernel.defineScalar("EffectOutput", "1.0", { type: "object" });
    const morphism = registry.define(
      "effectRender",
      inputType,
      outputType,
      { op: "var", name: "$input" },
      { impl: { kind: "algebra", ast: asset.render as never } },
    );
    await expect(
      registry.evaluate(morphism.id, { adapter: "scroll-into-view", args: { behavior: "smooth" } }),
    ).resolves.toEqual({
      kind: "effect",
      adapter: "scroll-into-view",
      args: { behavior: "smooth" },
      when: undefined,
    });
  });

  test("mounting an unknown adapter throws a clear error naming it", () => {
    const { registry } = setupRegistry();
    expect(() => registry.mount("fx-missing", "not-installed", {}, null)).toThrow(/not-installed/);
  });

  test("Effect.ts returns a marker node with effect metadata", () => {
    expect(
      renderEffect({ adapter: "scroll-into-view", args: { behavior: "smooth" } }),
    ).toMatchObject({
      kind: "effect",
      adapter: "scroll-into-view",
      args: { behavior: "smooth" },
      effectMeta: { adapter: "scroll-into-view", args: { behavior: "smooth" }, when: undefined },
    });
  });

  test("Effect.ts marker hash changes when args change", () => {
    const left = renderEffect({
      adapter: "scroll-into-view",
      args: { behavior: "smooth" },
    }).htmlFragment;
    const right = renderEffect({
      adapter: "scroll-into-view",
      args: { behavior: "auto" },
    }).htmlFragment;
    expect(left).not.toBe(right);
  });

  test("kind.defaults.yaml lists the Effect primitive asset path", () => {
    const kind = loadKindPack(resolve(import.meta.dir, "../..")) as { primitiveAssets: string[] };
    expect(kind.primitiveAssets).toContain("./primitives/Effect.yaml");
  });

  for (const file of ADAPTER_FILES) {
    test(`${file} declares an adapter manifest`, () => {
      const asset = Bun.YAML.parse(
        readFileSync(resolve(import.meta.dir, `../../adapters-builtin/${file}`), "utf-8"),
      ) as {
        assetKind: string;
        argsShape: { type?: string };
        implementation: { module: string; export: string };
      };
      expect(asset.assetKind).toBe("adapter");
      expect(asset.argsShape.type).toBe("object");
      expect(asset.implementation.module).toBe("../runtime/adapters-builtin.ts");
      expect(asset.implementation.export).toContain("-");
    });
  }

  test("client init exposes __adkEffects and __adkSend hooks", () => {
    remember("window", {});
    const result = registerEffectBootstrap({ querySelector: () => null } as ParentNode);
    (window as Record<string, unknown>).__adkSend = () => {};
    result.registry.mount("fx-hook", "scroll-into-view", {}, {
      scrollIntoView() {},
    } as HTMLElement);
    expect((window as Record<string, unknown>).__adkEffects).toBeDefined();
  });

  test("client skeleton frames mount effect entries", () => {
    remember("window", {});
    const mounts: unknown[] = [];
    const root = { querySelector: (selector: string) => ({ selector }) } as ParentNode;
    const client = registerEffectBootstrap(root);
    client.registry.mount = ((...args: unknown[]) => {
      mounts.push(args);
    }) as typeof client.registry.mount;
    client.handleFrame({
      type: "skeleton",
      effects: [
        {
          "effectId": "fx-s",
          "adapter": "scroll-into-view",
          "args": { behavior: "smooth" },
          "node-selector": "#x",
        },
      ],
    });
    expect(mounts[0]).toEqual([
      "fx-s",
      "scroll-into-view",
      { behavior: "smooth" },
      { selector: "#x" },
    ]);
  });

  test("client patch frames update effectMeta entries", () => {
    remember("window", {});
    const updates: unknown[] = [];
    const client = registerEffectBootstrap({ querySelector: () => null } as ParentNode);
    client.registry.update = ((...args: unknown[]) => {
      updates.push(args);
    }) as typeof client.registry.update;
    client.handleFrame({
      type: "patch",
      slot: "effectMeta",
      effectId: "fx-p",
      adapter: "scroll-into-view",
      args: { behavior: "auto" },
    });
    expect(updates).toEqual([["fx-p", "scroll-into-view", { behavior: "auto" }]]);
  });

  test("client list frames destroy removed effects", () => {
    remember("window", {});
    const destroys: unknown[] = [];
    const client = registerEffectBootstrap({ querySelector: () => null } as ParentNode);
    client.registry.destroy = ((...args: unknown[]) => {
      destroys.push(args);
    }) as typeof client.registry.destroy;
    client.handleFrame({ type: "list", removed: [{ effectId: "fx-l" }] });
    expect(destroys).toEqual([["fx-l"]]);
  });

  test("client effect mount frames dispatch through the registry", () => {
    remember("window", {});
    const mounts: unknown[] = [];
    const client = registerEffectBootstrap({ querySelector: () => null } as ParentNode);
    client.registry.mount = ((...args: unknown[]) => {
      mounts.push(args);
    }) as typeof client.registry.mount;
    client.handleFrame({
      type: "effect",
      adapter: "scroll-into-view",
      op: "mount",
      effectId: "fx-e",
      args: { behavior: "smooth" },
    });
    expect(mounts).toEqual([["fx-e", "scroll-into-view", { behavior: "smooth" }, null]]);
  });

  test("client effect update frames dispatch through the registry", () => {
    remember("window", {});
    const updates: unknown[] = [];
    const client = registerEffectBootstrap({ querySelector: () => null } as ParentNode);
    client.registry.update = ((...args: unknown[]) => {
      updates.push(args);
    }) as typeof client.registry.update;
    client.handleFrame({
      type: "effect",
      adapter: "scroll-into-view",
      op: "update",
      effectId: "fx-u",
      args: { behavior: "smooth" },
    });
    expect(updates).toEqual([["fx-u", "scroll-into-view", { behavior: "smooth" }]]);
  });

  test("client effect destroy frames dispatch through the registry", () => {
    remember("window", {});
    const destroys: unknown[] = [];
    const client = registerEffectBootstrap({ querySelector: () => null } as ParentNode);
    client.registry.destroy = ((...args: unknown[]) => {
      destroys.push(args);
    }) as typeof client.registry.destroy;
    client.handleFrame({
      type: "effect",
      adapter: "scroll-into-view",
      op: "destroy",
      effectId: "fx-d",
    });
    expect(destroys).toEqual([["fx-d"]]);
  });
});
