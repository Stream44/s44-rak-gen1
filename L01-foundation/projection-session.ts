// PP-27: confirmed L01 home — pure shape contract; consumers L07-L14.
export interface CurrentUser {
  id: string;
  capabilities: Record<string, string>;
}

export interface EphemeralStore {
  get(key: string): unknown;
  set(key: string, value: unknown): void;
  has(key: string): boolean;
  delete(key: string): void;
}

export interface ProjectionSession {
  currentUser: CurrentUser;
  route: { path: string; params: Record<string, string>; query: Record<string, string> };
  ephemeral: Map<string, unknown> | EphemeralStore;
  kindExt?: Record<string, unknown>;
}
