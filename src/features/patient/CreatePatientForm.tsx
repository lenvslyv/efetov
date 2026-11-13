import { FormEvent, useMemo, useState } from "react";
import { useDraft } from "./useDraft";
import { clearDrafts, clearIdleRecovery, clearRecovery } from "@/features/auth/recovery";
import { useEditor } from "./useEditor";
import { CrfTabs } from "./CrfTabs";
import { CrfFields } from "./CrfFields";
import { PatientFormActions } from "./PatientFormActions";
import { PatientContext } from "./PatientContext";
import { api } from "@/api/mock";
import { useRuntime } from "@/api/useRuntime";
import { fieldsOfSection } from "@/entities/crf/schema";
import { sectionLabel } from "@/entities/crf/sections";
import { CENTERS, centerCode, nextCode, nextPatientId } from "@/entities/patient/code";
import { useAuth } from "@/features/auth/useAuth";
import { setUnsavedChanges } from "@/features/patient/unsaved";
import {
  Card,
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
      <form onSubmit={onSubmit} className="space-y-5 pb-32">
        <PatientContext id={nextId} code={displayedCode} center={center} section={sectionLabel(activeSection)} editable dirty={dirty} pending={pending} creating />
        <Card className="p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-base font-semibold">Данные карточки</h2>
            <p className="text-xs text-muted-foreground">Автор: {user?.name || user?.login}. Дата создания фиксируется при сохранении.</p>
          </div>
          <div className="clinical-grid mt-3">
            <div className="clinical-field">
              <Label htmlFor="create-patient-id" className="clinical-label-row mb-0">ID</Label>
              <TextInput id="create-patient-id" className="clinical-control" value={nextId} readOnly />
            </div>
            <div className="clinical-field">
              <Label htmlFor="create-patient-code" className="clinical-label-row mb-0">Шифр</Label>
              <TextInput id="create-patient-code" className="clinical-control" value={displayedCode} onChange={event => {
                setManualCode(true); setCode(event.target.value);
              }} />
            </div>
            <div className="clinical-field">
              <Label htmlFor="create-patient-center" className="clinical-label-row mb-0">Группа/центр</Label>
              <Select id="create-patient-center" className="clinical-control" value={center} onChange={event => {
                setCenter(event.target.value); setManualCode(false); setCode("");
              }}>
                {CENTERS.map(item => <option key={item}>{item}</option>)}
              </Select>
            </div>
            <div className="clinical-field">
              <Label htmlFor="create-operation-date" className="clinical-label-row mb-0">Дата операции</Label>
              <TextInput id="create-operation-date" className="clinical-control" value={operationDate} placeholder="дд.мм.гггг" onChange={event => setOperationDate(event.target.value)} />
            </div>
          </div>
        </Card>
        <CrfTabs role={user?.role} active={activeSection} onChange={setSelectedSection} creating />
        <Card className="p-5">
          <h2 className="mb-5 text-lg font-semibold">{sectionLabel(activeSection)}</h2>
          <CrfFields
            fields={fieldsOfSection(activeSection).map(field => ({ key: field.key, name: field.label, hint: field.hint, value: "" }))}
            values={values} editable
            onChange={(key, value) => setValues(current => ({ ...current, [key]: value }))}
          />
        </Card>
        <PatientFormActions creating dirty={dirty} pending={pending} onBack={onCancel} />
      </form>
    </>
  );
}
