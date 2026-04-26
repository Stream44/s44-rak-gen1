import type { ServerFrame, SlotDescriptor } from "../wire-protocol.ts";
import type { Adapter } from "./adapters.ts";
import registerEffectBootstrap from "./effects-bootstrap.ts";
import { ContextResolver } from "./context.ts";
import { Dispatcher } from "./dispatch.ts";
import Patcher from "./patcher.ts";
import { createStateBag, type StateBag } from "./state-bag.ts";
import { SubscriptionGraph } from "./subscriptions.ts";

type RuntimeFrame = ServerFrame | { type: "rerender"; html: string; handlersJs?: string };

export type RuntimeApi = {
  readonly version: number;
  readonly state: StateBag;
  sendAction: Dispatcher["sendAction"];
  sendCustom: Dispatcher["sendCustom"];
  setUi: (ctxPath: string, path: string, value: unknown) => void;
  subscribe: StateBag["subscribe"];
  registerAdapter: (name: string, adapter: Adapter) => void;
  onConnectionStateChange: (handler: (state: string) => void) => () => void;
};

const jitter = (ms: number) => Math.max(0, Math.round(ms * (1 + (Math.random() * 0.3 - 0.15))));
const wsUrl = () => window.location.origin.replace(/^http/, "ws") + "/ws";
const deps = (slots: SlotDescriptor[]) =>
  Object.fromEntries(slots.map((slot) => [slot.path, [slot.id]]));

const updateConnectionState = (value: string) => {
  document.querySelectorAll?.("[data-connection-state]")?.forEach((node) => {
    node.textContent = value;
  });
};

const inferActiveTab = (): string | null => {
  const active = document.querySelector?.(
    '[data-tab-trigger][aria-selected="true"]',
  ) as HTMLElement | null;
  if (active?.dataset?.tabTrigger) return active.dataset.tabTrigger;
  const visible = document.querySelector?.(
    '[data-tab][data-tab-active="true"]',
  ) as HTMLElement | null;
  return visible?.dataset?.tab ?? null;
};
const syncTabs = (value: string | null | undefined) => {
  const resolved = value && typeof value === "string" ? value : inferActiveTab();
  if (!resolved) return;
  document.querySelectorAll?.<HTMLElement>("[data-tab]")?.forEach((node) => {
    node.setAttribute("data-tab-active", String(node.dataset.tab === resolved));
  });
  document.querySelectorAll?.<HTMLElement>("[data-tab-trigger]")?.forEach((node) => {
    node.setAttribute("aria-selected", String(node.dataset.tabTrigger === resolved));
  });
};

const toggleTree = (toggle: HTMLElement) => {
  const tree = toggle.closest("[data-tree-open]") as HTMLElement | null;
  if (!tree) return;
  const current = tree.dataset?.treeOpen ?? tree.getAttribute("data-tree-open") ?? "false";
  const next = current !== "true";
  const value = next ? "true" : "false";
  if (tree.dataset) tree.dataset.treeOpen = value;
  if (typeof tree.setAttribute === "function") tree.setAttribute("data-tree-open", value);
  else (tree as unknown as Record<string, unknown>)["data-tree-open"] = value;
  const list = typeof tree.querySelector === "function" ? tree.querySelector("ul") : null;
  if (list) (list as HTMLElement).style.display = next ? "block" : "none";
  toggle.textContent = next ? "▾" : "▸";
};

const inspectTreeLeaf = (leaf: HTMLElement) => {
  const label = leaf.getAttribute("data-tree-leaf") ?? "";
  document.querySelectorAll?.<HTMLElement>('[data-slot-id="inspector"]')?.forEach((node) => {
    node.textContent = label ? `Selected: ${label}` : "Select an item to inspect";
  });
};

