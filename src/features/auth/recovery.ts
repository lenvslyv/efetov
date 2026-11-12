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
export function restoredPath(userId: string): string {
  const path = readRecovery<string>(userId, "path");
  return path && /^\/(journal|patients(?:\/[^?#]*)?|files|audit|admin)(?:[?#].*)?$/.test(path)
    ? path : "/journal";
}
