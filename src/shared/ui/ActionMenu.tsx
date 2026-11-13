import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MoreHorizontal } from "lucide-react";
import { Button } from "./index";

export interface MenuAction { label: string; onSelect: () => void; disabled?: boolean; danger?: boolean }
export function ActionMenu({ label, actions, disabled }: { label: string; actions: MenuAction[]; disabled?: boolean }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const anchor = useRef({ top: 0, left: 0 });
  const [position, setPosition] = useState<{top: number; left: number} | null>(null);
  const close = () => { setPosition(null); trigger.current?.focus({preventScroll:true}); };
  useEffect(() => {
    if (!position) return;
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus({preventScroll:true});
    const outside = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node) && !trigger.current?.contains(event.target as Node)) setPosition(null); };
    const scroll = (event: Event) => {
      if (menu.current?.contains(event.target as Node)) return;
      const box = trigger.current?.getBoundingClientRect();
      if (!box || Math.abs(box.top - anchor.current.top) > 1 || Math.abs(box.left - anchor.current.left) > 1) setPosition(null);
    };
    const resize = () => setPosition(null);
    document.addEventListener("pointerdown", outside); window.addEventListener("scroll", scroll, true); window.addEventListener("resize", resize);
    return () => { document.removeEventListener("pointerdown", outside); window.removeEventListener("scroll", scroll, true); window.removeEventListener("resize", resize); };
  }, [position]);
  return <>
    <Button aria-label={label} title={label} aria-haspopup="menu" aria-expanded={Boolean(position)} aria-controls={position ? id : undefined} disabled={disabled}
      variant="secondary" className="h-9 w-9 p-0" onClick={event => {
        if (position) { close(); return; }
        trigger.current = event.currentTarget;
        const box = event.currentTarget.getBoundingClientRect();
        anchor.current = {top:box.top, left:box.left};
        setPosition({ left: Math.max(8, Math.min(innerWidth - 256, box.right - 248)), top: Math.max(8, Math.min(box.bottom + 6, innerHeight - actions.length * 48 - 16)) });
      }}><MoreHorizontal /></Button>
    {position && createPortal(<div ref={menu} id={id} role="menu" aria-label={label} style={position} className="fixed z-[70] max-h-[calc(100dvh-16px)] w-60 max-w-[calc(100vw-16px)] overflow-auto rounded-lg border bg-background p-1 shadow-xl"
      onKeyDown={event => {
        if (event.key === "Escape") { event.preventDefault(); close(); }
        if (event.key === "Tab") { setPosition(null); trigger.current?.focus({preventScroll:true}); }
        const buttons = [...(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') || [])];
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === "ArrowDown" ? (current + 1) % buttons.length : event.key === "ArrowUp" ? (current - 1 + buttons.length) % buttons.length : event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1 : -1;
        if (next >= 0) { event.preventDefault(); buttons[next]?.focus({preventScroll:true}); }
      }}>
      {actions.map(action => <button key={action.label} type="button" role="menuitem" disabled={action.disabled} className={`touch-target flex min-h-10 w-full items-center rounded-md px-3 py-2 text-left text-sm outline-none hover:bg-muted focus:bg-muted disabled:opacity-40 ${action.danger ? "mt-1 border-t text-destructive" : ""}`}
        onClick={() => { close(); action.onSelect(); }}>{action.label}</button>)}
    </div>, document.body)}
  </>;
}
