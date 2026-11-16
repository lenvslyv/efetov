export type UiPage = "journal" | "patient" | "patient-new" | "files" | "audit" | "admin" | "other";
export type UiAction = "page.open" | "control.click" | "field.change" | "form.submit";
export interface UiEvent { page: UiPage; control: string }

export function uiPage(path: string): UiPage {
  if (path === "/patients/new") return "patient-new";
  if (/^\/patients\/[^/]+$/.test(path)) return "patient";
  if (["/journal", "/files", "/audit", "/admin"].includes(path)) return path.slice(1) as UiPage;
  return "other";
}

// Never transmit text, URLs, filenames or field values in diagnostic events.
export function uiControl(element: Element): string {
  const stable = element.getAttribute("data-network-action") || element.id;
  return stable && /^[a-zA-Z][a-zA-Z0-9_.:-]{0,127}$/.test(stable) ? stable : element.tagName.toLowerCase();
}

export function privateControl(element: Element): boolean {
  return element.matches('[type="password"], [data-network-ignore]') ||
    Boolean(element.closest("[data-network-ignore]")) || /password|парол/i.test(element.id + " " + element.getAttribute("name"));
}

export function diagnosticInteraction(event: Event): { action: UiAction; control: string } | null {
  if (!event.isTrusted || !(event.target instanceof Element)) return null;
  const target = event.target.closest(event.type === "click" ? 'button, a, [role="button"]' : 'input, select, textarea, form');
  if (!target || privateControl(target) || target.matches(':disabled, [download]')) return null;
  return { action: event.type === "click" ? "control.click" : event.type === "submit" ? "form.submit" : "field.change", control: uiControl(target) };
}
