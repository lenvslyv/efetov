import { useNavigate, useParams } from "react-router-dom";
import { useEffect } from "react";
import { finishOperation } from "@/shared/lib/performance";
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
