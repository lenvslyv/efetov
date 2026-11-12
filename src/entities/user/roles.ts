import { CRF_SECTIONS, sectionById } from "@/entities/crf/sections";
import type { Role } from "./types";
import type { Patient } from "@/entities/patient/types";

export type Permission =
  | "patient.create"
  | "patient.delete"
  | "files.download"
  | "files.manage"
  | "audit.view"
  | "export.run"
  | "users.manage"
  | "crf.edit";

const MATRIX: Record<Role, Permission[]> = {
  stationary: ["patient.create", "files.download"],
  ambulatory: ["files.download"],
  leader: [
    "patient.create",
    "patient.delete",
    "files.download",
    "files.manage",
    "audit.view",
    "export.run",
    "users.manage",
  ],
  administrator: [],
};

export function can(role: Role | "" | null | undefined, permission: Permission): boolean {
  if (!role || !(role in MATRIX)) return false;
  return MATRIX[role].includes(permission);
}

export function powers(role: Role | null | undefined) {
  return {
    canCreate: can(role, "patient.create"),
    canDeletePatient: can(role, "patient.delete"),
    canFilesManage: can(role, "files.manage"),
    canAudit: can(role, "audit.view"),
    canExport: can(role, "export.run"),
    canAdminister: can(role, "users.manage"),
  };
}

export function canViewSection(role: Role | null | undefined, sectionId: number): boolean {
  if (!sectionById(sectionId)) return false;
  return role === "leader" || role === "stationary" || role === "ambulatory";
}

export function canEditSection(role: Role | null | undefined, sectionId: number): boolean {
  if (!sectionById(sectionId)) return false;
  if (role === "leader") return true;
  if (role === "stationary") return sectionId >= 1 && sectionId <= 10;
  if (role === "ambulatory") return sectionId >= 11 && sectionId <= 15;
  return false;
}

export function visibleSectionIds(role: Role | null | undefined): number[] {
  return CRF_SECTIONS.map((item) => item.id).filter((id) => canViewSection(role, id));
}

export function canEditPatientSection(user: { id: string; role: Role } | null | undefined, patient: Patient | undefined, sectionId: number): boolean {
  return Boolean(user && patient && canEditSection(user.role, sectionId) &&
    (user.role !== "stationary" || patient.createdBy === user.id));
}
