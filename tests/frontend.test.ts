import test from "node:test";
import assert from "node:assert/strict";
import { passwordError } from "../src/features/admin/password.ts";
import { selectAccounts, EMPTY_ACCOUNT_FILTERS } from "../src/features/admin/filter.ts";
import { saveAuthenticated, loadSession, loadToken, saveSession, recordActivity, browserSession } from "../src/features/auth/session.ts";
import { readRecovery, writeRecovery, restoredPath, clearRecovery } from "../src/features/auth/recovery.ts";

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

test("drafts and routes survive logout but stay isolated by account and tab", () => {
  tabA.clear(); tabB.clear(); tab(tabA);
  writeRecovery("A", "patient:42", { note: "черновик" });
  writeRecovery("A", "path", "/patients/42");
  saveSession(null);
  assert.deepEqual(readRecovery("A", "patient:42"), { note: "черновик" });
  assert.equal(restoredPath("A"), "/patients/42");
  assert.equal(readRecovery("B", "patient:42"), null);
  assert.equal(restoredPath("B"), "/journal");
  tab(tabB); assert.equal(readRecovery("A", "patient:42"), null);
  tab(tabA); clearRecovery("A", "patient:42");
  assert.equal(readRecovery("A", "patient:42"), null);
  writeRecovery("A", "path", "//evil.example");
  assert.equal(restoredPath("A"), "/journal");
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
