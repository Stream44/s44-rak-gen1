import type { Row, SlotId } from "../wire-protocol.ts";

type Rendered = string | DocumentFragment | { kind: "attr"; attr: string; value: string | null };
type Locate = (slotId: string) => Element | null;
const keyOf = (node: Element | null) => node?.id || node?.getAttribute?.("data-key") || "";

export default class Patcher {
  constructor(
    private readonly locate: Locate = (slotId) =>
      document.querySelector(`[data-slot-id="${slotId}"]`),
  ) {}
  patchSlot(slotId: SlotId, value: unknown, renderer: (value: unknown) => Rendered): void {
    const node = this.locate(slotId) as HTMLElement | null;
    if (!node) return;
    const out = renderer(value);
    if (typeof out === "object" && out && "kind" in out)
      return void (out.value == null
        ? node.removeAttribute(out.attr)
        : node.setAttribute(out.attr, out.value));
    if (typeof out === "string" && !out.trim().startsWith("<"))
      return void (node.textContent = out);
    this.preserve(() =>
      typeof out === "string"
        ? (node.innerHTML = out)
        : (node.replaceChildren(...Array.from(out.childNodes)), undefined),
    );
  }
  morphInto(oldRoot: Element, newRoot: Element): void {
    const keyed = new Map(
      Array.from(oldRoot.children).map((child) => [keyOf(child), child] as const),
    );
    const ordered = Array.from(newRoot.children).map(
      (child) => keyed.get(keyOf(child)) ?? (child.cloneNode(true) as Element),
    );
    // idiomorph-style keyed reuse keeps stable nodes through reorders.
    this.preserve(() => oldRoot.replaceChildren(...ordered));
  }
  applyListOp(slotId: SlotId, op: string, rows: Row[], key = "data-key"): void {
    const node = this.locate(slotId) as HTMLElement | null;
    if (!node) return;
    if (op === "replace") return void (node.innerHTML = rows.map((row) => row.html).join(""));
    const find = (value?: string) =>
      Array.from(node.children).find((child) => (child as Element).getAttribute(key) === value) as
        | HTMLElement
        | undefined;
    this.preserve(() => {
      if (op === "remove") rows.forEach((row) => find(row.key)?.remove());
      if (op === "move" && rows[0]) {
        const child = find(rows[0].key);
        if (child) node.appendChild(child);
      }
      if (op === "append")
        node.insertAdjacentHTML("beforeend", rows.map((row) => row.html).join(""));
      if (op === "prepend")
        node.insertAdjacentHTML("afterbegin", rows.map((row) => row.html).join(""));
    });
  }
  private preserve(run: () => void): void {
    const doc = globalThis.document as Document | undefined,
      win = globalThis.window as Window | undefined;
    if (!doc) return void run();
    const active = doc.activeElement as HTMLElement | null,
      sel = win?.getSelection?.(),
      range = sel?.rangeCount ? sel.getRangeAt(0) : null,
      top = active?.scrollTop,
      left = active?.scrollLeft,
      key = keyOf(active);
    run();
    const keep = key
      ? doc.getElementById(key) || (doc.querySelector(`[data-key="${key}"]`) as HTMLElement | null)
      : active;
    if (keep?.focus) {
      keep.focus();
      if (range && sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
      if (top != null) keep.scrollTop = top;
      if (left != null) keep.scrollLeft = left;
    }
  }
}
