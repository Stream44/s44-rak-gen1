`filesystem-space` is the V1 `KeyedValueStore` over a single JSON file.
It persists records under a JSON-LD envelope with `@context`, `@type`, `@savedAt`, and per-binding `@bindings`.
`open()` tolerates the new multi-binding envelope plus legacy single-binding and bare `{ records }` blobs.
`put()` and `delete()` debounce writes by `debounceMs` and `flush()`/`close()` force the pending write.
`snapshot(bindingName)` returns only the requested binding’s records.
`hydrate(bindingName, records)` replaces that binding in memory and does not write to disk by itself.
This kind is intended for entity and aggregate snapshots, not append-only journals.
Consumed by `L07-agency/storage-router.ts`.
