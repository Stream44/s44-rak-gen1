import { canonicalize } from "../L01-foundation/utils.ts";
import { JsonEncoder } from "../L01-foundation/encoder.ts";
import type { TypeRegistry } from "../L03-tower/registry.ts";

export interface DiffOp {
  op: "add" | "remove" | "replace";
  path: string;
  value?: unknown;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [k: string]: JsonValue };
type InternalRegistry = {
  cache: Map<string, unknown>;
  store: { get(id: string): Uint8Array | null };
  encoder?: { decode(bytes: Uint8Array): unknown };
};

const norm = (value: unknown): JsonValue => {
  const text = canonicalize(value);
  return text === undefined ? null : (JSON.parse(text) as JsonValue);
};
const esc = (segment: string | number) =>
  String(segment).replaceAll("~", "~0").replaceAll("/", "~1");
const trunc = (text: string) => (text.length <= 80 ? text : `${text.slice(0, 79)}...`);

export function diff(a: unknown, b: unknown): DiffOp[] {
  const out: DiffOp[] = [];
  const walk = (left: JsonValue, right: JsonValue, path: string): void => {
    if (Array.isArray(left) && Array.isArray(right)) {
      for (let i = 0; i < Math.min(left.length, right.length); i += 1)
        walk(left[i]!, right[i]!, `${path}/${esc(i)}`);
      for (let i = right.length; i < left.length; i += 1)
        out.push({ op: "remove", path: `${path}/${esc(i)}` });
      for (let i = left.length; i < right.length; i += 1)
        out.push({ op: "add", path: `${path}/${esc(i)}`, value: right[i] });
      return;
    }
    if (
      left &&
      right &&
      typeof left === "object" &&
      typeof right === "object" &&
      !Array.isArray(left) &&
      !Array.isArray(right)
    ) {
      const aKeys = Object.keys(left).sort();
      const bKeys = Object.keys(right).sort();
      for (const key of aKeys)
        if (!(key in right)) out.push({ op: "remove", path: `${path}/${esc(key)}` });
      for (const key of bKeys)
        key in left
          ? walk(left[key]!, right[key]!, `${path}/${esc(key)}`)
          : out.push({ op: "add", path: `${path}/${esc(key)}`, value: right[key] });
      return;
    }
    if (canonicalize(left) !== canonicalize(right))
      out.push({ op: "replace", path: path || "/", value: right });
  };
  walk(norm(a), norm(b), "");
  return out;
}

export function diffByCid(registry: TypeRegistry, aCid: string, bCid: string): DiffOp[] {
  const internal = registry as unknown as InternalRegistry;
  const decode =
    internal.encoder?.decode.bind(internal.encoder) ??
    new JsonEncoder().decode.bind(new JsonEncoder());
  const resolve = (cid: string): unknown => {
    const cached = internal.cache?.get(cid);
    if (cached !== undefined) return cached;
    const bytes = internal.store?.get(cid);
    if (!bytes) throw new Error(`diffByCid: unresolvable CID ${cid}`);
    return decode(bytes);
  };
  return diff(resolve(aCid), resolve(bCid));
}

export function diffToString(ops: DiffOp[], opts?: { color?: boolean }): string {
  const paint = (code: number, text: string) =>
    opts?.color ? `\u001b[${code}m${text}\u001b[0m` : text;
  const mark = { add: ["+", 32], remove: ["-", 31], replace: ["~", 33] } as const;
  return [
    "# Index-based array diff (compares array positions, not best-match moves)",
    ...ops.map(({ op, path, value }) => {
      const [prefix, color] = mark[op];
      const tail = op === "remove" ? "" : ` ${trunc(canonicalize(value) ?? "undefined")}`;
      return paint(color, `${prefix} ${path}${tail}`);
    }),
  ].join("\n");
}
