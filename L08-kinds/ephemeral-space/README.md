`ephemeral-space` is the in-memory V1 `KeyedValueStore`.
It keeps a `Map<string, Map<string, unknown>>` keyed first by binding name and then by record key.
`open()`, `flush()`, and `close()` are intentional no-ops.
`put()`, `get()`, `has()`, and `delete()` operate only on the named binding.
`snapshot(bindingName)` returns a plain record copy of one binding.
`hydrate(bindingName, records)` replaces the binding contents synchronously in memory.
This is the hermetic test space used by example test overlays.
Consumed by `L07-agency/storage-router.ts`.
