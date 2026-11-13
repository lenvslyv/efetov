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

export function JournalFilters({ filters, centers, canCreate, canExport, onPatch, onReset, onCreate, onExportFinal, onExportSlice, onRefresh, refreshing }: {
  filters: JournalFilterValues; centers: string[]; canCreate: boolean; canExport: boolean;
  onPatch: (patch: Partial<JournalFilterValues>) => void; onReset: () => void; onCreate: () => void; onExportFinal: () => void; onExportSlice: () => void;
  onRefresh?: () => void; refreshing?: boolean;
}) {
  return <>
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Button disabled={!canCreate} onClick={onCreate}><Plus />Создать карточку пациента</Button>
      <div className="flex flex-wrap gap-2">
        {onRefresh && <Button variant="secondary" disabled={refreshing} onClick={onRefresh}><RotateCcw />{refreshing ? "Обновление…" : "Обновить журнал"}</Button>}
        {canExport && <><Button variant="exportSlice" onClick={onExportSlice}><FileSpreadsheet />Статистический срез</Button><Button variant="secondary" onClick={onExportFinal}><Download />Итоговая выгрузка</Button></>}
      </div>
    </div>
    <Card className="mb-4 p-4">
    <div className="mb-3 flex items-center gap-2 text-sm font-semibold"><SlidersHorizontal className="size-4 text-primary" />Поиск и фильтры</div>
    <div className="filter-grid journal-filter-grid">
      <div><Label htmlFor="journal-id">ID пациента</Label><TextInput id="journal-id" value={filters.id} placeholder="Например, 1" onChange={event => onPatch({ id: event.target.value })} /></div>
      <div><Label htmlFor="journal-code">Шифр пациента</Label><TextInput id="journal-code" value={filters.code} placeholder="С-2026-001" onChange={event => onPatch({ code: event.target.value })} /></div>
      <div><Label htmlFor="journal-center">Группа / центр</Label><Select id="journal-center" value={filters.center} onChange={event => onPatch({ center: event.target.value })}>
        <option value="all">Все центры</option>{centers.map(center => <option key={center} value={center}>{center}</option>)}
      </Select></div>
      <div className="grid min-w-0 grid-cols-2 gap-3 md:col-span-2"><DateRange label="Дата операции" from={filters.operationDateFrom} to={filters.operationDateTo}
        onFrom={operationDateFrom => onPatch({ operationDateFrom })} onTo={operationDateTo => onPatch({ operationDateTo })} /></div>
      <div className="grid min-w-0 grid-cols-2 gap-3 md:col-span-2"><DateRange label="Дата создания" from={filters.createdAtFrom} to={filters.createdAtTo}
        onFrom={createdAtFrom => onPatch({ createdAtFrom })} onTo={createdAtTo => onPatch({ createdAtTo })} /></div>
    </div>
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onReset}><RotateCcw />Сбросить фильтры</Button>
      </div>
    </div>
    {!canCreate && !canExport && <p className="mt-3 text-sm text-muted-foreground">Для текущей роли создание карточки и выгрузки недоступны.</p>}
  </Card></>;
}
