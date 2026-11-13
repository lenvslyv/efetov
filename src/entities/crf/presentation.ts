const SHORT_LABELS: Record<string, string> = {
  sex: "Пол", p3g: "Локализация опухоли", access: "Хирургический доступ",
  p7h: "Вид операции", p7z: "Доступ к сосудам", p7cc: "Артериальные сосуды",
  p7dd: "Взаимоотношение ВБА и ВБВ", p7xx: "Тип анастомоза", p7zz: "Радикальность операции",
  p11j: "Дата последнего обследования", p11s: "Сексуальная дисфункция", p11t: "Сексуальная дисфункция",
  p14c: "Уровень перфорации брюшины",
};

export function visibleFieldHint(hint?: string): string | undefined {
  return /^\s*(?:позиция(?:\s|$)|вычисляемый\s+параметр\s*$|указана кодировка\/формула в источнике)/iu.test(hint ?? "") ? undefined : hint;
}

export function fieldPresentation(name: string, hint?: string, key?: string) {
  let label = (key && SHORT_LABELS[key]) || name;
  if (label === name) {
    label = name.replace(/\([^)]*(?:\d\s*[-–=]\s*[а-яa-z«"]|[а-яa-z]\s*[-–=]\s*\d|(?:да|нет)\s*[-–=])[^)]*\)/gi, "").trim();
    if (label.length > 70 && label.includes(" = ")) label = label.split(" = ")[0].trim();
    if (!label) label = name;
  }
  const parts = [label !== name ? name : undefined, visibleFieldHint(hint)].filter(Boolean);
  return { label, help: [...new Set(parts)].join("\n\n") || undefined };
}
