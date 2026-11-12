import { FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api } from "@/api/mock";
import type { DemoUser } from "@/entities/user/types";
import { ROLE_LABELS } from "@/entities/user/types";
import { Button, Card, Label, TextInput } from "@/shared/ui";
import { returnPathFromState } from "./redirect";
import { restoredPath } from "./recovery";
import { loadSession } from "./session";
import { useAuth } from "./useAuth";

export function LoginForm() {
  const { login, loginError } = useAuth();
  const navigate = useNavigate();

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const loginValue = (form.elements.namedItem("login") as HTMLInputElement).value;
    const password = (form.elements.namedItem("password") as HTMLInputElement)
      .value;
    if (await login(loginValue.trim(), password)) {
      navigate(restoredPath(loadSession()!.id), { replace: true });
    }
  };

  return (
    <Card className="p-8">
      <h1 className="text-2xl font-semibold tracking-tight">Вход в систему</h1>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">Система сопровождения клинического исследования. Введите данные своей учётной записи.</p>
      <form onSubmit={onSubmit} className="mt-8 space-y-4">
        <div>
          <Label htmlFor="login">Логин</Label>
          <TextInput
            id="login"
            name="login"
            autoComplete="username"
            placeholder="Введите логин"
          />
        </div>
        <div>
          <Label htmlFor="password">Пароль</Label>
          <TextInput
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            placeholder="Введите пароль"
          />
        </div>
        {loginError ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            {loginError}
          </div>
        ) : null}
        <Button className="w-full" type="submit">
          Войти в систему
        </Button>
      </form>
    </Card>
  );
}

export function QuickRoleCards() {
  const { quickLogin } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [users, setUsers] = useState<DemoUser[]>([]);
  const nextPath = returnPathFromState(location.state);

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
                  navigate(nextPath, { replace: true });
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
