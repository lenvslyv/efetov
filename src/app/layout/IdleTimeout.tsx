import { useEffect, useRef, useState } from "react";
import { api } from "@/api/mock";
import { useAuth } from "@/features/auth/useAuth";
import { browserSession, recordActivity, sessionKey } from "@/features/auth/session";
import { IDLE_TIMEOUT_MS, IDLE_WARNING_MS } from "@/shared/config/brand";
import { Button, Card, Modal } from "@/shared/ui";
import { useToast } from "@/shared/ui/toast";

const EVENTS = ["pointermove", "pointerdown", "keydown", "scroll", "touchstart"];

export function IdleTimeout() {
  const { user, logout } = useAuth();
  const { showToast } = useToast();
  const [warning, setWarning] = useState(false);
  const stay = useRef<() => void>(() => undefined);

  useEffect(() => {
    if (!user) return;
    let expired = false;
    let pingTimer: number | undefined;
    const pingKey = sessionKey() + ":ping";
    const check = () => {
      const current = browserSession();
      if (!current || expired) return;
      const remaining = IDLE_TIMEOUT_MS - (Date.now() - current.activity);
      if (remaining <= 0) {
        expired = true;
        setWarning(false);
        logout("idle");
        showToast("Сессия завершена после 15 минут бездействия. После входа в ту же учётную запись предложим восстановить несохранённые данные.");
      } else setWarning(remaining <= IDLE_WARNING_MS);
    };
    const ping = () => {
      if (!browserSession() || expired) return;
      const last = Number(localStorage.getItem(pingKey) || 0);
      if (Date.now() - last < 900) return;
      localStorage.setItem(pingKey, String(Date.now()));
      void api.touchSession().catch(() => undefined);
    };
    const activity = (event?: Event) => {
      if (event && !event.isTrusted) return;
      // A suspended tab must check expiry BEFORE accepting new activity.
      check();
      if (expired || !browserSession()) return;
      recordActivity();
      setWarning(false);
      const last = Number(localStorage.getItem(pingKey) || 0);
      if (Date.now() - last >= 10_000) ping();
      window.clearTimeout(pingTimer);
      pingTimer = window.setTimeout(ping, 1000);
    };
    const visible = () => { if (!document.hidden) check(); };
    stay.current = () => activity();
    check();
    const timer = window.setInterval(check, 1000);
    EVENTS.forEach(event => window.addEventListener(event, activity, { passive: true }));
    window.addEventListener("storage", check);
    window.addEventListener("focus", check);
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(pingTimer);
      EVENTS.forEach(event => window.removeEventListener(event, activity));
      window.removeEventListener("storage", check);
      window.removeEventListener("focus", check);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [user, logout, showToast]);

  if (!warning) return null;
  return (
    <Modal title="Сеанс скоро завершится" dismissible={false} onClose={() => undefined}>
      <Card className="p-6">
        <h2 className="text-xl font-semibold">Сеанс скоро завершится</h2>
        <p className="mt-3 text-slate-700">
          До выхода по бездействию осталось меньше минуты. Черновик останется в этой
          вкладке. После входа в ту же учётную запись предложим его восстановить.
          Для записи данных в систему нажмите «Сохранить» в карточке.
        </p>
        <div className="mt-5 flex justify-end">
          <Button type="button" onClick={() => stay.current()}>Продолжить работу</Button>
        </div>
      </Card>
    </Modal>
  );
}
