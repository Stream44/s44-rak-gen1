import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  MetaLevel,
  type JsonSchema,
  type KernelExpression,
  type ModelDocument,
  TypeRegistry,
} from "../../L13-facade/index.ts";
import {
  AlgebraicKernel,
  IntentProcessor,
  ModelLoader,
  loadKernelModel,
} from "../../L13-facade/index.ts";
import { createLocalModuleResolver } from "../../L11-projection/module-loader.ts";
import { createDefaultSession } from "../../L11-projection/session.ts";
import { compileAllAlgebraMorphisms } from "../bootstrap.ts";
import { BundleCache } from "../cache/bundle-cache.ts";
import { emit } from "../passes/emit.ts";
import { fold } from "../passes/fold.ts";
import { allocate } from "../passes/allocate.ts";
import { lower } from "../passes/lower.ts";
import { normalize } from "../passes/normalize.ts";
import { specialise } from "../passes/specialise.ts";
import { OpcodeKernelVm } from "../runtime/kernel-vm.ts";

const MODEL = resolve(import.meta.dir, "..", "..", "L00-model", "kernel.model.yaml");
const ROOT = resolve(import.meta.dir, "../..");
const VALID_OPS = new Set(new TypeRegistry().listAlgebraOperators().map((entry) => entry.name));
const VALID_BUILTINS = new Set(["add", "sub", "mul", "gt"] as const);
const PAGE = {
  projector: "p",
  version: "0.1.0",
  bindsModel: "demo@1",
  session: { scope: "demo" },
  pages: { home: { children: [{ component: "Heading", props: { text: "Hello" } }] } },
};
const YAML =
  "projector: p\nversion: 0.1.0\nbindsModel: demo@1\nsession:\n  scope: demo\npages:\n  home:\n    children: []\n";
const MODEL_DOC: ModelDocument = {
  model: "mini",
  version: "1.0.0",
  origin: "https://mini.test",
  lifecycle: {
    states: ["pending", "confirmed"],
    initial: "pending",
    terminal: ["confirmed"],
    transitions: [{ from: "pending", to: "confirmed", verb: "confirm" }],
  },
  actions: {
    ConfirmOrder: {
      verb: "confirm",
      inputSchema: { type: "object", required: ["id"], properties: { id: { type: "string" } } },
    },
  },
};

