import { useCallback, useRef, useState } from "react";
import { readRecovery, writeRecovery } from "@/features/auth/recovery";
import { useToast } from "@/shared/ui/toast";

export function useDraft<T>(userId: string | undefined, kind: string, initial: T):
  [T, (next: T | ((previous: T) => T)) => void] {
  const key = `${userId}:${kind}`;
  const [state, setState] = useState(() => ({ key, value: readRecovery<T>(userId, kind) ?? initial }));
  const value = state.key === key ? state.value : readRecovery<T>(userId, kind) ?? initial;
  const current = useRef(value);
  current.current = value;
  const { showToast } = useToast();
  const warned = useRef(false);
  const setValue = useCallback((next: T | ((previous: T) => T)) => {
    const value = typeof next === "function" ? (next as (previous: T) => T)(current.current) : next;
    current.current = value;
    if (!writeRecovery(userId, kind, value) && !warned.current) {
      warned.current = true;
      showToast("Не удалось сохранить черновик в браузере. Сохраните данные в системе до выхода.");
    }
    setState({ key, value });
  }, [userId, kind, key, showToast]);
  return [value, setValue];
}
