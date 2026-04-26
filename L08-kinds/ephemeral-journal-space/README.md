`ephemeral-journal-space` is the in-memory V1 `AppendOnlyJournal`.
It keeps append-only entry arrays keyed by binding name and synthesizes stable per-entry cursors in process memory.
`open()`, `flush()`, and `close()` are intentional no-ops.
`append(bindingName, entry)` stores one `@binding`-enveloped entry.
`scanFrom(bindingName, cursor)` replays binding-scoped entries in append order.
This is the hermetic journal companion used by `sds.test.yaml` overlays when append semantics must stay in memory.
