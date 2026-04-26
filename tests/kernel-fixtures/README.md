# tests/kernel-fixtures/

Synthetic YAML models for kernel unit tests.

Kernel tests MUST NOT import from `examples/**`. Examples are sealed
consumer surfaces owned by their authors; kernel tests are owned by
the kernel. Reaching across the boundary couples kernel regressions
to example churn and leaks example names into kernel invariants.

One file per capability:
entity-collection.model.yaml - collection CRUD with entityCollection binding
state-machine.model.yaml - state transitions and guards
commerce.model.yaml - lifecycle + actions for projection tests

When a kernel test needs a new capability, either extend an existing
fixture (keeping it minimal) or add a new file named after the
capability. Use synthetic names: Item, Widget, Container, Crate.
Origins use the `https://fixture.kernel/<capability>` scheme.

Grep invariant (spec SS5 #5):
grep -rE "from ['\"]\\.\\./examples/" \
 packages/04-ReflexiveAlgebraicKernel/{L0*,L10,kinds,hosts,bin,tests} \
 --include='*.ts' \
 | wc -l # must return 0
