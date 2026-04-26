/**
 * Expression evaluator shared by L08-projection (bindings) and L05-agency
 * (storage router shape morphisms). Per DC6 the evaluator is substrate:
 * both consumers live above L02.
 *
 * V1 ships this alongside `L04-expression/evaluator.ts` as a sibling module.
 * `evaluator.ts` remains the L02 matcher/canonicalizer, while this file is the
 * binding/path-ref morphism engine. A future revision will converge them
 * into a single substrate module.
 */

export interface EvalContext {
  bindings: Map<string, unknown>;
  props?: Record<string, unknown>;
  route?: {
    path: string;
    params: Record<string, string>;
    query: Record<string, string>;
  };
  currentUser?: {
    id: string;
    capabilities: Record<string, string>;
  };
  iteration?: {
    item: unknown;
    index: number;
    name: string;
  };
  $self?: unknown;
  $stored?: unknown;
  $key?: string;
  $now?: string;
  $model?: Record<string, unknown>;
  payload?: Record<string, unknown>;
  item?: unknown;
  index?: number;
}

export class BindingResolver {
  constructor(private ctx: EvalContext) {}

  resolve(spec: unknown): unknown {
    if (spec === null || spec === undefined) return spec;
    const t = typeof spec;
    if (t === "boolean" || t === "number") return spec;
    if (t === "string") return this.resolveString(spec as string);
    if (Array.isArray(spec)) return spec.map((s) => this.resolve(s));
    if (t === "object") return this.resolveObject(spec as Record<string, unknown>);
    return spec;
  }

  resolveAsString(spec: unknown): string {
    const v = this.resolve(spec);
    if (v === null || v === undefined) return "";
    if (typeof v === "string") return v;
    return String(v);
  }

  private resolveString(raw: string): unknown {
    if (raw.startsWith("$") && !raw.includes(" ")) {
      const secondDollar = raw.indexOf("$", 1);
      if (secondDollar === -1) {
        return this.resolvePath(raw);
      }
    }
    return this.interpolate(raw);
  }

