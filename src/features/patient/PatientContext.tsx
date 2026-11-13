import { Badge } from "@/shared/ui";
import { useLayoutEffect, useRef } from "react";
export function PatientContext({ id, code, center, section, editable, dirty, pending, lock, creating = false }: {
  id: string; code: string; center: string; section: string; editable: boolean; dirty: boolean; pending: boolean; lock?: string; creating?: boolean;
}) {
  const context = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const node = context.current;
    if (!node) return;
    const update = () => document.documentElement.style.setProperty("--patient-context-height", `${node.getBoundingClientRect().height}px`);
    update(); const observer = new ResizeObserver(update); observer.observe(node);
    return () => { observer.disconnect(); document.documentElement.style.removeProperty("--patient-context-height"); };
  }, []);
  return <div ref={context} aria-label="Контекст карточки пациента" className="patient-context sticky z-10 mb-4 rounded-lg border bg-background px-4 py-3 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1 text-sm"><span className="break-all font-semibold">{creating ? "Новая карточка" : "Карточка"} · {code}</span><span className="text-xs text-muted-foreground">ID: {id}{creating ? " (предварительно)" : ""}</span><span className="min-w-0 break-words text-xs text-muted-foreground">{center}</span></div>
      <div className="flex flex-wrap gap-1.5"><Badge tone={editable ? "blue" : "slate"}>{editable ? "Редактирование" : "Только просмотр"}</Badge><Badge tone={pending ? "blue" : dirty ? "amber" : "green"}>{pending ? "Сохранение…" : dirty ? "Есть изменения" : creating ? "Ещё не сохранена" : "Сохранено"}</Badge></div>
    </div>
    <div className="mt-2 flex flex-wrap justify-between gap-x-4 gap-y-1 border-t pt-2 text-xs leading-5 text-muted-foreground"><span className="min-w-0 break-words">{section}</span>{lock && <span className="break-words">Блокировка: {lock}</span>}</div>
  </div>;
}
