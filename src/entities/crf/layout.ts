import type { Field } from "@/entities/patient/types";
import { fieldByKey } from "./schema";

export type FieldLayout = "short" | "medium" | "long";
const LONG = new Set(`diagnosis p3h p3i p3k comorbidities colonoscopyTumor colonoscopyOther p4e ctAbdomen p4l p4s ctChest
  p6f p6l priorSurgery p7f p7n tumorDesc p7x p7y p7ii p7mm intraopComplications p7rr p7ss p7tt p7vv
  p8b woundComplications p8q p8s p8aa p10d p10g p10k p10o p11z p11ee p11ff p11gg p11ii p11jj p12b`.split(/\s+/));
const MEDIUM = new Set(`p1a p1j p1k attending p6c surgeon assistants operationName p7ee p7ff p7gg p7hh p7kk p7ll p10a p10e p10p p12a`.split(/\s+/));

export function fieldLayout(key?: string, name = ""): FieldLayout {
  if (key) return LONG.has(key) ? "long" : MEDIUM.has(key) ? "medium" : "short";
  return /описание|заключение|текст протокола|комментарий|причин[аы]|сопутствующие заболевания|другие данные ревизии/i.test(name) ? "long" : "short";
}

type Definition = { title: string; keys: string[] };
const group = (title: string, keys: string): Definition => ({ title, keys: keys.split(/\s+/) });
// Explicit field keys keep clinical grouping independent of labels and entered values.
export const CRF_FIELD_GROUPS: Record<number, Definition[]> = {
  1: [
    group("Пациент", "p1a"),
    group("Пол и возраст", "sex p1c age p1e p1f p1g"),
    group("Контакты и социальные сведения", "p1h p1i p1j p1k"),
  ],
  2: [group("Антропометрия", "height weight bmi p2d")],
  3: [
    group("Основной диагноз", "diagnosis"),
    group("Стадирование и локализация", "p3b p3c p3d stage p3f p3g"),
    group("Распространение и осложнения", "p3h p3i p3j p3k"),
    group("Сопутствующие заболевания и общее состояние", "comorbidities charlson p3n ecog karnofsky asa p3r"),
  ],
  4: [
    group("Диагноз и осмотр", "p4a p4b"),
    group("Эндоскопия и биопсия", "colonoscopyTumor colonoscopyOther p4e"),
    group("Молекулярные маркеры", "p4f p4g p4h"),
    group("Лучевая диагностика и характеристики опухоли", "ctAbdomen p4j p4k p4l p4s ctChest"),
    group("Лимфатические узлы", "p4m p4n p4o"),
    group("Печень и лёгкие", "p4p p4q p4r p4u p4v"),
  ],
  5: [
    group("Онкомаркеры", "cea ca199"),
    group("Общий анализ крови", "hemoglobin p5d wbc p5f p5g p5h platelets p5j"),
    group("Биохимический анализ крови", "p5k p5l p5m p5n p5o p5p p5q p5r creatinine p5t"),
    group("Коагулограмма", "p5u p5v p5w p5x"),
  ],
  6: [
    group("Госпитализация и лечащая команда", "hospDate attending p6c p6n"),
    group("Поддерживающая терапия", "p6d p6e p6f p6g p6h"),
    group("Противоопухолевое лечение", "p6i p6j p6k p6l"),
    group("Операции в анамнезе", "priorSurgery"),
  ],
  7: [
    group("Сведения об операции", "opDate surgeon assistants operationName"),
    group("Доступ и основные показатели", "access p7h p7i p7j p7k p7o p7p p7q p7r bloodLoss p7aa p7bb"),
    group("Конверсия", "p7l p7m p7n"),
    group("Протокол и интраоперационная ревизия", "p7f tumorDesc p7v p7w p7x p7y"),
    group("Сосудистая анатомия и лимфодиссекция", "p7z p7cc p7dd p7ee p7ff p7gg p7hh p7ii p7jj p7kk p7ll p7mm p7nn p7oo"),
    group("Объём вмешательства и реконструкция", "p7rr p7ss p7tt p7uu p7vv p7ww p7xx p7yy p7zz"),
    group("Интраоперационные осложнения", "intraopComplications"),
  ],
  8: [
    group("Восстановление и ОРИТ", "icuDays p8b p8c p8d p8e p8l"),
    group("Осложнения и их оценка", "postopComplications p8s p8t clavien"),
    group("Раневые осложнения и лимфоррея", "woundComplications p8h p8i p8j p8k"),
    group("Пневмония", "p8m p8n"),
    group("Кровотечение и анастомоз", "p8o p8p p8q p8r"),
    group("Выписка и дальнейшее лечение", "p8v dischargeDate p8x p8z p8aa"),
    group("Контрольные анализы", "p8bb p8cc p8dd p8ee p8ff p8gg p8hh p8ii"),
  ],
  9: [
    group("Общий анализ крови", "p9a p9b p9c p9d p9e p9f p9g"),
    group("Биохимический анализ крови", "p9h p9i p9j p9k p9l p9m p9n p9o p9p p9q"),
    group("Коагулограмма", "p9r p9s p9t p9u"),
  ],
  10: [
    group("Гистологические характеристики", "p10a p10b p10c p10d p10e"),
    group("TNM и стадия", "p10f p10g p10h p10i p10j p10k p10l p10m p10n p10o"),
    group("Резекция и инвазия", "p10p p10q p10r p10s p10t p10u p10v"),
    group("Лимфатические узлы", "p10w p10x p10y p10z p10aa p10bb p10cc p10dd p10ee p10ff p10gg p10hh"),
    group("Молекулярные маркеры", "p10ii p10jj p10kk p10ll"),
    group("Длительность госпитализации", "p10mm p10nn"),
  ],
  11: [
    group("Наблюдение и жизненный статус", "p11a followed p11d p11e p11f lastContact p11j"),
    group("Выживаемость и сроки наблюдения", "p11o p11y p11bb p11kk p11ll p11mm p11oo"),
    group("Прогрессия и рецидив", "progression localRecurrence p11z p11aa p11ee p11ff p11gg p11pp"),
    group("Отдалённые осложнения и функции", "p11q p11r p11s p11t p11u p11v p11x"),
    group("Дальнейшее лечение", "p11hh p11ii p11jj"),
  ],
  12: [group("Ответственный", "p12a"), group("Комментарий", "p12b")],
  13: [
    group("Опухоль и лимфодиссекция", "p13a p13b p13c p13d p13e p13f"),
    group("Сосудистая анатомия", "p13g p13h"),
    group("Объём и топография лимфодиссекции", "p13i p13j p13k p13l"),
    group("Артерии", "p13m p13n p13o p13p p13q p13r p13s p13t p13u p13v p13w p13x"),
    group("Вены", "p13y p13z p13aa p13bb p13cc p13dd p13ee p13ff"),
    group("Границы резекции", "p13gg p13hh p13ii p13jj"),
  ],
  14: [group("Доступ и особенности вмешательства", "p14a p14b p14c p14d"), group("Продолжительность этапов, мин", "p14e p14f p14g p14h p14i")],
  15: [
    group("Общее количество лимфатических узлов", "p15a p15b"),
    group("Лимфатические узлы по порядкам", "p15c p15d p15m p15n p15aa p15bb"),
    group("Проксимальнее опухоли", "p15e p15f p15g p15h"),
    group("Дистальнее опухоли", "p15i p15j p15k p15l"),
    group("Группы 232, 242, 242-2 и 252", "p15o p15p p15q p15r p15s p15t p15u p15v p15w p15x p15y p15z"),
    group("Группы 233, 243, 243-2 и 253", "p15cc p15dd p15ee p15ff p15gg p15hh p15ii p15jj p15kk p15ll p15mm p15nn"),
    group("Группа 215", "p15oo p15pp p15qq"),
  ],
};

export function groupFields(fields: Field[]): { title: string; fields: Field[] }[] {
  const result: { title: string; fields: Field[] }[] = [];
  const used = new Set<Field>();
  const sections = new Set(fields.map(field => field.key ? fieldByKey(field.key)?.section : undefined));
  for (const section of sections) {
    if (!section) continue;
    for (const definition of CRF_FIELD_GROUPS[section] ?? []) {
      const selected = definition.keys.flatMap(key => fields.filter(field => field.key === key && !used.has(field)));
      if (selected.length) { selected.forEach(field => used.add(field)); result.push({ title: definition.title, fields: selected }); }
    }
  }
  const rest = fields.filter(field => !used.has(field));
  if (rest.length) result.push({ title: "Дополнительные сведения", fields: rest });
  return result;
}
