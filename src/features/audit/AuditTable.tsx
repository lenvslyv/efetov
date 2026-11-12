import type { AuditEvent } from "@/entities/audit/types";
import { Card } from "@/shared/ui";

export function AuditTable({ rows }: { rows: AuditEvent[] }) {
  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr>
              {[
                "Дата и время",
                "ID пользователя",
                "Роль",
                "Тип действия",
                "Детали изменения",
              ].map((label) => (
                <th
                  key={label}
                  className="whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-3 text-left font-semibold text-slate-600"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((item, index) => (
              <tr key={`${item.time}-${index}`} className="hover:bg-slate-50">
                <td className="whitespace-nowrap border-b border-slate-200 px-3 py-3">{item.time}</td>
                <td className="whitespace-nowrap border-b border-slate-200 px-3 py-3 font-bold">
                  {item.userId}
                </td>
                <td className="border-b border-slate-200 px-3 py-3">{item.role}</td>
                <td className="border-b border-slate-200 px-3 py-3">{item.action}</td>
                <td className="min-w-48 max-w-md whitespace-normal break-words border-b border-slate-200 px-3 py-3">
                  {item.details}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
