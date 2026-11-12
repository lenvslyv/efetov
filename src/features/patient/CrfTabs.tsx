import { CRF_SECTIONS, sectionLabel } from "@/entities/crf/sections";
import { canViewSection } from "@/entities/user/roles";
import type { Role } from "@/entities/user/types";
import { Button, Card } from "@/shared/ui";

export function CrfTabs({
  role,
  active,
  onChange,
}: {
  role: Role | null | undefined;
  active: number;
  onChange: (sectionId: number) => void;
}) {
  return (
    <Card className="mb-5 min-w-0 overflow-hidden p-3">
      <div className="mb-2 flex items-center justify-between px-1 text-xs font-medium text-muted-foreground"><span>Разделы карточки</span><span>{active} из {CRF_SECTIONS.length}</span></div>
      <div aria-label="Разделы карточки пациента" className="flex flex-wrap gap-2">
        {CRF_SECTIONS.map((item) => (
          <Button
            key={item.id}
            variant={active === item.id ? "primary" : "secondary"}
            disabled={!canViewSection(role, item.id)}
            className="max-w-full justify-start whitespace-normal text-left text-xs"
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
