type ActionResolverContext = {
  bindings: Map<string, unknown>;
  payload?: Record<string, unknown>;
  route?: { path: string; params: Record<string, string>; query: Record<string, string> };
  session?: { currentUser?: { id: string; capabilities: Record<string, string> } };
  item?: unknown;
  index?: number;
};

export class ActionMorphismResolver {
  constructor(private readonly ctx: ActionResolverContext) {}

  resolve(spec: unknown): unknown {
    if (spec === null || spec === undefined) return spec;
    const kind = typeof spec;
    if (kind === "boolean" || kind === "number") return spec;
    if (kind === "string") return this.resolveString(spec as string);
    if (Array.isArray(spec)) return spec.map((entry) => this.resolve(entry));
    if (kind === "object") return this.resolveObject(spec as Record<string, unknown>);
    return spec;
  }

  private resolveString(raw: string): unknown {
    if (raw.startsWith("$") && !raw.includes(" ")) {
      const secondDollar = raw.indexOf("$", 1);
      if (secondDollar === -1) return this.resolvePath(raw);
    }
    return raw.replace(/\$[a-zA-Z_][a-zA-Z0-9_.]*/g, (token) => {
      const value = this.resolvePath(token);
      if (value === null || value === undefined) return "";
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
        return String(value);
      try {
        return JSON.stringify(value);
      } catch {
        return "";
      }
    });
  }

  private resolvePath(path: string): unknown {
    if (!path.startsWith("$")) return path;
    const [head, ...rest] = path.slice(1).split(".");
    switch (head) {
      case "bind": {
        if (rest.length === 0) return undefined;
        const [name, ...subPath] = rest;
        return this.walk(this.ctx.bindings.get(name), subPath);
      }
      case "payload":
        return this.walk(this.ctx.payload, rest);
      case "route": {
        const route = this.ctx.route ?? { path: "/", params: {}, query: {} };
        if (rest.length === 0) return route.path;
        const [segment, ...subPath] = rest;
        if (segment === "params") return this.walk(route.params, subPath);
        if (segment === "query") return this.walk(route.query, subPath);
        const asParam = route.params[segment];
        if (asParam !== undefined) return asParam;
        return this.walk(route, rest);
      }
      case "currentUser":
        return this.walk(this.ctx.session?.currentUser, rest);
      case "capability":
        return rest.length > 0 ? this.ctx.session?.currentUser?.capabilities?.[rest[0]] : undefined;
      case "item":
        return rest.length === 0 ? this.ctx.item : this.walk(this.ctx.item, rest);
      case "i":
      case "index":
        return this.ctx.index;
      default:
        return undefined;
    }
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
        case "if":
          return this.truthy(this.resolve(obj.if))
            ? this.resolve(obj.then)
            : this.resolve(obj.else);
        case "filter": {
          const items = this.resolve(obj.of);
          if (!Array.isArray(items)) return [];
          return items.filter((item, index) =>
            this.truthy(
              new ActionMorphismResolver({ ...this.ctx, item, index }).resolve(obj.where),
            ),
          );
        }
        case "map": {
          const items = this.resolve(obj.of);
          if (!Array.isArray(items)) return [];
          return items.map((item, index) =>
            new ActionMorphismResolver({ ...this.ctx, item, index }).resolve(obj.to),
          );
        }
        default:
          break;
      }
    }

    if ("eq" in obj && Array.isArray(obj.eq) && obj.eq.length === 2) {
      return this.deepEqual(this.resolve(obj.eq[0]), this.resolve(obj.eq[1]));
    }
    if ("not" in obj && Object.keys(obj).length === 1) {
      return !this.truthy(this.resolve(obj.not));
    }
    if ("and" in obj && Array.isArray(obj.and)) {
      return obj.and.every((entry) => this.truthy(this.resolve(entry)));
    }
    if ("or" in obj && Array.isArray(obj.or)) {
      return obj.or.some((entry) => this.truthy(this.resolve(entry)));
    }
    if ("lt" in obj && Array.isArray(obj.lt) && obj.lt.length === 2) {
      const [left, right] = obj.lt.map((entry) => this.resolve(entry));
      return typeof left === "number" && typeof right === "number" ? left < right : false;
    }
    if ("lte" in obj && Array.isArray(obj.lte) && obj.lte.length === 2) {
      const [left, right] = obj.lte.map((entry) => this.resolve(entry));
      return typeof left === "number" && typeof right === "number" ? left <= right : false;
    }
    if ("gt" in obj && Array.isArray(obj.gt) && obj.gt.length === 2) {
      const [left, right] = obj.gt.map((entry) => this.resolve(entry));
      return typeof left === "number" && typeof right === "number" ? left > right : false;
    }
    if ("gte" in obj && Array.isArray(obj.gte) && obj.gte.length === 2) {
      const [left, right] = obj.gte.map((entry) => this.resolve(entry));
      return typeof left === "number" && typeof right === "number" ? left >= right : false;
    }
    if ("if" in obj && "then" in obj) {
      return this.truthy(this.resolve(obj.if)) ? this.resolve(obj.then) : this.resolve(obj.else);
    }

    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, this.resolve(value)]),
    );
  }

  private walk(value: unknown, path: string[]): unknown {
    let current = value;
    for (const segment of path) {
      if (current === null || current === undefined || typeof current !== "object")
        return undefined;
      current = (current as Record<string, unknown>)[segment];
    }
    return current;
  }

  private truthy(value: unknown): boolean {
    return !!value;
  }

  private deepEqual(left: unknown, right: unknown): boolean {
    return JSON.stringify(left) === JSON.stringify(right);
  }
}
