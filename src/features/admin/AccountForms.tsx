import { FormEvent, useState } from "react";
import { passwordError } from "./password";
import type { AccountProfileInput, AccountRecord, AssignableRole } from "@/entities/user/types";
import { Button, Card, Label, Modal, TextInput, Badge, Select } from "@/shared/ui";

function Field({
  id,
  label,
  value,
  onChange,
  type = "text",
  autoComplete,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <TextInput
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      {message}
    </div>
  );
}

export function CreateAccountDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: AccountProfileInput & { password: string; passwordRepeat: string; roles: AssignableRole[]; role?: AssignableRole }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [roles, setRoles] = useState<AssignableRole[]>([]);
  const [effectiveRole, setEffectiveRole] = useState<AssignableRole>("stationary");

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (!roles.length) { setError("Назначьте хотя бы одну роль"); return; }
    setPending(true);
    setError("");
    const validation = passwordError(password, passwordRepeat);
    if (validation) { setError(validation); setPending(false); return; }
    void onSubmit({ name, login, email, password, passwordRepeat, roles, role: roles.includes(effectiveRole) ? effectiveRole : roles[0] })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Не удалось создать пользователя");
      })
      .finally(() => setPending(false));
  };

  return (
    <Modal title="Добавить пользователя" fixedHeader dismissible={!pending} onClose={onClose}>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-5"><fieldset disabled={pending} className="space-y-3"><legend className="mb-3 text-sm font-semibold">Основные сведения</legend>
          <Field id="new-name" label="ФИО" value={name} onChange={setName} autoComplete="name" />
          <Field id="new-login" label="Логин" value={login} onChange={setLogin} autoComplete="off" />
          <Field id="new-email" label="Почта" value={email} onChange={setEmail} type="email" autoComplete="off" />
          </fieldset><fieldset disabled={pending} className="space-y-2 rounded-lg border p-3"><legend className="px-1 text-sm font-semibold">Роли и доступ</legend>{([['stationary','Врач стационара'],['ambulatory','Врач амбулатории'],['leader','Руководитель']] as const).map(([role,label]) => <label key={role} className="flex min-h-10 cursor-pointer items-center gap-3 text-sm"><input type="checkbox" className="size-4 accent-blue-600" checked={roles.includes(role)} onChange={event => setRoles(current => event.target.checked ? [...current,role] : current.filter(item => item !== role))} />{label}</label>)}{roles.length > 1 && <div className="pt-2"><Label htmlFor="new-effective-role">Рабочая роль</Label><Select id="new-effective-role" value={roles.includes(effectiveRole) ? effectiveRole : roles[0]} onChange={event => setEffectiveRole(event.target.value as AssignableRole)}>{roles.map(role => <option key={role} value={role}>{role === 'stationary' ? 'Врач стационара' : role === 'ambulatory' ? 'Врач амбулатории' : 'Руководитель'}</option>)}</Select><p className="mt-2 text-xs leading-5 text-muted-foreground">Действуют права рабочей роли. Права нескольких ролей не объединяются.</p></div>}</fieldset><fieldset disabled={pending} className="space-y-3"><legend className="mb-3 text-sm font-semibold">Пароль</legend>
          <Field id="new-password" label="Пароль" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
          <Field id="new-password-repeat" label="Повтор пароля" value={passwordRepeat} onChange={setPasswordRepeat} type="password" autoComplete="new-password" /></fieldset>
          <FormError message={error} />
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              Создать
            </Button>
          </div>
        </form>
      </Card>
    </Modal>
  );
}

export function EditAccountDialog({
  account,
  onClose,
  onSubmit,
}: {
  account: AccountRecord;
  onClose: () => void;
  onSubmit: (input: AccountProfileInput) => Promise<void>;
}) {
  const [name, setName] = useState(account.name);
  const [login, setLogin] = useState(account.login);
  const [email, setEmail] = useState(account.email);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    void onSubmit({ name, login, email })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Не удалось сохранить учётную запись");
      })
      .finally(() => setPending(false));
  };

  return (
    <Modal title="Изменить учётную запись" fixedHeader dismissible={!pending} onClose={onClose}>
      <Card className="p-6">
        <form onSubmit={submit} className="space-y-5"><fieldset disabled={pending} className="space-y-3"><legend className="mb-3 text-sm font-semibold">Основные сведения</legend>
          <Field id="edit-name" label="ФИО" value={name} onChange={setName} autoComplete="name" />
          <Field id="edit-login" label="Логин" value={login} onChange={setLogin} autoComplete="off" />
          <Field id="edit-email" label="Почта" value={email} onChange={setEmail} type="email" autoComplete="off" /></fieldset><section className="space-y-2 rounded-lg border bg-muted/30 p-3"><h3 className="text-sm font-semibold">Роли и доступ</h3><div className="flex flex-wrap gap-1">{account.roles.map(role => <Badge key={role} tone="slate">{role === "stationary" ? "Врач стационара" : role === "ambulatory" ? "Врач амбулатории" : "Руководитель"}</Badge>)}{!account.roles.length && <span className="text-xs text-muted-foreground">Роли не назначены</span>}</div><p className="text-xs text-muted-foreground">Роли настраиваются флажками в таблице. Смена пароля доступна в меню действий пользователя.</p></section>
          <FormError message={error} />
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              Сохранить
            </Button>
          </div>
        </form>
      </Card>
    </Modal>
  );
}

export function PasswordDialog({
  account,
  onClose,
  onSubmit,
}: {
  account: AccountRecord;
  onClose: () => void;
  onSubmit: (input: { password: string; passwordRepeat: string }) => Promise<void>;
}) {
  const [password, setPassword] = useState("");
  const [passwordRepeat, setPasswordRepeat] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError("");
    const validation = passwordError(password, passwordRepeat);
    if (validation) { setError(validation); setPending(false); return; }
    void onSubmit({ password, passwordRepeat })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Не удалось сменить пароль");
      })
      .finally(() => setPending(false));
  };

  return (
    <Modal title="Сменить пароль" fixedHeader dismissible={!pending} onClose={onClose}>
      <Card className="p-6">
        <p className="mt-2 text-sm text-slate-500">{account.name}</p>
        <form onSubmit={submit} className="mt-5 space-y-5">
          <Field id="change-password" label="Новый пароль" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
          <Field id="change-password-repeat" label="Повтор пароля" value={passwordRepeat} onChange={setPasswordRepeat} type="password" autoComplete="new-password" />
          <FormError message={error} />
          <div className="flex flex-wrap justify-end gap-2 border-t pt-4">
            <Button type="button" variant="secondary" disabled={pending} onClick={onClose}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending}>
              Сменить пароль
            </Button>
          </div>
        </form>
      </Card>
    </Modal>
  );
}
