import { describe, expect, test } from "bun:test";

import { BindingResolver, type EvalContext } from "./binding-resolver.ts";

function makeContext(overrides: Partial<EvalContext> = {}): EvalContext {
  return {
    bindings: new Map<string, unknown>([
      ["order", { id: "ord-9", status: "pending" }],
      ["legacy", { ok: true }],
    ]),
    props: { title: "Projection title" },
    route: { path: "/orders/ord-9", params: { id: "ord-9" }, query: { page: "1" } },
    currentUser: { id: "user-1", capabilities: { ConfirmOrder: "cid-abc" } },
    payload: { amount: 3, nested: { active: true } },
    item: { title: "payload-item" },
    index: 7,
    $self: { id: "ord-9", title: "Draft", status: "pending", meta: { views: 1 } },
    $stored: { id: "ord-9", title: "Stored", archived: false },
    $key: "ord-9",
    $now: "2026-04-24T19:29:54.177Z",
    $model: { foo: "bar", nested: { label: "n" } },
    ...overrides,
  };
}

describe("binding-resolver operators", () => {
  test("pick returns only whitelisted fields and drops unknown fields", () => {
    const resolver = new BindingResolver(makeContext());

    expect(
      resolver.resolve({
        op: "pick",
        of: "$self",
        fields: ["title", "missing", "status"],
      }),
    ).toEqual({ title: "Draft", status: "pending" });
  });

  test("omit returns a shallow copy and unknown fields are no-ops", () => {
    const ctx = makeContext();
    const source = ctx.$self as Record<string, unknown>;
    const resolver = new BindingResolver(ctx);

    expect(
      resolver.resolve({
        op: "omit",
        of: "$self",
        fields: ["status", "missing"],
      }),
    ).toEqual({ id: "ord-9", title: "Draft", meta: { views: 1 } });
    expect(source).toEqual({ id: "ord-9", title: "Draft", status: "pending", meta: { views: 1 } });
  });

  test("merge is shallow, right wins, and neither side is mutated", () => {
    const left = { id: "ord-9", title: "Draft", nested: { left: true } };
    const right = { title: "Published", nested: { right: true } };
    const resolver = new BindingResolver(
      makeContext({
        $self: left,
        $stored: right,
      }),
    );

    expect(
      resolver.resolve({
        op: "merge",
        left: "$self",
        right: "$stored",
      }),
    ).toEqual({ id: "ord-9", title: "Published", nested: { right: true } });
    expect(left).toEqual({ id: "ord-9", title: "Draft", nested: { left: true } });
    expect(right).toEqual({ title: "Published", nested: { right: true } });
  });

  test("nested pick plus merge composition resolves correctly", () => {
    const resolver = new BindingResolver(makeContext());

    expect(
      resolver.resolve({
        op: "merge",
        left: { op: "pick", of: "$self", fields: ["title"] },
        right: { id: "$key" },
      }),
    ).toEqual({ title: "Draft", id: "ord-9" });
  });
});

describe("binding-resolver path refs", () => {
  test("$self, $key, $stored, and $now resolve from EvalContext", () => {
    const resolver = new BindingResolver(makeContext());

    expect(resolver.resolve("$self.title")).toBe("Draft");
    expect(resolver.resolve("$key")).toBe("ord-9");
    expect(resolver.resolve("$stored.archived")).toBe(false);
    expect(resolver.resolve("$now")).toBe("2026-04-24T19:29:54.177Z");
  });

  test("$model attr resolution works and missing attrs return undefined", () => {
    const resolver = new BindingResolver(makeContext());

    expect(resolver.resolve("$model.foo")).toBe("bar");
    expect(resolver.resolve("$model.missing")).toBeUndefined();
  });

  test("unset storage-only refs resolve to undefined rather than throwing", () => {
    const resolver = new BindingResolver(
      makeContext({
        $self: undefined,
        $stored: undefined,
        $key: undefined,
        $now: undefined,
        $model: undefined,
      }),
    );

    expect(resolver.resolve("$self.title")).toBe("Projection title");
    expect(resolver.resolve("$stored.title")).toBeUndefined();
    expect(resolver.resolve("$key")).toBeUndefined();
    expect(resolver.resolve("$now")).toBeUndefined();
    expect(resolver.resolve("$model.foo")).toBeUndefined();
  });
});

describe("binding-resolver legacy compat", () => {
  test("legacy $item, $payload, and bindings.* resolution still works", () => {
    const resolver = new BindingResolver(
      makeContext({
        iteration: { item: { id: "iter-1", title: "Iter title" }, index: 2, name: "row" },
      }),
    );

    expect(resolver.resolve("$item.title")).toBe("Iter title");
    expect(resolver.resolve("$payload.nested.active")).toBe(true);
    expect(resolver.resolve("$bindings.order.status")).toBe("pending");
  });

  test("existing projection aliases remain available", () => {
    const resolver = new BindingResolver(
      makeContext({
        props: {
          title: "Projection title",
          __pp09ContextStack: [{ scope: "panel", values: { status: "ready" } }],
        },
      }),
    );

    expect(resolver.resolve("$props.title")).toBe("Projection title");
    expect(resolver.resolve("$route.id")).toBe("ord-9");
    expect(resolver.resolve("$currentUser.id")).toBe("user-1");
    expect(resolver.resolve("$capability.ConfirmOrder")).toBe("cid-abc");
    expect(resolver.resolve("$ui.panel.status")).toBe("ready");
  });

  test("length op counts arrays, strings, and object keys", () => {
    const resolver = new BindingResolver(makeContext());
    expect(resolver.resolve({ op: "length", of: { op: "const", value: [1, 2, 3] } })).toBe(3);
    expect(resolver.resolve({ op: "length", of: { op: "const", value: "hello" } })).toBe(5);
    expect(resolver.resolve({ op: "length", of: { op: "const", value: { a: 1, b: 2 } } })).toBe(2);
    expect(resolver.resolve({ op: "length", of: { op: "const", value: [] } })).toBe(0);
  });

  test("length of filter supports 'items left' patterns", () => {
    const resolver = new BindingResolver(
      makeContext({
        bindings: new Map<string, unknown>([
          [
            "todos",
            {
              instances: [
                { id: "a", completed: false },
                { id: "b", completed: true },
                { id: "c", completed: false },
              ],
            },
          ],
        ]),
      }),
    );
    const result = resolver.resolve({
      op: "length",
      of: {
        op: "filter",
        of: "$bindings.todos.instances",
        predicate: { field: "completed", equals: false },
      },
    });
    expect(result).toBe(2);
  });

  test("concat op joins resolved args into a single string", () => {
    const resolver = new BindingResolver(makeContext());
    const result = resolver.resolve({
      op: "concat",
      args: [{ op: "const", value: 3 }, " items left"],
    });
    expect(result).toBe("3 items left");
  });
});
