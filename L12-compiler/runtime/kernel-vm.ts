import { canonicalize } from "../../L01-foundation/utils.ts";
import type { Bundle, Bytecode } from "../ir/bytecode.ts";
import { Opcode } from "../ir/opcodes.ts";
import { Gas, type GasTable } from "./gas.ts";

type BundleRegistry = { get(cid: string): Bundle | null };
type ClosureValue = { bundle: Bundle; captures: unknown[]; captureStart: number };
type ModuleResolver = (uri: string, exportName: string) => Function | Promise<Function>;
type MatchPattern =
  | { kind: "wildcard" }
  | { kind: "var"; name: string }
  | { kind: "const"; value: unknown }
  | { kind: "record"; fields: Record<string, MatchPattern> };

const COSTLY = {
  APPLY: 2,
  CALL_MODULE: 2,
  CALL_MORPHISM: 2,
  FILTER: 2,
  FOLD: 2,
  MAKE_CLOSURE: 2,
  MAP: 2,
} satisfies GasTable;
const isBundle = (v: unknown): v is Bundle =>
  !!v && typeof v === "object" && "code" in v && "registerCount" in v;
const isClosure = (v: unknown): v is ClosureValue =>
  !!v && typeof v === "object" && "bundle" in v && "captures" in v && "captureStart" in v;
const matchPattern = (
  pattern: MatchPattern,
  value: unknown,
): { matched: boolean; bindings: Record<string, unknown> } => {
  if (pattern.kind === "wildcard") return { matched: true, bindings: {} };
  if (pattern.kind === "var") return { matched: true, bindings: { [pattern.name]: value } };
  if (pattern.kind === "const") return { matched: Object.is(pattern.value, value), bindings: {} };
  if (value === null || typeof value !== "object") return { matched: false, bindings: {} };
  const bindings: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(pattern.fields)) {
    const out = matchPattern(child, (value as Record<string, unknown>)[key]);
    if (!out.matched) return { matched: false, bindings: {} };
    Object.assign(bindings, out.bindings);
  }
  return { matched: true, bindings };
};
const evalMatchBody = (
  node: Record<string, unknown>,
  bindings: Record<string, unknown>,
  input: unknown,
): unknown => {
  if (node.op === "const") return node.value;
  if (node.op === "var")
    return bindings[String(node.name)] ?? (node.name === "$input" ? input : undefined);
  if (node.op === "record")
    return Object.fromEntries(
      Object.entries(
        (node.fields as Record<string, Record<string, unknown>> | undefined) ?? {},
      ).map(([key, value]) => [key, evalMatchBody(value, bindings, input)]),
    );
  if (node.op === "array")
    return ((node.elements as Record<string, unknown>[] | undefined) ?? []).map((value) =>
      evalMatchBody(value, bindings, input),
    );
  throw new KernelVmError(`MATCH_KNOWN body op unsupported: ${String(node.op)}`);
};
const safeCanonicalize = (value: unknown, seen = new WeakSet<object>()): string => {
  if (value === null || value === undefined || typeof value !== "object")
    return canonicalize(value);
  if (seen.has(value as object)) throw new Error("Cannot canonicalize cyclic value");
  seen.add(value as object);
  const out = Array.isArray(value)
    ? "[" + value.map((entry) => safeCanonicalize(entry, seen)).join(",") + "]"
    : "{" +
      Object.keys(value as Record<string, unknown>)
        .sort()
        .filter((k) => (value as Record<string, unknown>)[k] !== undefined)
        .map(
          (k) =>
            JSON.stringify(k) + ":" + safeCanonicalize((value as Record<string, unknown>)[k], seen),
        )
        .join(",") +
      "}";
  seen.delete(value as object);
  return out;
};

export class KernelVmError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KernelVmError";
  }
}

export interface OpcodeKernelVmOptions {
  bytecode?: Bytecode;
  gas?: Gas;
  gasTable?: GasTable;
  moduleResolver?: ModuleResolver;
  registry?: BundleRegistry;
  trace?: (message: string, value: unknown) => void;
}

export class OpcodeKernelVm {
  constructor(readonly options: OpcodeKernelVmOptions = {}) {}

