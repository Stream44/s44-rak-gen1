import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { ModelBoot } from "../../L09-demand/model-loader.ts";

export interface FsModelStoreOpts {
  path: string;
  debounceMs?: number;
}

export interface FsModelStore {
  hydrate(app: ModelBoot): Promise<void>;
  subscribe(app: ModelBoot): () => void;
}

export function createFsModelStore(opts: FsModelStoreOpts): FsModelStore {
  return {
    async hydrate(app) {
      if (!existsSync(opts.path)) return;

      const data = JSON.parse(readFileSync(opts.path, "utf8")) as Record<string, unknown>;
      for (const [key, state] of Object.entries(data)) app.setState(key, state);
    },
    subscribe(app) {
      let timer: ReturnType<typeof setTimeout> | null = null;

      const flush = () => {
        const data = Object.fromEntries(app.listInstances().map(({ key, state }) => [key, state]));
        mkdirSync(dirname(opts.path), { recursive: true });
        writeFileSync(opts.path, JSON.stringify(data, null, 2), "utf8");
        timer = null;
      };

      const off = app.onEvent(() => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(flush, opts.debounceMs ?? 50);
      });

      return () => {
        if (timer) {
          clearTimeout(timer);
          flush();
        }
        off();
      };
    },
  };
}
