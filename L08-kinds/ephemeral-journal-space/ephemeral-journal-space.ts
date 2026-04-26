import type { AppendOnlyJournal } from "../storage-space/append-only-journal.ts";

export interface EphemeralJournalSpaceConfig {
  name: string;
}

type Entry = { cursor: string; value: Record<string, unknown> };

export function createEphemeralJournalSpace(
  _config: EphemeralJournalSpaceConfig,
): AppendOnlyJournal {
  const perBinding = new Map<string, Entry[]>();
  let nextCursor = 0;

  const ensureBinding = (bindingName: string): Entry[] => {
    const existing = perBinding.get(bindingName);
    if (existing) return existing;
    const created: Entry[] = [];
    perBinding.set(bindingName, created);
    return created;
  };

  return {
    async open(_openConfig: Record<string, unknown> = {}) {},

    append(bindingName, entry) {
      ensureBinding(bindingName).push({
        cursor: String(nextCursor++),
        value: { "@binding": bindingName, ...entry },
      });
    },

    async *scanFrom(bindingName, cursor) {
      const entries = perBinding.get(bindingName) ?? [];
      let start = 0;
      if (cursor !== undefined) {
        const index = entries.findIndex((entry) => entry.cursor === cursor);
        start = index >= 0 ? index + 1 : entries.length;
      }
      for (const entry of entries.slice(start)) {
        yield entry.value;
      }
    },

    latestCursor(bindingName) {
      const entries = perBinding.get(bindingName);
      return entries?.[entries.length - 1]?.cursor;
    },

    async flush() {},

    async close() {},
  };
}
