export interface AuditEvent {
  time: string;
  userId: string;
  userLogin?: string;
  role: string;
  action: string;
  details: string;
}

export interface AuditFilters {
  timeFrom: string;
  timeTo: string;
  userId: string;
  role: string;
  action: string;
  details: string;
}

export const EMPTY_AUDIT_FILTERS: AuditFilters = {
  timeFrom: "",
  timeTo: "",
  userId: "",
  role: "all",
  action: "",
  details: "",
};

export const AUDIT_ACTIONS = [
  "Вход в систему",
  "Создание карты пациента",
  "Редактирование блока",
  "Удаление карты пациента",
  "Экспорт",
  "Загрузка файла",
  "Удаление файла",
] as const;