  private interpolate(s: string): string {
    return s.replace(/\$[a-zA-Z_][a-zA-Z0-9_.]*/g, (tok) => {
      const v = this.resolvePath(tok);
      if (v === null || v === undefined) return "";
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
        return String(v);
      }
      try {
        return JSON.stringify(v);
      } catch {
        return "";
      }
    });
  }

  private resolvePath(path: string): unknown {
    if (!path.startsWith("$")) return path;
    const segs = path.slice(1).split(".");
    const [head, ...rest] = segs;

    switch (head) {
      case "ws": {
        return this.walk(this.ctx.bindings.get("ws"), rest);
      }
      case "bind":
      case "bindings": {
        if (rest.length === 0) return undefined;
        const [bindingName, ...subPath] = rest;
        const root =
          this.ctx.bindings.get(bindingName) ??
          (bindingName === "suite" ? this.ctx.bindings.get("acceptance") : undefined) ??
          (bindingName === "stepNodes" ? this.ctx.bindings.get("acceptanceNodes") : undefined);
        return this.walk(root, subPath);
      }
      case "ctx": {
        const props = this.ctx.props ?? {};
        if (rest.length === 0) return undefined;
        const stack = Array.isArray(props.__pp09ContextStack)
          ? (props.__pp09ContextStack as Array<Record<string, unknown>>)
          : [];
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          const frame = stack[index];
          if (!frame || typeof frame !== "object") continue;
          const root = (frame.values as Record<string, unknown> | undefined) ?? {};
          const direct = this.walk(root, rest);
          if (direct !== undefined) return direct;
        }
        return undefined;
      }
      case "ui": {
        const props = this.ctx.props ?? {};
        if (rest.length < 2) return undefined;
        const [scope, ...subPath] = rest;
        const stack = Array.isArray(props.__pp09ContextStack)
          ? (props.__pp09ContextStack as Array<Record<string, unknown>>)
          : [];
        for (let index = stack.length - 1; index >= 0; index -= 1) {
          const frame = stack[index];
          if (frame?.scope !== scope) continue;
          return this.walk((frame.values as Record<string, unknown> | undefined) ?? {}, subPath);
        }
        return undefined;
      }
      case "props": {
        return this.walk(this.ctx.props, rest);
      }
      case "self": {
        const root = this.ctx.$self !== undefined ? this.ctx.$self : this.ctx.props;
        return rest.length === 0 ? root : this.walk(root, rest);
      }
      case "stored": {
        const root = this.ctx.$stored;
        return rest.length === 0 ? root : this.walk(root, rest);
      }
      case "key": {
        return rest.length === 0 ? this.ctx.$key : undefined;
      }
      case "now": {
        return rest.length === 0 ? this.ctx.$now : undefined;
      }
      case "model": {
        const root = this.ctx.$model;
        return rest.length === 0 ? root : this.walk(root, rest);
      }
      case "route": {
        if (!this.ctx.route) return undefined;
        if (rest.length === 0) return this.ctx.route.path;
        const [seg, ...sub] = rest;
        if (seg === "params") return this.walk(this.ctx.route.params, sub);
        if (seg === "query") return this.walk(this.ctx.route.query, sub);
        const asParam = this.ctx.route.params[seg];
        if (asParam !== undefined) return asParam;
        return this.walk(this.ctx.route, rest);
      }
      case "currentUser": {
        return this.walk(this.ctx.currentUser, rest);
      }
      case "capability": {
        if (rest.length === 0) return undefined;
        const [capabilityName] = rest;
        return this.ctx.currentUser?.capabilities?.[capabilityName];
      }
      case "payload": {
        const root = this.ctx.payload;
        return rest.length === 0 ? root : this.walk(root, rest);
      }
      case "item": {
        const root = this.ctx.iteration?.item ?? this.ctx.item;
        return rest.length === 0 ? root : this.walk(root, rest);
      }
      case "i":
      case "index": {
        return this.ctx.iteration?.index ?? this.ctx.index;
      }
      default:
        if (this.ctx.iteration && head === this.ctx.iteration.name) {
          if (rest.length === 0) return this.ctx.iteration.item;
          return this.walk(this.ctx.iteration.item, rest);
        }
        return undefined;
    }
  }

  private walk(value: unknown, segs: string[]): unknown {
    let cur = value;
    for (const seg of segs) {
      if (cur === null || cur === undefined) return undefined;
      if (typeof cur !== "object") return undefined;
      cur = (cur as Record<string, unknown>)[seg];
    }
    return cur;
  }

  private resolveObject(obj: Record<string, unknown>): unknown {
    if (typeof obj.op === "string") {
      switch (obj.op) {
        case "const":
          return obj.value;
        case "get":
          return typeof obj.path === "string" ? this.resolvePath(obj.path) : undefined;
        case "eq":
          return Array.isArray(obj.args) && obj.args.length === 2
            ? this.deepEqual(this.resolve(obj.args[0]), this.resolve(obj.args[1]))
            : false;
        case "neq":
          return Array.isArray(obj.args) && obj.args.length === 2
            ? !this.deepEqual(this.resolve(obj.args[0]), this.resolve(obj.args[1]))
            : false;
        case "not":
          return Array.isArray(obj.args) && obj.args.length === 1
            ? !this.truthy(this.resolve(obj.args[0]))
            : false;
        case "and":
          return Array.isArray(obj.args)
            ? obj.args.every((entry) => this.truthy(this.resolve(entry)))
            : false;
        case "or":
          return Array.isArray(obj.args)
            ? obj.args.some((entry) => this.truthy(this.resolve(entry)))
            : false;
        case "lt":
        case "lte":
        case "gt":
        case "gte": {
          if (!Array.isArray(obj.args) || obj.args.length !== 2) return false;
          const left = this.resolve(obj.args[0]);
          const right = this.resolve(obj.args[1]);
          if (typeof left !== "number" || typeof right !== "number") return false;
          if (obj.op === "lt") return left < right;
          if (obj.op === "lte") return left <= right;
          if (obj.op === "gt") return left > right;
          return left >= right;
        }
        case "pick": {
          const src = this.resolve(obj.of) as Record<string, unknown>;
          const fields = Array.isArray(obj.fields) ? obj.fields : [];
          const out: Record<string, unknown> = {};
          if (!src || typeof src !== "object") return out;
          for (const field of fields) {
            if (typeof field === "string" && field in src) out[field] = src[field];
          }
          return out;
        }
        case "omit": {
          const resolved = this.resolve(obj.of);
          const src =
            resolved && typeof resolved === "object"
              ? { ...(resolved as Record<string, unknown>) }
              : {};
          const fields = Array.isArray(obj.fields) ? obj.fields : [];
          for (const field of fields) {
            if (typeof field === "string") delete src[field];
          }
          return src;
        }
        case "merge": {
          const left = this.resolve(obj.left);
          const right = this.resolve(obj.right);
          const l = left && typeof left === "object" ? (left as Record<string, unknown>) : {};
          const r = right && typeof right === "object" ? (right as Record<string, unknown>) : {};
          return { ...l, ...r };
        }
        case "call": {
          if (typeof obj.fn !== "string") return undefined;
          return this.resolveObject({ op: obj.fn, args: Array.isArray(obj.args) ? obj.args : [] });
        }
        case "lookup": {
          const key = this.resolve(obj.of);
          const map = obj.map;
          if (!map || typeof map !== "object" || Array.isArray(map))
            return obj.default !== undefined ? this.resolve(obj.default) : undefined;
          const hit = (map as Record<string, unknown>)[String(key)];
          return hit === undefined
            ? obj.default !== undefined
              ? this.resolve(obj.default)
              : undefined
            : this.resolve(hit);
        }
        case "first": {
          const items = this.resolve(obj.of);
          if (!Array.isArray(items) || items.length === 0) return undefined;
          const first = items[0];
          return typeof obj.field === "string" && first && typeof first === "object"
            ? (first as Record<string, unknown>)[obj.field]
            : first;
        }
        case "filter": {
          const items = this.resolve(obj.of);
          if (!Array.isArray(items)) return [];
          const predicate = obj.predicate;
          if (!predicate || typeof predicate !== "object" || Array.isArray(predicate)) return items;
          const { field, equals } = predicate as { field?: unknown; equals?: unknown };
          if (typeof field !== "string") return items;
          return items.filter(
            (item) =>
              item &&
              typeof item === "object" &&
              (item as Record<string, unknown>)[field] === equals,
          );
        }
        case "map": {
          const items = this.resolve(obj.of);
          if (!Array.isArray(items)) return [];
          return items.map((item, index) =>
            new BindingResolver({
              ...this.ctx,
              iteration: { item, index, name: "item" },
            }).resolve(obj.to),
          );
        }
        case "length": {
          const v = this.resolve(obj.of);
          if (Array.isArray(v) || typeof v === "string") return v.length;
          if (v && typeof v === "object") return Object.keys(v).length;
          return 0;
        }
        case "concat": {
          const args = Array.isArray(obj.args) ? obj.args : [];
          return args
            .map((a) => {
              const r = this.resolve(a);
              return r === null || r === undefined ? "" : String(r);
            })
            .join("");
        }
        default:
          return obj;
      }
    }
    if ("eq" in obj && Array.isArray(obj.eq) && obj.eq.length === 2) {
      const a = this.resolve(obj.eq[0]);
      const b = this.resolve(obj.eq[1]);
      return this.deepEqual(a, b);
    }
    if ("neq" in obj && Array.isArray(obj.neq) && obj.neq.length === 2) {
      return !this.deepEqual(this.resolve(obj.neq[0]), this.resolve(obj.neq[1]));
    }
    if ("not" in obj && Object.keys(obj).length === 1) {
      return !this.truthy(this.resolve(obj.not));
    }
    if ("and" in obj && Array.isArray(obj.and)) {
      return obj.and.every((x) => this.truthy(this.resolve(x)));
    }
    if ("or" in obj && Array.isArray(obj.or)) {
      return obj.or.some((x) => this.truthy(this.resolve(x)));
    }
    if ("capability" in obj && Object.keys(obj).length === 1) {
      const key = this.resolve(obj.capability);
      if (typeof key !== "string") return undefined;
      return this.ctx.currentUser?.capabilities?.[key];
    }
    for (const op of ["lte", "gte", "lt", "gt"] as const) {
      if (
        op in obj &&
        Array.isArray((obj as Record<string, unknown[]>)[op]) &&
        (obj as Record<string, unknown[]>)[op].length === 2
      ) {
        const args = (obj as Record<string, unknown[]>)[op];
        const a = this.resolve(args[0]);
        const b = this.resolve(args[1]);
        if (typeof a === "number" && typeof b === "number") {
          if (op === "lte") return a <= b;
          if (op === "gte") return a >= b;
          if (op === "lt") return a < b;
          if (op === "gt") return a > b;
        }
        return false;
      }
    }
    if ("if" in obj) {
      const cond = this.truthy(this.resolve(obj.if));
      return cond ? this.resolve(obj.then) : this.resolve(obj.else);
    }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      out[k] = this.resolve(v);
    }
    return out;
  }

  private truthy(v: unknown): boolean {
    if (v === null || v === undefined) return false;
    if (typeof v === "boolean") return v;
    if (typeof v === "number") return v !== 0;
    if (typeof v === "string") return v.length > 0;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.keys(v).length > 0;
    return true;
  }

  private deepEqual(a: unknown, b: unknown): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== typeof b) return false;
    if (typeof a !== "object") return false;
    if (Array.isArray(a)) {
      if (!Array.isArray(b) || a.length !== b.length) return false;
      return a.every((v, i) => this.deepEqual(v, b[i]));
    }
    const ak = Object.keys(a as object);
    const bk = Object.keys(b as object);
    if (ak.length !== bk.length) return false;
    return ak.every((k) =>
      this.deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]),
    );
  }
}
