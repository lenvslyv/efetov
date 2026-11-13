import type { Patient } from "@/entities/patient/types";
import { Card } from "@/shared/ui";

export function PatientHeader({ patient }: { patient: Patient }) {
  return (
    <Card className="mb-4 p-4">
      <dl className="flex flex-wrap gap-x-8 gap-y-3 text-sm">
        {[["ID", patient.id], ["Шифр", patient.code], ["Группа/центр", patient.center], ["Дата операции", patient.operationDate]].map(([label, value]) => (
          <div key={label} className="min-w-0 max-w-full">
            <dt className="text-xs text-muted-foreground">{label}</dt>
            <dd className="mt-1 break-words font-semibold">{value || "—"}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t pt-2 text-xs leading-5 text-muted-foreground">
        <span>Создал: {patient.createdByName || patient.createdByLogin || patient.createdBy} · {patient.createdAt || "—"}</span>
        <span>Последнее изменение: {patient.updatedAt || "—"}{patient.updatedByName ? ` · ${patient.updatedByName}` : ""}</span>
      </div>
    </Card>
  );
}
