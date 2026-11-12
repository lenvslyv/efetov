import { useLayoutEffect, useRef } from "react";
import { clearDrafts } from "@/features/auth/recovery";
import { registerEditor, setUnsavedChanges, type EditorActions } from "./unsaved";

export function useEditor(userId: string | undefined, prefix: string, dirty: boolean, actions: EditorActions) {
  const latest = useRef(actions);
  latest.current = actions;
  useLayoutEffect(() => {
    const unregister = registerEditor({ save: () => latest.current.save(), discard: () => latest.current.discard() });
    return () => { unregister(); clearDrafts(userId, prefix); };
  }, [userId, prefix]);
  useLayoutEffect(() => { setUnsavedChanges(dirty); }, [userId, prefix, dirty]);
}