describe("compiler parity acceptance cases", () => {
  const cases: Array<[string, () => Promise<unknown>, () => Promise<unknown>]> = [
    [
      "authorize",
      () =>
        action("Authorize", {
          requires: ["cap://a/read"],
          session: { currentUser: { id: "u1", capabilities: {} } },
          scope: "projection",
          nodePath: "$",
        }),
      () =>
        action(
          "Authorize",
          {
            requires: ["cap://a/read"],
            session: { currentUser: { id: "u1", capabilities: {} } },
            scope: "projection",
            nodePath: "$",
          },
          "compiled",
        ),
    ],
    [
      "surveyCapabilities",
      () => action("SurveyCapabilities", PAGE),
      () => action("SurveyCapabilities", PAGE, "compiled"),
    ],
    [
      "compose",
      () => action("Compile", { yamlText: YAML }),
      () => action("Compile", { yamlText: YAML }, "compiled"),
    ],
    [
      "render",
      () => action("Render", { doc: PAGE, pageName: "home", session: createDefaultSession() }),
      () =>
        action(
          "Render",
          { doc: PAGE, pageName: "home", session: createDefaultSession() },
          "compiled",
        ),
    ],
    ["acceptance.runStep", () => runStep("source"), () => runStep("compiled")],
    [
      "add/sub/mul chain",
      () =>
        algebra(
          "arith",
          "source",
          { type: "number" },
          { type: "number" },
          {
            op: "call",
            fn: "mul",
            args: [
              {
                op: "call",
                fn: "sub",
                args: [
                  {
                    op: "call",
                    fn: "add",
                    args: [
                      { op: "var", name: "$input" },
                      { op: "const", value: 5 },
                    ],
                  },
                  { op: "const", value: 2 },
                ],
              },
              { op: "const", value: 3 },
            ],
          },
          4,
        ),
      () =>
        algebra(
          "arith",
          "compiled",
          { type: "number" },
          { type: "number" },
          {
            op: "call",
            fn: "mul",
            args: [
              {
                op: "call",
                fn: "sub",
                args: [
                  {
                    op: "call",
                    fn: "add",
                    args: [
                      { op: "var", name: "$input" },
                      { op: "const", value: 5 },
                    ],
                  },
                  { op: "const", value: 2 },
                ],
              },
              { op: "const", value: 3 },
            ],
          },
          4,
        ),
    ],
    [
      "record build + GET_FIELD",
      () =>
        algebra(
          "field",
          "source",
          { type: "object", required: ["name"], properties: { name: { type: "string" } } },
          { type: "string" },
          {
            op: "let",
            name: "tmp",
            value: { op: "record", fields: { name: { op: "get", path: "$input/name" } } },
            body: { op: "get", path: "tmp/name" },
          },
          { name: "Ada" },
        ),
      () =>
        algebra(
          "field",
          "compiled",
          { type: "object", required: ["name"], properties: { name: { type: "string" } } },
          { type: "string" },
          {
            op: "let",
            name: "tmp",
            value: { op: "record", fields: { name: { op: "get", path: "$input/name" } } },
            body: { op: "get", path: "tmp/name" },
          },
          { name: "Ada" },
        ),
    ],
    [
      "array MAP + FILTER",
      () =>
        algebra(
          "arrayOps",
          "source",
          { type: "array", items: { type: "number" } },
          { type: "array", items: { type: "number" } },
          {
            op: "call",
            fn: "filter",
            args: [
              {
                op: "call",
                fn: "map",
                args: [
                  { op: "var", name: "$input" },
                  {
                    op: "lambda",
                    param: "n",
                    body: {
                      op: "call",
                      fn: "add",
                      args: [
                        { op: "var", name: "n" },
                        { op: "const", value: 1 },
                      ],
                    },
                  },
                ],
              },
              {
                op: "lambda",
                param: "n",
                body: {
                  op: "call",
                  fn: "gt",
                  args: [
                    { op: "var", name: "n" },
                    { op: "const", value: 3 },
                  ],
                },
              },
            ],
          },
          [1, 2, 3, 4],
        ),
      () =>
        algebra(
          "arrayOps",
          "compiled",
          { type: "array", items: { type: "number" } },
          { type: "array", items: { type: "number" } },
          {
            op: "call",
            fn: "filter",
            args: [
              {
                op: "call",
                fn: "map",
                args: [
                  { op: "var", name: "$input" },
                  {
                    op: "lambda",
                    param: "n",
                    body: {
                      op: "call",
                      fn: "add",
                      args: [
                        { op: "var", name: "n" },
                        { op: "const", value: 1 },
                      ],
                    },
                  },
                ],
              },
              {
                op: "lambda",
                param: "n",
                body: {
                  op: "call",
                  fn: "gt",
                  args: [
                    { op: "var", name: "n" },
                    { op: "const", value: 3 },
                  ],
                },
              },
            ],
          },
          [1, 2, 3, 4],
        ),
    ],
    [
      "nested conditional",
      () =>
        algebra(
          "cond",
          "source",
          { type: "number" },
          { type: "string" },
          {
            op: "if",
            cond: {
              op: "call",
              fn: "gt",
              args: [
                { op: "var", name: "$input" },
                { op: "const", value: 10 },
              ],
            },
            then: {
              op: "if",
              cond: {
                op: "call",
                fn: "gt",
                args: [
                  { op: "var", name: "$input" },
                  { op: "const", value: 20 },
                ],
              },
              then: { op: "const", value: "big" },
              else: { op: "const", value: "mid" },
            },
            else: { op: "const", value: "small" },
          },
          15,
        ),
      () =>
        algebra(
          "cond",
          "compiled",
          { type: "number" },
          { type: "string" },
          {
            op: "if",
            cond: {
              op: "call",
              fn: "gt",
              args: [
                { op: "var", name: "$input" },
                { op: "const", value: 10 },
              ],
            },
            then: {
              op: "if",
              cond: {
                op: "call",
                fn: "gt",
                args: [
                  { op: "var", name: "$input" },
                  { op: "const", value: 20 },
                ],
              },
              then: { op: "const", value: "big" },
              else: { op: "const", value: "mid" },
            },
            else: { op: "const", value: "small" },
          },
          15,
        ),
    ],
    [
      "closure capture",
      () =>
        algebra(
          "closure",
          "source",
          { type: "number" },
          { type: "number" },
          {
            op: "let",
            name: "bias",
            value: { op: "const", value: 7 },
            body: {
              op: "apply",
              fn: {
                op: "lambda",
                param: "n",
                body: {
                  op: "call",
                  fn: "add",
                  args: [
                    { op: "var", name: "n" },
                    { op: "var", name: "bias" },
                  ],
                },
              },
              arg: { op: "var", name: "$input" },
            },
          },
          5,
        ),
      () =>
        algebra(
          "closure",
          "compiled",
          { type: "number" },
          { type: "number" },
          {
            op: "let",
            name: "bias",
            value: { op: "const", value: 7 },
            body: {
              op: "apply",
              fn: {
                op: "lambda",
                param: "n",
                body: {
                  op: "call",
                  fn: "add",
                  args: [
                    { op: "var", name: "n" },
                    { op: "var", name: "bias" },
                  ],
                },
              },
              arg: { op: "var", name: "$input" },
            },
          },
          5,
        ),
    ],
    [
      "pattern match",
      () =>
        algebra(
          "match",
          "source",
          {
            type: "object",
            required: ["kind"],
            properties: { kind: { type: "string" }, value: { type: "number" } },
          },
          { type: "number" },
          {
            op: "match",
            scrutinee: { op: "var", name: "$input" },
            cases: [
              {
                pattern: {
                  kind: "record",
                  fields: {
                    kind: { kind: "const", value: "ok" },
                    value: { kind: "var", name: "v" },
                  },
                },
                body: { op: "var", name: "v" },
              },
              { pattern: { kind: "wildcard" }, body: { op: "const", value: 0 } },
            ],
          },
          { kind: "ok", value: 9 },
        ),
      () =>
        algebra(
          "match",
          "compiled",
          {
            type: "object",
            required: ["kind"],
            properties: { kind: { type: "string" }, value: { type: "number" } },
          },
          { type: "number" },
          {
            op: "match",
            scrutinee: { op: "var", name: "$input" },
            cases: [
              {
                pattern: {
                  kind: "record",
                  fields: {
                    kind: { kind: "const", value: "ok" },
                    value: { kind: "var", name: "v" },
                  },
                },
                body: { op: "var", name: "v" },
              },
              { pattern: { kind: "wildcard" }, body: { op: "const", value: 0 } },
            ],
          },
          { kind: "ok", value: 9 },
        ),
    ],
    [
      "CALL_MORPHISM",
      () =>
        evalRef(
          {
            helper: {
              op: "call",
              fn: "add",
              args: [
                { op: "var", name: "$input" },
                { op: "const", value: 3 },
              ],
            },
            main: {
              op: "apply",
              fn: { op: "ref", morphismId: "helper" },
              arg: { op: "var", name: "$input" },
            },
          }.main,
          4,
          {
            helper: {
              op: "call",
              fn: "add",
              args: [
                { op: "var", name: "$input" },
                { op: "const", value: 3 },
              ],
            },
            main: {
              op: "apply",
              fn: { op: "ref", morphismId: "helper" },
              arg: { op: "var", name: "$input" },
            },
          },
        ),
      () =>
        opcode(
          {
            helper: {
              op: "call",
              fn: "add",
              args: [
                { op: "var", name: "$input" },
                { op: "const", value: 3 },
              ],
            },
            main: {
              op: "apply",
              fn: { op: "ref", morphismId: "helper" },
              arg: { op: "var", name: "$input" },
            },
          },
          4,
        ),
    ],
    [
      "CALL_MODULE",
      () =>
        evalRef(
          {
            op: "apply",
            fn: {
              op: "ref",
              uri: "module://adk/L11-projection/morphisms/test-fixtures/double.ts#default",
            },
            arg: { op: "var", name: "$input" },
          },
          6,
          {},
        ),
      () =>
        opcode(
          {
            main: {
              op: "apply",
              fn: {
                op: "ref",
                uri: "module://adk/L11-projection/morphisms/test-fixtures/double.ts#default",
              },
              arg: { op: "var", name: "$input" },
            },
          },
          6,
        ),
    ],
  ];

  test.each(cases)("%s", async (_name, sourceRun, compiledRun) => {
    expect(await compiledRun()).toEqual(await sourceRun());
  });
});

