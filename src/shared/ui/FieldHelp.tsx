import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CircleHelp } from "lucide-react";

export function FieldHelp({ label, text }: { label: string; text: string }) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const close = () => setPosition(null);
  useEffect(() => {
    if (!position) return;
    const outside = (event: PointerEvent) => {
      if (!trigger.current?.contains(event.target as Node) && !popup.current?.contains(event.target as Node)) close();
    };
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { close(); trigger.current?.focus(); } };
    const scroll = (event: Event) => { if (!popup.current?.contains(event.target as Node)) close(); };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", scroll, true);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", scroll, true);
    };
  }, [position]);
  return <>
    <button ref={trigger} type="button" aria-label={`Подсказка: ${label}`} aria-expanded={Boolean(position)} aria-controls={position ? id : undefined}
      className="mb-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => {
        if (position) return close();
        const rect = trigger.current!.getBoundingClientRect();
        setPosition({ left: Math.max(16, Math.min(rect.left, window.innerWidth - Math.min(352, window.innerWidth - 32) - 16)), top: Math.max(16, Math.min(rect.bottom + 8, window.innerHeight - 220)) });
      }}><CircleHelp className="size-4" /></button>
    {position && createPortal(<div ref={popup} id={id} role="note" aria-label={`Расшифровка: ${label}`} style={position}
      className="fixed z-[110] max-h-48 w-[min(22rem,calc(100vw-2rem))] overflow-y-auto whitespace-pre-wrap rounded-lg border bg-white p-4 text-sm leading-6 text-foreground shadow-xl">{text}</div>, document.body)}
  </>;
}
