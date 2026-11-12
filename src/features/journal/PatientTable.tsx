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
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {COLUMNS.map(([key, label]) => (
                <th
                  key={key}
                  className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-3 text-left font-semibold text-slate-600"
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
              <th className="sticky right-0 z-10 whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-3 text-left font-semibold text-slate-600 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.35)]">
                Действия
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((patient) => (
              <tr key={patient.id} className="group hover:bg-slate-50">
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-3 font-semibold">
                  {patient.id}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-3">
                  {patient.code}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-3">
                  {patient.center}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-3">
                  {patient.operationDate}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-3">
                  {patient.createdAt || "—"}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-3">
                  {patient.createdByLogin ||
                    patient.createdByName ||
                    patient.createdBy}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-3">
                  {patient.updatedAt}
                </td>
                <td className="max-w-[280px] border-b border-slate-200 px-3 py-3">
                  {lockOwnerId(patient.lock) ? (
                    <Badge tone="amber">{patient.lock}</Badge>
                  ) : (
                    <Badge tone="slate">{LOCK_FREE}</Badge>
                  )}
                </td>
                <td className="sticky right-0 z-10 border-b border-slate-200 bg-white px-3 py-3 shadow-[-8px_0_8px_-8px_rgba(15,23,42,0.35)] group-hover:bg-slate-50">
                  <div className="flex flex-wrap gap-2">
                    <Button variant="secondary" onClick={() => onOpen(patient.id)}>
                      Открыть
                    </Button>
                    <Button
                      variant="danger"
                      disabled={!canDelete}
                      onClick={() => onDelete(patient.id)}
                    >
                      Удалить
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
