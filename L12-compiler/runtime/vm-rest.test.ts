import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import { createLocalModuleResolver } from "../../L11-projection/module-loader.ts";
import type { Bundle } from "../ir/bytecode.ts";
import { Opcode } from "../ir/opcodes.ts";
import { GasExhaustedError } from "./gas.ts";
import { OpcodeKernelVm } from "./kernel-vm.ts";

const b = (code: number[], constants: unknown[] = [], extra: Partial<Bundle> = {}): Bundle => ({
  cid: "cid:test",
  compilerVersion: 1,
  code: new Uint32Array(code),
  constants,
  registerCount: 8,
  entryPoint: 0,
  moduleTable: [],
  calleeTable: [],
  closureTable: [],
  sourceMap: {},
  ...extra,
});
const run = (bundle: Bundle, opts: ConstructorParameters<typeof OpcodeKernelVm>[0] = {}) =>
  new OpcodeKernelVm(opts).run(bundle);
const fit = resolve(import.meta.dir, "../../L11-projection/morphisms/test-fixtures");
const closure = (code: number[], registerCount = 4): Bundle => b(code, [], { registerCount });

describe("vm rest + gas", () => {
  test("CONCAT", async () =>
    expect(
      await run(
        b(
          [Opcode.LOAD_CONST, 1, 0, Opcode.LOAD_CONST, 2, 1, Opcode.CONCAT, 0, 1, 2, Opcode.RET, 0],
          ["a", "b"],
        ),
      ),
    ).toBe("ab"));
  test("LEN", async () =>
    expect(await run(b([Opcode.LOAD_CONST, 1, 0, Opcode.LEN, 0, 1, Opcode.RET, 0], ["abcd"]))).toBe(
      4,
    ));
  test("SUBSTR", async () =>
    expect(
      await run(
        b(
          [
            Opcode.LOAD_CONST,
            1,
            0,
            Opcode.LOAD_CONST,
            2,
            1,
            Opcode.LOAD_CONST,
            3,
            2,
            Opcode.SUBSTR,
            0,
            1,
            2,
            3,
            Opcode.RET,
            0,
          ],
          ["forge", 1, 4],
        ),
      ),
    ).toBe("org"));
  test("GET_FIELD", async () =>
    expect(
      await run(
        b([Opcode.LOAD_CONST, 1, 0, Opcode.GET_FIELD, 0, 1, 1, Opcode.RET, 0], [{ a: 7 }, "a"]),
      ),
    ).toBe(7));
  test("MAKE_RECORD", async () =>
    expect(
      await run(
        b(
          [
            Opcode.LOAD_CONST,
            1,
            2,
            Opcode.LOAD_CONST,
            2,
            3,
            Opcode.MAKE_RECORD,
            0,
            2,
            0,
            1,
            1,
            2,
            Opcode.RET,
            0,
          ],
          ["a", "b", 1, 2],
        ),
      ),
    ).toEqual({ a: 1, b: 2 }));
  test("MAKE_ARRAY", async () =>
    expect(
      await run(
        b(
          [
            Opcode.LOAD_CONST,
            1,
            0,
            Opcode.LOAD_CONST,
            2,
            1,
            Opcode.MAKE_ARRAY,
            0,
            2,
            1,
            2,
            Opcode.RET,
            0,
          ],
          [1, 2],
        ),
      ),
    ).toEqual([1, 2]));
  test("MERGE", async () =>
    expect(
      await run(
        b(
          [Opcode.LOAD_CONST, 1, 0, Opcode.LOAD_CONST, 2, 1, Opcode.MERGE, 0, 1, 2, Opcode.RET, 0],
          [{ a: 1 }, { b: 2 }],
        ),
      ),
    ).toEqual({ a: 1, b: 2 }));
  test("HEAD", async () =>
    expect(
      await run(b([Opcode.LOAD_CONST, 1, 0, Opcode.HEAD, 0, 1, Opcode.RET, 0], [[9, 8]])),
    ).toBe(9));
  test("TAIL", async () =>
    expect(
      await run(b([Opcode.LOAD_CONST, 1, 0, Opcode.TAIL, 0, 1, Opcode.RET, 0], [[9, 8, 7]])),
    ).toEqual([8, 7]));
  test("LEN_ARR", async () =>
    expect(
      await run(b([Opcode.LOAD_CONST, 1, 0, Opcode.LEN_ARR, 0, 1, Opcode.RET, 0], [[1, 2, 3]])),
    ).toBe(3));
  test("CANONICALIZE", async () =>
    expect(
      await run(
        b([Opcode.LOAD_CONST, 1, 0, Opcode.CANONICALIZE, 0, 1, Opcode.RET, 0], [{ b: 2, a: 1 }]),
      ),
    ).toBe('{"a":1,"b":2}'));
  test("MAKE_CLOSURE", async () =>
    expect(
      await run(
        b([Opcode.LOAD_CONST, 1, 0, Opcode.MAKE_CLOSURE, 0, 0, 1, 1, Opcode.RET, 0], [5], {
          closureTable: [
            {
              bodyOffset: 0,
              registerCount: 3,
              captureCount: 1,
              bundle: closure([Opcode.ADD, 2, 0, 1, Opcode.RET, 2], 3),
            },
          ],
        }),
      ),
    ).toMatchObject({ captureStart: 1, captures: [5] }));
  test("APPLY", async () =>
    expect(
      await run(
        b(
          [
            Opcode.LOAD_CONST,
            1,
            0,
            Opcode.LOAD_CONST,
            2,
            1,
            Opcode.MAKE_CLOSURE,
            3,
            0,
            1,
            1,
            Opcode.APPLY,
            0,
            3,
            2,
            Opcode.RET,
            0,
          ],
          [10, 5],
          {
            closureTable: [
              {
                bodyOffset: 0,
                registerCount: 3,
                captureCount: 1,
                bundle: closure([Opcode.ADD, 2, 0, 1, Opcode.RET, 2], 3),
              },
            ],
          },
        ),
      ),
    ).toBe(15));
  test("MAP", async () =>
    expect(
      await run(
        b(
          [
            Opcode.LOAD_CONST,
            1,
            1,
            Opcode.LOAD_CONST,
            2,
            0,
            Opcode.MAKE_CLOSURE,
            3,
            0,
            1,
            1,
            Opcode.MAP,
            0,
            2,
            3,
            Opcode.RET,
            0,
          ],
          [[1, 2, 3], 2],
          {
            closureTable: [
              {
                bodyOffset: 0,
                registerCount: 3,
                captureCount: 1,
                bundle: closure([Opcode.MUL, 2, 0, 1, Opcode.RET, 2], 3),
              },
            ],
          },
        ),
      ),
    ).toEqual([2, 4, 6]));
  test("MAP_INT_INT", async () =>
    expect(
      await run(
        b(
          [
            Opcode.LOAD_CONST,
            1,
            1,
            Opcode.LOAD_CONST,
            2,
            0,
            Opcode.MAKE_CLOSURE,
            3,
            0,
            1,
            1,
            Opcode.MAP_INT_INT,
            0,
            2,
            3,
            Opcode.RET,
            0,
          ],
          [[1, 2, 3], 2],
          {
            closureTable: [
              {
                bodyOffset: 0,
                registerCount: 3,
                captureCount: 1,
                bundle: closure([Opcode.MUL_INT, 2, 0, 1, Opcode.RET, 2], 3),
              },
            ],
          },
        ),
      ),
    ).toEqual([2, 4, 6]));
  test("FILTER", async () =>
    expect(
      await run(
        b(
          [
            Opcode.LOAD_CONST,
            1,
            1,
            Opcode.LOAD_CONST,
            2,
            0,
            Opcode.MAKE_CLOSURE,
            3,
            0,
            1,
            1,
            Opcode.FILTER,
            0,
            2,
            3,
            Opcode.RET,
            0,
          ],
          [[1, 2, 3], 1],
          {
            closureTable: [
              {
                bodyOffset: 0,
                registerCount: 3,
                captureCount: 1,
                bundle: closure([Opcode.GT, 2, 0, 1, Opcode.RET, 2], 3),
              },
            ],
          },
        ),
      ),
    ).toEqual([2, 3]));
  test("FILTER_RECORD_KNOWN_FIELD", async () =>
    expect(
      await run(
        b(
          [Opcode.LOAD_CONST, 1, 0, Opcode.FILTER_RECORD_KNOWN_FIELD, 0, 1, 1, Opcode.RET, 0],
          [[{ status: "open" }, { status: "" }, { status: "done" }], "status"],
        ),
      ),
    ).toEqual([{ status: "open" }, { status: "done" }]));
  test("FOLD", async () =>
    expect(
      await run(
        b(
          [
            Opcode.LOAD_CONST,
            1,
            0,
            Opcode.LOAD_CONST,
            2,
            1,
            Opcode.MAKE_CLOSURE,
            3,
            0,
            0,
            0,
            Opcode.FOLD,
            0,
            1,
            2,
            3,
            Opcode.RET,
            0,
          ],
          [[1, 2, 3], 0],
          {
            closureTable: [
              {
                bodyOffset: 0,
                registerCount: 5,
                captureCount: 0,
                bundle: closure(
                  [
                    Opcode.HEAD,
                    1,
                    0,
                    Opcode.TAIL,
                    2,
                    0,
                    Opcode.HEAD,
                    3,
                    2,
                    Opcode.ADD,
                    4,
                    1,
                    3,
                    Opcode.RET,
                    4,
                  ],
                  5,
                ),
              },
            ],
          },
        ),
      ),
    ).toBe(6));
  test("CALL_MORPHISM", async () =>
    expect(
      await run(
        b([Opcode.LOAD_CONST, 1, 0, Opcode.CALL_MORPHISM, 0, 0, 1, Opcode.RET, 0], [4], {
          calleeTable: ["cid:callee"],
        }),
        {
          registry: new Map([
            [
              "cid:callee",
              b([Opcode.LOAD_CONST, 1, 0, Opcode.MUL, 2, 0, 1, Opcode.RET, 2], [2], {
                cid: "cid:callee",
              }),
            ],
          ]) as unknown as { get(cid: string): Bundle | null },
        },
      ),
    ).toBe(8));
  test("CALL_MODULE", async () =>
    expect(
      await run(
        b([Opcode.LOAD_CONST, 1, 0, Opcode.CALL_MODULE, 0, 0, 1, Opcode.RET, 0], [21], {
          moduleTable: ["module://./double.ts"],
        }),
        { moduleResolver: createLocalModuleResolver(fit) },
      ),
    ).toBe(42));
  test("GAS", async () =>
    expect(await new OpcodeKernelVm().run(b([Opcode.GAS, 0, Opcode.RET, 0]), undefined, 3)).toBe(
      2,
    ));
  test("TRACE", async () => {
    const seen: Array<[string, unknown]> = [];
    expect(
      await run(b([Opcode.LOAD_CONST, 1, 0, Opcode.TRACE, 0, 1, 1, Opcode.RET, 0], [9, "tap"]), {
        trace: (m, v) => void seen.push([m, v]),
      }),
    ).toBe(9);
    expect(seen).toEqual([["tap", 9]]);
  });

  test("integration: MAP + MAKE_CLOSURE end-to-end", async () =>
    expect(
      await new OpcodeKernelVm({
        registry: new Map([
          [
            "cid:main",
            b(
              [
                Opcode.LOAD_CONST,
                1,
                1,
                Opcode.LOAD_CONST,
                2,
                0,
                Opcode.MAKE_CLOSURE,
                3,
                0,
                1,
                1,
                Opcode.MAP,
                0,
                2,
                3,
                Opcode.RET,
                0,
              ],
              [[2, 3], 3],
              {
                cid: "cid:main",
                closureTable: [
                  {
                    bodyOffset: 0,
                    registerCount: 3,
                    captureCount: 1,
                    bundle: closure([Opcode.MUL, 2, 0, 1, Opcode.RET, 2], 3),
                  },
                ],
              },
            ),
          ],
        ]) as unknown as { get(cid: string): Bundle | null },
      }).run("cid:main"),
    ).toEqual([6, 9]));
  test("integration: CALL_MORPHISM to another bundle", async () =>
    expect(
      await new OpcodeKernelVm({
        registry: new Map([
          [
            "cid:main",
            b([Opcode.LOAD_CONST, 1, 0, Opcode.CALL_MORPHISM, 0, 0, 1, Opcode.RET, 0], [5], {
              cid: "cid:main",
              calleeTable: ["cid:callee"],
            }),
          ],
          [
            "cid:callee",
            b([Opcode.LOAD_CONST, 1, 0, Opcode.ADD, 2, 0, 1, Opcode.RET, 2], [7], {
              cid: "cid:callee",
            }),
          ],
        ]) as unknown as { get(cid: string): Bundle | null },
      }).run("cid:main"),
    ).toBe(12));
  test("integration: gas exhaustion names the opcode", async () =>
    expect(new OpcodeKernelVm().run(b([Opcode.JUMP, 0]), undefined, 0)).rejects.toEqual(
      expect.objectContaining({
        name: "GasExhaustedError",
        op: "JUMP",
        overBudget: 1,
      } satisfies Partial<GasExhaustedError>),
    ));
  test("integration: CALL_MODULE surfaces resolver allowlist errors", async () =>
    expect(
      run(
        b([Opcode.LOAD_CONST, 1, 0, Opcode.CALL_MODULE, 0, 0, 1, Opcode.RET, 0], [1], {
          moduleTable: ["module://./../../../../package.json"],
        }),
        {
          moduleResolver: createLocalModuleResolver(
            resolve(import.meta.dir, "../../27B-projection"),
          ),
        },
      ),
    ).rejects.toThrow("module URI resolved outside packages/04-ReflexiveAlgebraicKernel/"));
});
