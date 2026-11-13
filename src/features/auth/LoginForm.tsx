import { FormEvent, useEffect, useRef, useState } from "react";
import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { api } from "@/api/mock";
import type { DemoUser } from "@/entities/user/types";
import { ROLE_LABELS } from "@/entities/user/types";
import { Button, Card, Label, TextInput } from "@/shared/ui";
import { restoredPath } from "./recovery";
import { loadSession } from "./session";
import { useAuth } from "./useAuth";

export function LoginForm() {
  const { login, loginError } = useAuth();
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const submitting = useRef(false);
  const [visible, setVisible] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const loginValue = (form.elements.namedItem("login") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement)
      .value;
    submitting.current = true; setPending(true);
    try {
      if (await login(loginValue.trim(), password)) navigate(restoredPath(loadSession()!.id), { replace: true });
    } finally { submitting.current = false; setPending(false); }
  };

  return (
    <Card className="p-6 shadow-sm sm:p-7">
      <h1 className="text-xl font-semibold tracking-tight">Вход в систему</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Введите логин и пароль.</p>
      <form onSubmit={onSubmit} className="mt-6 space-y-4" aria-busy={pending}>
        <div>
          <Label htmlFor="login">Логин</Label>
          <TextInput
            id="login"
            name="login"
            autoComplete="username"
            placeholder="Введите логин"
            required disabled={pending} autoCapitalize="none" spellCheck={false}
          />
        </div>
        <div>
          <Label htmlFor="password">Пароль</Label>
          <div className="relative"><TextInput
            id="password"
            name="password"
            type={visible ? "text" : "password"}
            autoComplete="current-password"
            placeholder="Введите пароль"
            className="pr-12" required disabled={pending}
            onKeyDown={event => setCapsLock(event.getModifierState("CapsLock"))}
            onKeyUp={event => setCapsLock(event.getModifierState("CapsLock"))}
            onBlur={() => setCapsLock(false)} aria-describedby={capsLock ? "caps-lock-warning" : undefined}
          /><button type="button" disabled={pending} aria-label={visible ? "Скрыть пароль" : "Показать пароль"} aria-pressed={visible} className="touch-target absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => setVisible(!visible)}>{visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</button></div>
          {capsLock && <p id="caps-lock-warning" role="status" className="mt-2 text-xs text-amber-800">Включён Caps Lock</p>}
        </div>
        {loginError ? (
          <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {loginError}
          </div>
        ) : null}
        <Button className="min-h-10 w-full" type="submit" disabled={pending}>
          {pending ? <><LoaderCircle aria-hidden="true" className="animate-spin" />Выполняется вход…</> : "Войти в систему"}
        </Button>
      </form>
    </Card>
  );
}

export function QuickRoleCards() {
  const { quickLogin } = useAuth();
  const navigate = useNavigate();
  const [users, setUsers] = useState<DemoUser[]>([]);

  useEffect(() => {
    void api.listDemoUsers().then(setUsers).catch(() => setUsers([]));
  }, []);

  return (
    <section className="grid gap-4">
      {users.map((item) => (
        <Card key={item.id} className="p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">{ROLE_LABELS[item.role]}</div>
              <div className="mt-1 text-sm text-slate-500">
                ID пользователя: {item.id}
              </div>
            </div>
            <Button
              variant="secondary"
              type="button"
              onClick={async () => {
                if (await quickLogin(item.login, item.password)) {
                  navigate(restoredPath(loadSession()!.id), { replace: true });
                }
              }}
            >
              Войти
            </Button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="mb-1.5 block text-xs font-bold text-slate-600">
                Логин
              </div>
              <code>{item.login}</code>
            </div>
            <div className="rounded-xl bg-slate-50 p-3">
              <div className="mb-1.5 block text-xs font-bold text-slate-600">
                Пароль
              </div>
              <code>{item.password}</code>
            </div>
          </div>
        </Card>
      ))}
    </section>
  );
}
