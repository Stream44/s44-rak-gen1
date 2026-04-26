import { describe, expect, test } from "bun:test";

import Patcher from "../patcher.ts";

const mk = (key?: string) => ({
  key,
  parent: null as any,
  children: [] as any[],
  scrollTop: 0,
  scrollLeft: 0,
  focusCalls: 0,
  textContent: "",
  innerHTML: "",
  getAttribute(name: string) {
    return name === "data-key" ? (this.key ?? null) : null;
  },
  setAttribute() {},
  removeAttribute() {},
  focus() {
    this.focusCalls += 1;
  },
  remove() {
    this.parent.children = this.parent.children.filter((child: any) => child !== this);
  },
  appendChild(child: any) {
    child.parent = this;
    this.children.push(child);
  },
  replaceChildren(...children: any[]) {
    this.children = children;
    children.forEach((child: any) => (child.parent = this));
  },
  insertAdjacentHTML(_where: string, html: string) {
    this.innerHTML = _where === "afterbegin" ? html + this.innerHTML : this.innerHTML + html;
  },
  cloneNode() {
    return mk(this.key);
  },
  get id() {
    return this.key ?? "";
  },
});

describe("Patcher", () => {
  test("text-kind renderer updates textContent without restructuring", () => {
    const node = mk();
    new Patcher(() => node as never).patchSlot("s1", "new", (value) => String(value));
    expect(node.textContent).toBe("new");
    expect(node.children).toHaveLength(0);
  });

  test("idiomorph-style keyed reorder reuses the same row objects", () => {
    const root = mk(),
      a = mk("a"),
      b = mk("b"),
      c = mk("c"),
      next = mk();
    root.replaceChildren(a, b, c);
    next.replaceChildren(mk("b"), mk("a"), mk("c"));
    new Patcher().morphInto(root as never, next as never);
    expect(root.children).toEqual([b, a, c]);
  });

  test("focus preservation restores focus and selection", () => {
    const active = mk("x"),
      root = mk(),
      next = mk();
    root.replaceChildren(active);
    next.replaceChildren(mk("x"));
    globalThis.document = {
      activeElement: active,
      getElementById: () => active,
      querySelector: () => active,
    } as never;
    const sel = {
      rangeCount: 1,
      getRangeAt: () => "r",
      removeAllRangesCalled: 0,
      addRangeCalled: "",
      removeAllRanges() {
        this.removeAllRangesCalled += 1;
      },
      addRange(value: string) {
        this.addRangeCalled = value;
      },
    };
    globalThis.window = { getSelection: () => sel } as never;
    new Patcher().morphInto(root as never, next as never);
    expect(active.focusCalls).toBe(1);
    expect(sel.addRangeCalled).toBe("r");
  });

  test("scroll preservation restores scroll offsets on the focused node", () => {
    const active = mk("x"),
      root = mk(),
      next = mk();
    active.scrollTop = 120;
    active.scrollLeft = 7;
    root.replaceChildren(active);
    next.replaceChildren(mk("x"));
    globalThis.document = {
      activeElement: active,
      getElementById: () => active,
      querySelector: () => active,
    } as never;
    globalThis.window = { getSelection: () => ({ rangeCount: 0 }) } as never;
    new Patcher().morphInto(root as never, next as never);
    expect(active.scrollTop).toBe(120);
    expect(active.scrollLeft).toBe(7);
  });
});
