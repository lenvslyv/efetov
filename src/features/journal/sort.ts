import type { Patient } from "@/entities/patient/types";
import { normalizeDate, normalizeDateTime } from "@/shared/lib/dates";

export type SortDir = "asc" | "desc";

export interface SortState {
  key: string;
  dir: SortDir;
}

export function valueForSort(patient: Patient, key: string): string | number {
  if (key === "id") return Number(patient.id) || patient.id || "";
  if (key === "code") return patient.code || "";
  if (key === "center") return patient.center || "";
  if (key === "operationDate") return normalizeDate(patient.operationDate);
  if (key === "createdAt") return normalizeDateTime(patient.createdAt);
  if (key === "createdBy") return patient.createdByLogin || "";
  if (key === "updatedAt") return normalizeDateTime(patient.updatedAt);
  if (key === "lock") return patient.lockLabel || patient.lock || "";
  return (patient as unknown as Record<string, string>)[key] || "";
}

export function compareValues(a: string | number, b: string | number) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a ?? "").localeCompare(String(b ?? ""), "ru", {
    numeric: true,
    sensitivity: "base",
  });
}
