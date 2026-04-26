import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import type { AppendOnlyJournal } from "../storage-space/append-only-journal.ts";

export interface FilesystemJournalSpaceConfig {
  name: string;
  path: string;
  debounceMs?: number;
}

interface JournalHeader {
  "@context": string;
  "@type": "JournalHeader";
  "@createdAt": string;
}

type JournalLine = Record<string, unknown> & { "@binding"?: string; "@type"?: string };

interface ParsedJournalLine {
  complete: boolean;
  start: number;
  text: string;
}

function createHeader(): JournalHeader {
  return {
    "@context":
      "https://github.com/Stream44/s44-rak-gen1@1.0/L08-kinds/filesystem-journal-space/1.0",
    "@type": "JournalHeader",
    "@createdAt": new Date().toISOString(),
  };
}

export function createFilesystemJournalSpace(
  config: FilesystemJournalSpaceConfig,
): AppendOnlyJournal {
  const bindingMeta = new Map<string, { schemaVersion?: string }>();
  let timer: ReturnType<typeof setTimeout> | null = null;
  let queued = "";
  let warnedMalformedTail = false;
  let drainChain = Promise.resolve();

  const ensureHeader = () => {
    mkdirSync(dirname(config.path), { recursive: true });
    if (!existsSync(config.path) || readFileSync(config.path).length === 0) {
      writeFileSync(config.path, `${JSON.stringify(createHeader())}\n`, "utf8");
    }
  };

  const scheduleDrain = () => {
    const run = () => {
      timer = null;
      if (!queued) return;
      const payload = queued;
      queued = "";
      appendFileSync(config.path, payload, "utf8");
    };

    if ((config.debounceMs ?? 0) <= 0) {
      run();
      return;
    }

    if (timer) clearTimeout(timer);
    timer = setTimeout(run, config.debounceMs ?? 0);
  };

  const queueDrain = () => {
    drainChain = drainChain.then(async () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!queued) return;
      const payload = queued;
      queued = "";
      appendFileSync(config.path, payload, "utf8");
    });
    return drainChain;
  };

  const parseLines = (): ParsedJournalLine[] => {
    if (!existsSync(config.path)) return [];
    const buffer = readFileSync(config.path);
    const lines: ParsedJournalLine[] = [];
    let offset = 0;
    while (offset < buffer.length) {
      const newline = buffer.indexOf(0x0a, offset);
      if (newline === -1) {
        lines.push({
          complete: false,
          start: offset,
          text: buffer.toString("utf8", offset),
        });
        break;
      }

      const lineEnd = newline > offset && buffer[newline - 1] === 0x0d ? newline - 1 : newline;
      lines.push({
        complete: true,
        start: offset,
        text: buffer.toString("utf8", offset, lineEnd),
      });
      offset = newline + 1;
    }
    return lines;
  };

  const parseLine = (line: ParsedJournalLine): JournalLine | undefined => {
    if (!line.text.trim()) return undefined;

    try {
      return JSON.parse(line.text) as JournalLine;
    } catch (error) {
      if (!line.complete) {
        if (!warnedMalformedTail) {
          warnedMalformedTail = true;
          console.warn(
            `[filesystem-journal-space] Ignoring malformed trailing line in ${config.path}`,
          );
        }
        return undefined;
      }
      throw error;
    }
  };

  const iterateFrom = (
    bindingName: string,
    cursor: string | undefined,
  ): Record<string, unknown>[] => {
    const afterOffset = cursor === undefined ? -1 : Number(cursor);
    const lines = parseLines();
    const entries: Record<string, unknown>[] = [];

    for (let index = 1; index < lines.length; index += 1) {
      const line = lines[index];
      if (line.start <= afterOffset) continue;
      const parsed = parseLine(line);
      if (!parsed) continue;
      if (parsed["@type"] === "JournalHeader") continue;
      if (parsed["@binding"] !== bindingName) continue;
      entries.push(parsed as Record<string, unknown>);
    }

    return entries;
  };

  return {
    async open(_config: Record<string, unknown> = {}) {
      ensureHeader();
    },

    setBindingMeta(bindingName, meta) {
      bindingMeta.set(bindingName, { ...bindingMeta.get(bindingName), ...meta });
    },

    append(bindingName, entry) {
      ensureHeader();
      const line = JSON.stringify({
        ...entry,
        "@binding": bindingName,
        ...(bindingMeta.get(bindingName)?.schemaVersion
          ? { "@schemaVersion": bindingMeta.get(bindingName)?.schemaVersion }
          : {}),
      });
      queued += `${line}\n`;
      scheduleDrain();
    },

    async *scanFrom(bindingName, cursor) {
      await queueDrain();
      yield* iterateFrom(bindingName, cursor);
    },

    *scanFromSync(bindingName, cursor) {
      yield* iterateFrom(bindingName, cursor);
    },

    latestCursor(bindingName) {
      const lines = parseLines();
      let latest: string | undefined;

      for (let index = 1; index < lines.length; index += 1) {
        const line = lines[index];
        const parsed = parseLine(line);
        if (!parsed) continue;
        if (parsed["@binding"] === bindingName) latest = String(line.start);
      }

      return latest;
    },

    async flush() {
      await queueDrain();
    },

    async close() {
      await queueDrain();
    },
  };
}
