import { Button } from "@/shared/ui";

export function PatientFormActions({ dirty, creating = false, pending = false, canSave = true, onSave, onBack }: {
  dirty: boolean; creating?: boolean; pending?: boolean; canSave?: boolean; onSave?: () => void; onBack: () => void;
}) {
  const status = pending ? "Сохранение…" : dirty ? "Есть несохранённые изменения" : creating ? "Новая карточка" : "Сохранено";
  return <div className="patient-form-actions fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 shadow-[0_-4px_20px_-12px_rgba(15,23,42,0.3)] backdrop-blur">
    <div className="mx-auto flex max-w-[1760px] flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6 2xl:px-8">
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground sm:text-sm">
        <span className={`size-2 shrink-0 rounded-full ${dirty ? "bg-amber-500" : creating ? "bg-slate-400" : "bg-emerald-500"}`} />{status}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button type={creating ? "submit" : "button"} disabled={!canSave || pending} onClick={onSave}>{creating ? "Сохранить карточку" : "Сохранить"}</Button>
        <Button type="button" variant="secondary" disabled={pending} onClick={onBack}>Назад в журнал</Button>
      </div>
    </div>
  </div>;
}
