import { existsSync } from "node:fs";
import path from "node:path";

/**
 * Implements spec 02 §5.1 module URI parsing and §11.2's in-package allowlist.
 * It accepts only `module://./...` relative-to-YAML paths and
 * `module://adk/...` package-relative paths rooted at
 * `packages/04-ReflexiveAlgebraicKernel/`.
 * Bare specifier module URIs are rejected in v1.
 *
 * URI fragments are tolerated but ignored here: callers pass `exportName`
 * separately, so anything after `#` is stripped before resolution.
 *
 * Runtime signature validation from spec §5.3 steps 5–6 is intentionally
 * deferred. This resolver returns the raw exported function; a higher layer
 * wraps it with `SchemaValidator`.
 */
export type ModuleResolver = (uri: string, exportName: string) => Promise<Function>;

const MODULE_URI_PREFIX = "module://";
const ADK_SRC = path.resolve(import.meta.dir, "..");
const moduleCache = new Map<string, Function>();

export function __resetModuleLoaderCacheForTests(): void {
  moduleCache.clear();
}

function resolveModuleUriToPath(uri: string, yamlDir: string): string {
  if (!uri.startsWith(MODULE_URI_PREFIX)) {
    throw new Error(`not a module URI: ${uri}`);
  }

  const rawPath = uri.slice(MODULE_URI_PREFIX.length).split("#", 1)[0];

  if (rawPath.startsWith("./")) {
    return path.resolve(yamlDir, rawPath);
  }

  if (rawPath.startsWith("adk/")) {
    return path.resolve(ADK_SRC, rawPath.slice("adk/".length));
  }

  throw new Error("bare-specifier module URIs are rejected in v1 (spec §5.1)");
}

function assertInAdkSrc(resolvedPath: string, uri: string): void {
  if (resolvedPath === ADK_SRC || resolvedPath.startsWith(ADK_SRC + path.sep)) {
    return;
  }

  throw new Error(
    `module URI resolved outside packages/04-ReflexiveAlgebraicKernel/: ${resolvedPath} (from ${uri})`,
  );
}

export function createLocalModuleResolver(yamlDir: string): ModuleResolver {
  return async (uri: string, exportName: string): Promise<Function> => {
    const resolvedPath = resolveModuleUriToPath(uri, yamlDir);
    assertInAdkSrc(resolvedPath, uri);

    if (!existsSync(resolvedPath)) {
      throw new Error(`module URI ${uri} resolves to missing file: ${resolvedPath}`);
    }

    const cacheKey = `${resolvedPath}#${exportName}`;
    const cached = moduleCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const mod = await import(resolvedPath);
    const exported = mod[exportName as keyof typeof mod];

    if (typeof exported !== "function") {
      throw new Error(
        `module URI ${uri} has no function export "${exportName}" (got ${typeof exported})`,
      );
    }

    moduleCache.set(cacheKey, exported);
    return exported;
  };
}
