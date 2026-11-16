import { useNavigate, useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { startOperation, finishOperation, cancelOperation } from "@/shared/lib/performance";
import { api } from "@/api/mock";
import { useAuth } from "@/features/auth/useAuth";
import { CrfBlockForm } from "@/features/patient/CrfBlockForm";
import { CrfTabs } from "@/features/patient/CrfTabs";
import { LeaderEditConfirm } from "@/features/patient/LeaderEditConfirm";
import { PatientHeader } from "@/features/patient/PatientHeader";
import { PatientContext } from "@/features/patient/PatientContext";
import { PatientLockBar } from "@/features/patient/PatientLockBar";
import { usePatientCard } from "@/features/patient/usePatientCard";
import { PageHeader } from "@/shared/ui";

export function PatientCardPage() {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const card = usePatientCard(id);
  const [loadState, setLoadState] = useState<{ id: string | undefined; ready: boolean; error: string }>({ id, ready: false, error: "" });
  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    setLoadState({ id, ready: false, error: "" });
    startOperation("patient.open");
    void api.openPatient(user, id).then(() => {
      if (!cancelled) setLoadState({ id, ready: true, error: "" });
    }).catch((error: unknown) => {
      if (!cancelled) {
        cancelOperation("patient.open");
        setLoadState({ id, ready: false, error: error instanceof Error ? error.message : "Не удалось открыть карточку" });
      }
    });
    return () => { cancelled = true; };
  }, [id, user?.id]);
  const ready = loadState.id === id && loadState.ready;
  useEffect(() => {
    if (!card.patient || !ready) return;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => finishOperation("patient.open")); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [id, Boolean(card.patient), ready]);

  if (!ready || !card.patient) {
    return (
      <PageHeader title="Карточка пациента" description={loadState.id === id && loadState.error ? loadState.error : "Загрузка карточки…"} />
    );
  }

  return (
    <>
      <h1 className="mb-4 text-2xl font-semibold tracking-tight">Карточка пациента</h1>
      <PatientContext id={card.patient.id} code={card.patient.code} center={card.patient.center} section={card.sectionLabel} editable={card.editable} dirty={card.hasDraft} pending={card.pending} lock={card.lockLabel} />
      <PatientHeader patient={card.patient} />
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
        dirty={card.hasDraft}
        pending={card.pending}
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
