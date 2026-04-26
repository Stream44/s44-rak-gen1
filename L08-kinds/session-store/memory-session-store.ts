import type { SessionRecord, SessionStoreInterface } from "./m1.ts";

export default class MemorySessionStore implements SessionStoreInterface {
  private records = new Map<string, SessionRecord>();
  private byUserScope = new Map<string, string>();

  create(user: { id: string; capabilities: Record<string, string> }, scope: string): string {
    const key = `${user.id}::${scope}`;
    if (this.byUserScope.has(key)) this.destroy(this.byUserScope.get(key)!);
    const id = crypto.randomUUID(),
      record: SessionRecord = {
        id,
        userId: user.id,
        scope,
        capabilities: { ...user.capabilities },
        ephemeral: {},
        createdAt: Date.now(),
      };
    this.records.set(id, record);
    this.byUserScope.set(key, id);
    return id;
  }
  get(id: string): SessionRecord | null {
    return this.records.get(id) ?? null;
  }
  getByScope(userId: string, scope: string): SessionRecord | null {
    return this.get(this.byUserScope.get(`${userId}::${scope}`) ?? "");
  }
  attach(id: string, caps: Record<string, string>): void {
    const record = this.records.get(id);
    if (record) record.capabilities = { ...record.capabilities, ...caps };
  }
  detach(id: string, capNames: string[]): void {
    const record = this.records.get(id);
    if (!record) return;
    for (const capName of capNames) delete record.capabilities[capName];
  }
  destroy(id: string): void {
    const record = this.records.get(id);
    if (!record) return;
    this.records.delete(id);
    this.byUserScope.delete(`${record.userId}::${record.scope}`);
  }
  destroyByUserScope(userId: string, scope: string): void {
    const id = this.byUserScope.get(`${userId}::${scope}`);
    if (id) this.destroy(id);
  }
  list(userId?: string): SessionRecord[] {
    return [...this.records.values()].filter((record) => !userId || record.userId === userId);
  }
}