async function action(
  ref: string,
  payload: Record<string, unknown>,
  mode: "compiled" | "source" = "source",
) {
  const prev = process.env.ADK_COMPILED_KERNEL;
  if (mode === "compiled") process.env.ADK_COMPILED_KERNEL = "compiled";
  else delete process.env.ADK_COMPILED_KERNEL;
  try {
    return await (await loadKernelModel(MODEL)).dispatch({ ref, payload });
  } finally {
    if (prev === undefined) delete process.env.ADK_COMPILED_KERNEL;
    else process.env.ADK_COMPILED_KERNEL = prev;
  }
}

async function runStep(mode: "compiled" | "source") {
  const kernel = AlgebraicKernel.create();
  kernel.defineType({
    id: "type://adk/StepContext/0.1.0",
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/scalar/1.0",
    schema: { type: "object", additionalProperties: true },
  });
  kernel.defineType({
    id: "type://adk/StepResult/0.1.0",
    level: MetaLevel.Model,
    conformsTo: "type://github.com/Stream44/s44-rak-gen1@1.0/scalar/1.0",
    schema: { type: "object", additionalProperties: true },
  });
  kernel.morphisms.registerModuleResolver(
    createLocalModuleResolver(resolve(ROOT, "L10-acceptance")),
  );
  kernel.morphisms.define(
    "runStep",
    "type://adk/StepContext/0.1.0",
    "type://adk/StepResult/0.1.0",
    { op: "var", name: "$input" },
    {
      id: "morphism://adk/runStep/1.0",
      impl: { kind: "module", uri: "module://./modules/run-step.ts", export: "default" },
    },
  );
  if (mode === "compiled") {
    const vm = new OpcodeKernelVm({
      registry: new BundleCache(),
      moduleResolver: createLocalModuleResolver(resolve(ROOT, "L10-acceptance")),
    });
    compileAllAlgebraMorphisms(kernel.morphisms, vm);
    kernel.morphisms.registerCompiler(vm, "compiled");
  }
  const appKernel = AlgebraicKernel.create();
  const loader = new ModelLoader(appKernel);
  loader.setIntentProcessor(new IntentProcessor(appKernel));
  const app = loader.boot(MODEL_DOC);
  app.setState("ord-1", { status: "pending" });
  return await kernel.morphisms.evaluate("morphism://adk/runStep/1.0", {
    step: {
      id: "s1",
      personaId: "alice",
      verb: "confirm",
      targetKey: "ord-1",
      payload: { id: "ord-1" },
      assertions: [],
    },
    persona: {
      id: "alice",
      name: "Alice",
      role: "customer",
      capabilities: { confirm: app.issueCapability("confirm", "alice") },
    },
    app,
    capturedEvents: [],
  });
}

