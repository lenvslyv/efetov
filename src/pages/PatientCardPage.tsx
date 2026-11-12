import { useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import { finishOperation } from "@/shared/lib/performance";
import { useAuth } from "@/features/auth/useAuth";
import { CrfBlockForm } from "@/features/patient/CrfBlockForm";
import { CrfTabs } from "@/features/patient/CrfTabs";
import { LeaderEditConfirm } from "@/features/patient/LeaderEditConfirm";
import { PatientHeader } from "@/features/patient/PatientHeader";
import { PatientLockBar } from "@/features/patient/PatientLockBar";
import { usePatientCard } from "@/features/patient/usePatientCard";
import { PageHeader } from "@/shared/ui";

export function PatientCardPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const card = usePatientCard(id);
  useEffect(() => {
    if (!card.patient) return;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => finishOperation("patient.open")); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [id, Boolean(card.patient)]);

  if (!card.patient) {
    return (
      <PageHeader title="Карточка пациента" description="Нет доступных карточек." />
    );
  }

  return (
    <>
      <PageHeader
        title="Карточка пациента"
        description="Данные пациента по разделам карточки."
      />
      <PatientHeader patient={card.patient} />
      {card.hasDraft && <p role="status" className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Есть несохранённые изменения. При выходе по бездействию предложим восстановить их после входа в этой вкладке. Для записи в систему нажмите «Сохранить».</p>}
      <PatientLockBar
        lockLabel={card.lockLabel}
        lockedByOther={card.lockedByOther}
        holdsLock={card.ownsLock}
        canTake={card.canTakeLock}
        canRelease={card.canReleaseLock}
        onTake={card.takeLock}
        onRelease={card.releaseLock}
      />
      <CrfTabs
        role={user?.role}
        active={card.sectionId}
        onChange={card.setActiveSection}
      />
      <CrfBlockForm
        block={card.sectionLabel}
        fields={card.fields}
        values={card.values}
        editable={card.editable}
        canSave={card.canSave}
        onChange={card.setField}
        onSave={card.requestSave}
        onBack={() => navigate("/journal")}
      />
      {card.leaderEditOpen ? (
        <LeaderEditConfirm
          creator={card.creator}
          onCancel={card.closeLeaderEdit}
          onConfirm={card.applySave}
        />
      ) : null}
    </>
  );
}
