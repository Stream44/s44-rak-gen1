import { expect, test } from "bun:test";
import { existsSync, rmSync } from "node:fs";
import { basename, relative } from "node:path";
import { PACKAGE_TMP_PARENT, makePackageTmpDir, withPackageTmpDir } from "./tmp.ts";

test("makePackageTmpDir creates a directory under .~o/tmp with the requested prefix", () => {
  const dir = makePackageTmpDir("test-");
  try {
    expect(existsSync(dir)).toBe(true);
    expect(relative(PACKAGE_TMP_PARENT, dir)).not.toStartWith("..");
    expect(basename(dir)).toStartWith("test-");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("withPackageTmpDir removes the directory after success", async () => {
  let createdDir = "";
  await withPackageTmpDir("test-", async (dir) => {
    createdDir = dir;
    expect(existsSync(dir)).toBe(true);
  });
  expect(existsSync(createdDir)).toBe(false);
});

test("withPackageTmpDir removes the directory after failure and rethrows", async () => {
  let createdDir = "";
  await expect(
    withPackageTmpDir("test-", (dir) => {
      createdDir = dir;
      throw new Error("boom");
    }),
  ).rejects.toThrow("boom");
  expect(existsSync(createdDir)).toBe(false);
});
