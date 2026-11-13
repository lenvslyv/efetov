import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "@/api/mock";
import { clearRuntime, setUnauthorizedHandler } from "@/api/http";
import { useLocation } from "react-router-dom";
import { checkpointIdle, clearDrafts, clearIdleRecovery } from "./recovery";
import { IDLE_TIMEOUT_MS } from "@/shared/config/brand";
import { powers } from "@/entities/user/roles";
import { ROLE_LABELS, type SessionUser } from "@/entities/user/types";
import { hasUnsavedChanges, setUnsavedChanges } from "@/features/patient/unsaved";
import { useToast } from "@/shared/ui/toast";
import { browserSession, loadSession, loadToken, markSessionEnd, saveSession, saveToken, sessionEndReason, sessionKey } from "./session";

interface AuthContextValue {
  user: SessionUser | null;
  roleName: string;
  loginError: string;
  pwr: ReturnType<typeof powers>;
  login: (loginValue: string, password: string) => Promise<boolean>;
  quickLogin: (loginValue: string, password: string) => Promise<boolean>;
  logout: (reason?: "manual" | "idle") => void;
  applyRole: (role: SessionUser["role"]) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [user, setUser] = useState<SessionUser | null>(() => {
    const session = browserSession();
    if (!session || Date.now() - session.activity >= IDLE_TIMEOUT_MS) {
      if (session) {
        checkpointIdle(session.user.id, location.pathname + location.search + location.hash, hasUnsavedChanges());
        markSessionEnd("idle", session.token);
      }
      saveToken(null);
      return null;
    }
    return session.user;
  });
  const [loginError, setLoginError] = useState("");
  const { showToast } = useToast();
  const path = useRef(location.pathname + location.search + location.hash);
  path.current = location.pathname + location.search + location.hash;
  const prepareExit = useCallback((reason: "manual" | "idle") => {
    if (user) {
      if (reason === "idle") {
        if (!checkpointIdle(user.id, path.current, hasUnsavedChanges())) showToast("Не удалось сохранить данные для восстановления. Хранилище браузера недоступно.");
      } else clearIdleRecovery(user.id);
      clearDrafts(user.id);
    }
    setUnsavedChanges(false);
  }, [user?.id, showToast]);

  const setCurrentUser = useCallback((next: SessionUser | null) => {
    setUser(next);
    saveSession(next);
    if (!next) { saveToken(null); clearRuntime(); }
  }, []);

  useEffect(() => {
    let knownToken = loadToken();
    const sync = (event: StorageEvent) => {
      if (event.key !== sessionKey() && event.key !== null) return;
      const token = loadToken();
      if (token === knownToken) return;
      if (!token) prepareExit(sessionEndReason(knownToken));
      knownToken = token;
      clearRuntime();
      setUser(token ? loadSession() : null);
      setLoginError("");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [user, prepareExit]);

  useEffect(() => {
    setUnauthorizedHandler((message) => {
      const dirty = hasUnsavedChanges();
      prepareExit(message.includes("неактивност") ? "idle" : "manual");
      setCurrentUser(null);
      setLoginError("");
      if (message === "Нужна авторизация") return;
      if (dirty && message.includes("неактивности")) {
        showToast(
          "Сессия завершена из-за неактивности. Войдите в ту же учётную запись, чтобы восстановить черновик."
        );
        return;
      }
      showToast(message);
    });
    return () => setUnauthorizedHandler(null);
  }, [setCurrentUser, showToast, prepareExit]);

  useEffect(() => {
    if (user && loadToken()) {
      void api.refreshRuntime().catch(() => undefined);
    }
  }, [user]);

  const loginWithUser = useCallback(
    (found: SessionUser) => {
      setCurrentUser(found);
      setLoginError("");
    },
    [setCurrentUser]
  );

  const signIn = useCallback(
    async (loginValue: string, password: string) => {
        setLoginError("");
      try {
        const found = await api.authenticate(
          loginValue,
          password,
          "Успешная аутентификация"
        );
        if (!found) {
          setLoginError("Неверный логин или пароль.");
          return false;
        }
        loginWithUser(found);
        return true;
      } catch (error) {
        setLoginError(error instanceof Error ? error.message : "Неверный логин или пароль.");
        return false;
      }
    },
    [loginWithUser]
  );

  const login = useCallback(
    (loginValue: string, password: string) => signIn(loginValue, password),
    [signIn]
  );

  const quickLogin = useCallback(
    (loginValue: string, password: string) => signIn(loginValue, password),
    [signIn]
  );

  const applyRole = useCallback(
    (role: SessionUser["role"]) => {
      if (!user || user.role === role) return;
      setCurrentUser({ ...user, role });
    },
    [setCurrentUser, user]
  );

  const logout = useCallback(
    (reason: "manual" | "idle" = "manual") => {
      markSessionEnd(reason);
      prepareExit(reason);
      if (user) void api.endSession(user, reason).catch(() => undefined);
      else {
        saveToken(null);
      }
      setCurrentUser(null);
      setLoginError("");
    },
    [setCurrentUser, user, prepareExit]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      roleName: user ? ROLE_LABELS[user.role] ?? "Роль не назначена" : "Не авторизован",
      loginError,
      pwr: powers(user?.role),
      login,
      quickLogin,
      logout,
      applyRole,
    }),
    [user, loginError, login, quickLogin, logout, applyRole]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
