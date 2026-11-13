import { useEffect, useRef, useState } from "react";
import { clearDrafts, clearIdleRecovery } from "@/features/auth/recovery";
import { useEditor } from "./useEditor";
import { useDraft } from "./useDraft";
import { startOperation, finishOperation, cancelOperation } from "@/shared/lib/performance";
import { api } from "@/api/mock";
import { tryApi } from "@/api/errors";
import { useRuntime } from "@/api/useRuntime";
import { mergeSection } from "@/entities/crf/merge";
import { sectionById, sectionLabel } from "@/entities/crf/sections";
import {
  holdsLock,
  isLockedByOther,
  LOCK_FREE,
  lockOwnerId,
} from "@/entities/patient/lock";
import type { Patient } from "@/entities/patient/types";
import { canEditPatientSection, visibleSectionIds } from "@/entities/user/roles";
import { useAuth } from "@/features/auth/useAuth";
import { setUnsavedChanges } from "@/features/patient/unsaved";
import { useToast } from "@/shared/ui/toast";

function sectionValues(patient: Patient, sectionId: number): Record<string, string> {
  const next: Record<string, string> = {};
  mergeSection(sectionId, patient.blocks).forEach((field) => {
    if (field.key) next[field.key] = field.value ?? "";
  });
  return next;
}

