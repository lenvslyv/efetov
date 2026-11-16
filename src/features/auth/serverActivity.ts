import { loadToken, sessionKey } from "./session";

export const SESSION_SYNC_INTERVAL_MS = 5 * 60 * 1000;

export function recordServerActivity(token: string | null, at = Date.now()) {
  if (!token || token !== loadToken()) return;
  try { localStorage.setItem(sessionKey() + ":server-sync", JSON.stringify({ token, at })); } catch { /* Optional coordination between tabs. */ }
}

export function lastServerActivity(token: string | null): number {
  try {
    const value = JSON.parse(localStorage.getItem(sessionKey() + ":server-sync") || "null");
    return token && value?.token === token && Number.isFinite(value.at) ? value.at : 0;
  } catch { return 0; }
}

export function needsSessionSync(now: number, lastSync: number): boolean {
  return now - lastSync >= SESSION_SYNC_INTERVAL_MS;
}
