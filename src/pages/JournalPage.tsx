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
import { Button, PageHeader } from "@/shared/ui";
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

  const deletePatient = async (id: string) => {
    if (!user) return;
    const target = patients.find((item) => item.id === id);
    if (!target) return;
    if (
      !window.confirm(
        `Удалить карточку пациента ${target.code}?`
      )
    ) {
      return;
    }
    const deleted = await tryApi(
      () => api.deletePatient(user, id),
      (error) => showToast(error.message)
    );
    if (deleted.ok) showToast("Карточка удалена");
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
      <div className="mb-4">
        <Button type="button" variant="secondary" disabled={refreshing} onClick={async () => {
          setRefreshing(true);
          try { await api.refreshRuntime(); }
          catch (error) { showToast(error instanceof Error ? error.message : "Не удалось обновить журнал"); }
          finally { setRefreshing(false); }
        }}>{refreshing ? "Обновление…" : "Обновить журнал"}</Button>
      </div>
      <JournalFilters
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
      <PatientTable
        rows={filteredPatients}
        sort={sort}
        canDelete={pwr.canDeletePatient}
        onSort={sortBy}
        onOpen={(id) => { startOperation("patient.open"); navigate(`/patients/${id}`); }}
        onDelete={deletePatient}
      />
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
