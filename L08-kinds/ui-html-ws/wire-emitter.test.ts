import { describe, expect, test } from "bun:test";

import { SchemaValidator } from "../../L01-foundation/validator.ts";
import type { Morphism } from "../../L05-morphism/registry.ts";
import type { Slot, SplitArtefact } from "./split-pass.ts";
import { WireFrameEmitter } from "./wire-emitter.ts";
import {
  CLIENT_FRAME_SCHEMA,
  SERVER_FRAME_SCHEMA,
  isClientFrame,
  isServerFrame,
} from "./wire-protocol.ts";

const morph = {
  id: "m",
  name: "m",
  sourceType: "x",
  targetType: "y",
  expr: { op: "literal", value: null } as never,
  isIsomorphism: false,
  cid: "cid",
} satisfies Morphism;
const text = (id: string, path: string): Slot => ({ id, path, kind: "text", renderer: morph });
const list = (id: string, path: string, rows: Array<{ key?: string }>): Slot => ({
  id,
  path,
  kind: "html",
  renderer: { ...morph, expr: { op: "literal", value: { rows } } as never },
});
const artefact = (
  slots: Slot[],
  dependents: Record<string, string[]>,
  ctxScopes: SplitArtefact["ctxScopes"] = [],
): SplitArtefact => ({
  skeleton: "<div>shell</div>",
  slots,
  dependents: new Map(Object.entries(dependents).map(([path, ids]) => [path, new Set(ids)])),
  ctxScopes,
});
const emitter = (inputArtefact: SplitArtefact, state: Record<string, unknown>, version = 7) =>
  new WireFrameEmitter({
    artefact: inputArtefact,
    version,
    evaluatePath: (path) => state[path],
    evaluateRenderer: (slot, value) =>
      slot.kind === "html"
        ? `<li>${String((value as { label?: string; key?: string })?.label ?? (value as { key?: string })?.key ?? value ?? "")}</li>`
        : `render:${slot.id}:${String(Array.isArray(value) ? value.length : (value ?? ""))}`,
  });

