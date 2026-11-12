import type { Field } from "@/entities/patient/types";
import { fieldByKey } from "@/entities/crf/schema";
import { Badge, Button, Card, FieldControl } from "@/shared/ui";

export function CrfBlockForm({
  block,
  fields,
  values,
  editable,
  canSave,
  onChange,
  onSave,
  onBack,
}: {
  block: string;
  fields: Field[];
  values: Record<string, string>;
  editable: boolean;
  canSave: boolean;
  onChange: (name: string, value: string) => void;
  onSave: () => void;
  onBack: () => void;
}) {
  return (
    <Card className="p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{block}</h2>
          <p className="mt-1 text-slate-500">
            {fields.length === 0
              ? "В этом разделе нет полей."
              : editable
                ? "Поля можно изменить и сохранить. Ввод сохраняется при переходе в другой раздел."
                : canSave
                  ? "Только просмотр. Несохраненные изменения других разделов можно записать кнопкой «Сохранить»."
                  : "Только просмотр."}
          </p>
        </div>
        <Badge tone={editable ? "green" : "slate"}>
          {editable ? "редактирование" : "только просмотр"}
        </Badge>
      </div>
      <div className="clinical-grid">
        {fields.map((field) => {
          const computed = Boolean(
            field.key && fieldByKey(field.key)?.computedFrom
          );
          return (
            <FieldControl
              key={field.key || field.name}
              fieldKey={field.key}
              name={field.name}
              value={values[field.key || field.name] ?? field.value ?? ""}
              hint={field.hint}
              editable={editable && !computed}
              onChange={(value) => onChange(field.key || field.name, value)}
            />
          );
        })}
      </div>
      <div className="mt-6 flex flex-wrap gap-2 border-t border-border pt-5">
        <Button disabled={!canSave} onClick={onSave}>
          Сохранить
        </Button>
        <Button variant="secondary" onClick={onBack}>
          Назад в журнал
        </Button>
      </div>
    </Card>
  );
}
