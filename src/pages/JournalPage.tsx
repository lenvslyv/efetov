import { useState } from "react";
import { startOperation } from "@/shared/lib/performance";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/mock";
import { tryApi } from "@/api/errors";
import { useAuth } from "@/features/auth/useAuth";
import { downloadExport } from "@/features/export/buildWorkbook";
import { ExportDialog } from "@/features/export/ExportDialog";
import { JournalFilters } from "@/features/journal/JournalFilters";
import { PatientTable } from "@/features/journal/PatientTable";
import { useJournal } from "@/features/journal/useJournal";
import { Button, Modal, PageHeader } from "@/shared/ui";
import { useToast } from "@/shared/ui/toast";

export function JournalPage() {
  const { user, pwr } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const {
    patients,
    filteredPatients,
    centers,
    filters,
    setFilters,
    sort,
    sortBy,
    resetFilters,
  } = useJournal();
  const [exportModal, setExportModal] = useState<"final" | "slice" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const deletePatient = async (id: string) => {
    if (!user) return;
    const target = patients.find((item) => item.id === id);
    if (!target) return;
    if (!pwr.canDeletePatient || deleting) return;
    setDeleting(true);
    const deleted = await tryApi(
      () => api.deletePatient(user, id),
      (error) => showToast(error.message)
    );
    setDeleting(false);
    if (deleted.ok) { setDeleteId(null); showToast("Карточка удалена"); }
  };

  const performExport = async (format: "excel" | "csv") => {
    if (!user || !exportModal) return;
    const rows = exportModal === "slice" ? filteredPatients : patients;
    const recorded = await tryApi(
      () =>
        api.recordExport(
          user,
          `${exportModal === "slice" ? "Статистический срез" : "Итоговая выгрузка"} ${format.toUpperCase()}, строк: ${rows.length}`
        ),
      (error) => showToast(error.message)
    );
    if (!recorded.ok) return;
    try {
      if (format === "excel" && exportModal === "final") {
        await api.downloadFinalExport(user);
      } else if (format === "excel") {
        await api.downloadSliceExport(
          user,
          rows.map((patient) => patient.id)
        );
      } else {
        downloadExport(rows, exportModal, format);
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Выгрузка не сформирована");
      return;
    }
    setExportModal(null);
    showToast("Выгрузка сформирована и сохранена браузером");
  };

  return (
    <>
      <PageHeader
        title="Общий журнал пациентов"
        description="Список карточек пациентов."
      />
      <JournalFilters
        onRefresh={async () => {
          setRefreshing(true);
          try { await api.refreshRuntime(); }
          catch (error) { showToast(error instanceof Error ? error.message : "Не удалось обновить журнал"); }
          finally { setRefreshing(false); }
        }}
        refreshing={refreshing}
        filters={filters}
        centers={centers}
        canCreate={pwr.canCreate}
        canExport={pwr.canExport}
        onPatch={(patch) => setFilters({ ...filters, ...patch })}
        onReset={resetFilters}
        onCreate={() => navigate("/patients/new")}
        onExportFinal={() => setExportModal("final")}
        onExportSlice={() => setExportModal("slice")}
      />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="mr-2 text-muted-foreground">Найдено: {filteredPatients.length} из {patients.length}</span>
        {(Object.entries(filters) as Array<[keyof typeof filters, string]>).filter(([, value]) => value && value !== "all").map(([key, value]) => <button key={key} type="button"
          className="touch-target inline-flex min-h-8 items-center gap-2 rounded-md border bg-muted/50 px-2 py-1 text-xs hover:bg-muted"
          title="Убрать фильтр" aria-label={`Убрать фильтр ${filterNames[key]}: ${value}`} onClick={() => setFilters({ ...filters, [key]: key === "center" ? "all" : "" })}>
          {filterNames[key]}: {value}<span aria-hidden="true">×</span>
        </button>)}
      </div>
      <PatientTable
        rows={filteredPatients}
        sort={sort}
        canDelete={pwr.canDeletePatient}
        onSort={sortBy}
        onOpen={(id) => { startOperation("patient.open"); navigate(`/patients/${id}`); }}
        onDelete={setDeleteId}
      />
      {deleteId && <Modal title="Удаление карточки" dismissible={!deleting} onClose={() => setDeleteId(null)}><div className="space-y-4 p-6">
        <h2 className="text-lg font-semibold">Удалить карточку пациента?</h2><p className="break-all text-sm">Шифр: {patients.find(patient => patient.id === deleteId)?.code}</p>
        <p className="text-sm text-muted-foreground">Данные карточки будут удалены. Отменить удаление невозможно.</p><div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={deleting} onClick={() => setDeleteId(null)}>Отмена</Button><Button variant="danger" disabled={deleting} onClick={() => void deletePatient(deleteId)}>{deleting ? "Удаление…" : "Удалить"}</Button></div>
      </div></Modal>}
      {exportModal ? (
        <ExportDialog
          type={exportModal}
          filters={filters}
          onClose={() => setExportModal(null)}
          onExport={performExport}
        />
      ) : null}
    </>
  );
}

const filterNames: Record<string, string> = { id: "ID", code: "Шифр", center: "Центр", operationDateFrom: "Операция с", operationDateTo: "Операция по", createdAtFrom: "Создание с", createdAtTo: "Создание по" };
