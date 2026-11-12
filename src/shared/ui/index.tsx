import { useId, type ButtonHTMLAttributes, type HTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";
import { Button as BaseButton } from "./components/button";
import { Dialog, DialogContent, DialogTitle } from "./components/dialog";
import { Label } from "./components/label";
import { Input as TextInput } from "./components/input";
import { Textarea as TextArea } from "./components/textarea";
import { Card } from "./components/card";
import { fieldSize, visibleFieldHint } from "@/entities/crf/presentation";

export { Label, TextInput, TextArea, Card };

type ButtonVariant = "primary" | "secondary" | "danger" | "exportFinal" | "exportSlice";
const variants = { primary: "default", secondary: "outline", danger: "destructive", exportFinal: "default", exportSlice: "outline" } as const;

export function Button({ variant = "primary", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return <BaseButton variant={variants[variant]} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("h-10 w-full min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-70", className)} {...props} />;
}

export function Badge({ tone = "blue", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: "green" | "blue" | "amber" | "slate" | "red" }) {
  return <span className={cn("inline-flex max-w-full items-center rounded-md border px-2 py-0.5 text-xs font-medium leading-5", {
    "border-emerald-200 bg-emerald-50 text-emerald-700": tone === "green",
    "border-blue-200 bg-blue-50 text-blue-700": tone === "blue",
    "border-amber-200 bg-amber-50 text-amber-800": tone === "amber",
    "border-slate-200 bg-slate-50 text-slate-600": tone === "slate",
    "border-red-200 bg-red-50 text-red-700": tone === "red",
  }, className)} {...props} />;
}

export function PageHeader({ title, description }: { title: string; description?: string }) {
  return <div className="mb-7 border-b border-border pb-6">
    <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-[1.75rem]">{title}</h1>
    {description && <p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{description}</p>}
  </div>;
}

export function Kpi({ title, value, note, tone = "blue" }: { title: string; value: string; note?: string; tone?: "green" | "blue" | "amber" | "slate" }) {
  return <Card className="flex min-w-0 flex-col gap-2 p-4">
    <div className="text-xs font-medium text-muted-foreground">{title}</div>
    <div className="break-words text-lg font-semibold tracking-tight text-foreground">{value}</div>
    {note && <div className="mt-auto pt-1"><Badge tone={tone}>{note}</Badge></div>}
  </Card>;
}

export function Modal({ children, onClose, title = "Диалог", dismissible = true, className }: { children: ReactNode; onClose: () => void; title?: string; dismissible?: boolean; className?: string }) {
  return <Dialog open onOpenChange={open => { if (!open && dismissible) onClose(); }}>
    <DialogContent showCloseButton={dismissible} className={cn("p-0 sm:p-0 [&>div]:border-0 [&>div]:bg-transparent [&>div]:shadow-none [&_h2]:pr-7", className)}>
      <DialogTitle className="sr-only">{title}</DialogTitle>
      {children}
    </DialogContent>
  </Dialog>;
}

export function Toast({ message }: { message: string | null }) {
  return message ? <div role="status" aria-live="polite" className="fixed bottom-5 right-5 z-[100] max-w-[min(28rem,calc(100vw-2.5rem))] rounded-lg border border-slate-700 bg-slate-900 px-4 py-3 text-sm leading-6 text-white shadow-lg">{message}</div> : null;
}

// Layout must never depend on the current value: typing cannot move neighboring fields.
export function isMultilineField(name: string): boolean {
  return /описание|заключение|текст протокола|комментарий|причин[аы]|сопутствующие заболевания|другие данные ревизии/i.test(name);
}

export function FieldControl({ name, value, hint, fieldKey, editable, onChange }: { name: string; value: string; hint?: string; fieldKey?: string; editable: boolean; onChange: (value: string) => void }) {
  const id = useId();
  const size = fieldSize(fieldKey);
  const visibleHint = visibleFieldHint(hint);
  const multiline = isMultilineField(name);
  const Control = multiline ? TextArea : TextInput;
  return <div className={cn("clinical-field", size === "compact" && "clinical-field-compact", size === "medium" && "clinical-field-medium", (multiline || name.length > 120) && "clinical-field-wide")}>
    <Label htmlFor={id} className="clinical-label mb-0">{name}</Label>
    <Control id={id} readOnly={!editable} value={value} aria-describedby={visibleHint ? `${id}-hint` : undefined}
      className="clinical-control" onChange={event => { if (editable) onChange(event.target.value); }} />
    <p id={`${id}-hint`} className="clinical-hint">{visibleHint}</p>
  </div>;
}
