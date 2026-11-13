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
      <div aria-label="Разделы карточки пациента" className="grid auto-rows-fr grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-5">
        {CRF_SECTIONS.map((item) => (
          <Button
            key={item.id}
            variant={active === item.id ? "primary" : "secondary"}
            disabled={!canViewSection(role, item.id) || (creating && item.id > 10)}
            title={creating && item.id > 10 ? "Доступно после создания карточки" : undefined}
            className="h-full min-h-14 w-full min-w-0 justify-start whitespace-normal px-3 py-2 text-left text-xs leading-4"
            aria-current={active === item.id ? "page" : undefined}
            onClick={() => onChange(item.id)}
          >
            {sectionLabel(item.id)}
          </Button>
        ))}
      </div>
    </Card>
  );
}
