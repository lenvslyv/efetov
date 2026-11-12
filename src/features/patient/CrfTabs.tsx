import { CRF_SECTIONS, sectionLabel } from "@/entities/crf/sections";
import { canViewSection } from "@/entities/user/roles";
import type { Role } from "@/entities/user/types";
import { Button, Card } from "@/shared/ui";

export function CrfTabs({
  role,
  active,
  onChange,
  creating = false,
}: {
  role: Role | null | undefined;
  active: number;
  onChange: (sectionId: number) => void;
  creating?: boolean;
}) {
  return (
    <Card className="mb-5 min-w-0 overflow-hidden p-3">
      <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium text-muted-foreground"><span>Разделы карточки</span><span>{active} из {CRF_SECTIONS.length}</span></div>
      <div aria-label="Разделы карточки пациента" className="flex flex-wrap gap-2">
        {CRF_SECTIONS.map((item) => (
          <Button
            key={item.id}
            variant={active === item.id ? "primary" : "secondary"}
            disabled={!canViewSection(role, item.id) || (creating && item.id > 10)}
            title={creating && item.id > 10 ? "Доступно после создания карточки" : undefined}
            className="max-w-full justify-start whitespace-normal text-left text-xs"
            aria-current={active === item.id ? "page" : undefined}
            onClick={() => onChange(item.id)}
          >
            {sectionLabel(item.id)}
          </Button>
        ))}
      </div>
      {creating && <p className="mt-3 px-1 text-xs leading-5 text-muted-foreground">При создании заполняются разделы 1–10. Разделы 11–15 доступны после сохранения карточки.</p>}
    </Card>
  );
}
