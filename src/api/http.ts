import type { Permission } from "@/entities/user/roles";
import type { AccountRecord, DemoUser, SessionUser } from "@/entities/user/types";
import { loadToken, markSessionEnd, saveToken, saveAuthenticated } from "@/features/auth/session";
import { ForbiddenError } from "./errors";
import type {
  AppApi,
  CreatePatientInput,
  RuntimeSnapshot,
} from "./client";
import { EMPTY_RUNTIME } from "./client";
import { startOperation, finishOperation, cancelOperation } from "@/shared/lib/performance";

const API_ROOT =
  (import.meta.env.VITE_API_URL as string | undefined) ||
  (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

let snapshot: RuntimeSnapshot = EMPTY_RUNTIME;
const listeners = new Set<() => void>();
let onUnauthorized: ((message: string) => void) | null = null;

const DEMO_PASSWORDS: Record<string, string> = {
  stationary_doctor: "Doctor123",
  ambulatory_doctor: "Doctor123",
  manager: "Manager123",
};

export function setUnauthorizedHandler(handler: ((message: string) => void) | null) {
  onUnauthorized = handler;
}

function errorMessage(data: { detail?: unknown }, status: number): string {
  const detail = data.detail;
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    const message = (detail as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  return `Ошибка API (${status})`;
}

function rejectUnauthorized(status: number, message: string, token: string | null): boolean {
  if (status !== 401) return false;
  if (token !== loadToken()) return true;
  if (token) markSessionEnd(message.includes("неактивност") ? "idle" : "manual", token);
  saveToken(null);
  // Checkpoint the open editor before clearing the patient used to detect edits.
  onUnauthorized?.(message);
  setSnapshot(EMPTY_RUNTIME);
  return true;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function setSnapshot(next: RuntimeSnapshot) {
  snapshot = next;
  emit();
}

function upsertPatient(patient: RuntimeSnapshot["patients"][number], token: string | null) {
  if (token !== loadToken()) return;
  const exists = snapshot.patients.some(item => item.id === patient.id);
  setSnapshot({ ...snapshot, patients: exists
    ? snapshot.patients.map(item => item.id === patient.id ? patient : item)
    : [...snapshot.patients, patient] });
}

async function refreshFiles() {
  const token = loadToken();
  const data = await request<Pick<RuntimeSnapshot, "files" | "folders">>("/api/file-index");
  if (token === loadToken()) setSnapshot({ ...snapshot, ...data });
}

async function refreshAudit() {
  const token = loadToken();
  const audit = await request<RuntimeSnapshot["audit"]>("/api/audit");
  if (token === loadToken()) setSnapshot({ ...snapshot, audit });
}

export function clearRuntime() { setSnapshot(EMPTY_RUNTIME); }

if (import.meta.hot) {
  const previous = import.meta.hot.data.snapshot as RuntimeSnapshot | undefined;
  if (previous) snapshot = previous;
  import.meta.hot.dispose((data) => {
    data.snapshot = snapshot;
  });
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body && !(init.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }
  const token = loadToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers, cache: "no-store" });
  if (response.status === 204) return undefined as T;
  const data = await response.json().catch(() => ({}));
  if (rejectUnauthorized(response.status, errorMessage(data, response.status), token)) {
    throw new Error(errorMessage(data, response.status));
  }
  if (response.status === 403) {
    const detail = data.detail ?? data;
    throw new ForbiddenError(
      (detail.permission ?? "crf.edit") as Permission,
      detail.message ?? detail.detail ?? "Недостаточно прав"
    );
  }
  if (!response.ok) {
    throw new Error(errorMessage(data, response.status));
  }
  return data as T;
}

async function downloadWorkbook(path: string, filename: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const token = loadToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(`${API_ROOT}${path}`, { ...init, headers });
  const data = response.ok ? null : await response.json().catch(() => ({}));
  if (
    data &&
    rejectUnauthorized(response.status, errorMessage(data, response.status), token)
  ) {
    throw new Error(errorMessage(data, response.status));
  }
  if (response.status === 403 && data) {
    const detail = data.detail ?? data;
    throw new ForbiddenError(
      (detail.permission ?? "export.run") as Permission,
      detail.message ?? detail.detail ?? "Недостаточно прав"
    );
  }
  if (!response.ok) {
    throw new Error(errorMessage(data ?? {}, response.status));
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function refreshRuntime(): Promise<RuntimeSnapshot> {
  const token = loadToken();
  if (!loadToken()) {
    setSnapshot(EMPTY_RUNTIME);
    return snapshot;
  }
  startOperation("journal.load");
  try {
    const next = await request<RuntimeSnapshot>("/api/runtime?include_audit=false&include_files=false");
    if (token === loadToken()) {
      setSnapshot({ ...next, audit: snapshot.audit, files: snapshot.files, folders: snapshot.folders });
      requestAnimationFrame(() => requestAnimationFrame(() => finishOperation("journal.load")));
    } else cancelOperation("journal.load");
  } catch (error) {
    cancelOperation("journal.load");
    throw error;
  }
  return snapshot;
}

export const api: AppApi = {
  async listDemoUsers() {
    const items = await request<Array<Omit<DemoUser, "password">>>("/api/demo-users");
    return items.map((item) => ({
      ...item,
      password: DEMO_PASSWORDS[item.login] ?? "",
    }));
  },

  async authenticate(login, password, details = "Успешная аутентификация") {
    const response = await fetch(`${API_ROOT}/api/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ login, password, details }),
    });
    const data = await response.json().catch(() => ({}));
    if (response.status === 401) {
      const detail = typeof data.detail === "string" ? data.detail : "";
      if (detail && detail !== "Неверный логин или пароль") throw new Error(detail);
      return null;
    }
    if (!response.ok) {
      throw new Error(data.detail || "Ошибка входа");
    }
    clearRuntime();
    saveAuthenticated(data.user, data.token);
    await refreshRuntime();
    return data.user as SessionUser;
  },

  getRuntime() {
    return snapshot;
  },

  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },

  refreshRuntime,
  refreshAudit,
  refreshFiles,

  async resetDemoData() {
    setSnapshot(await request("/api/reset-demo", { method: "POST" }));
  },

  async recordExport(_actor, details) {
    await request("/api/export", {
      method: "POST",
      body: JSON.stringify({ details }),
    });
  },

  async downloadFinalExport(_actor) {
    await downloadWorkbook("/api/export/final.xlsx", "final_export.xlsx");
  },

  async downloadSliceExport(_actor, ids) {
    await downloadWorkbook("/api/export/slice.xlsx", "stat_slice.xlsx", {
      method: "POST",
      body: JSON.stringify({ ids }),
    });
  },

  async createPatient(_actor, input: CreatePatientInput) {
    const token = loadToken();
    const patient = await request<RuntimeSnapshot["patients"][number]>(
      "/api/patients",
      {
        method: "POST",
        body: JSON.stringify(input),
      }
    );
    upsertPatient(patient, token);
    return patient;
  },

  async deletePatient(_actor, id) {
    const patient = await request<RuntimeSnapshot["patients"][number]>(
      `/api/patients/${id}`,
      { method: "DELETE" }
    );
    await refreshRuntime();
    return patient;
  },

  async savePatientSections(_actor, patientId, sections) {
    const token = loadToken();
    const patient = await request<RuntimeSnapshot["patients"][number]>(
      `/api/patients/${patientId}/sections`,
      {
        method: "PUT",
        body: JSON.stringify({
          sections: Object.fromEntries(
            Object.entries(sections).map(([sectionId, values]) => [String(sectionId), values])
          ),
        }),
      }
    );
    upsertPatient(patient, token);
    return patient;
  },

  async lockPatient(_actor, patientId) {
    const token = loadToken();
    const patient = await request<RuntimeSnapshot["patients"][number]>(
      `/api/patients/${patientId}/lock`,
      { method: "POST" }
    );
    upsertPatient(patient, token);
    return patient;
  },

  async unlockPatient(_actor, patientId) {
    const token = loadToken();
    const patient = await request<RuntimeSnapshot["patients"][number]>(
      `/api/patients/${patientId}/unlock`,
      { method: "POST" }
    );
    upsertPatient(patient, token);
    return patient;
  },

  async touchSession() {
    await request("/api/session/touch", { method: "POST" });
  },

  async endSession(_actor, reason) {
    const token = loadToken();
    try {
      await request("/api/session/end", {
        method: "POST",
        body: JSON.stringify({ reason }),
      });
    } finally {
      if (token === loadToken()) {
        saveToken(null);
        clearRuntime();
      }
    }
  },

  async createFolder(_actor, parent, name) {
    const created = await request<{ path: string }>("/api/folders", {
      method: "POST",
      body: JSON.stringify({ parent, name }),
    });
    await refreshFiles();
    return created.path;
  },

  async deleteFolder(_actor, path) {
    await request(`/api/folders?path=${encodeURIComponent(path)}&confirmed=true`, { method: "DELETE" });
    await refreshFiles();
  },

  async uploadFile(_actor, file, folder, comment) {
    const body = new FormData();
    body.append("file", file);
    body.append("folder", folder);
    body.append("comment", comment);
    const stored = await request<RuntimeSnapshot["files"][number]>("/api/files", {
      method: "POST",
      body,
    });
    await refreshFiles();
    return stored;
  },

  async downloadFile(_actor, name) {
    const headers = new Headers();
    const token = loadToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(
      `${API_ROOT}/api/files/content?name=${encodeURIComponent(name)}`,
      { headers }
    );
    if (response.status === 403) {
      const data = await response.json().catch(() => ({}));
      const detail = data.detail ?? data;
      throw new ForbiddenError(
        (detail.permission ?? "files.download") as Permission,
        detail.message ?? detail.detail ?? "Недостаточно прав"
      );
    }
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      const message =
        typeof data.detail === "string"
          ? data.detail
          : `Ошибка API (${response.status})`;
      throw new Error(message);
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  },

  async deleteFile(_actor, name) {
    await request(`/api/files?name=${encodeURIComponent(name)}`, {
      method: "DELETE",
    });
    await refreshFiles();
  },

  async listAccounts(_actor) {
    return request<AccountRecord[]>("/api/users");
  },

  async updateAccountRoles(_actor, userId, roles) {
    return request<AccountRecord>(`/api/users/${encodeURIComponent(userId)}/roles`, {
      method: "PUT",
      body: JSON.stringify({ roles }),
    });
  },

  async createAccount(_actor, input) {
    return request<AccountRecord>("/api/users", {
      method: "POST",
      body: JSON.stringify(input),
    });
  },

  async updateAccount(_actor, userId, input) {
    return request<AccountRecord>(`/api/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  async changeAccountPassword(_actor, userId, input) {
    return request<AccountRecord>(`/api/users/${encodeURIComponent(userId)}/password`, {
      method: "PUT",
      body: JSON.stringify(input),
    });
  },

  async blockAccount(_actor, userId) {
    return request<AccountRecord>(`/api/users/${encodeURIComponent(userId)}/block`, {
      method: "POST",
    });
  },

  async unblockAccount(_actor, userId) {
    return request<AccountRecord>(`/api/users/${encodeURIComponent(userId)}/unblock`, {
      method: "POST",
    });
  },

  async removeAccount(_actor, userId) {
    await request(`/api/users/${encodeURIComponent(userId)}`, { method: "DELETE" });
  },
};