describe("WireFrameEmitter", () => {
  test("single-field change yields one patch frame with one update", () => {
    const frames = emitter(artefact([text("s0", "$ws.title")], { "$ws.title": ["s0"] }), {
      "$ws.title": "Alpha",
    }).emit(["$ws.title"]);
    expect(frames).toEqual([
      { type: "patch", version: 7, updates: [{ slotId: "s0", value: "render:s0:Alpha" }] },
    ]);
  });

  test("nested fan-out batches two affected slots into one patch frame", () => {
    const frames = emitter(
      artefact([text("s0", "$ws.orders"), text("s1", "$ws.orders")], {
        "$ws.orders": ["s0", "s1"],
      }),
      { "$ws.orders": [{ total: 2 }, { total: 3 }] },
    ).emit(["$ws.orders"]);
    expect(frames).toHaveLength(1);
    expect(frames[0]?.type).toBe("patch");
    expect(
      (frames[0] as Extract<(typeof frames)[number], { type: "patch" }>).updates.map(
        (update) => update.slotId,
      ),
    ).toEqual(["s0", "s1"]);
  });

  test("array reorder emits move with the new neighbour key", () => {
    const frames = emitter(
      artefact([list("rows", "$ws.rows", [{ key: "a" }, { key: "c" }, { key: "b" }])], {
        "$ws.rows": ["rows"],
      }),
      {
        "$ws.rows": [
          { key: "b", label: "B" },
          { key: "a", label: "A" },
          { key: "c", label: "C" },
        ],
      },
    ).emit(["$ws.rows"]);
    expect(frames[0]).toMatchObject({
      type: "list",
      op: "move",
      fromKey: "b",
      toKey: "a",
      version: 7,
    });
  });

  test("array append emits append with only the new row", () => {
    const frames = emitter(
      artefact([list("rows", "$ws.rows", [{ key: "a" }])], { "$ws.rows": ["rows"] }),
      {
        "$ws.rows": [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
      },
    ).emit(["$ws.rows"]);
    expect(frames[0]).toMatchObject({
      type: "list",
      op: "append",
      rows: [{ key: "b", html: "<li>B</li>" }],
    });
  });

  test("array prepend emits prepend", () => {
    const frames = emitter(
      artefact([list("rows", "$ws.rows", [{ key: "b" }])], { "$ws.rows": ["rows"] }),
      {
        "$ws.rows": [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
      },
    ).emit(["$ws.rows"]);
    expect(frames[0]).toMatchObject({
      type: "list",
      op: "prepend",
      rows: [{ key: "a", html: "<li>A</li>" }],
    });
  });

  test("array full replace emits replace with the full row set", () => {
    const frames = emitter(
      artefact([list("rows", "$ws.rows", [{ key: "a" }, { key: "b" }])], { "$ws.rows": ["rows"] }),
      {
        "$ws.rows": [
          { key: "x", label: "X" },
          { key: "y", label: "Y" },
        ],
      },
    ).emit(["$ws.rows"]);
    expect(frames[0]).toMatchObject({
      type: "list",
      op: "replace",
      rows: [{ key: "x" }, { key: "y" }],
    });
  });

  test("context mutation patches only the ctx-scoped slot", () => {
    const frames = emitter(
      artefact([text("title", "$ws.title"), text("ctx", "$ui.ordersPanel.expanded")], {
        "$ctx.ordersPanel.expanded": ["ctx"],
        "$ws.title": ["title"],
      }),
      { "$ws.title": "Alpha", "$ui.ordersPanel.expanded": true },
    ).emit(["$ctx.ordersPanel.expanded"]);
    expect(frames).toEqual([
      { type: "patch", version: 7, updates: [{ slotId: "ctx", value: "render:ctx:true" }] },
    ]);
  });

  test("skeletonFrame returns the current version and slot descriptors", () => {
    const frame = emitter(
      artefact(
        [text("s0", "$ws.title"), { ...text("s1", "$ctx.foo"), kind: "attr", attrName: "class" }],
        { "$ws.title": ["s0"] },
      ),
      { "$ws.title": "Alpha", "$ctx.foo": 1 },
      11,
    ).skeletonFrame();
    expect(frame).toEqual({
      type: "skeleton",
      version: 11,
      html: "<div>shell</div>",
      slots: [
        { id: "s0", path: "$ws.title", kind: "text" },
        { id: "s1", path: "$ctx.foo", kind: "attr", attrName: "class" },
      ],
    });
  });

  test("skeletonFrame includes ctxScopes when present", () => {
    const frame = emitter(
      artefact([], {}, [
        {
          scopePath: "page/ordersPanel",
          scope: "ordersPanel",
          initial: { foo: 1 },
          mirror: ["foo"],
        },
      ]),
      {},
      3,
    ).skeletonFrame();
    expect(frame).toEqual({
      type: "skeleton",
      version: 3,
      html: "<div>shell</div>",
      slots: [],
      ctxScopes: [
        {
          scopePath: "page/ordersPanel",
          scope: "ordersPanel",
          initial: { foo: 1 },
          mirror: ["foo"],
        },
      ],
    });
  });

  test("single-field patch frame stays under 1KB with realistic content", () => {
    const content = "This title payload is comfortably above 32 chars.";
    const [frame] = emitter(artefact([text("s0", "$ws.title")], { "$ws.title": ["s0"] }), {
      "$ws.title": content,
    }).emit(["$ws.title"]);
    expect(content.length).toBeGreaterThanOrEqual(32);
    expect(Buffer.byteLength(JSON.stringify(frame), "utf8")).toBeLessThan(1024);
  });

  test("unrelated changes return an empty array", () => {
    expect(
      emitter(artefact([text("s0", "$ws.title")], { "$ws.title": ["s0"] }), {
        "$ws.title": "Alpha",
      }).emit(["$ws.unrelated"]),
    ).toEqual([]);
  });

  test("mixed title and rows change yields one patch frame plus one list frame with matching version", () => {
    const frames = emitter(
      artefact([text("title", "$ws.title"), list("rows", "$ws.rows", [{ key: "a" }])], {
        "$ws.title": ["title"],
        "$ws.rows": ["rows"],
      }),
      {
        "$ws.title": "Beta",
        "$ws.rows": [
          { key: "a", label: "A" },
          { key: "b", label: "B" },
        ],
      },
      9,
    ).emit(["$ws.title", "$ws.rows"]);
    expect(frames).toHaveLength(2);
    expect(frames[0]).toMatchObject({ type: "patch", version: 9 });
    expect(frames[1]).toMatchObject({ type: "list", version: 9, op: "append" });
  });

  test("keyless iter falls back to replace on structural change", () => {
    const frames = emitter(
      artefact([list("rows", "$ws.rows", [{}, {}])], { "$ws.rows": ["rows"] }),
      { "$ws.rows": [{ label: "B" }, { label: "C" }] },
    ).emit(["$ws.rows"]);
    expect(frames[0]).toMatchObject({
      type: "list",
      op: "replace",
      rows: [{ key: "0" }, { key: "1" }],
    });
  });

  test("existing ws-action shape validates against CLIENT_FRAME_SCHEMA", () => {
    const validator = new SchemaValidator();
    const frame = { type: "action", ref: "X", target: null, payload: {} };
    expect(validator.validate(frame, CLIENT_FRAME_SCHEMA).valid).toBe(true);
    expect(isClientFrame(frame)).toBe(true);
  });

  test("isServerFrame accepts all six kinds and rejects malformed input", () => {
    expect(isServerFrame({ type: "skeleton", version: 1, html: "<div/>", slots: [] })).toBe(true);
    expect(
      isServerFrame({ type: "patch", version: 1, updates: [{ slotId: "s0", value: 1 }] }),
    ).toBe(true);
    expect(isServerFrame({ type: "list", version: 1, slotId: "s0", op: "append", rows: [] })).toBe(
      true,
    );
    expect(isServerFrame({ type: "event", kind: "ping", payload: null })).toBe(true);
    expect(isServerFrame({ type: "effect", adapter: "dom", op: "focus", args: [] })).toBe(true);
    expect(isServerFrame({ type: "error", message: "boom" })).toBe(true);
    expect(isServerFrame({ version: 1 })).toBe(false);
  });

  test("guards and schemas accept the client/server contract", () => {
    const validator = new SchemaValidator();
    const clients = [
      { type: "action", ref: "X", target: null, payload: {} },
      { type: "custom", name: "open", payload: { id: 1 } },
      { type: "ui-set", ctxPath: "$ctx.panel", path: "expanded", value: true },
      { type: "ack", seen: 0 },
    ];
    expect(clients.every(isClientFrame)).toBe(true);
    expect(clients.every((frame) => validator.validate(frame, CLIENT_FRAME_SCHEMA).valid)).toBe(
      true,
    );
    expect(
      validator.validate(
        { type: "patch", version: 1, updates: [{ slotId: "s0", value: "x" }] },
        SERVER_FRAME_SCHEMA,
      ).valid,
    ).toBe(true);
  });
});
