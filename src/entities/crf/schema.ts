import catalog from "./catalog.json" with { type: "json" };

export type CrfFieldType = "text" | "number" | "date";

export interface CrfFieldSchema {
  pos: string;
  section: number;
  key: string;
  label: string;
  type?: CrfFieldType;
  hint?: string;
  excelHeaders: string[];
  aliases?: string[];
  computedFrom?: string[];
}

export const CRF_SCHEMA = catalog.fields as CrfFieldSchema[];

export const FIELD_SECTION: Record<string, number> = Object.fromEntries(
  CRF_SCHEMA.map((field) => [field.key, field.section])
);

const LABEL_OWNER = new Map<string, string>();
CRF_SCHEMA.forEach((field) => {
  const name = normalizeHeader(field.label);
  if (name && !LABEL_OWNER.has(name)) LABEL_OWNER.set(name, field.key);
});

export function fieldsOfSection(sectionId: number): CrfFieldSchema[] {
  return CRF_SCHEMA.filter((field) => field.section === sectionId);
}

export function fieldByKey(key: string): CrfFieldSchema | undefined {
  return CRF_SCHEMA.find((field) => field.key === key);
}

export function fieldNames(field: CrfFieldSchema): string[] {
  return [field.label, ...(field.aliases ?? [])];
}

export function normalizeHeader(value: string): string {
  return String(value ?? "")
    .replace(/\r/g, "")
    .replace(/\n/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function labelOwnerKey(label: string): string | undefined {
  return LABEL_OWNER.get(normalizeHeader(label));
}
