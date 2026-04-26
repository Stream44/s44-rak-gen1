import type { Slot, SplitArtefact } from "./split-pass.ts";
import type { Row, ServerFrame, SlotDescriptor } from "./wire-protocol.ts";

export interface EmitterInput {
  artefact: SplitArtefact;
  version: number;
  evaluatePath: (path: string) => unknown;
  evaluateRenderer: (slot: Slot, value: unknown) => string;
}

type PatchUpdate = Extract<ServerFrame, { type: "patch" }>["updates"][number];
type ListFrame = Extract<ServerFrame, { type: "list" }>;
type RowMeta = { key?: string };

const MAX_PATCH_BYTES = 16 * 1024;
const listMeta = (slot: Slot): RowMeta[] =>
  (((slot.renderer as { expr?: { value?: { rows?: RowMeta[] } } }).expr?.value ?? {}).rows ??
    []) as RowMeta[];
const isListSlot = (slot: Slot, changed: Set<string>, value: unknown): boolean =>
  slot.kind === "html" &&
  changed.has(slot.path) &&
  Array.isArray(value) &&
  Array.isArray(listMeta(slot));
const rowKey = (value: unknown, index: number): string =>
  typeof value === "object" &&
  value !== null &&
  typeof (value as { key?: unknown }).key === "string"
    ? (value as { key: string }).key
    : String(index);
const same = (left: string[], right: string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);
const keyless = (keys: string[]): boolean => keys.every((key, index) => key === String(index));

export class WireFrameEmitter {
  constructor(private readonly input: EmitterInput) {}

  emit(changedPaths: string[]): ServerFrame[] {
    if (!changedPaths.length) return [];
    const changed = new Set(changedPaths),
      affected = new Set<string>();
    for (const path of changed)
      for (const slotId of this.input.artefact.dependents.get(path) ?? []) affected.add(slotId);
    if (!affected.size) return [];
    const listFrames: ServerFrame[] = [];
    const updates: PatchUpdate[] = [];
    for (const slot of this.input.artefact.slots.filter((entry) => affected.has(entry.id))) {
      const value = this.input.evaluatePath(slot.path);
      if (isListSlot(slot, changed, value)) {
        const frame = this.listFrame(slot, value as unknown[]);
        if (frame) listFrames.push(frame);
        continue;
      }
      updates.push({ slotId: slot.id, value: this.input.evaluateRenderer(slot, value) });
    }
    return [...this.patchFrames(updates), ...listFrames];
  }

  skeletonFrame(): ServerFrame {
    return {
      type: "skeleton",
      version: this.input.version,
      html: this.input.artefact.skeleton,
      slots: this.input.artefact.slots.map(({ id, path, kind, attrName }) => ({
        id,
        path,
        kind,
        ...(attrName ? { attrName } : {}),
      })),
      ...(this.input.artefact.ctxScopes.length ? { ctxScopes: this.input.artefact.ctxScopes } : {}),
    };
  }

  private listFrame(slot: Slot, next: unknown[]): ListFrame | null {
    const prevKeys = listMeta(slot).map((row, index) => row.key ?? String(index));
    const nextKeys = next.map((item, index) => rowKey(item, index));
    if (keyless(prevKeys) || keyless(nextKeys) || same(prevKeys, nextKeys))
      return this.frame(slot, "replace", next, nextKeys);
    if (nextKeys.length > prevKeys.length && same(prevKeys, nextKeys.slice(0, prevKeys.length)))
      return this.frame(
        slot,
        "append",
        next.slice(prevKeys.length),
        nextKeys.slice(prevKeys.length),
      );
    if (
      nextKeys.length > prevKeys.length &&
      same(prevKeys, nextKeys.slice(nextKeys.length - prevKeys.length))
    )
      return this.frame(
        slot,
        "prepend",
        next.slice(0, nextKeys.length - prevKeys.length),
        nextKeys.slice(0, nextKeys.length - prevKeys.length),
      );
    if (prevKeys.length > nextKeys.length && nextKeys.every((key) => prevKeys.includes(key)))
      return {
        type: "list",
        version: this.input.version,
        slotId: slot.id,
        op: "remove",
        rows: prevKeys.filter((key) => !nextKeys.includes(key)).map((key) => ({ key, html: "" })),
      };
    if (prevKeys.length === nextKeys.length && same([...prevKeys].sort(), [...nextKeys].sort())) {
      const moved = prevKeys.find(
        (key) =>
          same(
            prevKeys.filter((entry) => entry !== key),
            nextKeys.filter((entry) => entry !== key),
          ) && prevKeys.indexOf(key) !== nextKeys.indexOf(key),
      );
      if (moved)
        return {
          type: "list",
          version: this.input.version,
          slotId: slot.id,
          op: "move",
          rows: this.rows(slot, [next[nextKeys.indexOf(moved)]], [moved]),
          fromKey: moved,
          toKey: nextKeys[nextKeys.indexOf(moved) + 1],
        };
    }
    return this.frame(slot, "replace", next, nextKeys);
  }

  private frame(slot: Slot, op: ListFrame["op"], items: unknown[], keys: string[]): ListFrame {
    return {
      type: "list",
      version: this.input.version,
      slotId: slot.id,
      op,
      rows: this.rows(slot, items, keys),
    };
  }

  private rows(slot: Slot, items: unknown[], keys: string[]): Row[] {
    return items.map((item, index) => {
      const key = keys[index] ?? rowKey(item, index),
        slots = this.rowSlots(slot, key);
      return {
        key,
        html: this.input.evaluateRenderer(slot, item),
        ...(slots.length ? { slots } : {}),
      };
    });
  }

  private rowSlots(slot: Slot, key: string): SlotDescriptor[] {
    const prefix = `list:${slot.path}:${key}/`;
    return this.input.artefact.slots
      .filter((entry) => entry.id.startsWith(prefix))
      .map(({ id, path, kind, attrName }) => ({
        id,
        path,
        kind,
        ...(attrName ? { attrName } : {}),
      }));
  }

  private patchFrames(updates: PatchUpdate[]): ServerFrame[] {
    if (!updates.length) return [];
    const frame: Extract<ServerFrame, { type: "patch" }> = {
      type: "patch",
      version: this.input.version,
      updates,
    };
    if (Buffer.byteLength(JSON.stringify(frame), "utf8") <= MAX_PATCH_BYTES || updates.length < 2)
      return [frame];
    const target = updates.reduce((sum, update) => sum + JSON.stringify(update).length, 0) / 2;
    let cut = 1,
      seen = 0;
    while (cut < updates.length && seen < target) seen += JSON.stringify(updates[cut++ - 1]).length;
    const largest = updates.reduce((left, right) =>
      JSON.stringify(left).length >= JSON.stringify(right).length ? left : right,
    );
    console.warn(`WireFrameEmitter oversize patch near slot ${largest.slotId}`);
    const split: Array<Extract<ServerFrame, { type: "patch" }>> = [
      { type: "patch", version: this.input.version, updates: updates.slice(0, cut) },
      { type: "patch", version: this.input.version, updates: updates.slice(cut) },
    ];
    return split.filter((entry) => entry.updates.length);
  }
}
