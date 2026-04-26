# TodoMVC

This example demonstrates a fully declarative TodoMVC surface in the Reflexive Algebraic Kernel: model actions with standardized `kind:` dispatch, filesystem persistence declared in `sds.yaml`, and a projection that renders the UI from `$bind.instances`.

Run it with:

```sh
rak serve --example todomvc
```

What to look for:

- `models/todos.model.yaml` declares the Todo entity plus the six actions used by the UI.
- `sds.yaml` binds the Todo model and turns on filesystem persistence.
- `projection/projection.yaml` owns the UI, filter state, and derived todo slices.
- `projection/shell.html` enables path-style hash sync for `#/`, `#/active`, and `#/completed`.
- `projection/assets/todomvc.css` is the upstream MIT TodoMVC stylesheet.
