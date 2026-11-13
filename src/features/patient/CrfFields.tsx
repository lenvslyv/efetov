import type { Field } from "@/entities/patient/types";
import { fieldLayout, groupFields, type FieldLayout } from "@/entities/crf/layout";
import { FieldControl } from "@/shared/ui";

export function CrfFields({ fields, values, editable, onChange }: {
  fields: Field[]; values: Record<string, string>; editable: boolean; onChange: (key: string, value: string) => void;
}) {
  const groups = groupFields(fields);
  return <div className="clinical-groups space-y-6">
    {groups.map((group, index) => <section key={group.title} className={index ? "border-t border-border pt-6" : ""}>
      {groups.length > 1 && <h3 className="mb-3 text-sm font-semibold text-slate-700">{group.title}</h3>}
      <div className="space-y-4">
        {(["short", "medium", "long"] as FieldLayout[]).map(layout => {
          const selected = group.fields.filter(field => fieldLayout(field.key, field.name) === layout);
          if (!selected.length) return null;
          const className = layout === "long" ? "clinical-narratives space-y-4" : layout === "medium" ? "clinical-grid clinical-grid-medium" : "clinical-grid";
          return <div key={layout} className={className}>
            {selected.map(field => <FieldControl key={field.key || field.name} fieldKey={field.key} name={field.name}
              value={values[field.key || field.name] ?? field.value ?? ""} hint={field.hint} editable={editable}
              onChange={value => onChange(field.key || field.name, value)} />)}
          </div>;
        })}
      </div>
    </section>)}
  </div>;
}