export function init(opts: { socketUrl?: string; rootSelector?: string } = {}): RuntimeApi {
  let socket: WebSocket | null = null;
  let version = 0;
  let tries = 0;
  let slots = new Map<string, SlotDescriptor>();
  let connectionState = "connecting";
  let scheduledScrollOnce = false;
  // Set briefly while handle() swaps `innerHTML`. Chromium dispatches `blur`
  // synchronously during innerHTML detach (with isConnected still true on
  // the dying element), which used to trigger a phantom commit → rerender →
  // blur → commit loop. The flag gates onBlur during rerender churn.
  let rerendering = false;

  const state = createStateBag();
  const graph = new SubscriptionGraph();
  const patcher = new Patcher();
  const effects = registerEffectBootstrap();
  const listeners = new Set<(state: string) => void>();

  const emit = (value: string) => {
    connectionState = value;
    updateConnectionState(value);
    listeners.forEach((listener) => listener(value));
  };

  const dispatch = new Dispatcher(
    () => socket,
    () => version,
  );
  const resolver = new ContextResolver(dispatch);
  state.setCtxResolver(resolver);

  const root = () => document.querySelector(opts.rootSelector ?? "#root") as HTMLElement | null;
  const setUi = (ctxPath: string, path: string, value: unknown) => {
    state.setUi(ctxPath, path, value);
  };
  const render = (slot: SlotDescriptor, value: unknown) =>
    slot.kind === "attr"
      ? {
          kind: "attr" as const,
          attr: slot.attrName ?? "value",
          value: value == null ? null : String(value),
        }
      : typeof value === "string"
        ? value
        : JSON.stringify(value ?? "");
  const scrollSelectedRowsOnce = () => {
    scheduledScrollOnce = true;
    requestAnimationFrame(() => {
      const row = document.querySelector('[data-selected="true"]');
      if (row && row instanceof HTMLElement)
        row.scrollIntoView({ block: "nearest", behavior: "instant" as ScrollBehavior });
    });
  };

  // Rerender replaces #root.innerHTML wholesale — the browser has no way to
  // correlate old and new DOM nodes, so every scrollable container resets
  // scrollTop/Left to 0. That looks to the user as if clicking a row scrolled
  // the table. We defend against that by capturing each scrollable element's
  // position before the swap and restoring it after, keyed by a structural
  // path so matching survives node replacement.
  const pathOf = (el: Element, host: Element): string => {
    const parts: string[] = [];
    let cur: Element | null = el;
    while (cur && cur !== host && cur.parentElement) {
      const tag = cur.tagName;
      const parent: Element = cur.parentElement;
      const sameTag = Array.from(parent.children).filter((sib: Element) => sib.tagName === tag);
      parts.unshift(`${tag}:${sameTag.indexOf(cur)}`);
      cur = parent;
    }
    return parts.join(">");
  };
  const scrollableContainers = (host: HTMLElement): HTMLElement[] =>
    Array.from(host.querySelectorAll<HTMLElement>("*")).filter((el: HTMLElement) => {
      if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) return false;
      const cs = window.getComputedStyle(el);
      return (
        cs.overflowY === "auto" ||
        cs.overflowY === "scroll" ||
        cs.overflowX === "auto" ||
        cs.overflowX === "scroll"
      );
    });
  const captureScrollState = (host: HTMLElement) =>
    new Map(
      scrollableContainers(host).map(
        (el) => [pathOf(el, host), { top: el.scrollTop, left: el.scrollLeft }] as const,
      ),
    );
  const restoreScrollState = (
    host: HTMLElement,
    snapshot: Map<string, { top: number; left: number }>,
  ) => {
    if (snapshot.size === 0) return;
    // Include elements that may not yet have become scrollable (querySelectorAll
    // picks them up; we only restore when we have a recorded entry).
    for (const el of Array.from(host.querySelectorAll<HTMLElement>("*"))) {
      const entry = snapshot.get(pathOf(el, host));
      if (!entry) continue;
      if (entry.top) el.scrollTop = entry.top;
      if (entry.left) el.scrollLeft = entry.left;
    }
  };

  // Same problem as scroll state: an `innerHTML` rerender wipes the active
  // element, so a user typing into the new-todo input loses focus the moment
  // their action triggers a rerender. Capture which input had focus + cursor
  // position before the swap, and restore by structural path after. We only
  // restore for form controls (input/textarea/select) — restoring focus on a
  // button or label after an unrelated rerender would feel like a focus jump.
  type FocusSnapshot = {
    path: string;
    selectionStart: number | null;
    selectionEnd: number | null;
    tag: string;
  };
  const captureFocusState = (host: HTMLElement): FocusSnapshot | null => {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !host.contains(active)) return null;
    const tag = active.tagName;
    if (tag !== "INPUT" && tag !== "TEXTAREA" && tag !== "SELECT") return null;
    const selectionStart = (active as HTMLInputElement).selectionStart ?? null;
    const selectionEnd = (active as HTMLInputElement).selectionEnd ?? null;
    return { path: pathOf(active, host), selectionStart, selectionEnd, tag };
  };
  const restoreFocusState = (host: HTMLElement, snapshot: FocusSnapshot | null) => {
    if (snapshot) {
      for (const el of Array.from(host.querySelectorAll<HTMLElement>("input, textarea, select"))) {
        if (el.tagName !== snapshot.tag) continue;
        if (pathOf(el, host) !== snapshot.path) continue;
        el.focus();
        if (snapshot.selectionStart !== null && el instanceof HTMLInputElement) {
          try {
            el.setSelectionRange(
              snapshot.selectionStart,
              snapshot.selectionEnd ?? snapshot.selectionStart,
            );
          } catch {
            /* selection may be unsupported on this input type */
          }
        }
        return;
      }
    }
    // No matching snapshot → honour any `autofocus` attribute the rerender
    // emitted. Browsers don't trigger autofocus on `innerHTML` insertion, so
    // we do it manually. Position the cursor at end so a single click on a
    // todo label lands you ready-to-type at the end of the existing title
    // (rather than two-click: select then position).
    const autofocus = host.querySelector("input[autofocus], textarea[autofocus]") as
      | HTMLInputElement
      | HTMLTextAreaElement
      | null;
    if (autofocus) {
      autofocus.focus();
      const len = autofocus.value.length;
      try {
        autofocus.setSelectionRange(len, len);
      } catch {
        /* selection unsupported on this input type */
      }
    }
  };

  const hydrate = (frame: Extract<ServerFrame, { type: "skeleton" }>) => {
    version = frame.version;
    const host = root();
    if (host && host.innerHTML.trim().length === 0) host.innerHTML = frame.html;
    slots = new Map(frame.slots.map((slot) => [slot.id, slot]));
    graph.loadFromSkeleton(deps(frame.slots));
    resolver.loadFromSkeleton(frame.ctxScopes ?? []);
    dispatch.release();
    effects.handleFrame({ type: "skeleton", effects: [] });
    updateConnectionState(connectionState);
    syncTabs((state.get("$ui.page.activeTab") as string) ?? null);
  };

  const handle = (frame: RuntimeFrame) => {
    (window.__adkReceivedFrames ??= []).push(frame);
    if (frame.type === "rerender") {
      const host = root()!;
      const scroll = captureScrollState(host);
      const focus = captureFocusState(host);
      rerendering = true;
      try {
        host.innerHTML = frame.html;
        if (frame.handlersJs) Function(frame.handlersJs)();
      } finally {
        rerendering = false;
      }
      updateConnectionState(connectionState);
      syncTabs((state.get("$ui.page.activeTab") as string) ?? null);
      restoreScrollState(host, scroll);
      restoreFocusState(host, focus);
      if (!scheduledScrollOnce && window.location.hash.length > 0) scrollSelectedRowsOnce();
      return;
    }
    if (frame.type === "skeleton") return hydrate(frame);
    if ("version" in frame && frame.version !== version) return dispatch.sendAck(version);
    dispatch.release();
    if (frame.type === "patch") {
      window.__adkPatchCount = (window.__adkPatchCount ?? 0) + 1;
      frame.updates.forEach(({ slotId, value }) => {
        const slot = slots.get(slotId);
        if (!slot) return;
        state.set(slot.path, value);
        patcher.patchSlot(slotId, value, (next) => render(slot, next));
        graph.fireAffectedSlots(slot.path);
      });
    }
    if (frame.type === "list") patcher.applyListOp(frame.slotId, frame.op, frame.rows, frame.key);
    if (frame.type === "effect") effects.handleFrame(frame as never);
  };

  const connect = () => {
    socket = new WebSocket(opts.socketUrl ?? wsUrl());
    window.ws = socket;
    socket.onopen = () => {
      emit("connected");
      tries = 0;
      dispatch.sendAck(version);
      dispatch.drain();
    };
    socket.onmessage = (event) => handle(JSON.parse(String(event.data)) as RuntimeFrame);
    socket.onclose = () => {
      emit("reconnecting");
      const wait = Math.min(30_000, 500 * 2 ** tries++);
      setTimeout(connect, jitter(wait));
    };
  };

  const matchesSelector = (node: HTMLElement | null, selector: string) => {
    if (!node) return false;
    const attrs = Array.from(selector.matchAll(/\[([^\]=]+)(?:="([^"]*)")?\]/g));
    if (attrs.length === 0) return true;
    return attrs.every(([, name, expected]) => {
      const value = node.getAttribute?.(name) ?? null;
      return expected == null ? value != null : value === expected;
    });
  };
  const closest = (node: EventTarget | null, selector: string) => {
    const candidate = (node as HTMLElement | null)?.closest?.(selector) as HTMLElement | null;
    return matchesSelector(candidate, selector) ? candidate : null;
  };
  const parsePayloadAttr = (value: string | null) => {
    if (!value) return {};
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : {};
    } catch {
      return {};
    }
  };
  const replaceEditableEventValue = (value: unknown, editableValue: string): unknown => {
    if (value === "$event.value") return editableValue;
    if (Array.isArray(value))
      return value.map((entry) => replaceEditableEventValue(entry, editableValue));
    if (value && typeof value === "object") {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
          key,
          replaceEditableEventValue(entry, editableValue),
        ]),
      );
    }
    return value;
  };
  const sendEditableAction = (
    el: HTMLElement,
    actionAttr: string,
    payloadAttr: string,
    dynamicPayload: Record<string, unknown>,
  ) => {
    const ref = el.getAttribute(actionAttr);
    if (!ref) return false;
    const ctxPath = el.dataset.ctxPath ?? "page";
    const payload = {
      ...(replaceEditableEventValue(
        parsePayloadAttr(el.getAttribute(payloadAttr)),
        (el as HTMLInputElement).value,
      ) as Record<string, unknown>),
      ...dynamicPayload,
    };
    if (ref === "ui.set") {
      const values =
        payload.values && typeof payload.values === "object" && !Array.isArray(payload.values)
          ? (payload.values as Record<string, unknown>)
          : typeof payload.path === "string"
            ? { [payload.path]: payload.value ?? "" }
            : {};
      for (const [path, value] of Object.entries(values)) {
        setUi(ctxPath, path, value);
        (window.__adkSentFrames ??= []).push({ type: "ui-set", ctxPath, path, value });
        dispatch.sendUiSet(ctxPath, path, value);
      }
      return true;
    }
    // Resolve the action target. Prefer the explicit `data-<actionAttr>-target`
    // emitted by EditableText (carries the projection's `target: $t.id`),
    // then fall back to `payload.id` (the row's id from data-editable-id /
    // dynamicPayload), and only as a last resort to the action ref itself.
    // Without this, mutate-kind actions like EditTodo got `target = "EditTodo"`
    // server-side and persisted under a key named after the verb instead of
    // updating the row.
    const explicitTarget = el.getAttribute(`${actionAttr}-target`);
    const fallbackId = typeof payload.id === "string" ? payload.id : undefined;
    const target = explicitTarget ?? fallbackId ?? ref;
    dispatch.sendAction(ref, payload, target, ctxPath);
    return true;
  };
  const sendEditableEnd = (editable: HTMLInputElement) => {
    sendEditableAction(editable, "data-editable-end", "data-editable-end-payload", {});
  };
  const onClick = (event: Event) => {
    const treeToggle = closest(event.target, "[data-tree-toggle]");
    if (treeToggle) {
      toggleTree(treeToggle);
      return;
    }
    const treeLeaf = closest(event.target, "[data-tree-leaf]");
    if (treeLeaf) {
      inspectTreeLeaf(treeLeaf);
      return;
    }
    const uiSet = closest(event.target, '[data-action-ref="ui.set"][data-ui-set-path]');
    if (
      uiSet?.getAttribute("data-action-ref") === "ui.set" &&
      uiSet.getAttribute("data-ui-set-path")
    ) {
      const ctxPath = uiSet.getAttribute("data-ctx-path") ?? "page";
      const path = uiSet.getAttribute("data-ui-set-path") ?? "";
      const value = uiSet.getAttribute("data-value");
      setUi(ctxPath, path, value);
      if (path === "activeTab" && value) syncTabs(value);
      (window.__adkSentFrames ??= []).push({ type: "ui-set", ctxPath, path, value });
      dispatch.sendUiSet(ctxPath, path, value);
      return;
    }
    const uiSetPayload = closest(event.target, '[data-action-ref="ui.set"][data-action-payload]');
    if (uiSetPayload?.getAttribute("data-action-ref") === "ui.set") {
      const ctxPath = uiSetPayload.getAttribute("data-ctx-path") ?? "page";
      const payload = JSON.parse(uiSetPayload.getAttribute("data-action-payload") ?? "{}") as {
        path?: string;
        value?: unknown;
        values?: Record<string, unknown>;
      };
      const values =
        payload.values ?? (payload.path ? { [payload.path]: payload.value ?? "" } : {});
      for (const [path, value] of Object.entries(values)) {
        setUi(ctxPath, path, value);
        (window.__adkSentFrames ??= []).push({ type: "ui-set", ctxPath, path, value });
        dispatch.sendUiSet(ctxPath, path, value);
      }
      if (typeof values.activeTab === "string") syncTabs(values.activeTab);
      return;
    }
    const copyUrlButton = closest(event.target, '[data-copy-url="true"]');
    if (copyUrlButton) {
      const url = window.location.href;
      void navigator.clipboard.writeText(url).then(() => {
        copyUrlButton.setAttribute("data-copied", "true");
        setTimeout(() => copyUrlButton.removeAttribute("data-copied"), 1500);
      });
      return;
    }
    const el = closest(event.target, "[data-action]");
    if (!el) return;
    const payload = el.getAttribute("data-action-payload");
    const ctxPath = el.getAttribute("data-ctx-path") ?? "page";
    dispatch.sendAction(
      el.getAttribute("data-action")!,
      payload ? JSON.parse(payload) : undefined,
      el.getAttribute("data-action-target") ?? undefined,
      ctxPath,
    );
  };
  const onDblClick = (event: MouseEvent) => {
    const el = closest(event.target, "[data-editable-start]");
    if (!el) return;
    const ref = el.getAttribute("data-editable-start")!;
    const payload = parsePayloadAttr(el.getAttribute("data-editable-start-payload"));
    const ctxPath = el.dataset.ctxPath ?? "page";
    dispatch.sendAction(ref, payload, ref, ctxPath);
  };

  const onInput = (event: Event) => {
    const actionEl = closest(
      event.target,
      "select[data-action-ref][data-ui-set-path]",
    ) as HTMLSelectElement | null;
    if (actionEl?.getAttribute("data-action-ref"))
      return dispatch.sendAction(
        actionEl.getAttribute("data-action-ref")!,
        { [actionEl.getAttribute("data-action-payload-key") ?? "value"]: actionEl.value },
        actionEl.getAttribute("data-action-ref") ?? undefined,
        actionEl.getAttribute("data-ctx-path") ?? "page",
      );
    const el = closest(event.target, "[data-ui-set]") as HTMLInputElement | null;
    if (!el) return;
    const ctxPath = el.getAttribute("data-ctx-path") ?? "page";
    const path = el.getAttribute("data-ui-set-path") ?? "";
    setUi(ctxPath, path, el.value);
    (window.__adkSentFrames ??= []).push({ type: "ui-set", ctxPath, path, value: el.value });
    dispatch.sendUiSet(ctxPath, path, el.value);
  };
  const submitInput = (el: HTMLInputElement) => {
    const action = el.dataset.submitAction;
    if (!action) return;
    const key = el.getAttribute("data-submit-payload-key") ?? "value";
    const payload = { [key]: el.value };
    const ctxPath = el.dataset.ctxPath ?? "page";
    dispatch.sendAction(action, payload, action, ctxPath);
    if (el.getAttribute("data-clear-on-submit") === "true") el.value = "";
  };
  // Walk up from any element to its enclosing iterated row — the immediate
  // child of a list-shaped container. Generic across `<ul><li>`, `<ol><li>`,
  // and `<table><tbody><tr>` so editable-list navigation works for any
  // example, not just todomvc's particular shape.
  const findIteratedRow = (el: Element): Element | null => {
    let cur: Element | null = el;
    while (cur && cur.parentElement) {
      const parentEl: HTMLElement = cur.parentElement;
      const tag = parentEl.tagName;
      if (tag === "UL" || tag === "OL" || tag === "TBODY") return cur;
      cur = parentEl;
    }
    return null;
  };
  // Find the click-to-edit trigger inside a row. Any element that fires
  // `ui.set` on click and writes a path encodes the "enter edit mode" signal
  // generically. We don't hard-code "editingId" — we read whatever the
  // projection declares.
  const findEditTrigger = (row: Element): HTMLElement | null =>
    row.querySelector(
      '[data-action-ref="ui.set"][data-ui-set-path][data-value]',
    ) as HTMLElement | null;

  const moveEditMode = (editable: HTMLInputElement, direction: 1 | -1): boolean => {
    const row = findIteratedRow(editable);
    if (!row) return false;
    const sibling = (
      direction === 1 ? row.nextElementSibling : row.previousElementSibling
    ) as HTMLElement | null;
    if (!sibling) return false;
    const trigger = findEditTrigger(sibling);
    if (!trigger) return false;
    const id = editable.dataset.editableId;
    // Commit the current edit before moving on. Reuses the same path Enter
    // takes so the value persists through the same action contract. Mark as
    // committed so the upcoming detach doesn't fire blur → re-commit.
    delete editable.dataset.editableCancelled;
    editable.dataset.editableCommitted = "true";
    sendEditableAction(editable, "data-editable-commit", "data-editable-commit-payload", {
      ...(id ? { id } : {}),
      value: editable.value,
    });
    sendEditableEnd(editable);
    // Now activate edit mode on the target row by replaying its ui.set.
    // The server rerenders with the new editingId; restoreFocusState's
    // autofocus fallback puts the cursor in the new input at end-of-value.
    const ctxPath = trigger.getAttribute("data-ctx-path") ?? "page";
    const path = trigger.getAttribute("data-ui-set-path") ?? "";
    const value = trigger.getAttribute("data-value");
    setUi(ctxPath, path, value);
    (window.__adkSentFrames ??= []).push({ type: "ui-set", ctxPath, path, value });
    dispatch.sendUiSet(ctxPath, path, value);
    return true;
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const editable = closest(event.target, "input[data-editable-input]") as HTMLInputElement | null;
    if (editable) {
      const id = editable.dataset.editableId;
      if (event.key === "Enter") {
        event.preventDefault();
        delete editable.dataset.editableCancelled;
        editable.dataset.editableCommitted = "true";
        sendEditableAction(editable, "data-editable-commit", "data-editable-commit-payload", {
          ...(id ? { id } : {}),
          value: editable.value,
        });
        sendEditableEnd(editable);
        return;
      }
      if (event.key === "Tab") {
        const moved = moveEditMode(editable, event.shiftKey ? -1 : 1);
        if (moved) {
          event.preventDefault();
          return;
        }
        // No next/prev row → fall through to default Tab (browser focuses
        // outside the list; the input's own blur will then commit).
      }
      if (event.key === "Escape") {
        event.preventDefault();
        editable.dataset.editableCancelled = "true";
        editable.value = editable.defaultValue ?? "";
        sendEditableAction(
          editable,
          "data-editable-cancel",
          "data-editable-cancel-payload",
          id ? { id } : {},
        );
        sendEditableEnd(editable);
        editable.blur();
        return;
      }
    }
    const el = closest(event.target, "[data-submit-action]") as HTMLInputElement | null;
    if (!el) return;
    if (event.key === "Enter") {
      event.preventDefault();
      submitInput(el);
    } else if (event.key === "Escape" && el.getAttribute("data-submit-on-blur") === "true") {
      el.value = el.defaultValue ?? "";
      el.blur();
    }
  };
  const onBlur = (event: FocusEvent) => {
    const editable = closest(event.target, "input[data-editable-input]") as HTMLInputElement | null;
    if (editable) {
      // The blur event also fires when an `innerHTML` rerender detaches the
      // input. Chromium dispatches blur *before* the detach completes, so
      // `isConnected` can still be true. The reliable signal is the
      // `rerendering` flag set by handle() around the innerHTML swap; any
      // blur fired in that window is rerender churn, not a user action.
      // The committed flag covers the synchronous Enter/Tab paths.
      if (rerendering || editable.dataset.editableCommitted === "true") {
        delete editable.dataset.editableCommitted;
        return;
      }
      if (editable.dataset.editableCancelled === "true") {
        delete editable.dataset.editableCancelled;
        return;
      }
      const id = editable.dataset.editableId;
      sendEditableAction(editable, "data-editable-commit", "data-editable-commit-payload", {
        ...(id ? { id } : {}),
        value: editable.value,
      });
      sendEditableEnd(editable);
      return;
    }
    const el = event.target as HTMLInputElement | null;
    if (el?.dataset?.submitAction && el.getAttribute("data-submit-on-blur") === "true")
      submitInput(el);
  };
  const bindDomListeners = () => {
    const body = document.body;
    const tagged = body as (HTMLElement & { __adkRuntimeBound?: boolean }) | null;
    if (!tagged || tagged.__adkRuntimeBound) return;
    tagged.__adkRuntimeBound = true;
    body.addEventListener("click", onClick);
    body.addEventListener("dblclick", onDblClick);
    body.addEventListener("input", onInput);
    body.addEventListener("change", onInput);
    body.addEventListener("keydown", onKeyDown);
    body.addEventListener("blur", onBlur, true);
  };
  if (document.body) bindDomListeners();
  else document.addEventListener("DOMContentLoaded", bindDomListeners, { once: true });

  window.__adkSend = (frame) => {
    (window.__adkSentFrames ??= []).push(frame);
    dispatch.send(frame as never);
  };
  window.__adkCustomAction = (name, payload) => dispatch.sendCustom(name, payload);
  window.__adkEffects = effects;
  window.__adkPatchCount = 0;
  window.__adkSentFrames = [];
  window.__adkReceivedFrames = [];

  // URL-bookmark sync: parses shell-embedded whitelist, syncs ctx <-> hash.
  type UrlSyncEntry = {
    key: string;
    alias?: string;
    scope?: string;
    pathStyle?: boolean;
    defaultValue?: string;
  };
  const urlSyncConfig: UrlSyncEntry[] = (() => {
    try {
      const el = document.getElementById?.("adk-url-sync");
      return el?.textContent ? JSON.parse(el.textContent) : [];
    } catch {
      return [];
    }
  })();
  const aliasToEntry = new Map<string, UrlSyncEntry>();
  const keyToAlias = new Map<string, string>();
  const keyToEntry = new Map<string, UrlSyncEntry>();
  let pathStyleEntry: UrlSyncEntry | null = null;
  for (const entry of urlSyncConfig) {
    if (entry.pathStyle) {
      if (pathStyleEntry) throw new Error("Only one pathStyle entry is allowed in adk-url-sync");
      if (keyToEntry.has(entry.key)) throw new Error("pathStyle and key=value cannot share a key");
      pathStyleEntry = entry;
      keyToEntry.set(entry.key, entry);
      continue;
    }
    const alias = entry.alias ?? entry.key;
    if (pathStyleEntry?.key === entry.key)
      throw new Error("pathStyle and key=value cannot share a key");
    aliasToEntry.set(alias, entry);
    keyToAlias.set(entry.key, alias);
    keyToEntry.set(entry.key, entry);
  }
  // parseHash always returns canonical keys (entry.key), mapping aliases → keys on read.
  const parseHash = (): Record<string, string> => {
    const raw = (typeof window !== "undefined" ? window.location.hash : "").replace(/^#/, "");
    const [pathPart, ...rest] = raw.split("&");
    const out: Record<string, string> = {};
    const pairs = pathStyleEntry
      ? pathPart.startsWith("/")
        ? rest
        : pathPart
          ? [pathPart, ...rest]
          : rest
      : raw.split("&");
    if (pathStyleEntry) {
      const segment = pathPart.startsWith("/") ? pathPart.slice(1) : "";
      out[pathStyleEntry.key] = decodeURIComponent(segment || (pathStyleEntry.defaultValue ?? ""));
    }
    for (const pair of pairs) {
      if (!pair) continue;
      const eq = pair.indexOf("=");
      const rawK = eq < 0 ? pair : pair.slice(0, eq);
      const rawV = eq < 0 ? "" : pair.slice(eq + 1);
      if (!rawK) continue;
      const alias = decodeURIComponent(rawK);
      const entry = aliasToEntry.get(alias);
      const canonical = entry ? entry.key : alias;
      out[canonical] = decodeURIComponent(rawV);
    }
    return out;
  };
  // writeHash accepts canonical-key values; emits aliased entries; pushState for hashchange history.
  const writeHash = (values: Record<string, string>, mode: "replace" | "push" = "replace") => {
    if (typeof window === "undefined" || !window.history?.replaceState) return;
    let pathSegment = "";
    const queryParts: string[] = [];
    for (const [key, value] of Object.entries(values)) {
      if (pathStyleEntry && key === pathStyleEntry.key) {
        pathSegment =
          value && value !== (pathStyleEntry.defaultValue ?? "")
            ? `/${encodeURIComponent(value)}`
            : "";
        continue;
      }
      if (value === "" || value == null) continue;
      const alias = keyToAlias.get(key) ?? key;
      queryParts.push(`${encodeURIComponent(alias)}=${encodeURIComponent(value)}`);
    }
    const next =
      pathSegment + (queryParts.length ? `${pathSegment ? "&" : ""}${queryParts.join("&")}` : "");
    const current = window.location.hash.replace(/^#/, "");
    if (next === current) return;
    const url = next ? `#${next}` : window.location.pathname + window.location.search;
    if (mode === "push") window.history.pushState(null, "", url);
    else window.history.replaceState(null, "", url);
  };
  const applyHashToServer = () => {
    const params = parseHash();
    for (const [canonical, raw] of Object.entries(params)) {
      const scope = keyToEntry.get(canonical)?.scope ?? "page";
      setUi(scope, canonical, raw);
      // Call original sendUiSet directly to avoid re-triggering writeHash from within apply.
      originalSendUiSet(scope, canonical, raw);
    }
  };
  const originalSendUiSet = dispatch.sendUiSet.bind(dispatch);
  const currentHashState = () => {
    const out: Record<string, string> = {};
    for (const entry of urlSyncConfig) {
      const scope = entry.scope ?? "page";
      const value = state.get(`$ui.${scope}.${entry.key}`);
      if (value != null && value !== "")
        out[entry.key] = typeof value === "string" ? value : JSON.stringify(value);
    }
    return out;
  };
  if (urlSyncConfig.length > 0 && typeof window !== "undefined") {
    dispatch.sendUiSet = ((scope: string, path: string, value: unknown) => {
      originalSendUiSet(scope, path, value);
      const entry = keyToEntry.get(path);
      if (entry && (entry.scope ?? "page") === scope) {
        const current = parseHash();
        current[path] = typeof value === "string" ? value : JSON.stringify(value);
        writeHash(current, "push");
      }
    }) as typeof dispatch.sendUiSet;
    window.addEventListener("hashchange", applyHashToServer);
    window.addEventListener("popstate", applyHashToServer);
    // Copy-URL affordance — clipboard write for [data-copy-url="true"] elements.
    document.addEventListener("click", (event) => {
      const btn = (event.target as HTMLElement | null)?.closest?.(
        '[data-copy-url="true"]',
      ) as HTMLElement | null;
      if (!btn || typeof navigator === "undefined" || !navigator.clipboard?.writeText) return;
      void navigator.clipboard.writeText(window.location.href).then(() => {
        btn.setAttribute("data-copied", "true");
        setTimeout(() => btn.removeAttribute("data-copied"), 1500);
      });
    });
  }
  void currentHashState; // retained for future "on reconnect, re-project ctx to hash"

  updateConnectionState("connecting");
  connect();
  // After first connection completes, apply any hash → server so reloads preserve ctx.
  if (urlSyncConfig.length > 0) setTimeout(applyHashToServer, 0);

  return {
    get version() {
      return version;
    },
    get state() {
      return state;
    },
    sendAction: dispatch.sendAction.bind(dispatch),
    sendCustom: dispatch.sendCustom.bind(dispatch),
    setUi,
    subscribe: state.subscribe.bind(state),
    registerAdapter: effects.registry.registerAdapter.bind(effects.registry),
    onConnectionStateChange: (handler) => (listeners.add(handler), () => listeners.delete(handler)),
  };
}

export default init;

declare global {
  interface Window {
    __adkSend?: (frame: unknown) => void;
    __adkCustomAction?: (name: string, payload?: unknown) => void;
    __adkPatchCount?: number;
    __adkSentFrames?: unknown[];
    __adkReceivedFrames?: unknown[];
    ws?: WebSocket;
  }
}
