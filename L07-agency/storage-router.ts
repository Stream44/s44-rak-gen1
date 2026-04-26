import { BindingResolver } from "../L04-expression/binding-resolver.ts";
import type { AppendOnlyJournal } from "../L08-kinds/storage-space/append-only-journal.ts";
import type { KeyedValueStore } from "../L08-kinds/storage-space/keyed-value.ts";
import type { ShapeExpr, StorageBindingDef } from "../L14-hosts/projection-runtime/sds-schema.ts";
import type {
  IntentProcessor,
  RemovedEvent,
  SubmittedEvent,
  TransactionCommittedEvent,
} from "./intent.ts";

type StorageSpace = KeyedValueStore | AppendOnlyJournal;
type SpaceWithMeta = StorageSpace & {
  setBindingMeta?(bindingName: string, meta: { schemaVersion?: string }): void;
};
type SyncJournal = AppendOnlyJournal & {
  scanFromSync?(bindingName: string, cursor: string | undefined): Iterable<Record<string, unknown>>;
};

export interface StorageRouterInput {
  bindings: StorageBindingDef[];
  spaces: Map<string, KeyedValueStore | AppendOnlyJournal>;
  processor: IntentProcessor;
  schemaEmitter?: { contextFor(binding: StorageBindingDef): string };
}

export interface StorageRouter {
  route(event: SubmittedEvent): void;
  routeRemoval(event: RemovedEvent): void;
  onTransactionCommit(evt: TransactionCommittedEvent): Promise<void>;
  hydrate(): Promise<void>;
  close(): Promise<void>;
  bindingFor(subject: {
    entity?: string;
    machine?: string;
    aspectKind?: string;
  }): StorageBindingDef | undefined;
}

