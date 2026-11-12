import { useId } from "react";
import { Download, FileSpreadsheet, Plus, RotateCcw, SlidersHorizontal } from "lucide-react";
import type { JournalFilters as JournalFilterValues } from "@/entities/patient/types";
import { dateRangeError } from "@/features/journal/filter";
import { Button, Card, Label, Select, TextInput } from "@/shared/ui";

function DateRange({ label, from, to, onFrom, onTo }: {
  label: string; from: string; to: string; onFrom: (value: string) => void; onTo: (value: string) => void;
}) {
  const id = useId();
  const error = dateRangeError(from, to, label);
  return <>
    <div><Label htmlFor={`${id}-from`}>{label}: с</Label><TextInput id={`${id}-from`} value={from} placeholder="дд.мм.гггг" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => onFrom(event.target.value)} /></div>
    <div><Label htmlFor={`${id}-to`}>{label}: по</Label><TextInput id={`${id}-to`} value={to} placeholder="дд.мм.гггг" aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} onChange={event => onTo(event.target.value)} /></div>
    {error && <p id={`${id}-error`} role="alert" className="col-span-full text-sm text-destructive">{error}</p>}
  </>;
}

export function JournalFilters({ filters, centers, canCreate, canExport, onPatch, onReset, onCreate, onExportFinal, onExportSlice }: {
  filters: JournalFilterValues; centers: string[]; canCreate: boolean; canExport: boolean;
  onPatch: (patch: Partial<JournalFilterValues>) => void; onReset: () => void; onCreate: () => void; onExportFinal: () => void; onExportSlice: () => void;
}) {
  return <Card className="mb-6 p-5">
    <div className="mb-5 flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="size-4 text-primary" />Поиск и фильтры</div>
    <div className="filter-grid">
      <div><Label htmlFor="journal-id">ID пациента</Label><TextInput id="journal-id" value={filters.id} placeholder="Например, 1" onChange={event => onPatch({ id: event.target.value })} /></div>
      <div><Label htmlFor="journal-code">Шифр пациента</Label><TextInput id="journal-code" value={filters.code} placeholder="С-2026-001" onChange={event => onPatch({ code: event.target.value })} /></div>
      <div><Label htmlFor="journal-center">Группа / центр</Label><Select id="journal-center" value={filters.center} onChange={event => onPatch({ center: event.target.value })}>
        <option value="all">Все центры</option>{centers.map(center => <option key={center} value={center}>{center}</option>)}
      </Select></div>
      <DateRange label="Дата операции" from={filters.operationDateFrom} to={filters.operationDateTo}
        onFrom={operationDateFrom => onPatch({ operationDateFrom })} onTo={operationDateTo => onPatch({ operationDateTo })} />
      <DateRange label="Дата создания" from={filters.createdAtFrom} to={filters.createdAtTo}
        onFrom={createdAtFrom => onPatch({ createdAtFrom })} onTo={createdAtTo => onPatch({ createdAtTo })} />
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
      <div className="flex flex-wrap gap-2">
        <Button disabled={!canCreate} onClick={onCreate}><Plus />Создать карточку пациента</Button>
        <Button variant="secondary" onClick={onReset}><RotateCcw />Сбросить фильтры</Button>
      </div>
      {canExport && <div className="flex flex-wrap gap-2">
        <Button variant="exportSlice" onClick={onExportSlice}><FileSpreadsheet />Статистический срез</Button>
        <Button variant="exportFinal" onClick={onExportFinal}><Download />Итоговая выгрузка</Button>
      </div>}
    </div>
    {!canCreate && !canExport && <p className="mt-3 text-sm text-muted-foreground">Для текущей роли создание карточки и выгрузки недоступны.</p>}
  </Card>;
}
