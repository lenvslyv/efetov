import { FormEvent, useState } from "react";
import { passwordError } from "./password";
import type { AccountProfileInput, AccountRecord } from "@/entities/user/types";
import { Button, Card, Label, Modal, TextInput } from "@/shared/ui";

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
    <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
      {message}
    </div>
  );
}

export function CreateAccountDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (input: AccountProfileInput & { password: string; passwordRepeat: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [email, setEmail] = useState("");
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
    void onSubmit({ name, login, email, password, passwordRepeat })
      .catch((reason: unknown) => {
        setError(reason instanceof Error ? reason.message : "Не удалось создать пользователя");
      })
      .finally(() => setPending(false));
  };

  return (
    <Modal title="Добавить пользователя" onClose={onClose}>
      <Card className="p-6">
        <h2 className="text-xl font-semibold">Добавить пользователя</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field id="new-name" label="ФИО" value={name} onChange={setName} autoComplete="name" />
          <Field id="new-login" label="Логин" value={login} onChange={setLogin} autoComplete="off" />
          <Field id="new-email" label="Почта" value={email} onChange={setEmail} type="email" autoComplete="off" />
          <Field id="new-password" label="Пароль" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
          <Field id="new-password-repeat" label="Повтор пароля" value={passwordRepeat} onChange={setPasswordRepeat} type="password" autoComplete="new-password" />
          <FormError message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
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
    <Modal title="Изменить учётную запись" onClose={onClose}>
      <Card className="p-6">
        <h2 className="text-xl font-semibold">Изменить учётную запись</h2>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field id="edit-name" label="ФИО" value={name} onChange={setName} autoComplete="name" />
          <Field id="edit-login" label="Логин" value={login} onChange={setLogin} autoComplete="off" />
          <Field id="edit-email" label="Почта" value={email} onChange={setEmail} type="email" autoComplete="off" />
          <FormError message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
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
    <Modal title="Сменить пароль" onClose={onClose}>
      <Card className="p-6">
        <h2 className="text-xl font-semibold">Сменить пароль</h2>
        <p className="mt-2 text-sm text-slate-500">{account.name}</p>
        <form onSubmit={submit} className="mt-4 space-y-3">
          <Field id="change-password" label="Новый пароль" value={password} onChange={setPassword} type="password" autoComplete="new-password" />
          <Field id="change-password-repeat" label="Повтор пароля" value={passwordRepeat} onChange={setPasswordRepeat} type="password" autoComplete="new-password" />
          <FormError message={error} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
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