export function createStorageRouter(input: StorageRouterInput): StorageRouter {
  // bootNode wires this router via processor.onEvent(...) and processor.onTransactionCommit(...).
  // Hydrated/live binding state is stored under bindings/<bindingName>/<targetKey>.
  const openedSpaces = new Set<string>();
  const touchedSpaces = new Set<StorageSpace>();

  for (const binding of input.bindings) {
    if (binding.aspect.kind === "stateMachineAggregate") {
      input.processor.registerMachineAggregateBinding(binding.aspect.machine, binding.name);
    }
  }

  function resolveSpace(binding: StorageBindingDef): StorageSpace {
    const space = input.spaces.get(binding.space);
    if (!space)
      throw new Error(
        `[storage-router] Missing storage space "${binding.space}" for binding "${binding.name}".`,
      );
    return space;
  }

  function ensureOpen(binding: StorageBindingDef, space: StorageSpace): void {
    if (openedSpaces.has(binding.space)) return;
    openedSpaces.add(binding.space);
    void space.open({ name: binding.space });
  }

  function configureBindingMeta(binding: StorageBindingDef, space: StorageSpace): void {
    const schemaVersion = input.schemaEmitter?.contextFor(binding);
    (space as SpaceWithMeta).setBindingMeta?.(binding.name, { schemaVersion });
  }

  function resolveStored(binding: StorageBindingDef, source: unknown, key: string): unknown {
    const resolver = new BindingResolver({
      bindings: new Map(),
      $self: source,
      $key: key,
      $now: isoNow(),
    });
    return resolver.resolve(desugarStoredSugar(binding.shape.stored));
  }

  function resolveDerived(binding: StorageBindingDef, stored: unknown, key: string): unknown {
    const resolver = new BindingResolver({
      bindings: new Map(),
      $stored: stored,
      $key: key,
    });
    return resolver.resolve(desugarDerivedSugar(binding.shape.derived));
  }

  function journalEntries(
    binding: StorageBindingDef,
    cursor: string | undefined,
  ): Iterable<Record<string, unknown>> {
    const journal = resolveSpace(binding) as SyncJournal;
    return journal.scanFromSync?.(binding.name, cursor) ?? [];
  }

  function companionJournal(machine: string): StorageBindingDef | undefined {
    return input.bindings.find(
      (binding) => binding.aspect.kind === "eventJournal" && binding.aspect.machine === machine,
    );
  }

  return {
    route(event) {
      for (const binding of input.bindings) {
        if (!matchesBinding(binding, event)) continue;

        const space = resolveSpace(binding);
        ensureOpen(binding, space);
        configureBindingMeta(binding, space);

        switch (binding.aspect.kind) {
          case "entityCollection": {
            const stored = resolveStored(binding, event.afterState, event.targetKey);
            const keyed = space as KeyedValueStore;
            keyed.put(binding.name, event.targetKey, stored);
            if (binding.name === "default") {
              for (const [key, value] of input.processor.stateStore) {
                if (key.startsWith("bindings/")) continue;
                keyed.put(binding.name, key, resolveStored(binding, value, key));
              }
            }
            input.processor.setStateForBinding(
              binding.name,
              event.targetKey,
              resolveDerived(binding, stored, event.targetKey),
            );
            touchedSpaces.add(space);
            break;
          }
          case "stateMachineAggregate": {
            const previous = input.processor.readStoreForBinding(binding.name, event.targetKey);
            const aggregate = toAggregateSnapshot(event, previous);
            input.processor.setStateForBinding(binding.name, event.targetKey, aggregate);
            const beforeCurrent = pickCurrentState(previous ?? event.beforeState);
            const afterCurrent = pickCurrentState(aggregate);
            const snapshotEvery = binding.aspect.snapshotEvery ?? 1;
            const transitionCount =
              typeof aggregate.transitionCount === "number" ? aggregate.transitionCount : 0;
            const snapshotHit =
              afterCurrent !== beforeCurrent || transitionCount % snapshotEvery === 0;
            if (!snapshotHit) break;
            const stored = resolveStored(binding, aggregate, event.targetKey);
            (space as KeyedValueStore).put(binding.name, event.targetKey, stored);
            input.processor.setStateForBinding(
              binding.name,
              event.targetKey,
              resolveDerived(binding, stored, event.targetKey),
            );
            touchedSpaces.add(space);
            break;
          }
          case "eventJournal": {
            const stored = resolveStored(
              binding,
              {
                verb: event.verb,
                payload: event.payload,
                beforeState: event.beforeState,
                afterState: event.afterState,
                at: event.at,
                causationKey: event.causationKey,
                aggregateKey: event.targetKey,
              },
              event.targetKey,
            );
            (space as AppendOnlyJournal).append(binding.name, stored as Record<string, unknown>);
            touchedSpaces.add(space);
            break;
          }
        }
      }
    },

    routeRemoval(event) {
      // bootNode forwards kind: "removed" events here.
      for (const binding of input.bindings) {
        if (!matchesRemovalBinding(binding, event)) continue;

        const space = resolveSpace(binding);
        ensureOpen(binding, space);
        configureBindingMeta(binding, space);

        switch (binding.aspect.kind) {
          case "entityCollection": {
            (space as KeyedValueStore).delete(binding.name, event.targetKey);
            input.processor.removeStateForBinding(binding.name, event.targetKey);
            touchedSpaces.add(space);
            break;
          }
          case "eventJournal": {
            const stored = resolveStored(
              binding,
              {
                kind: "remove",
                verb: "remove",
                aggregateKey: event.targetKey,
                at: event.at,
              },
              event.targetKey,
            );
            (space as AppendOnlyJournal).append(binding.name, stored as Record<string, unknown>);
            touchedSpaces.add(space);
            break;
          }
          case "stateMachineAggregate":
            // Removed events are entity-scoped today; aggregate snapshot deletion is not yet wired.
            break;
        }
      }
    },

    async onTransactionCommit(evt) {
      const spaces = [...touchedSpaces];
      touchedSpaces.clear();

      if (spaces.length > 1) {
        console.warn(
          `[storage-router] transaction ${evt.transactionId} wrote to ${spaces.length} spaces; eventual atomicity only.`,
        );
      }

      await Promise.all(
        spaces.map(async (space) => {
          try {
            await space.flush?.();
          } catch (error) {
            console.error("[storage-router] flush failed; continuing without rollback.", error);
          }
        }),
      );
    },

    async hydrate() {
      for (const binding of input.bindings) {
        const space = resolveSpace(binding);
        ensureOpen(binding, space);
        configureBindingMeta(binding, space);

        if (binding.aspect.kind === "eventJournal") continue;

        const records = (space as KeyedValueStore).snapshot(binding.name);
        for (const [key, stored] of Object.entries(records)) {
          const hydrated = resolveDerived(binding, stored, key);
          input.processor.setStateForBinding(binding.name, key, hydrated);
        }

        if (binding.aspect.kind !== "stateMachineAggregate") continue;

        const journalBinding = companionJournal(binding.aspect.machine);
        if (!journalBinding) continue;

        for (const [key, stored] of Object.entries(records)) {
          let latest = resolveDerived(binding, stored, key);
          const lastTransitionAt = readLastTransitionAt(stored);
          for (const entry of journalEntries(journalBinding, undefined)) {
            if ((entry.aggregateKey as string | undefined) !== key) continue;
            if (lastTransitionAt && typeof entry.at === "string" && entry.at <= lastTransitionAt)
              continue;
            latest = entry.afterState ?? latest;
          }
          input.processor.setStateForBinding(binding.name, key, latest);
        }
      }
    },

    async close() {
      const spaces = [...new Set([...touchedSpaces, ...input.spaces.values()])];
      touchedSpaces.clear();
      await Promise.all(
        spaces.map(async (space) => {
          try {
            await space.flush?.();
          } catch (error) {
            console.error("[storage-router] close flush failed; continuing shutdown.", error);
          }
        }),
      );
    },

    bindingFor(subject) {
      return input.bindings.find((binding) => {
        if (subject.aspectKind && binding.aspect.kind !== subject.aspectKind) return false;
        if (
          subject.entity &&
          "entity" in binding.aspect &&
          binding.aspect.entity !== subject.entity
        )
          return false;
        if (
          subject.machine &&
          "machine" in binding.aspect &&
          binding.aspect.machine !== subject.machine
        )
          return false;
        if (subject.entity && !("entity" in binding.aspect)) return false;
        if (subject.machine && !("machine" in binding.aspect)) return false;
        return true;
      });
    },
  };
}

