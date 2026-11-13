import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { AuditEvent } from "@/entities/audit/types";
import { Badge, Button, Card, Modal } from "@/shared/ui";

function eventTone(action: string): "red" | "green" | "blue" | "slate" {
  if (/удал|ошиб|отказ|delete|fail/i.test(action)) return "red";
  if (/созда|сохран|загруз|create|save|upload/i.test(action)) return "green";
  if (/вход|выход|login|logout/i.test(action)) return "slate";
  return "blue";
}
export function AuditTable({ rows }: { rows: AuditEvent[] }) {
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  return <>
    <p className="mb-3 text-sm text-muted-foreground">Найдено событий: {rows.length}</p>
    <Card className="overflow-hidden"><div className="max-h-[65vh] overflow-auto"><table className="w-full min-w-[760px] text-sm">
      <thead className="sticky top-0 z-10 bg-muted"><tr>{["Дата и время", "ID пользователя", "Роль", "Тип действия", "Детали изменения", "Просмотр"].map(label => <th key={label} className="border-b px-3 py-2 text-left text-xs font-semibold text-muted-foreground">{label}</th>)}</tr></thead>
      <tbody>{rows.map((item, index) => <tr key={`${item.time}-${index}`} className="border-b last:border-0 hover:bg-muted/30">
        <td className="whitespace-nowrap px-3 py-2">{item.time}</td><td className="px-3 py-2 font-medium">{item.userId}</td><td className="px-3 py-2">{item.role}</td>
        <td className="px-3 py-2"><Badge tone={eventTone(item.action)}>{item.action}</Badge></td>
        <td className="max-w-md px-3 py-2"><p className="line-clamp-2 break-words">{item.details}</p></td>
        <td className="px-3 py-2"><Button variant="secondary" className="h-9 w-9 p-0" aria-label={`Подробнее о событии ${index + 1}`} title="Подробнее о событии" onClick={() => setSelected(item)}><ArrowUpRight /></Button></td>
      </tr>)}{!rows.length && <tr><td colSpan={6} className="p-10 text-center text-muted-foreground">События не найдены. Измените или сбросьте фильтры.</td></tr>}</tbody>
    </table></div></Card>
    {selected && <Modal title="Подробности события" onClose={() => setSelected(null)} className="left-auto right-0 top-0 h-dvh max-h-dvh w-full max-w-xl translate-x-0 translate-y-0 rounded-none">
      <div className="space-y-6 p-6"><h2 className="text-lg font-semibold">Подробности события</h2><p className="text-sm text-muted-foreground">Запись журнала доступна только для чтения.</p>
        <dl className="space-y-4">{[["Дата и время", selected.time], ["ID пользователя", selected.userId], ["Роль", selected.role], ["Тип действия", selected.action], ["Детали изменения", selected.details]].map(([label, value]) => <div key={label}><dt className="mb-1 text-xs font-medium text-muted-foreground">{label}</dt><dd className="whitespace-pre-wrap break-words text-sm leading-6">{value || "—"}</dd></div>)}</dl>
        <Button variant="secondary" onClick={() => setSelected(null)}>Закрыть</Button>
      </div>
    </Modal>}
  </>;
}
