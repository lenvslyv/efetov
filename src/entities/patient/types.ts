export interface Field {
  key?: string;
  name: string;
  value: string;
  hint?: string;
}

export interface Patient {
  id: string;
  code: string;
  center: string;
  group: string;
  centerCode: string;
  operationDate: string;
  createdBy: string;
  createdByLogin: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
  updatedByName?: string;
  lock: string;
  lockLabel?: string;
  blocks: Record<string, Field[]>;
}

export interface JournalFilters {
  id: string;
  code: string;
  center: string;
  operationDateFrom: string;
  operationDateTo: string;
  createdAtFrom: string;
  createdAtTo: string;
}

export const EMPTY_JOURNAL_FILTERS: JournalFilters = {
  id: "",
  code: "",
  center: "all",
  operationDateFrom: "",
  operationDateTo: "",
  createdAtFrom: "",
  createdAtTo: "",
};
