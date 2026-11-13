import type { Field } from "@/entities/patient/types";
import {
  fieldByKey,
  fieldNames,
  fieldsOfSection,
  labelOwnerKey,
  normalizeHeader,
  type CrfFieldSchema,
} from "./schema";

function storedNameSet(field: CrfFieldSchema): Set<string> {
  return new Set(fieldNames(field).map((name) => normalizeHeader(name)));
}

export function matchStoredField(
  stored: Field[],
  field: CrfFieldSchema
): Field | undefined {
  const byKey = stored.find((item) => item.key === field.key);
  if (byKey) return byKey;
  const names = storedNameSet(field);
  const ownsLabel = labelOwnerKey(field.label) === field.key;
  return stored.find((item) => {
    if (item.key && item.key !== field.key) return false;
    const name = normalizeHeader(item.name);
    if ((field.aliases ?? []).some((alias) => normalizeHeader(alias) === name)) {
      return true;
    }
    return ownsLabel && names.has(name);
  });
}

export function storedFields(blocks: Record<string, Field[]>): Field[] {
  return Object.values(blocks).flatMap((items) => items ?? []);
}

export function mergeSection(
  sectionId: number,
  blocks: Record<string, Field[]>
): Field[] {
  const stored = storedFields(blocks);
  return fieldsOfSection(sectionId).map((field) => {
    const found = matchStoredField(stored, field);
    return {
      key: field.key,
      name: field.label,
      value: found?.value ?? "",
      hint: field.hint ?? found?.hint,
    };
  });
}

export function getFieldValueByKey(
  blocks: Record<string, Field[]>,
  key: string
): string {
  const schema = fieldByKey(key);
  if (!schema) return "";
  const found = matchStoredField(storedFields(blocks), schema);
  return found?.value ?? "";
}

export function resolveFieldValue(
  blocks: Record<string, Field[]>,
  key: string
): string {
  return getFieldValueByKey(blocks, key);
}