function matchesBinding(binding: StorageBindingDef, event: SubmittedEvent): boolean {
  switch (binding.aspect.kind) {
    case "entityCollection":
      return binding.aspect.entity === event.entity;
    case "stateMachineAggregate":
      return binding.aspect.machine === event.targetMachine;
    case "eventJournal":
      return (
        (binding.aspect.machine && binding.aspect.machine === event.targetMachine) ||
        (binding.aspect.entity && binding.aspect.entity === event.entity) ||
        (!binding.aspect.machine && !binding.aspect.entity)
      );
  }
}

function matchesRemovalBinding(binding: StorageBindingDef, event: RemovedEvent): boolean {
  switch (binding.aspect.kind) {
    case "entityCollection":
      return binding.aspect.entity === event.entity;
    case "stateMachineAggregate":
      return binding.aspect.machine === event.targetMachine;
    case "eventJournal":
      return (
        (binding.aspect.machine && binding.aspect.machine === event.targetMachine) ||
        (binding.aspect.entity && binding.aspect.entity === event.entity) ||
        (!binding.aspect.machine && !binding.aspect.entity)
      );
  }
}

function desugarStoredSugar(shape: ShapeExpr): unknown {
  if (typeof shape === "string") return shape;
  if (Array.isArray(shape)) return { op: "pick", of: "$self", fields: shape };
  return shape;
}

function desugarDerivedSugar(shape: ShapeExpr | undefined): unknown {
  if (!shape) return { op: "merge", left: "$stored", right: {} };
  if (typeof shape === "string")
    return shape === "$stored" ? { op: "merge", left: "$stored", right: {} } : shape;
  if (Array.isArray(shape)) return { op: "pick", of: "$stored", fields: shape };
  if (!("op" in shape)) return { op: "merge", left: "$stored", right: shape };
  return shape;
}

function toAggregateSnapshot(event: SubmittedEvent, previous: unknown): Record<string, unknown> {
  if (
    event.afterState &&
    typeof event.afterState === "object" &&
    "transitionCount" in (event.afterState as Record<string, unknown>)
  ) {
    return event.afterState as Record<string, unknown>;
  }
  const prior =
    previous && typeof previous === "object" ? (previous as Record<string, unknown>) : {};
  return {
    currentState: pickCurrentState(event.afterState),
    transitionCount: typeof prior.transitionCount === "number" ? prior.transitionCount + 1 : 1,
    lastTransitionAt: event.at,
  };
}

function pickCurrentState(value: unknown): unknown {
  if (value && typeof value === "object" && "currentState" in (value as Record<string, unknown>)) {
    return (value as Record<string, unknown>).currentState;
  }
  return value;
}

function readLastTransitionAt(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const lastTransitionAt = (value as Record<string, unknown>).lastTransitionAt;
  return typeof lastTransitionAt === "string" ? lastTransitionAt : undefined;
}

function isoNow(): string {
  return new Date().toISOString();
}
