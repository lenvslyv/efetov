import type { SessionUser } from "@/entities/user/types";

const SELECTED = "efetovSelectedAccount";
const LAST = "efetovLastAccount";
const PREFIX = "efetovAuth:";
export interface BrowserSession { user: SessionUser; token: string; activity: number }

function selectedId(): string | null {
  const existing = sessionStorage.getItem(SELECTED);
  if (existing) return existing;
  const last = localStorage.getItem(LAST);
  if (last) sessionStorage.setItem(SELECTED, last);
  return last;
}
export function sessionKey(): string { return PREFIX + (selectedId() ?? ""); }
export function markSessionEnd(reason: "manual" | "idle", token = loadToken()) {
  localStorage.setItem(sessionKey() + ":ended", JSON.stringify({ reason, token }));
}
export function sessionEndReason(token: string | null): "manual" | "idle" {
  try {
    const end = JSON.parse(localStorage.getItem(sessionKey() + ":ended") || "null");
    return end?.token === token && end.reason === "idle" ? "idle" : "manual";
  } catch { return "manual"; }
}
export function browserSession(): BrowserSession | null {
  try { return JSON.parse(localStorage.getItem(sessionKey()) || "null"); }
  catch { return null; }
}
export function loadSession(): SessionUser | null { return browserSession()?.user ?? null; }
export function loadToken(): string | null { return browserSession()?.token ?? null; }

export function saveAuthenticated(user: SessionUser, token: string) {
  sessionStorage.setItem(SELECTED, user.id);
  localStorage.setItem(LAST, user.id);
  localStorage.removeItem(sessionKey() + ":ended");
  localStorage.setItem(sessionKey(), JSON.stringify({ user, token, activity: Date.now() }));
  localStorage.removeItem("efetovSessionUser");
  localStorage.removeItem("efetovToken");
}
export function saveSession(user: SessionUser | null) {
  if (!user) { localStorage.removeItem(sessionKey()); return; }
  const current = browserSession();
  if (current) localStorage.setItem(sessionKey(), JSON.stringify({ ...current, user }));
}
export function saveToken(token: string | null) {
  const current = browserSession();
  if (!token) { localStorage.removeItem(sessionKey()); return; }
  if (current) localStorage.setItem(sessionKey(), JSON.stringify({ ...current, token }));
}
export function recordActivity() {
  const current = browserSession();
  const now = Date.now();
  if (current && now - current.activity >= 500) {
    localStorage.setItem(sessionKey(), JSON.stringify({ ...current, activity: now }));
  }
}
