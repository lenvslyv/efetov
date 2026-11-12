import { FormEvent, useMemo, useState } from "react";
import { useDraft } from "./useDraft";
import { clearDrafts, clearIdleRecovery, clearRecovery } from "@/features/auth/recovery";
import { useEditor } from "./useEditor";
import { CrfTabs } from "./CrfTabs";
import { api } from "@/api/mock";
import { useRuntime } from "@/api/useRuntime";
import { applyBmiToValues } from "@/entities/crf/computed";
import { fieldsOfSection } from "@/entities/crf/schema";
import { sectionLabel } from "@/entities/crf/sections";
import { CENTERS, centerCode, nextCode, nextPatientId } from "@/entities/patient/code";
import { useAuth } from "@/features/auth/useAuth";
import { setUnsavedChanges } from "@/features/patient/unsaved";
import { now } from "@/shared/lib/dates";
import {
  Button,
  Card,
  FieldControl,
  Kpi,
  Label,
  Select,
  TextInput,
} from "@/shared/ui";
import { useToast } from "@/shared/ui/toast";

export function CreatePatientForm({
  onCreated,
  onCancel,
}: {
  onCreated: (id: string) => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const { patients } = useRuntime();
  const { showToast } = useToast();
  const nextId = nextPatientId(patients.map((item) => item.id));
  const [center, setCenter] = useDraft<string>(user?.id, "new:center", CENTERS[0]);
  // Store an explicit override, not a code calculated before runtime loads.
  const [code, setCode] = useDraft<string>(user?.id, "new:code", "");
  const [manualCode, setManualCode] = useDraft<boolean>(user?.id, "new:codeManual", Boolean(code));
  const [operationDate, setOperationDate] = useDraft<string>(user?.id, "new:operationDate", "");
  const [values, setValues] = useDraft<Record<string, string>>(user?.id, "new:values", {});
  const [selectedSection, setSelectedSection] = useDraft<number>(user?.id, "new:section", 1);
  const activeSection = selectedSection >= 1 && selectedSection <= 10 ? selectedSection : 1;
  const [pending, setPending] = useState(false);
  const discard = () => {
    setCenter(CENTERS[0]); setCode(""); setManualCode(false); setOperationDate(""); setValues({});
    setSelectedSection(1);
    ["center", "code", "codeManual", "operationDate", "values"].forEach(key => clearRecovery(user?.id, `new:${key}`));
    clearDrafts(user?.id, "new:");
    if (user) clearIdleRecovery(user.id);
    setUnsavedChanges(false);
  };

  const previewCode = useMemo(
    () => nextCode(nextId, centerCode(center)),
    [center, nextId]
  );
  const displayedCode = manualCode ? code : previewCode;
  const dirty =
    center !== CENTERS[0] ||
    (manualCode && code !== previewCode) ||
    operationDate.trim() !== "" ||
    Object.values(values).some((value) => value.trim() !== "");

  const saveCard = async (openCreated: boolean): Promise<boolean> => {
    if (!user || pending) return false;
    setPending(true);
    try {
      const created = await api.createPatient(user, {
        code: manualCode ? code : "",
        center,
        operationDate,
        values,
      });
      discard();
      setUnsavedChanges(false);
      showToast("Карточка добавлена в общий журнал");
      if (openCreated) onCreated(created.id);
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : "Не удалось создать карточку. Повторите сохранение.");
      return false;
    } finally {
      setPending(false);
    }
  };
  useEditor(user?.id, "new:", dirty, { save: () => saveCard(false), discard });
  const onSubmit = (event: FormEvent) => { event.preventDefault(); void saveCard(true); };

  return (
    <>
      <div className="mb-5 grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
        <Kpi title="Новый ID" value={nextId} note="автоматически" />
        <Kpi
          title="Шифр пациента"
          value={displayedCode}
          note="задается отдельно от ID"
          tone="green"
        />
        <Kpi
          title="Автор"
          value={user?.id || "—"}
          note="фиксируется при сохранении"
        />
        <Kpi
          title="Дата и время"
          value={now()}
          note="фиксируется при сохранении"
          tone="amber"
        />
      </div>
      <form onSubmit={onSubmit} className="space-y-5">
        {dirty && <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Есть несохранённые данные. При выходе по бездействию предложим восстановить их после входа в этой вкладке. Карточка появится в системе после сохранения.</p>}
        <Card className="p-5">
          <h2 className="text-base font-semibold text-slate-900">
            Ключевые поля общего журнала
          </h2>
          <div className="mt-4 grid gap-4 md:grid-cols-2 2xl:grid-cols-4">
            <div>
              <Label>ID</Label>
              <TextInput value={nextId} disabled />
            </div>
            <div>
              <Label>Шифр</Label>
              <TextInput value={displayedCode} onChange={(event) => {
                setManualCode(true);
                setCode(event.target.value);
              }} />
            </div>
            <div>
              <Label>Группа/центр</Label>
              <Select
                value={center}
                onChange={(event) => {
                  const nextCenter = event.target.value;
                  setCenter(nextCenter);
                  setManualCode(false);
                  setCode("");
                }}
              >
                {CENTERS.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Дата операции</Label>
              <TextInput
                value={operationDate}
                placeholder="дд.мм.гггг"
                onChange={(event) => setOperationDate(event.target.value)}
              />
            </div>
          </div>
        </Card>
        <CrfTabs role={user?.role} active={activeSection} onChange={setSelectedSection} creating />
            <Card className="p-5">
              <h2 className="text-base font-semibold text-slate-900">
                {sectionLabel(activeSection)}
              </h2>
              <div className="clinical-grid mt-4">
                {fieldsOfSection(activeSection).map((field) => (
                  <FieldControl
                    key={field.key}
                    fieldKey={field.key}
                    name={field.label}
                    value={values[field.key] || ""}
                    hint={field.hint}
                    editable={!field.computedFrom}
                    onChange={(value) =>
                      setValues((current) =>
                        applyBmiToValues({
                          ...current,
                          [field.key]: value,
                        })
                      )
                    }
                  />
                ))}
              </div>
            </Card>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>Сохранить карточку</Button>
          <Button type="button" variant="secondary" onClick={onCancel}>
            Отмена
          </Button>
        </div>
      </form>
    </>
  );
}
