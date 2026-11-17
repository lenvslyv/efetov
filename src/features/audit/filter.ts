import type { AuditEvent, AuditFilters } from "@/entities/audit/types";
import { normalizeDate, parseRuDate } from "@/shared/lib/dates";

function inRange(value: string, from: string, to: string): boolean {
  const startRaw = from.trim();
  const endRaw = to.trim();
  const start = startRaw ? parseRuDate(startRaw) : null;
  const end = endRaw ? parseRuDate(endRaw) : null;
  if ((startRaw && !start) || (endRaw && !end) || (start && end && start > end)) {
    return true;
  }
  if (!start && !end) return true;
  const point = normalizeDate(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(point)) return false;
  if (start && point < start) return false;
  if (end && point > end) return false;
  return true;
}

export function matchesAuditFilters(item: AuditEvent, filters: AuditFilters): boolean {
  return (
    inRange(item.time, filters.timeFrom, filters.timeTo) &&
    (!filters.userId || (item.userLogin || "").toLowerCase().includes(filters.userId.toLowerCase())) &&
    (filters.role === "all" || item.role === filters.role) &&
    (!filters.action || item.action.toLowerCase().includes(filters.action.toLowerCase())) &&
    (!filters.details || item.details.toLowerCase().includes(filters.details.toLowerCase()))
  );
}
