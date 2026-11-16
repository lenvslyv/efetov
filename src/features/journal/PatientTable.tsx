import { ArrowUpRight, Trash2 } from "lucide-react";
import type { Patient } from "@/entities/patient/types";
import { LOCK_FREE, lockOwnerId } from "@/entities/patient/lock";
import { Badge, Button, Card } from "@/shared/ui";
import type { SortState } from "./sort";

const COLUMNS: Array<[string, string]> = [
  ["id", "ID"],
  ["code", "Шифр"],
  ["center", "Группа/центр"],
  ["operationDate", "Дата операции"],
  ["createdAt", "Дата и время создания"],
  ["createdBy", "Автор"],
  ["updatedAt", "Время последнего изменения"],
  ["lock", "Блокировка"],
];

export function PatientTable({
  rows,
  sort,
  canDelete,
  onSort,
  onOpen,
  onDelete,
}: {
  rows: Patient[];
  sort: SortState;
  canDelete: boolean;
  onSort: (key: string) => void;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <Card className="overflow-hidden">
      <div className="max-h-[70vh] overflow-auto">
        <table className="journal-table w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-30">
            <tr>
              {COLUMNS.map(([key, label]) => (
                <th
                  key={key}
                  className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600"
                >
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 bg-transparent p-0 font-semibold text-slate-700 hover:text-blue-700"
                    onClick={() => onSort(key)}
                  >
                    {label}
                    <span>
                      {sort.key === key ? (sort.dir === "asc" ? "↑" : "↓") : "↕"}
                    </span>
                  </button>
                </th>
              ))}
              <th className="sticky right-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-left font-semibold text-slate-600 border-l">
                Действия
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((patient) => (
              <tr key={patient.id} className="group hover:bg-slate-50">
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-2 font-semibold">
                  {patient.id}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-2">
                  {patient.code}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-2">
                  {patient.center}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-2">
                  {patient.operationDate}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-2">
                  {patient.createdAt || "—"}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-2">
                  {patient.createdByLogin ||
                    patient.createdByName ||
                    patient.createdBy}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-2">
                  {patient.updatedAt}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-2">
                  {lockOwnerId(patient.lock) ? (
                    <Badge tone="amber">{patient.lock}</Badge>
                  ) : (
                    <Badge tone="slate">{LOCK_FREE}</Badge>
                  )}
                </td>
                <td className="sticky right-0 z-10 border-b border-slate-200 bg-white px-3 py-2 border-l group-hover:bg-slate-50">
                  <div className="flex flex-nowrap gap-1">
                    <Button variant="secondary" className="h-9 w-9 p-0" title="Открыть карточку" aria-label={`Открыть карточку ${patient.code}`} onClick={() => onOpen(patient.id)}>
                      <ArrowUpRight />
                    </Button>
                    <Button
                      variant="secondary" className="h-9 w-9 p-0 text-destructive" title="Удалить карточку" aria-label={`Удалить карточку ${patient.code}`}
                      disabled={!canDelete}
                      onClick={() => onDelete(patient.id)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length === 0 && <p role="status" className="border-t px-4 py-10 text-center text-sm text-muted-foreground">Нет карточек для отображения. Проверьте условия поиска или сбросьте фильтры.</p>}
    </Card>
  );
}
