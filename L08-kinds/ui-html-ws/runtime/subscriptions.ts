import type { SlotId } from "../wire-protocol.ts";

const hit = (left: string, right: string) =>
  left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`);

export class SubscriptionGraph {
  private readonly index = new Map<string, Set<SlotId>>();
  loadFromSkeleton(dependents: Record<string, string[]>): void {
    this.index.clear();
    for (const [path, slots] of Object.entries(dependents)) this.index.set(path, new Set(slots));
  }
  fireAffectedSlots(changedPath: string): Set<SlotId> {
    const out = new Set<SlotId>();
    for (const [path, slots] of this.index)
      if (hit(path, changedPath)) for (const slot of slots) out.add(slot);
    return out;
  }
  unsubscribeSlot(slotId: SlotId): void {
    for (const slots of this.index.values()) slots.delete(slotId);
  }
  addSlot(slotId: SlotId, path: string): void {
    (this.index.get(path) ?? this.index.set(path, new Set()).get(path)!).add(slotId);
  }
}