  async run(cidOrInput?: unknown, input?: unknown, gasLimit = Infinity): Promise<unknown> {
    const bundle =
      typeof cidOrInput === "string"
        ? this.resolveBundle(cidOrInput)
        : isBundle(cidOrInput)
          ? cidOrInput
          : this.options.bytecode;
    if (!bundle) throw new KernelVmError("OpcodeKernelVm.run: no bundle available");
    return this.execute(
      bundle,
      typeof cidOrInput === "string" ? input : isBundle(cidOrInput) ? input : cidOrInput,
      this.options.gas ?? new Gas(gasLimit, this.options.gasTable ?? COSTLY),
    );
  }

  private resolveBundle(cid: string): Bundle {
    const bundle =
      this.options.registry?.get(cid) ??
      (this.options.bytecode?.cid === cid ? this.options.bytecode : null);
    if (!bundle) throw new KernelVmError(`Unknown bundle CID: ${cid}`);
    return bundle;
  }

  private reg(registers: unknown[], idx: number): unknown {
    if (idx < 0 || idx >= registers.length)
      throw new KernelVmError(`Register out of bounds: r${idx}`);
    return registers[idx];
  }

  private set(registers: unknown[], idx: number, value: unknown): void {
    if (idx < 0 || idx >= registers.length)
      throw new KernelVmError(`Register out of bounds: r${idx}`);
    registers[idx] = value;
  }

  private applyClosure(closure: ClosureValue, arg: unknown, gas: Gas): Promise<unknown> {
    const regs = new Array<unknown>(closure.bundle.registerCount);
    regs[0] = arg;
    closure.captures.forEach((value, i) => {
      regs[closure.captureStart + i] = value;
    });
    return this.execute(closure.bundle, arg, gas, regs);
  }

