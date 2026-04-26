`filesystem-journal-space` is the V1 `AppendOnlyJournal` over one NDJSON file.
`open()` creates the journal file on first use and writes the required header line.
Each appended entry is stored as a single JSON line with a mandatory `@binding`.
`scanFrom(bindingName, cursor)` filters by binding and resumes after the provided cursor.
`latestCursor(bindingName)` returns the byte offset of the latest matching line.
`flush()` and `close()` drain the in-memory write queue before returning.
The reader tolerates one malformed trailing line so crash-cut tails do not poison replay.
Consumed by `L07-agency/storage-router.ts`.
