import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const TMP_PARENT = join(PACKAGE_ROOT, ".~o", "tmp");

export function makePackageTmpDir(prefix: string): string {
  mkdirSync(TMP_PARENT, { recursive: true });
  return mkdtempSync(join(TMP_PARENT, prefix));
}

export async function withPackageTmpDir<T>(
  prefix: string,
  body: (dir: string) => Promise<T> | T,
): Promise<T> {
  const dir = makePackageTmpDir(prefix);
  try {
    return await body(dir);
  } finally {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup for interrupted or failing tests.
    }
  }
}

export const PACKAGE_TMP_PARENT = TMP_PARENT;
