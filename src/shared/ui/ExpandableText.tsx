import { useLayoutEffect, useRef, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Button, Modal, TextArea } from "./index";

export function ExpandableText({ id, label, value, editable, onChange }: {
  id: string; label: string; value: string; editable: boolean; onChange: (value: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [expanded, setExpanded] = useState(false);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const resize = () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(256, Math.max(136, input.scrollHeight))}px`;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [value]);
  return <>
    <div className="relative min-w-0">
      <TextArea ref={ref} id={id} aria-label={label} rows={5} value={value} readOnly={!editable}
        className="clinical-control pr-12" onChange={event => { if (editable) onChange(event.target.value); }} />
      <Button variant="secondary" className="absolute right-2 top-2 h-8 w-8 p-0" title={`Развернуть: ${label}`} aria-label={`Развернуть: ${label}`} onClick={() => setExpanded(true)}><Maximize2 /></Button>
    </div>
    {expanded && <Modal title={label} onClose={() => setExpanded(false)} className="max-w-4xl">
      <div className="space-y-4 p-6"><h2 className="text-lg font-semibold">{label}</h2>
        <TextArea aria-label={`${label} — развёрнуто`} rows={16} className="max-h-[60dvh] min-h-64" value={value} readOnly={!editable} onChange={event => { if (editable) onChange(event.target.value); }} />
        <p className="text-xs text-muted-foreground">{editable ? "Изменения переносятся в форму. Для сохранения карточки нажмите «Сохранить»." : "Просмотр без редактирования."}</p>
        <div className="flex justify-end"><Button onClick={() => setExpanded(false)}>Готово</Button></div>
      </div>
    </Modal>}
  </>;
}
