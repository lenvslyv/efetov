import test from "node:test";
import assert from "node:assert/strict";
import { passwordError } from "../src/features/admin/password.ts";
import { selectAccounts, EMPTY_ACCOUNT_FILTERS } from "../src/features/admin/filter.ts";
import { saveAuthenticated, loadSession, loadToken, saveSession, recordActivity, browserSession } from "../src/features/auth/session.ts";
import { readRecovery, writeRecovery, restoredPath, clearRecovery, readDraft, writeDraft, clearDrafts, checkpointIdle, idleRecovery, resolveIdleRecovery, clearIdleRecovery } from "../src/features/auth/recovery.ts";

class StorageMock {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, String(value)); }
  removeItem(key: string) { this.data.delete(key); }
  clear() { this.data.clear(); }
}
const shared = new StorageMock();
const tabA = new StorageMock();
const tabB = new StorageMock();
const userA = { id: "A", name: "Иван", login: "ivan", role: "stationary" as const };
const userB = { id: "B", name: "Анна", login: "anna", role: "leader" as const };
function tab(storage: StorageMock) {
  Object.defineProperty(globalThis, "localStorage", { value: shared, configurable: true });
  Object.defineProperty(globalThis, "sessionStorage", { value: storage, configurable: true });
}

test("password rules reject missing letters/digits and list all violations", () => {
  assert.equal(passwordError("Doctor12", "Doctor12"), "");
  assert.match(passwordError("12345678", "12345678"), /2 букв/);
  assert.match(passwordError("Password", "Password"), /2 цифр/);
  assert.match(passwordError("Ab12", "Ab12"), /8 символов/);
  assert.match(passwordError("a", "a"), /8 символов.*2 букв.*2 цифр/);
  assert.equal(passwordError("Doctor12", "Doctor13"), "Пароли не совпадают");
  assert.equal(passwordError("Доктор12", "Доктор12"), "");
});

test("same-account tabs share activity and logout; another account stays signed in", () => {
  shared.clear(); tabA.clear(); tabB.clear(); tab(tabA);
  saveAuthenticated(userA, "token-A");
  const activity = browserSession()!.activity;
  tab(tabB);
  assert.equal(loadToken(), "token-A");
  assert.equal(browserSession()!.activity, activity);
  saveAuthenticated(userB, "token-B");
  tab(tabA);
  saveSession(null);
  assert.equal(loadSession(), null);
  tab(tabB);
  assert.equal(loadToken(), "token-B");
  tab(tabA);
  saveAuthenticated(userA, "token-A2");
  tabB.setItem("efetovSelectedAccount", "A"); tab(tabB);
  assert.equal(loadToken(), "token-A2");
  tab(tabA); saveSession(null);
  tab(tabB); assert.equal(loadToken(), null);
  tabB.setItem("efetovSelectedAccount", "B");
  assert.equal(loadToken(), "token-B");
});

test("activity in one account never extends another account", () => {
  shared.clear(); tabA.clear(); tabB.clear(); tab(tabA);
  saveAuthenticated(userA, "A");
  const data = browserSession()!;
  shared.setItem("efetovAuth:A", JSON.stringify({ ...data, activity: 1 }));
  tab(tabB); saveAuthenticated(userB, "B"); recordActivity();
  tab(tabA); assert.equal(browserSession()!.activity, 1);
});

test("drafts live only in memory until an idle checkpoint is made", () => {
  tabA.clear(); tabB.clear(); tab(tabA); clearDrafts("A");
  writeDraft("A", "new:values", { note: "unsaved" });
  assert.deepEqual(readDraft("A", "new:values"), { note: "unsaved" });
  assert.equal(idleRecovery("A"), null);
  assert.equal(restoredPath("A"), "/journal");
  clearDrafts("A", "new:");
  assert.equal(readDraft("A", "new:values"), null);
});

test("idle snapshots require a decision and stay isolated by account and tab", () => {
  tabA.clear(); tabB.clear(); tab(tabA); clearDrafts("A");
  writeDraft("A", "patient:42:draft", { 1: { note: "idle draft" } });
  assert.equal(checkpointIdle("A", "/patients/42", true), true);
  clearDrafts("A");
  assert.equal(readDraft("A", "patient:42:draft"), null);
  assert.equal(restoredPath("A"), "/patients/42");
  assert.equal(idleRecovery("B"), null);
  tab(tabB); assert.equal(idleRecovery("A"), null);
  tab(tabA);
  assert.equal(resolveIdleRecovery("A", true), "/patients/42");
  assert.deepEqual(readDraft("A", "patient:42:draft"), { 1: { note: "idle draft" } });
  assert.equal(idleRecovery("A"), null);
  checkpointIdle("A", "/patients/42", true); clearDrafts("A");
  resolveIdleRecovery("A", false);
  assert.equal(readDraft("A", "patient:42:draft"), null);
});

test("manual exit clears recovery and unsafe idle paths are rejected", () => {
  tab(tabA); clearDrafts("A");
  writeDraft("A", "new:values", { note: "test" });
  checkpointIdle("A", "//evil.example", true);
  assert.equal(restoredPath("A"), "/journal");
  clearIdleRecovery("A"); clearDrafts("A");
  assert.equal(idleRecovery("A"), null);
  assert.equal(restoredPath("A"), "/journal");
  // The old unqualified recovery format cannot cause an ordinary restore.
  writeRecovery("A", "path", "/patients/new");
  assert.equal(restoredPath("A"), "/journal");
  clearRecovery("A", "path");
  assert.equal(readRecovery("A", "path"), null);
});

test("combined filters use all assigned roles; sorting does not mutate source", () => {
  const rows = [
    { ...userA, email: "", roles: ["stationary", "ambulatory"] as ("stationary" | "ambulatory")[], blocked: false },
    { ...userB, email: "", roles: ["leader"] as "leader"[], blocked: true },
  ];
  assert.deepEqual(selectAccounts(rows, { name: " иВ ", login: "iv", role: "ambulatory", status: "active" }, { key: "name", dir: "asc" }).map(row => row.id), ["A"]);
  assert.deepEqual(selectAccounts(rows, EMPTY_ACCOUNT_FILTERS, { key: "blocked", dir: "desc" }).map(row => row.id), ["B", "A"]);
  assert.deepEqual(rows.map(row => row.id), ["A", "B"]);
});

test("performance report requires 10 successful samples and ignores cancelled operations", async () => {
  Object.defineProperty(globalThis, "window", { value: {}, configurable: true });
  const { startOperation, finishOperation, cancelOperation, performanceSummary } = await import("../src/shared/lib/performance.ts");
  window.efetovPerformance.reset();
  startOperation("patient.save"); cancelOperation("patient.save"); finishOperation("patient.save");
  assert.equal(performanceSummary().find(row => row.operation === "patient.save")!.repeats, 0);
  for (let index = 0; index < 9; index++) { startOperation("patient.open"); finishOperation("patient.open"); }
  assert.equal(performanceSummary().find(row => row.operation === "patient.open")!.passed, false);
  startOperation("patient.open"); finishOperation("patient.open");
  const result = performanceSummary().find(row => row.operation === "patient.open")!;
  assert.equal(result.repeats, 10);
  assert.equal(result.complete, true);
  assert.equal(result.passed, true);
  window.efetovPerformance.reset();
});
