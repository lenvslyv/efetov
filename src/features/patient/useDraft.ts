import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { readDraft, writeDraft } from "@/features/auth/recovery";

export function useDraft<T>(userId: string | undefined, kind: string, initial: T):
  [T, (next: T | ((previous: T) => T)) => void] {
  const key = `${userId}:${kind}`;
  const [state, setState] = useState(() => ({ key, value: readDraft<T>(userId, kind) ?? initial }));
  const value = state.key === key ? state.value : readDraft<T>(userId, kind) ?? initial;
  const current = useRef(value);
  current.current = value;
  // Re-register restored input after a development StrictMode remount as well.
  useLayoutEffect(() => { writeDraft(userId, kind, value); }, [userId, kind, value]);
  const setValue = useCallback((next: T | ((previous: T) => T)) => {
    const value = typeof next === "function" ? (next as (previous: T) => T)(current.current) : next;
    current.current = value;
    writeDraft(userId, kind, value);
    setState({ key, value });
  }, [userId, kind, key]);
  return [value, setValue];
}
