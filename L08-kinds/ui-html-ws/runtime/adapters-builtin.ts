import { AdapterRegistry, type Dispatcher, type StateBag } from "./adapters.ts";

const bySelector = (node: HTMLElement | null, selector?: string) =>
  (selector ? document.querySelector(selector) : node) as HTMLElement | null;
const meta = (files: File[]) => files.map(({ name, size, type }) => ({ name, size, type }));

export default function registerBuiltins(
  registry: AdapterRegistry,
  deps: { dispatcher: Dispatcher; stateBag: StateBag },
): void {
  registry.registerAdapter("scroll-into-view", {
    argsShape: { type: "object" },
    mounted({ args, node }) {
      bySelector(node, (args as { targetRef?: string }).targetRef)?.scrollIntoView({
        behavior: (args as { behavior?: "auto" | "smooth" }).behavior ?? "smooth",
      });
    },
  });
  registry.registerAdapter("focus-element", {
    argsShape: { type: "object" },
    mounted({ args, node }) {
      const t = bySelector(node, (args as { selector?: string }).selector),
        s = (args as { preserveSelection?: boolean }).preserveSelection
          ? window.getSelection?.()
          : null,
        r = s && s.rangeCount ? s.getRangeAt(0) : null;
      t?.focus();
      if (s && r) {
        s.removeAllRanges();
        s.addRange(r);
      }
    },
  });
  registry.registerAdapter("intersection-observe", {
    argsShape: { type: "object" },
    mounted({ args, node, dispatcher, instance }) {
      if (!node) return;
      const o = new IntersectionObserver(
        (entries) =>
          entries.forEach((entry) =>
            dispatcher.sendCustom((args as { emit?: string }).emit ?? "intersect", { entry }),
          ),
        { threshold: (args as { threshold?: number }).threshold ?? 0 },
      );
      o.observe(node);
      instance.cleanup = () => o.disconnect();
    },
    destroyed({ instance }) {
      instance.cleanup?.();
    },
  });
  registry.registerAdapter("clipboard-copy", {
    argsShape: { type: "object" },
    mounted({ args, dispatcher }) {
      navigator.clipboard
        .writeText((args as { text: string }).text)
        .then(() =>
          dispatcher.sendCustom(
            (args as { successEvent?: string }).successEvent ?? "clipboard-success",
          ),
        )
        .catch((error) =>
          dispatcher.sendCustom((args as { errorEvent?: string }).errorEvent ?? "clipboard-error", {
            message: error instanceof Error ? error.message : String(error),
          }),
        );
    },
  });
  registry.registerAdapter("download-file", {
    argsShape: { type: "object" },
    mounted({ args, instance }) {
      let url =
        (args as { url?: string; blob?: Blob }).url ??
        ((args as { blob?: Blob }).blob
          ? URL.createObjectURL((args as { blob: Blob }).blob)
          : undefined);
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.download = (args as { filename?: string }).filename ?? "";
      a.click();
      instance.cleanup = () => {
        if (url) {
          URL.revokeObjectURL(url);
          url = undefined;
        }
      };
      queueMicrotask(() => instance.cleanup?.());
    },
    destroyed({ instance }) {
      instance.cleanup?.();
    },
  });
  registry.registerAdapter("file-select", {
    argsShape: { type: "object" },
    mounted({ args, dispatcher, instance }) {
      const input = document.createElement("input");
      input.type = "file";
      input.hidden = true;
      input.accept = (args as { accept?: string }).accept ?? "";
      input.multiple = !!(args as { multiple?: boolean }).multiple;
      input.onchange = () => {
        const files = Array.from((input.files as unknown as File[]) ?? []);
        dispatcher.sendCustom((args as { emit?: string }).emit ?? "files-selected", {
          files: meta(files),
        });
        files.forEach((file) => {
          const reader = new FileReader();
          reader.onload = () =>
            dispatcher.sendAction("file.upload", {
              name: file.name,
              size: file.size,
              type: file.type,
              base64: reader.result,
            });
          reader.readAsDataURL(file);
        });
      };
      document.body.appendChild(input);
      input.click();
      instance.cleanup = () => input.remove();
    },
    destroyed({ instance }) {
      instance.cleanup?.();
    },
  });
  registry.registerAdapter("animation-timing", {
    argsShape: { type: "object" },
    mounted({ args, dispatcher, instance }) {
      const step = 1000 / ((args as { rate?: number }).rate ?? 60);
      let id = 0,
        last = -step;
      const loop = (t: number) => {
        if (t - last >= step - 1) {
          last = t;
          dispatcher.sendCustom((args as { emit?: string }).emit ?? "tick", { t });
        }
        id = requestAnimationFrame(loop);
      };
      id = requestAnimationFrame(loop);
      instance.cleanup = () => cancelAnimationFrame(id);
    },
    destroyed({ instance }) {
      instance.cleanup?.();
    },
  });
  void deps;
}
