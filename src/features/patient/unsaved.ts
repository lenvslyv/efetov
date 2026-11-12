let unsaved = false;
const listeners = new Set<() => void>();
export interface EditorActions { save: () => Promise<boolean>; discard: () => void }
let editor: EditorActions | null = null;
export function currentEditor() { return editor; }
export function registerEditor(actions: EditorActions) {
  editor = actions;
  return () => { if (editor === actions) { editor = null; setUnsavedChanges(false); } };
}

export function hasUnsavedChanges(): boolean {
  return unsaved;
}

export function setUnsavedChanges(value: boolean) {
  if (unsaved === value) return;
  unsaved = value;
  listeners.forEach((listener) => listener());
}

export function subscribeUnsaved(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