  private async execute(
    bundle: Bundle,
    input: unknown,
    gas: Gas,
    registers = new Array<unknown>(bundle.registerCount),
  ): Promise<unknown> {
    const { code, constants, closureTable } = bundle;
    let lastValue: unknown = undefined;
    if (registers[0] === undefined && bundle.registerCount > 0) registers[0] = input;
    const jump = (target: number, opName: string) => {
      if (target < 0 || target > code.length)
        throw new KernelVmError(`${opName} target out of bounds: ${target}`);
      return target;
    };
    for (let pc = bundle.entryPoint; pc < code.length; ) {
      const op = code[pc]!,
        name = Opcode[op] as string;
      gas.charge(name);
      switch (op) {
        case Opcode.LOAD_CONST:
          this.set(registers, code[pc + 1]!, constants[code[pc + 2]!]!);
          lastValue = registers[code[pc + 1]!];
          pc += 3;
          break;
        case Opcode.MOVE:
          this.set(registers, code[pc + 1]!, this.reg(registers, code[pc + 2]!));
          lastValue = registers[code[pc + 1]!];
          pc += 3;
          break;
        case Opcode.LOAD_INPUT:
          this.set(registers, code[pc + 1]!, input);
          lastValue = registers[code[pc + 1]!];
          pc += 2;
          break;
        case Opcode.ADD:
        case Opcode.ADD_INT:
          this.set(
            registers,
            code[pc + 1]!,
            Number(this.reg(registers, code[pc + 2]!)) + Number(this.reg(registers, code[pc + 3]!)),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.SUB:
        case Opcode.SUB_INT:
          this.set(
            registers,
            code[pc + 1]!,
            Number(this.reg(registers, code[pc + 2]!)) - Number(this.reg(registers, code[pc + 3]!)),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.MUL:
        case Opcode.MUL_INT:
          this.set(
            registers,
            code[pc + 1]!,
            Number(this.reg(registers, code[pc + 2]!)) * Number(this.reg(registers, code[pc + 3]!)),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.DIV: {
          const b = Number(this.reg(registers, code[pc + 3]!));
          if (b === 0) throw new Error("Division by zero");
          this.set(registers, code[pc + 1]!, Number(this.reg(registers, code[pc + 2]!)) / b);
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        }
        case Opcode.MOD:
          this.set(
            registers,
            code[pc + 1]!,
            Number(this.reg(registers, code[pc + 2]!)) % Number(this.reg(registers, code[pc + 3]!)),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.NEG:
          this.set(registers, code[pc + 1]!, -Number(this.reg(registers, code[pc + 2]!)));
          lastValue = registers[code[pc + 1]!];
          pc += 3;
          break;
        case Opcode.ABS:
          this.set(registers, code[pc + 1]!, Math.abs(Number(this.reg(registers, code[pc + 2]!))));
          lastValue = registers[code[pc + 1]!];
          pc += 3;
          break;
        case Opcode.EQ:
          this.set(
            registers,
            code[pc + 1]!,
            this.reg(registers, code[pc + 2]!) === this.reg(registers, code[pc + 3]!),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.EQ_INT:
        case Opcode.EQ_STR:
          this.set(
            registers,
            code[pc + 1]!,
            this.reg(registers, code[pc + 2]!) === this.reg(registers, code[pc + 3]!),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.NEQ:
          this.set(
            registers,
            code[pc + 1]!,
            this.reg(registers, code[pc + 2]!) !== this.reg(registers, code[pc + 3]!),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.LT:
        case Opcode.LT_INT:
          this.set(
            registers,
            code[pc + 1]!,
            Number(this.reg(registers, code[pc + 2]!)) < Number(this.reg(registers, code[pc + 3]!)),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.LTE:
          this.set(
            registers,
            code[pc + 1]!,
            Number(this.reg(registers, code[pc + 2]!)) <=
              Number(this.reg(registers, code[pc + 3]!)),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.GT:
          this.set(
            registers,
            code[pc + 1]!,
            Number(this.reg(registers, code[pc + 2]!)) > Number(this.reg(registers, code[pc + 3]!)),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.GTE:
          this.set(
            registers,
            code[pc + 1]!,
            Number(this.reg(registers, code[pc + 2]!)) >=
              Number(this.reg(registers, code[pc + 3]!)),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.AND:
          this.set(
            registers,
            code[pc + 1]!,
            Boolean(this.reg(registers, code[pc + 2]!)) &&
              Boolean(this.reg(registers, code[pc + 3]!)),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.OR:
          this.set(
            registers,
            code[pc + 1]!,
            Boolean(this.reg(registers, code[pc + 2]!)) ||
              Boolean(this.reg(registers, code[pc + 3]!)),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.NOT:
          this.set(registers, code[pc + 1]!, !this.reg(registers, code[pc + 2]!));
          lastValue = registers[code[pc + 1]!];
          pc += 3;
          break;
        case Opcode.CONCAT:
          this.set(
            registers,
            code[pc + 1]!,
            String(this.reg(registers, code[pc + 2]!)) + String(this.reg(registers, code[pc + 3]!)),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.LEN:
          this.set(
            registers,
            code[pc + 1]!,
            (this.reg(registers, code[pc + 2]!) as { length?: number })?.length ?? 0,
          );
          lastValue = registers[code[pc + 1]!];
          pc += 3;
          break;
        case Opcode.LEN_ARR:
          this.set(
            registers,
            code[pc + 1]!,
            Array.isArray(this.reg(registers, code[pc + 2]!))
              ? (this.reg(registers, code[pc + 2]!) as unknown[]).length
              : 0,
          );
          lastValue = registers[code[pc + 1]!];
          pc += 3;
          break;
        case Opcode.SUBSTR:
          this.set(
            registers,
            code[pc + 1]!,
            String(this.reg(registers, code[pc + 2]!)).slice(
              Number(this.reg(registers, code[pc + 3]!)),
              Number(this.reg(registers, code[pc + 4]!)),
            ),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 5;
          break;
        case Opcode.CANONICALIZE:
          this.set(registers, code[pc + 1]!, safeCanonicalize(this.reg(registers, code[pc + 2]!)));
          lastValue = registers[code[pc + 1]!];
          pc += 3;
          break;
        case Opcode.GET_FIELD:
          this.set(
            registers,
            code[pc + 1]!,
            (this.reg(registers, code[pc + 2]!) as Record<string, unknown> | null | undefined)?.[
              String(constants[code[pc + 3]!] ?? "")
            ],
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.GET_FIELD_KNOWN: {
          const record = this.reg(registers, code[pc + 2]!) as
            | Record<string, unknown>
            | null
            | undefined;
          const key = record ? Object.keys(record)[code[pc + 3]!] : undefined;
          this.set(registers, code[pc + 1]!, key ? record?.[key] : undefined);
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        }
        case Opcode.MAKE_RECORD: {
          const n = code[pc + 2]!,
            out: Record<string, unknown> = {};
          for (let i = 0; i < n; i++)
            out[String(constants[code[pc + 3 + i]!] ?? "")] = this.reg(
              registers,
              code[pc + 3 + n + i]!,
            );
          this.set(registers, code[pc + 1]!, out);
          lastValue = registers[code[pc + 1]!];
          pc += 3 + n * 2;
          break;
        }
        case Opcode.MAKE_ARRAY: {
          const n = code[pc + 2]!;
          this.set(
            registers,
            code[pc + 1]!,
            Array.from({ length: n }, (_, i) => this.reg(registers, code[pc + 3 + i]!)),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 3 + n;
          break;
        }
        case Opcode.MERGE:
          this.set(registers, code[pc + 1]!, {
            ...(this.reg(registers, code[pc + 2]!) as object),
            ...(this.reg(registers, code[pc + 3]!) as object),
          });
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        case Opcode.HEAD:
          this.set(registers, code[pc + 1]!, (this.reg(registers, code[pc + 2]!) as unknown[])[0]);
          lastValue = registers[code[pc + 1]!];
          pc += 3;
          break;
        case Opcode.TAIL:
          this.set(
            registers,
            code[pc + 1]!,
            (this.reg(registers, code[pc + 2]!) as unknown[]).slice(1),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 3;
          break;
        case Opcode.MATCHES:
          this.set(
            registers,
            code[pc + 1]!,
            matchPattern(
              this.reg(registers, code[pc + 3]!) as MatchPattern,
              this.reg(registers, code[pc + 2]!),
            ),
          );
          pc += 4;
          break;
        case Opcode.MAKE_CLOSURE: {
          const idx = code[pc + 2]!,
            count = code[pc + 3]!,
            start = code[pc + 4]!,
            entry = closureTable[idx];
          if (!entry?.bundle) throw new KernelVmError(`Closure ${idx} missing bundle`);
          this.set(registers, code[pc + 1]!, {
            bundle: entry.bundle,
            captures: Array.from({ length: count }, (_, i) => this.reg(registers, start + i)),
            captureStart: start,
          });
          lastValue = registers[code[pc + 1]!];
          pc += 5;
          break;
        }
        case Opcode.APPLY: {
          const closure = this.reg(registers, code[pc + 2]!);
          if (!isClosure(closure)) throw new KernelVmError("APPLY requires a closure");
          this.set(
            registers,
            code[pc + 1]!,
            await this.applyClosure(closure, this.reg(registers, code[pc + 3]!), gas),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        }
        case Opcode.MAP:
        case Opcode.MAP_INT_INT:
        case Opcode.FILTER:
        case Opcode.FOLD: {
          const closure = this.reg(registers, code[pc + 3 + (op === Opcode.FOLD ? 1 : 0)]!);
          if (!isClosure(closure)) throw new KernelVmError(`${name} requires a closure`);
          const arr = this.reg(registers, code[pc + 2]!) as unknown[];
          if (!Array.isArray(arr)) throw new KernelVmError(`${name} requires an array`);
          if (op === Opcode.MAP || op === Opcode.MAP_INT_INT)
            this.set(
              registers,
              code[pc + 1]!,
              await Promise.all(arr.map((item) => this.applyClosure(closure, item, gas))),
            );
          else if (op === Opcode.FILTER)
            this.set(
              registers,
              code[pc + 1]!,
              (await Promise.all(arr.map((item) => this.applyClosure(closure, item, gas)))).flatMap(
                (keep, i) => (keep ? [arr[i]] : []),
              ),
            );
          else {
            let acc = this.reg(registers, code[pc + 3]!);
            for (const item of arr) acc = await this.applyClosure(closure, [acc, item], gas);
            this.set(registers, code[pc + 1]!, acc);
          }
          lastValue = registers[code[pc + 1]!];
          pc += op === Opcode.FOLD ? 5 : 4;
          break;
        }
        case Opcode.FILTER_RECORD_KNOWN_FIELD: {
          const arr = this.reg(registers, code[pc + 2]!) as unknown[];
          if (!Array.isArray(arr)) throw new KernelVmError(`${name} requires an array`);
          const field = String(constants[code[pc + 3]!] ?? "");
          this.set(
            registers,
            code[pc + 1]!,
            arr.filter((item) =>
              Boolean((item as Record<string, unknown> | null | undefined)?.[field]),
            ),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        }
        case Opcode.JUMP:
          pc = jump(code[pc + 1]!, "JUMP");
          break;
        case Opcode.JUMP_IF_TRUE:
          pc = this.reg(registers, code[pc + 1]!) ? jump(code[pc + 2]!, "JUMP_IF_TRUE") : pc + 3;
          break;
        case Opcode.JUMP_IF_FALSE:
          pc = this.reg(registers, code[pc + 1]!) ? pc + 3 : jump(code[pc + 2]!, "JUMP_IF_FALSE");
          break;
        case Opcode.SWITCH_STR: {
          const scrutinee = this.reg(registers, code[pc + 2]!);
          const table = constants[code[pc + 3]!] as Array<{ value: unknown; target: number }>;
          const matched = table.find((entry) => Object.is(entry.value, scrutinee));
          this.set(registers, code[pc + 1]!, matched?.target);
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        }
        case Opcode.MATCH_KNOWN: {
          const scrutinee = this.reg(registers, code[pc + 2]!);
          const cases = constants[code[pc + 3]!] as Array<{
            pattern: MatchPattern;
            body: Record<string, unknown>;
          }>;
          const matched = cases.find((entry) => matchPattern(entry.pattern, scrutinee).matched);
          if (!matched) throw new KernelVmError("MATCH_KNOWN found no matching case");
          const bindings = matchPattern(matched.pattern, scrutinee).bindings;
          this.set(registers, code[pc + 1]!, evalMatchBody(matched.body, bindings, input));
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        }
        case Opcode.CALL_MORPHISM: {
          const callee = this.options.registry?.get(bundle.calleeTable[code[pc + 2]!]!);
          if (!callee)
            throw new KernelVmError(`Unknown morphism CID: ${bundle.calleeTable[code[pc + 2]!]}`);
          this.set(
            registers,
            code[pc + 1]!,
            await this.execute(callee, this.reg(registers, code[pc + 3]!), gas),
          );
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        }
        case Opcode.CALL_MODULE: {
          const uri = bundle.moduleTable[code[pc + 2]!]!,
            exportName = uri.includes("#") ? uri.split("#").at(-1)! : "default",
            fn = await this.options.moduleResolver?.(uri, exportName);
          if (typeof fn !== "function")
            throw new KernelVmError(`CALL_MODULE requires moduleResolver for ${uri}`);
          this.set(registers, code[pc + 1]!, await fn(this.reg(registers, code[pc + 3]!)));
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        }
        case Opcode.RET: {
          const value = this.reg(registers, code[pc + 1]!);
          if (value === undefined)
            throw new KernelVmError(`RET requires a value in r${code[pc + 1]}`);
          return value;
        }
        case Opcode.GAS:
          this.set(registers, code[pc + 1]!, gas.remaining());
          lastValue = registers[code[pc + 1]!];
          pc += 2;
          break;
        case Opcode.TRACE: {
          const value = this.reg(registers, code[pc + 2]!);
          this.options.trace?.(String(constants[code[pc + 3]!] ?? "TRACE"), value);
          this.set(registers, code[pc + 1]!, value);
          lastValue = registers[code[pc + 1]!];
          pc += 4;
          break;
        }
        default:
          throw new KernelVmError(`Unknown opcode: ${op}`);
      }
    }
    if (lastValue !== undefined) return lastValue;
    throw new KernelVmError(`Execution fell off end of bundle ${bundle.cid}`);
  }
}
