import type { Field } from "@/entities/patient/types";
import { Card } from "@/shared/ui";
import { PatientFormActions } from "./PatientFormActions";
import { CrfFields } from "./CrfFields";

export function CrfBlockForm({
  block,
  fields,
  values,
  editable,
  canSave,
  onChange,
  onSave,
  onBack,
  dirty = false,
  pending = false,
}: {
  block: string;
  fields: Field[];
  values: Record<string, string>;
  editable: boolean;
  canSave: boolean;
  onChange: (name: string, value: string) => void;
  onSave: () => void;
  onBack: () => void;
  dirty?: boolean;
  pending?: boolean;
}) {
  return (
    <div className="pb-32"><Card className="p-5">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{block}</h2>
          <p className="mt-1 text-sm leading-6 text-muted-foreground">
            {fields.length === 0
              ? "В этом разделе нет полей."
              : editable
                ? "Поля можно изменить и сохранить. Ввод сохраняется при переходе в другой раздел."
                : canSave
                  ? "Только просмотр. Несохраненные изменения других разделов можно записать кнопкой «Сохранить»."
                  : "Только просмотр."}
          </p>
        </div>
      </div>
      <CrfFields fields={fields} values={values} editable={editable} onChange={onChange} />
    </Card>
    <PatientFormActions dirty={dirty} pending={pending} canSave={canSave} onSave={onSave} onBack={onBack} />
    </div>
  );
}
