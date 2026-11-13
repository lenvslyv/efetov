import type { AuditFilters } from "@/entities/audit/types";
import { dateRangeError } from "@/features/journal/filter";
import { Button, Card, Label, Select, TextInput } from "@/shared/ui";
import { RotateCcw, SlidersHorizontal } from "lucide-react";

export function AuditFiltersBar({ filters, roles, onChange, onReset }: {
  filters: AuditFilters; roles: string[]; onChange: (filters: AuditFilters) => void; onReset: () => void;
}) {
  const timeError = dateRangeError(filters.timeFrom, filters.timeTo, "Дата и время");
  return <Card className="mb-4 p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-sm font-semibold"><span className="flex items-center gap-2"><SlidersHorizontal className="size-4 text-primary" />Фильтры событий</span><Button variant="secondary" onClick={onReset}><RotateCcw />Сбросить фильтры</Button></div>
    <div className="filter-grid audit-filter-grid">
      <div><Label htmlFor="audit-date-from">Дата события: с</Label>
        <TextInput id="audit-date-from" value={filters.timeFrom} placeholder="дд.мм.гггг" aria-invalid={Boolean(timeError)} aria-describedby={timeError ? "audit-date-error" : undefined}
          onChange={event => onChange({ ...filters, timeFrom: event.target.value })} /></div>
      <div><Label htmlFor="audit-date-to">Дата события: по</Label>
        <TextInput id="audit-date-to" value={filters.timeTo} placeholder="дд.мм.гггг" aria-invalid={Boolean(timeError)} aria-describedby={timeError ? "audit-date-error" : undefined}
          onChange={event => onChange({ ...filters, timeTo: event.target.value })} /></div>
      <div><Label htmlFor="audit-user">ID пользователя</Label>
        <TextInput id="audit-user" value={filters.userId} placeholder="Например, U-STA-001" onChange={event => onChange({ ...filters, userId: event.target.value })} /></div>
      <div className="audit-role"><Label htmlFor="audit-role">Роль</Label>
        <Select id="audit-role" value={filters.role} onChange={event => onChange({ ...filters, role: event.target.value })}>
          <option value="all">Все роли</option>{roles.map(role => <option key={role} value={role}>{role}</option>)}
        </Select></div>
      <div className="audit-action"><Label htmlFor="audit-action">Тип действия</Label>
        <TextInput id="audit-action" value={filters.action} placeholder="Например, сохранение" onChange={event => onChange({ ...filters, action: event.target.value })} /></div>
      <div className="audit-details"><Label htmlFor="audit-details">Детали изменения</Label>
        <TextInput id="audit-details" value={filters.details} placeholder="Шифр или описание" onChange={event => onChange({ ...filters, details: event.target.value })} /></div>
    </div>
    {timeError && <p id="audit-date-error" role="alert" className="mt-3 text-sm text-destructive">{timeError}</p>}
  </Card>;
}