async function algebra(
  name: string,
  mode: "compiled" | "source",
  inputSchema: JsonSchema,
  outputSchema: JsonSchema,
  ast: KernelExpression,
  input: unknown,
) {
  const kernel = AlgebraicKernel.create();
  const inputType = kernel.defineScalar(`${name}In`, "1.0", inputSchema);
  const outputType = kernel.defineScalar(`${name}Out`, "1.0", outputSchema);
  kernel.morphisms.define(name, inputType, outputType, ast, { impl: { kind: "algebra", ast } });
  if (mode === "compiled") {
    const vm = new OpcodeKernelVm({
      registry: new BundleCache(),
      moduleResolver: createLocalModuleResolver(ROOT),
    });
    compileAllAlgebraMorphisms(kernel.morphisms, vm);
    kernel.morphisms.registerCompiler(vm, "compiled");
  }
  return await kernel.morphisms.evaluate(
    `morphism://github.com/Stream44/s44-rak-gen1@1.0/${name}/1.0`,
    input,
  );
}

async function opcode(defs: Record<string, KernelExpression>, input: number) {
  const bundles = Object.fromEntries(
    Object.entries(defs).map(([id, ast]) => [
      id,
      emit(
        specialise(
          lower(
            allocate(
              fold(
                normalize(ast, {
                  validOps: VALID_OPS,
                  validBuiltins: VALID_BUILTINS as Set<string>,
                }),
              ),
            ),
          ),
        ),
        1,
      ),
    ]),
  );
  const registry = {
    get: (id: string) =>
      bundles[id] ?? Object.values(bundles).find((bundle) => bundle.cid === id) ?? null,
  };
  return await new OpcodeKernelVm({
    registry,
    moduleResolver: createLocalModuleResolver(ROOT),
  }).run(bundles.main!, input);
}

async function evalRef(
  ast: any,
  input: unknown,
  defs: Record<string, KernelExpression>,
): Promise<unknown> {
  if (ast.op === "const") return ast.value;
  if (ast.op === "var") return input;
  if (ast.op === "call")
    return (
      Number(await evalRef(ast.args[0], input, defs)) +
      Number(await evalRef(ast.args[1], input, defs))
    );
  if (ast.fn?.morphismId)
    return evalRef(defs[ast.fn.morphismId], await evalRef(ast.arg, input, defs), defs);
  return (await createLocalModuleResolver(ROOT)(ast.fn.uri, "default"))(
    await evalRef(ast.arg, input, defs),
  );
}
