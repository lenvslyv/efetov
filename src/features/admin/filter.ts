import type { AccountRecord } from "@/entities/user/types";

export interface AccountFilters { name: string; login: string; role: string; status: string }
export type AccountSort = { key: "name" | "login" | "blocked" | "stationary" | "ambulatory" | "leader"; dir: "asc" | "desc" };
export const EMPTY_ACCOUNT_FILTERS: AccountFilters = { name: "", login: "", role: "", status: "" };

export function selectAccounts(rows: AccountRecord[], filters: AccountFilters, sort: AccountSort): AccountRecord[] {
  const normalize = (text: string) => text.trim().toLocaleLowerCase("ru");
  const result = rows.filter(row =>
    normalize(row.name).includes(normalize(filters.name)) &&
    normalize(row.login).includes(normalize(filters.login)) &&
    (!filters.role || row.roles.some(role => role === filters.role)) &&
    (!filters.status || row.blocked === (filters.status === "blocked"))
  );
  const value = (row: AccountRecord): string => {
    if (sort.key === "name" || sort.key === "login") return row[sort.key];
    if (sort.key === "blocked") return String(Number(row.blocked));
    return String(Number(row.roles.includes(sort.key)));
  };
  return result.sort((a, b) => {
    const comparison = value(a).localeCompare(value(b), "ru", { numeric: true, sensitivity: "base" });
    return (sort.dir === "asc" ? comparison : -comparison) || a.id.localeCompare(b.id);
  });
}
