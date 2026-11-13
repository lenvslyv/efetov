import type { AuditEvent } from "@/entities/audit/types";
import type { StoredFile } from "@/entities/file/types";
import type { Patient } from "@/entities/patient/types";
import type {
  AccountPasswordInput,
  AccountProfileInput,
  AccountRecord,
  AssignableRole,
  DemoUser,
  SessionUser,
} from "@/entities/user/types";

export interface CreatePatientInput {
  code: string;
  center: string;
  operationDate: string;
  values: Record<string, string>;
}

export interface RuntimeSnapshot {
  patients: Patient[];
  files: StoredFile[];
  folders: string[];
  audit: AuditEvent[];
}

export const EMPTY_RUNTIME: RuntimeSnapshot = {
  patients: [],
  files: [],
  folders: [],
  audit: [],
};

export interface AppApi {
  listDemoUsers(): Promise<DemoUser[]>;
  authenticate(
    login: string,
    password: string,
    details?: string
  ): Promise<SessionUser | null>;
  getRuntime(): RuntimeSnapshot;
  subscribe(listener: () => void): () => void;
  refreshRuntime(): Promise<RuntimeSnapshot>;
  refreshAudit(): Promise<void>;
  refreshFiles(): Promise<void>;
  resetDemoData(): Promise<void>;
  recordExport(actor: SessionUser, details: string): Promise<void>;
  downloadFinalExport(actor: SessionUser): Promise<void>;
  downloadSliceExport(actor: SessionUser, ids: string[]): Promise<void>;
  createPatient(actor: SessionUser, input: CreatePatientInput): Promise<Patient>;
  deletePatient(actor: SessionUser, id: string): Promise<Patient | null>;
  savePatientSections(
    actor: SessionUser,
    patientId: string,
    sections: Record<number, Record<string, string>>
  ): Promise<Patient | null>;
  lockPatient(actor: SessionUser, patientId: string): Promise<Patient | null>;
  unlockPatient(actor: SessionUser, patientId: string): Promise<Patient | null>;
  endSession(actor: SessionUser, reason: "manual" | "idle"): Promise<void>;
  touchSession(): Promise<void>;
  createFolder(actor: SessionUser, parent: string, name: string): Promise<string>;
  deleteFolder(actor: SessionUser, path: string): Promise<void>;
  uploadFile(actor: SessionUser, file: File, folder: string, comment: string): Promise<StoredFile>;
  downloadFile(actor: SessionUser, name: string): Promise<void>;
  deleteFile(actor: SessionUser, name: string): Promise<void>;
  listAccounts(actor: SessionUser): Promise<AccountRecord[]>;
  updateAccountRoles(
    actor: SessionUser,
    userId: string,
    roles: AssignableRole[]
  ): Promise<AccountRecord>;
  createAccount(
    actor: SessionUser,
    input: AccountProfileInput & AccountPasswordInput & { roles: AssignableRole[]; role?: AssignableRole }
  ): Promise<AccountRecord>;
  updateAccount(
    actor: SessionUser,
    userId: string,
    input: AccountProfileInput
  ): Promise<AccountRecord>;
  changeAccountPassword(
    actor: SessionUser,
    userId: string,
    input: AccountPasswordInput
  ): Promise<AccountRecord>;
  blockAccount(actor: SessionUser, userId: string): Promise<AccountRecord>;
  unblockAccount(actor: SessionUser, userId: string): Promise<AccountRecord>;
  removeAccount(actor: SessionUser, userId: string): Promise<void>;
}
