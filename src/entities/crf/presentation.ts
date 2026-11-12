import { fieldByKey } from "./schema";

// Presentation only: compact coded fields still accept the existing text format.
const COMPACT = new Set(`sex p1e p1f p1g p1h p1i p2d p3b p3c p3d stage p3f p3g p3j p3n p3r
  p4f p4g p4h p4j p4k p4m p4n p4o p4q p4r p4u p4v
  p6k p6n access p7h p7i p7j p7k p7l p7m p7o p7p p7q p7r p7v p7z p7aa p7bb p7cc p7hh p7jj p7oo p7ww p7xx p7yy p7zz
  p8c p8d p8e p8i p8j p8k p8n p8p p8t p8x p8bb p8cc p8dd p8ee p8ff p8gg p8hh p8ii
  p10f p10h p10i p10j p10l p10m p10w p10x p10y p10z p10aa p10bb p10cc p10dd
  p10ee p10ff p10gg p10hh p10ii p10jj p10kk p10ll p10mm p10nn
  p11d p11o p11mm p11oo`.split(/\s+/));
const MEDIUM = new Set(["p1a", "p1j", "diagnosis", "attending", "surgeon", "assistants", "operationName"]);

export function fieldSize(key?: string): "compact" | "medium" | "normal" {
  const field = key ? fieldByKey(key) : undefined;
  if (!field || !key) return "normal";
  if (field.type === "number" || field.type === "date" || [2, 5, 9, 13, 14, 15].includes(field.section) || COMPACT.has(key)) return "compact";
  return MEDIUM.has(key) ? "medium" : "normal";
}

export function visibleFieldHint(hint?: string): string | undefined {
  return /^\s*позиция(?:\s|$)/iu.test(hint ?? "") ? undefined : hint;
}
