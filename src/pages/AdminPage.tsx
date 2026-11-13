import { Pencil, UserPlus, RotateCcw } from "lucide-react";
import { ActionMenu } from "@/shared/ui/ActionMenu";
import { useEffect, useState } from "react";
import { EMPTY_ACCOUNT_FILTERS, selectAccounts, type AccountSort } from "@/features/admin/filter";
import { api } from "@/api/mock";
import { tryApi } from "@/api/errors";
import type { AccountProfileInput, AccountRecord, AssignableRole } from "@/entities/user/types";
import {
  CreateAccountDialog,
  EditAccountDialog,
  PasswordDialog,
} from "@/features/admin/AccountForms";
import { useAuth } from "@/features/auth/useAuth";
import { Badge, Button, Label, TextInput, Select, PageHeader, Card, Modal } from "@/shared/ui";
import { useToast } from "@/shared/ui/toast";

const ROLE_COLUMNS: Array<{ role: AssignableRole; label: string }> = [
  { role: "stationary", label: "Врач стационара" },
  { role: "ambulatory", label: "Врач амбулатории" },
  { role: "leader", label: "Руководитель" },
];

export function AdminPage() {
  const { user, applyRole } = useAuth();
  const { showToast } = useToast();
  const [rows, setRows] = useState<AccountRecord[]>([]);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<AccountRecord | null>(null);
  const [passwordFor, setPasswordFor] = useState<AccountRecord | null>(null);
  const [filters, setFilters] = useState(EMPTY_ACCOUNT_FILTERS);
  const [sort, setSort] = useState<AccountSort>({ key: "name", dir: "asc" });
  const [confirmation, setConfirmation] = useState<{account: AccountRecord; action: "block" | "unblock" | "remove"} | null>(null);
  const visibleRows = selectAccounts(rows, filters, sort);
  const sortButton = (key: AccountSort["key"], label: string) => (
    <button type="button" onClick={() => setSort(current => ({ key, dir: current.key === key && current.dir === "asc" ? "desc" : "asc" }))}>
      {label} {sort.key === key ? sort.dir === "asc" ? "↑" : "↓" : "↕"}
    </button>
  );

  useEffect(() => {
    if (!user) return;
    void api.listAccounts(user).then(setRows).catch((error: unknown) => {
      showToast(error instanceof Error ? error.message : "Не удалось открыть список пользователей");
    });
  }, [user, showToast]);

  const toggleRole = async (account: AccountRecord, role: AssignableRole) => {
    if (!user || pendingId) return;
    const roles = account.roles.includes(role) ? account.roles.filter(item => item !== role) : [...account.roles, role];
    setPendingId(account.id);
    try {
      const saved = await api.updateAccountRoles(user, account.id, roles);
      replaceRow(saved);
      if (saved.id === user.id && saved.role) applyRole(saved.role);
      showToast("Назначенные роли сохранены");
    } catch (error) { showToast(error instanceof Error ? error.message : "Не удалось сохранить права"); }
    finally { setPendingId(null); }
  };

  const replaceRow = (saved: AccountRecord) => {
    setRows((current) => {
      const exists = current.some((item) => item.id === saved.id);
      const next = exists
        ? current.map((item) => (item.id === saved.id ? saved : item))
        : [...current, saved];
      return next.sort((left, right) => left.id.localeCompare(right.id));
    });
  };

  const createAccount = async (
    input: AccountProfileInput & { password: string; passwordRepeat: string; roles: AssignableRole[]; role?: AssignableRole }
  ) => {
    if (!user) return;
    const saved = await api.createAccount(user, input);
    replaceRow(saved);
    setCreating(false);
    showToast("Учётная запись создана");
  };

  const saveAccount = async (input: AccountProfileInput) => {
    if (!user || !editing) return;
    const saved = await api.updateAccount(user, editing.id, input);
    replaceRow(saved);
    setEditing(null);
    showToast("Учётная запись сохранена");
  };

  const changeStatus = async (
    account: AccountRecord,
    action: () => Promise<AccountRecord>
  ) => {
    if (!user) return;
    setPendingId(account.id);
    try {
      const saved = await tryApi(action, (error) => showToast(error.message));
      if (!saved.ok) return;
      replaceRow(saved.value); setConfirmation(null);
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось изменить учётную запись");
    } finally {
      setPendingId(null);
    }
  };

  const remove = async (account: AccountRecord) => {
    if (!user) return;
    setPendingId(account.id);
    try {
      const saved = await tryApi(
        () => api.removeAccount(user, account.id),
        (error) => showToast(error.message)
      );
      if (!saved.ok) return;
      setRows((current) => current.filter((item) => item.id !== account.id)); setConfirmation(null);
      showToast("Учётная запись удалена из списка");
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось удалить учётную запись");
    } finally {
      setPendingId(null);
    }
  };

  const savePassword = async (input: { password: string; passwordRepeat: string }) => {
    if (!user || !passwordFor) return;
    const saved = await api.changeAccountPassword(user, passwordFor.id, input);
    replaceRow(saved);
    setPasswordFor(null);
    showToast("Пароль изменён");
  };

  return (
    <>
      <PageHeader
        title="Администрирование"
        description="Зарегистрированные учётные записи и назначенные роли."
      />
      <div className="mb-4">
        <Button type="button" onClick={() => setCreating(true)}>
          <UserPlus />Добавить пользователя
        </Button>
      </div>
      <Card className="mb-4 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
        <div><Label htmlFor="account-filter-name">ФИО</Label><TextInput id="account-filter-name" value={filters.name} onChange={event => setFilters({ ...filters, name: event.target.value })} /></div>
        <div><Label htmlFor="account-filter-login">Логин</Label><TextInput id="account-filter-login" value={filters.login} onChange={event => setFilters({ ...filters, login: event.target.value })} /></div>
        <div><Label htmlFor="account-filter-role">Назначенная роль</Label><Select id="account-filter-role" value={filters.role} onChange={event => setFilters({ ...filters, role: event.target.value })}>
          <option value="">Все роли</option>{ROLE_COLUMNS.map(column => <option key={column.role} value={column.role}>{column.label}</option>)}
        </Select></div>
        <div><Label htmlFor="account-filter-status">Статус</Label><Select id="account-filter-status" value={filters.status} onChange={event => setFilters({ ...filters, status: event.target.value })}>
          <option value="">Все статусы</option><option value="active">Активна</option><option value="blocked">Заблокирована</option>
        </Select></div>
        <div className="flex items-end"><Button type="button" variant="secondary" onClick={() => { setFilters(EMPTY_ACCOUNT_FILTERS); setSort({ key: "name", dir: "asc" }); }}><RotateCcw />Сбросить фильтры</Button></div>
      </Card>
      <p className="mb-2 text-sm text-slate-500">Найдено: {visibleRows.length} из {rows.length}</p>
      <Card className="overflow-hidden"><div className="max-h-[70vh] overflow-auto">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="sticky top-0 z-20 bg-muted"><tr>
            <th className="px-4 py-3 text-left">{sortButton("name", "ФИО")}</th>
            <th className="px-4 py-3 text-left">{sortButton("login", "Логин")}</th>
            {ROLE_COLUMNS.map(column => <th key={column.role} className="px-3 py-3 text-center">{sortButton(column.role, column.label)}</th>)}
            <th className="px-4 py-3 text-left">{sortButton("blocked", "Статус")}</th>
            <th className="sticky right-0 bg-muted px-4 py-3 text-right">Действия</th>
          </tr></thead>
          <tbody>{visibleRows.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-muted-foreground">Пользователи не найдены</td></tr>}
            {visibleRows.map(account => <tr key={account.id} aria-busy={pendingId === account.id} className="group border-t hover:bg-muted/30">
              <td className="max-w-64 break-words px-4 py-3"><div className="font-medium">{account.name}</div>{account.email && <div className="mt-1 text-xs text-muted-foreground">{account.email}</div>}</td>
              <td className="px-4 py-3"><div className="font-medium">{account.login}</div><div className="mt-1 text-xs text-muted-foreground">{account.id}</div></td>
              {ROLE_COLUMNS.map(column => <td key={column.role} className="px-3 py-2 text-center"><label className="touch-target mx-auto flex min-h-10 w-10 cursor-pointer items-center justify-center rounded-md hover:bg-primary/5"><input type="checkbox" className="size-4 rounded border-input accent-blue-600 focus-visible:ring-2 focus-visible:ring-ring" aria-label={`${account.name}, ${column.label}`} checked={account.roles.includes(column.role)} disabled={Boolean(pendingId)} onChange={() => void toggleRole(account, column.role)} /></label></td>)}
              <td className="px-4 py-3"><Badge tone={account.blocked ? "red" : "green"}>{account.blocked ? "Заблокирована" : "Активна"}</Badge></td>
              <td className="sticky right-0 bg-background px-4 py-3 group-hover:bg-slate-50"><div className="flex flex-nowrap justify-end gap-1">
                <Button variant="secondary" className="h-9 w-9 p-0" aria-label={`Редактировать ${account.login}`} title="Редактировать пользователя" disabled={Boolean(pendingId)} onClick={() => setEditing(account)}><Pencil /></Button>
                <ActionMenu label={`Действия пользователя ${account.login}`} disabled={Boolean(pendingId)} actions={[
                  {label:"Сменить пароль", onSelect:() => setPasswordFor(account)},
                  {label: account.blocked ? "Разблокировать" : "Заблокировать", disabled:!account.blocked && account.id === user?.id, onSelect:() => setConfirmation({account, action:account.blocked ? "unblock" : "block"})},
                  {label:"Удалить пользователя", danger:true, disabled:account.id === user?.id, onSelect:() => setConfirmation({account,action:"remove"})},
                ]} />
              </div></td>
            </tr>)}
          </tbody>
        </table>
      </div></Card>
      {confirmation && <Modal title="Подтверждение действия" dismissible={!pendingId} onClose={() => setConfirmation(null)}><div className="space-y-4 p-6"><h2 className="text-lg font-semibold">{confirmation.action === "remove" ? "Удалить пользователя?" : confirmation.action === "block" ? "Заблокировать пользователя?" : "Разблокировать пользователя?"}</h2><p className="break-words text-sm">{confirmation.account.name} · {confirmation.account.login}</p><p className="text-sm text-muted-foreground">{confirmation.action === "remove" ? "Учётная запись будет удалена из списка. Записи аудита сохранятся." : confirmation.action === "block" ? "Вход под этой учётной записью будет недоступен." : "Пользователь снова сможет войти в систему."}</p>
        <div className="flex flex-wrap justify-end gap-2"><Button variant="secondary" disabled={Boolean(pendingId)} onClick={() => setConfirmation(null)}>Отмена</Button><Button variant={confirmation.action === "remove" ? "danger" : "primary"} disabled={Boolean(pendingId)} onClick={() => {
          if (confirmation.action === "remove") void remove(confirmation.account);
          else void changeStatus(confirmation.account, () => confirmation.action === "block" ? api.blockAccount(user!,confirmation.account.id) : api.unblockAccount(user!,confirmation.account.id));
        }}>{pendingId ? "Выполнение…" : confirmation.action === "remove" ? "Удалить" : confirmation.action === "block" ? "Заблокировать" : "Разблокировать"}</Button></div>
      </div></Modal>}
      <p className="mt-3 text-sm text-slate-500">
        Несколько ролей сохраняются. Пока их сочетание не согласовано, действуют
        права одной роли: текущей, если она остаётся отмеченной, либо единственной
        выбранной.
      </p>
      {creating ? (
        <CreateAccountDialog onClose={() => setCreating(false)} onSubmit={createAccount} />
      ) : null}
      {editing ? (
        <EditAccountDialog
          account={editing}
          onClose={() => setEditing(null)}
          onSubmit={saveAccount}
        />
      ) : null}
      {passwordFor ? (
        <PasswordDialog
          account={passwordFor}
          onClose={() => setPasswordFor(null)}
          onSubmit={savePassword}
        />
      ) : null}
    </>
  );
}
