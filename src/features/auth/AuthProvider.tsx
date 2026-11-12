import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { api } from "@/api/mock";
import { clearRuntime, setUnauthorizedHandler } from "@/api/http";
import { useLocation } from "react-router-dom";
import { writeRecovery } from "./recovery";
import { IDLE_TIMEOUT_MS } from "@/shared/config/brand";
import { powers } from "@/entities/user/roles";
import { ROLE_LABELS, type SessionUser } from "@/entities/user/types";
import { hasUnsavedChanges } from "@/features/patient/unsaved";
import { useToast } from "@/shared/ui/toast";
import { browserSession, loadSession, loadToken, saveSession, saveToken, sessionKey } from "./session";

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
      saveToken(null);
      return null;
    }
    return session.user;
  });
  const [loginError, setLoginError] = useState("");
  const { showToast } = useToast();

  const setCurrentUser = useCallback((next: SessionUser | null) => {
    setUser(next);
    saveSession(next);
    if (!next) { saveToken(null); clearRuntime(); }
  }, []);

  useEffect(() => {
    if (user && location.pathname !== "/login") {
      writeRecovery(user.id, "path", location.pathname + location.search + location.hash);
    }
  }, [user?.id, location.pathname, location.search, location.hash]);

  useEffect(() => {
    let knownToken = loadToken();
    const sync = (event: StorageEvent) => {
      if (event.key !== sessionKey() && event.key !== null) return;
      const token = loadToken();
      if (token === knownToken) return;
      knownToken = token;
      clearRuntime();
      setUser(token ? loadSession() : null);
      setLoginError("");
    };
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, [user]);

  useEffect(() => {
    setUnauthorizedHandler((message) => {
      const dirty = hasUnsavedChanges();
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
  }, [setCurrentUser, showToast]);

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
      if (user) void api.endSession(user, reason).catch(() => undefined);
      else {
        saveToken(null);
      }
      setCurrentUser(null);
      setLoginError("");
    },
    [setCurrentUser, user]
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
