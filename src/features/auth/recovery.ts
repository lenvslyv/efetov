// Per-tab storage keeps each editor's draft separate, even for the same account.
export function recoveryKey(userId: string, kind: string): string {
  return `efetovRecovery:${userId}:${kind}`;
}
export function readRecovery<T>(userId: string | undefined, kind: string): T | null {
  if (!userId) return null;
  try { return JSON.parse(sessionStorage.getItem(recoveryKey(userId, kind)) || "null"); }
  catch { return null; }
}
export function writeRecovery(userId: string | undefined, kind: string, value: unknown): boolean {
  if (!userId) return false;
  try {
    sessionStorage.setItem(recoveryKey(userId, kind), JSON.stringify(value));
    return true;
  } catch { return false; }
}
export function clearRecovery(userId: string | undefined, kind: string) {
  if (userId) sessionStorage.removeItem(recoveryKey(userId, kind));
}
const drafts = new Map<string, Map<string, unknown>>();
const idleKey = (userId: string) => `efetovIdleRecovery:${userId}`;
const safePath = (path: string) => /^\/(journal|patients(?:\/[^?#]*)?|files|audit|admin)(?:[?#].*)?$/.test(path);
export interface IdleRecovery { reason: "idle"; path: string; dirty: boolean; values: Record<string, unknown> }

export function readDraft<T>(userId: string | undefined, kind: string): T | null {
  return (userId ? drafts.get(userId)?.get(kind) as T | undefined : undefined) ?? null;
}
export function writeDraft(userId: string | undefined, kind: string, value: unknown) {
  if (!userId) return;
  if (!drafts.has(userId)) drafts.set(userId, new Map());
  drafts.get(userId)!.set(kind, value);
}
export function clearDrafts(userId: string | undefined, prefix = "") {
  if (!userId) return;
  const values = drafts.get(userId);
  if (values) for (const key of values.keys()) if (key.startsWith(prefix)) values.delete(key);
}
export function idleRecovery(userId: string): IdleRecovery | null {
  try {
    const value = JSON.parse(sessionStorage.getItem(idleKey(userId)) || "null");
    return value?.reason === "idle" && typeof value.path === "string" && safePath(value.path) &&
      value.values && typeof value.values === "object" ? value : null;
  } catch { return null; }
}
export function checkpointIdle(userId: string, path: string, dirty: boolean): boolean {
  // Persist only at timeout. A page reload must not overwrite an existing checkpoint.
  const values = drafts.get(userId);
  if (!values?.size && idleRecovery(userId)?.dirty) return true;
  try {
    sessionStorage.setItem(idleKey(userId), JSON.stringify({ reason: "idle", path: safePath(path) ? path : "/journal", dirty,
      values: Object.fromEntries(values ?? []) } satisfies IdleRecovery));
    return true;
  } catch { return false; }
}
export function resolveIdleRecovery(userId: string, restore: boolean): string {
  const saved = idleRecovery(userId);
  clearDrafts(userId);
  if (restore && saved) for (const [key, value] of Object.entries(saved.values)) writeDraft(userId, key, value);
  sessionStorage.removeItem(idleKey(userId));
  return saved?.path ?? "/journal";
}
export function clearIdleRecovery(userId: string) { sessionStorage.removeItem(idleKey(userId)); }
export function restoredPath(userId: string): string { return idleRecovery(userId)?.path ?? "/journal"; }
