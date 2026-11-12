import type { JournalFilters } from "@/entities/patient/types";
import { Button, Card, Modal } from "@/shared/ui";

function rangeText(from: string, to: string): string {
  const start = from.trim();
  const end = to.trim();
  if (start && end) return `${start}–${end}`;
  if (start) return `с ${start}`;
  if (end) return `по ${end}`;
  return "все";
}

export function ExportDialog({
  type,
  filters,
  onClose,
  onExport,
}: {
  type: "final" | "slice";
  filters: JournalFilters;
  onClose: () => void;
  onExport: (format: "excel" | "csv") => void;
}) {
  return (
    <Modal title={type === "final" ? "Итоговая выгрузка" : "Статистический срез"} onClose={onClose}>
      <Card className="p-6">
        <h2 className="text-xl font-semibold">
          {type === "final" ? "Итоговая выгрузка" : "Статистический срез"}
        </h2>
        <p className="mt-2 text-slate-500">
          {type === "slice"
            ? `Выгрузка будет сформирована с учетом выбранных фильтров: ID=${filters.id || "все"}, шифр=${filters.code || "все"}, центр=${filters.center === "all" ? "все" : filters.center}, дата операции=${rangeText(filters.operationDateFrom, filters.operationDateTo)}, дата/время создания=${rangeText(filters.createdAtFrom, filters.createdAtTo)}.`
            : "Выгрузка включает все карточки пациентов без учета фильтров."}
        </p>
        <p className="mt-2 text-slate-500">
          Excel-выгрузка формируется по приложенному шаблону. Дополнительно можно
          выгрузить CSV.
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Button variant="exportFinal" onClick={() => onExport("excel")}>
            Excel
          </Button>
          <Button variant="exportSlice" onClick={() => onExport("csv")}>
            CSV
          </Button>
        </div>
        <Button variant="secondary" className="mt-3 w-full" onClick={onClose}>
          Закрыть
        </Button>
      </Card>
    </Modal>
  );
}
