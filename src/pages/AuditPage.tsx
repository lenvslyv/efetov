import { useEffect, useMemo, useState } from "react";
import { api } from "@/api/mock";
import { useToast } from "@/shared/ui/toast";
import { useRuntime } from "@/api/useRuntime";
import { EMPTY_AUDIT_FILTERS, type AuditFilters } from "@/entities/audit/types";
import { AuditFiltersBar } from "@/features/audit/AuditFilters";
import { matchesAuditFilters } from "@/features/audit/filter";
import { AuditTable } from "@/features/audit/AuditTable";
import { useAuth } from "@/features/auth/useAuth";
import { PageHeader } from "@/shared/ui";

export function AuditPage() {
  const { pwr } = useAuth();
  const { showToast } = useToast();
  useEffect(() => {
    if (pwr.canAudit) void api.refreshAudit().catch(error => showToast(error.message));
  }, [pwr.canAudit, showToast]);
  const { audit } = useRuntime();
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_AUDIT_FILTERS);

  const rows = useMemo(
    () =>
      audit.filter((item) => matchesAuditFilters(item, filters)),
    [audit, filters]
  );
  const roles = useMemo(
    () => Array.from(new Set(audit.map((item) => item.role))),
    [audit]
  );

  if (!pwr.canAudit) {
    return (
      <PageHeader
        title="Модуль аудита"
        description="Недоступно для текущей роли."
      />
    );
  }

  return (
    <>
      <PageHeader
        title="Модуль аудита"
        description="Журнал действий пользователей. Записи нельзя изменить или удалить."
      />
      <AuditFiltersBar
        filters={filters}
        roles={roles}
        onChange={setFilters}
        onReset={() => setFilters(EMPTY_AUDIT_FILTERS)}
      />
      <AuditTable rows={rows} />
    </>
  );
}
