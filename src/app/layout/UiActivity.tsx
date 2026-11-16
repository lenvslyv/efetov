import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { api } from "@/api/mock";
import { useAuth } from "@/features/auth/useAuth";
import { uiPage, diagnosticInteraction, type UiAction } from "@/shared/lib/uiEvents";

export function UiActivity() {
  const { user } = useAuth();
  const location = useLocation();
  const lastPage = useRef("");
  useEffect(() => {
    if (!user) return;
    const page = uiPage(location.pathname);
    const record = (action: UiAction, control: string) => {
      void api.recordUiEvent(action, { page, control }).catch(() => undefined);
    };
    const pageKey = `${user.id}:${location.key}`;
    if (lastPage.current !== pageKey) {
      lastPage.current = pageKey;
      record("page.open", "page");
    }
    const interact = (event: Event) => {
      const interaction = diagnosticInteraction(event);
      if (interaction) record(interaction.action, interaction.control);
    };
    document.addEventListener("click", interact, true);
    document.addEventListener("change", interact, true);
    document.addEventListener("submit", interact, true);
    return () => {
      document.removeEventListener("click", interact, true);
      document.removeEventListener("change", interact, true);
      document.removeEventListener("submit", interact, true);
    };
  }, [user?.id, location.key, location.pathname]);
  return null;
}