export function usePatientCard(id: string | undefined) {
  const { patients } = useRuntime();
  const { user } = useAuth();
  const { showToast } = useToast();
  const patient = patients.find((item) => item.id === id);
  const visibleSections = visibleSectionIds(user?.role);
  const [activeSection, setActiveSection] = useDraft<number>(user?.id, `patient:${id}:section`, visibleSections[0] ?? 1);
  const [drafts, setDrafts] = useDraft<Record<number, Record<string, string>>>(user?.id, `patient:${id}:draft`, {});
  const [baselines, setBaselines] = useDraft<Record<number, Record<string, string>>>(user?.id, `patient:${id}:baseline`, {});
  const [leaderEditOpen, setLeaderEditOpen] = useState(false);
  const leaveSave = useRef<((result: boolean) => void) | null>(null);
  const saving = useRef(false);
  const [pending, setPending] = useState(false);

  const sectionId = visibleSections.includes(activeSection)
    ? activeSection
    : visibleSections[0] ?? 1;
  const lockedByOther = isLockedByOther(patient?.lock, user?.id);
  const ownsLock = holdsLock(patient?.lock, user?.id);
  const lockOwner = lockOwnerId(patient?.lock);
  const editable = canEditPatientSection(user, patient, sectionId) && !lockedByOther;
  const fields = patient
    ? mergeSection(sectionId, patient.blocks)
    : [];
  const values = patient
    ? { ...sectionValues(patient, sectionId), ...drafts[sectionId] }
    : {};
  const canSave = Boolean(
    user &&
      patient &&
      !lockedByOther &&
      (editable ||
        Object.keys(drafts).some((key) => canEditPatientSection(user, patient, Number(key))))
  );

  useEffect(() => {
    setLeaderEditOpen(false);
  }, [id]);

  useEffect(() => {
    if (activeSection !== sectionId) setActiveSection(sectionId);
  }, [activeSection, sectionId]);

  const creator =
    patient?.createdByLogin ||
    patient?.createdByName ||
    patient?.createdBy ||
    "неизвестный пользователь";

  const sectionsToSave = (): Record<number, Record<string, string>> => {
    if (!user) return {};
    const payload: Record<number, Record<string, string>> = {};
    Object.entries(drafts).forEach(([key, draft]) => {
      const section = Number(key);
      if (canEditPatientSection(user, patient, section)) payload[section] = draft;
    });
    return payload;
  };

  const completeSave = (success: boolean) => {
    leaveSave.current?.(success); leaveSave.current = null;
    setLeaderEditOpen(false);
    return success;
  };
  const applySave = async (): Promise<boolean> => {
    if (!user || !patient || saving.current) return false;
    const payload = sectionsToSave();
    if (Object.keys(payload).length === 0) {
      showToast("Нет изменений для сохранения");
      return completeSave(true);
    }
    const conflicts = Object.entries(payload).some(([section, draft]) => {
      const current = sectionValues(patient, Number(section));
      return Object.keys(draft).some(key => baselines[Number(section)]?.[key] !== undefined &&
        current[key] !== baselines[Number(section)][key] && current[key] !== draft[key]);
    });
    if (conflicts && !window.confirm("После начала редактирования данные карточки изменились. Заменить изменённые поля значениями из вашего черновика?")) return completeSave(false);
    saving.current = true;
    setPending(true);
    try {
      startOperation("patient.save");
      const saved = await tryApi(
        () => api.savePatientSections(user, patient.id, payload),
        (error) => showToast(error.message)
      );
      if (!saved.ok) { cancelOperation("patient.save"); return completeSave(false); }
      setDrafts({});
      setBaselines({});
      setUnsavedChanges(false);
      setLeaderEditOpen(false);
      showToast("Изменения сохранены в карточке пациента");
      requestAnimationFrame(() => requestAnimationFrame(() => finishOperation("patient.save")));
      return completeSave(true);
    } catch (error) {
      cancelOperation("patient.save");
      showToast(error instanceof Error ? error.message : "Не удалось сохранить карточку");
      return completeSave(false);
    } finally {
      saving.current = false;
      setPending(false);
    }
  };
  const dirty = Boolean(patient && Object.entries(drafts).some(([section, values]) =>
    Object.entries(values).some(([key, value]) => sectionValues(patient, Number(section))[key] !== value)));
  const discard = () => {
    setDrafts({}); setBaselines({});
    clearDrafts(user?.id, `patient:${id}:`);
    if (user) clearIdleRecovery(user.id);
    setUnsavedChanges(false);
  };
  useEditor(user?.id, `patient:${id}:`, dirty, {
    discard,
    save: () => {
      if (!user || !patient || !canSave) { showToast("Сохранение карточки недоступно"); return Promise.resolve(false); }
      if (user.role === "leader" && patient.createdBy !== user.id) {
        setLeaderEditOpen(true);
        return new Promise<boolean>(resolve => { leaveSave.current = resolve; });
      }
      return applySave();
    },
  });
  useEffect(() => () => { leaveSave.current?.(false); leaveSave.current = null; }, [id]);

  const requestSave = () => {
    if (!user || !patient || !canSave) {
      showToast(
        lockedByOther
          ? `Карточка редактируется пользователем ${lockOwner}`
          : "Редактирование раздела недоступно"
      );
      return;
    }
    if (user.role === "leader" && patient.createdBy !== user.id) {
      setLeaderEditOpen(true);
      return;
    }
    applySave();
  };

  const takeLock = async () => {
    if (!user || !patient) return;
    const locked = await tryApi(
      () => api.lockPatient(user, patient.id),
      (error) => showToast(error.message)
    );
    if (locked.ok) showToast("Карточка взята в работу");
  };

  const releaseLock = async () => {
    if (!user || !patient) return;
    const unlocked = await tryApi(
      () => api.unlockPatient(user, patient.id),
      (error) => showToast(error.message)
    );
    if (unlocked.ok) showToast("Блокировка снята");
  };

  return {
    patient,
    hasDraft: dirty,
    pending,
    sectionId,
    sectionLabel: sectionById(sectionId)
      ? sectionLabel(sectionId)
      : "Раздел",
    fields,
    values,
    editable,
    canSave,
    lockedByOther,
    ownsLock,
    lockLabel: patient?.lock || LOCK_FREE,
    canTakeLock: Boolean(
      user && patient && (user.role !== "stationary" || patient.createdBy === user.id) && (!lockOwner || user.role === "leader") && !ownsLock
    ),
    canReleaseLock: Boolean(
      user && patient && lockOwner && (ownsLock || user.role === "leader")
    ),
    creator,
    leaderEditOpen,
    setActiveSection,
    setField: (key: string, value: string) => {
      if (!patient || lockedByOther || !canEditPatientSection(user, patient, sectionId)) return;
      setBaselines(current => ({ ...current, [sectionId]: {
        ...current[sectionId],
        [key]: current[sectionId]?.[key] ?? sectionValues(patient, sectionId)[key] ?? "",
      } }));
      setDrafts((current) => {
        const base = current[sectionId] ?? {};
        const next = { ...base, [key]: value };
        return {
          ...current,
          [sectionId]: next,
        };
      });
    },
    requestSave,
    applySave,
    closeLeaderEdit: () => completeSave(false),
    takeLock,
    releaseLock,
  };
}
