# fs-model-store

Filesystem-backed instance state persistence for a booted model.

## Convention

- `resolvePersistencePath()` maps a model to `./.o/<namespace>/<structKind>/<modelId>.state.json`.
- `override` resolves relative to the `sds.yaml` directory.
- `createFsModelStore()` hydrates state from JSON on boot and writes debounced snapshots after events.

## Usage

```ts
import { createFsModelStore } from "./fs-model-store.ts";
import { resolvePersistencePath } from "./path-resolver.ts";

const path = resolvePersistencePath({
  sdsPath: "/workspace/node/sds.yaml",
  origin: "https://github.com/Stream44/s44-rak-gen1@1.0",
  structKind: "model",
  modelId: "todomvc",
});

const store = createFsModelStore({ path });
await store.hydrate(app);
const unsubscribe = store.subscribe(app);

unsubscribe();
```
