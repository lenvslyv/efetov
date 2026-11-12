import { createContext, ReactNode, useContext, useEffect, useState, useSyncExternalStore } from "react";
import { useBlocker, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/features/auth/useAuth";
import { checkpointIdle, clearIdleRecovery, idleRecovery, resolveIdleRecovery } from "@/features/auth/recovery";
import { browserSession, loadToken } from "@/features/auth/session";
import { IDLE_TIMEOUT_MS } from "@/shared/config/brand";
import { Button, Card, Modal } from "@/shared/ui";
import { useToast } from "@/shared/ui/toast";
import { currentEditor, hasUnsavedChanges, setUnsavedChanges, subscribeUnsaved } from "./unsaved";

const LeaveContext = createContext<(action: () => void) => void>(action => action());
export const useLeaveForm = () => useContext(LeaveContext);

export function NavigationGuard({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  useSyncExternalStore(subscribeUnsaved, hasUnsavedChanges);
  const [action, setAction] = useState<(() => void) | null>(null);
  const [busy, setBusy] = useState(false);
  const [recoveryDestination, setRecoveryDestination] = useState<string | null>(null);
  const blocker = useBlocker(({ currentLocation, nextLocation }) => Boolean(
    user && hasUnsavedChanges() && currentLocation.pathname !== nextLocation.pathname
  ));
  const checkpoint = user ? idleRecovery(user.id) : null;

  useEffect(() => {
    if (!user) { setAction(null); setBusy(false); setRecoveryDestination(null); }
    if (recoveryDestination === location.pathname + location.search + location.hash) setRecoveryDestination(null);
    if (user && checkpoint && !checkpoint.dirty) {
      if (location.pathname + location.search + location.hash === checkpoint.path) clearIdleRecovery(user.id);
      else navigate(checkpoint.path, { replace: true });
    }
  }, [user?.id, location.pathname, location.search, location.hash, checkpoint?.dirty, checkpoint?.path, recoveryDestination]);

  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (!user || !hasUnsavedChanges()) return;
      const session = browserSession();
      if (session && Date.now() - session.activity >= IDLE_TIMEOUT_MS) {
        checkpointIdle(user.id, location.pathname + location.search + location.hash, true);
        return;
      }
      // Browsers allow only their native confirmation for reload/closing a tab.
      event.preventDefault(); event.returnValue = "";
    };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [user?.id, location.pathname, location.search, location.hash]);

  const requestLeave = (next: () => void) => {
    if (!hasUnsavedChanges()) next();
    else setAction(() => next);
  };
  const finish = () => {
    const next = action;
    setAction(null);
    if (blocker.state === "blocked") blocker.proceed();
    else next?.();
  };
  const stay = () => {
    if (busy) return;
    setAction(null);
    if (blocker.state === "blocked") blocker.reset();
  };
  const discard = () => {
    currentEditor()?.discard();
    setUnsavedChanges(false);
    finish();
  };
  const saveAndLeave = async () => {
    if (busy) return;
    const editor = currentEditor(), token = loadToken();
    if (!editor) return;
    setBusy(true);
    try {
      if (await editor.save() && token === loadToken()) finish();
    } catch (error) { showToast(error instanceof Error ? error.message : "Не удалось сохранить данные"); }
    finally { setBusy(false); }
  };
  const decideRecovery = (restore: boolean) => {
    if (!user) return;
    const path = resolveIdleRecovery(user.id, restore);
    setUnsavedChanges(false);
    // A tab authenticated by another tab can still be on /login. Do not mount
    // GuestOnly there while the router is committing the recovery destination.
    setRecoveryDestination(path);
    navigate(path, { replace: true });
  };
  const recovering = Boolean(user && checkpoint?.dirty);
  const routingRecovery = Boolean(user && checkpoint && !checkpoint.dirty && checkpoint.path !== location.pathname + location.search + location.hash);
  const creating = checkpoint?.path.split(/[?#]/)[0] === "/patients/new";
  return (
    <LeaveContext.Provider value={requestLeave}>
      {recovering ? (
        <Modal title="Восстановить несохранённые данные?" dismissible={false} className="max-w-2xl" onClose={() => undefined}>
          <Card className="p-6 sm:p-7">
          <h2 className="text-lg font-semibold leading-6 tracking-tight">Восстановить несохранённые данные?</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Предыдущий сеанс завершился из-за бездействия. Вы можете продолжить работу с введёнными данными или отказаться от несохранённых изменений.</p>
          <div className="mt-6 flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button onClick={() => decideRecovery(true)}>{creating ? "Продолжить создание" : "Продолжить редактирование"}</Button>
            <Button variant="secondary" onClick={() => decideRecovery(false)}>{creating ? "Начать новую карточку" : "Открыть сохранённую версию"}</Button>
          </div>
          </Card>
        </Modal>
      ) : routingRecovery || (recoveryDestination && recoveryDestination !== location.pathname + location.search + location.hash) ? null : children}
      {user && !recovering && (action || blocker.state === "blocked") && (
        <Modal title="Есть несохранённые изменения" dismissible={false} className="max-w-2xl" onClose={stay}>
          <Card className="p-6 sm:p-7">
          <h2 className="text-lg font-semibold leading-6 tracking-tight">Есть несохранённые изменения</h2>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Сохранить данные перед переходом? Если уйти без сохранения, последние изменения будут потеряны. Ранее сохранённые данные карточки останутся.</p>
          <div className="mt-6 flex flex-col gap-2 border-t border-border pt-5 sm:flex-row sm:flex-wrap sm:justify-end">
            <Button disabled={busy} onClick={() => void saveAndLeave()}>Сохранить и перейти</Button>
            <Button variant="secondary" disabled={busy} onClick={discard}>Уйти без сохранения</Button>
            <Button variant="secondary" disabled={busy} onClick={stay}>Остаться</Button>
          </div>
          </Card>
        </Modal>
      )}
    </LeaveContext.Provider>
  );
}
