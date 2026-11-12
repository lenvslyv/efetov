import type { Patient } from "@/entities/patient/types";
import { LOCK_FREE, lockOwnerId } from "@/entities/patient/lock";
import { Kpi } from "@/shared/ui";

export function PatientHeader({ patient }: { patient: Patient }) {
  const owner = lockOwnerId(patient.lock);
  return (
    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      <Kpi title="ID" value={patient.id} note="ключевое поле журнала" />
      <Kpi title="Шифр" value={patient.code} note="код исследования" />
      <Kpi title="Группа/центр" value={patient.center} note="ключевое поле журнала" />
      <Kpi
        title="Дата операции"
        value={patient.operationDate}
        note="ключевое поле журнала"
        tone="amber"
      />
      <Kpi
        title="Дата и время создания"
        value={patient.createdAt || "—"}
        note={`Создатель: ${patient.createdByName || "—"}`}
      />
      <Kpi
        title="Последнее изменение"
        value={patient.updatedAt || "—"}
        note={
          patient.updatedByName
            ? `Автор: ${patient.updatedByName}`
            : "Автор не записан"
        }
      />
      <Kpi
        title="Блокировка"
        value={owner ? owner : LOCK_FREE}
        note={owner ? "карта занята" : "можно взять в работу"}
        tone={owner ? "amber" : "slate"}
      />
    </div>
  );
}
