import { beforeEach, expect, test } from "bun:test";
import path from "node:path";
import { __resetModuleLoaderCacheForTests, createLocalModuleResolver } from "./module-loader.ts";

const fixtureDir = path.resolve(import.meta.dir, "morphisms", "test-fixtures");

beforeEach(() => {
  __resetModuleLoaderCacheForTests();
});

test("relative module URI resolves and returns the default export", async () => {
  const resolver = createLocalModuleResolver(fixtureDir);
  const fn = await resolver("module://./echo.ts", "default");

  expect(typeof fn).toBe("function");
  expect(fn(42)).toBe(42);
});

test("package-relative module URI resolves from adk src", async () => {
  const resolver = createLocalModuleResolver(fixtureDir);
  const fn = await resolver(
    "module://adk/L11-projection/morphisms/test-fixtures/echo.ts",
    "default",
  );

  expect(fn("hi")).toBe("hi");
});

test("bare specifier module URI is rejected", async () => {
  const resolver = createLocalModuleResolver(fixtureDir);

  await expect(resolver("module://@pkg/foo", "default")).rejects.toThrow(
    "bare-specifier module URIs are rejected in v1 (spec §5.1)",
  );
});

test("allowlist rejects path escapes outside packages/04-ReflexiveAlgebraicKernel", async () => {
  const resolver = createLocalModuleResolver(fixtureDir);
  const escapedPath = path.resolve(path.resolve(import.meta.dir, ".."), "../../anywhere.ts");

  await expect(resolver("module://adk/../../anywhere.ts", "default")).rejects.toThrow(
    `module URI resolved outside packages/04-ReflexiveAlgebraicKernel/: ${escapedPath} (from module://adk/../../anywhere.ts)`,
  );
});

test("missing file surfaces a helpful error", async () => {
  const resolver = createLocalModuleResolver(fixtureDir);

  await expect(resolver("module://./does-not-exist.ts", "default")).rejects.toThrow(
    /module URI module:\/\/\.\/does-not-exist\.ts resolves to missing file:/,
  );
});

test("missing export surfaces the URI and export name", async () => {
  const resolver = createLocalModuleResolver(fixtureDir);

  await expect(resolver("module://./echo.ts", "noSuchExport")).rejects.toThrow(
    'module URI module://./echo.ts has no function export "noSuchExport" (got undefined)',
  );
});

test("cache hit returns the same function reference across resolver instances", async () => {
  const resolverA = createLocalModuleResolver(fixtureDir);
  const resolverB = createLocalModuleResolver(fixtureDir);

  const fn1 = await resolverA("module://./echo.ts", "default");
  const fn2 = await resolverA("module://./echo.ts", "default");
  const fn3 = await resolverB("module://./echo.ts", "default");

  expect(fn1).toBe(fn2);
  expect(fn1).toBe(fn3);
});

test("cache misses across distinct exports return different functions", async () => {
  const resolver = createLocalModuleResolver(fixtureDir);

  const defaultExport = await resolver("module://./echo.ts", "default");
  const namedExport = await resolver("module://./echo.ts", "named");

  expect(defaultExport).not.toBe(namedExport);
  expect(namedExport({ v: 1 })).toEqual({ tagged: { v: 1 } });
});

test("module URIs tolerate fragments and still resolve by explicit export name", async () => {
  const resolver = createLocalModuleResolver(fixtureDir);
  const fn = await resolver("module://./echo.ts#ignored", "default");

  expect(fn("fragment")).toBe("fragment");
});
