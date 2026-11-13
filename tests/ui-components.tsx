import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import assert from "node:assert/strict";
import { Button, FieldControl, Modal } from "../src/shared/ui/index";
import { DialogContent } from "../src/shared/ui/components/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AuditFiltersBar } from "../src/features/audit/AuditFilters";
import { EMPTY_AUDIT_FILTERS } from "../src/entities/audit/types";
import { JournalFilters } from "../src/features/journal/JournalFilters";
import { EMPTY_JOURNAL_FILTERS } from "../src/entities/patient/types";
import { CrfBlockForm } from "../src/features/patient/CrfBlockForm";
import { mergeSection, resolveFieldValue } from "../src/entities/crf/merge";
import { fieldPresentation } from "../src/entities/crf/presentation";
import { CRF_SCHEMA } from "../src/entities/crf/schema";
import { CRF_FIELD_GROUPS, groupFields } from "../src/entities/crf/layout";
import { CrfFields } from "../src/features/patient/CrfFields";
import { FileTree } from "../src/features/files/FileTree";
import { AuditTable } from "../src/features/audit/AuditTable";

let count = 0;
function checkFieldHelp() {
  const age = "Пожилой возраст (60-74) да - 1";
  assert.equal(fieldPresentation(age).label, age);
  assert.equal(fieldPresentation("Гемоглобин (г/л)").label, "Гемоглобин (г/л)");
  const sex = fieldPresentation("Пол (М - 1, Ж -0)", undefined, "sex");
  assert.equal(sex.label, "Пол");
  assert.equal(sex.help, "Пол (М - 1, Ж -0)");
}
function check(name: string, run: () => void) { run(); count++; console.log(`PASS ${name}`); }
check("Short labels preserve units and age ranges; coding stays in help", checkFieldHelp);
check("Clinical groups cover every schema field exactly once and preserve values", () => {
  const defined = Object.values(CRF_FIELD_GROUPS).flatMap(groups => groups.flatMap(group => group.keys));
  assert.equal(new Set(defined).size, defined.length);
  assert.deepEqual([...defined].sort(), CRF_SCHEMA.map(field => field.key).sort());
  for (let section = 1; section <= 15; section++) {
    const fields = CRF_SCHEMA.filter(field => field.section === section).map(field => ({ key: field.key, name: field.label, value: `saved-${field.key}` }));
    const grouped = groupFields(fields).flatMap(group => group.fields);
    assert.equal(grouped.length, fields.length);
    const html = renderToStaticMarkup(<CrfFields fields={fields} values={{}} editable onChange={() => {}} />);
    assert.equal((html.match(/<(?:input|textarea)\b/g) || []).length, fields.length);
    fields.forEach(field => assert.ok(html.includes(field.value), field.key));
  }
});
const field = (value: string, editable = true, name = "ФИО") => renderToStaticMarkup(<FieldControl name={name} value={value} editable={editable} onChange={() => {}} />);

check("Manual BMI remains editable and legacy computed hints are hidden", () => {
  const blocks = { legacy: [
    { name: "Рост", value: "180" }, { name: "Вес", value: "81" },
    { name: "ИМТ (вычисляемый параметр)", value: "31,27", hint: "вычисляемый параметр" },
  ] };
  assert.equal(resolveFieldValue(blocks, "bmi"), "31,27");
  const html = renderToStaticMarkup(<CrfBlockForm block="Раздел 2" fields={mergeSection(2, blocks)} values={{}} editable canSave onChange={() => {}} onSave={() => {}} onBack={() => {}} />);
  assert.ok(html.includes('value="31,27"'));
  assert.ok(!/readOnly|readonly|вычисляемый параметр/i.test(html));
});

check("Long values do not change input type or grid span", () => {
  const short = field("Тест");
  const long = field("Очень длинное значение ".repeat(30));
  assert.ok(short.includes("<input") && long.includes("<input"));
  assert.ok(!short.includes("clinical-field-wide") && !long.includes("clinical-field-wide"));
  assert.ok(!long.includes("<textarea"));
});
check("Long text gets a separate block while values never change the layout", () => {
  assert.ok(field("", true, "Комментарий").includes("<textarea"));
  assert.ok(field("", true, "Комментарий").includes("clinical-field-long"));
  assert.ok(!field("Текст", true, "Комментарий").includes("clinical-field-wide"));
  assert.ok(!field("1", true, "Длинная подпись ".repeat(15)).includes("clinical-field-wide"));
});
check("Read-only fields preserve controls and allow selecting/copying values", () => {
  const html = field("Сохранённое значение", false);
  assert.ok(html.includes("readOnly") || html.includes("readonly"));
  assert.ok(!html.includes("disabled="));
});
check("Field labels reference unique control IDs", () => {
  const html = renderToStaticMarkup(<><FieldControl name="Первое" value="" editable onChange={() => {}} /><FieldControl name="Второе" value="" editable onChange={() => {}} /></>);
  const labels = [...html.matchAll(/for="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(labels).size, 2);
  labels.forEach(id => assert.ok(html.includes(`id="${id}"`)));
});
check("Backdrop interactions cannot dismiss a dialog even with consumer handlers", () => {
  let closed = false;
  const portal = (DialogContent as any).render({ onInteractOutside: () => { closed = true; }, children: <p>Проверка</p> }, null);
  const content = portal.props.children.find((child: any) => child?.type === DialogPrimitive.Content);
  assert.ok(content);
  for (const handler of ["onPointerDownOutside", "onInteractOutside", "onEscapeKeyDown"]) {
    let prevented = false;
    content.props[handler]({ preventDefault: () => { prevented = true; } });
    assert.ok(prevented, handler);
  }
  assert.equal(closed, false);
});
check("Dialog explicit-close policy permits form close and prevents idle-dialog close", () => {
  let closed = 0;
  const modal = Modal({ children: <p>Тест</p>, onClose: () => { closed++; } });
  modal.props.onOpenChange(false);
  assert.equal(closed, 1);
  const idle = Modal({ children: <p>Тест</p>, onClose: () => { closed++; }, dismissible: false });
  idle.props.onOpenChange(false);
  assert.equal(closed, 1);
});
check("Buttons outside submission keep type=button, submit buttons remain submit", () => {
  assert.ok(renderToStaticMarkup(<Button>Действие</Button>).includes('type="button"'));
  assert.ok(renderToStaticMarkup(<Button type="submit">Сохранить</Button>).includes('type="submit"'));
});
check("Audit date bounds are peer filter fields with accessible labels", () => {
  const html = renderToStaticMarkup(<AuditFiltersBar filters={EMPTY_AUDIT_FILTERS} roles={[]} onChange={() => {}} onReset={() => {}} />);
  assert.ok(html.includes("filter-grid"));
  assert.ok(html.includes('for="audit-date-from"') && html.includes('for="audit-date-to"'));
  assert.equal((html.match(/<input/g) || []).length, 5);
  assert.equal((html.match(/<select/g) || []).length, 1);
});
check("Journal retains all seven filtering controls and export actions", () => {
  const html = renderToStaticMarkup(<JournalFilters filters={EMPTY_JOURNAL_FILTERS} centers={[]} canCreate canExport onPatch={() => {}} onReset={() => {}} onCreate={() => {}} onExportFinal={() => {}} onExportSlice={() => {}} />);
  assert.equal((html.match(/<input/g) || []).length, 6);
  assert.equal((html.match(/<select/g) || []).length, 1);
  assert.ok(html.includes("Итоговая выгрузка") && html.includes("Статистический срез"));
});
check("Explorer preserves legacy folder paths, metadata and download-only access", () => {
  const files = [{ name: "proof.txt", folder: "2026/June", author: "Doctor", date: "13.11.2026", comment: "Full comment" }];
  const html = renderToStaticMarkup(<FileTree files={files} selected="2026 / June" onSelect={() => {}} canManage={false} onDownload={() => {}} onDelete={() => {}} onDeleteFolder={() => {}} />);
  for (const text of ["proof.txt", "Doctor", "13.11.2026", "Full comment", "Скачать proof.txt"]) assert.ok(html.includes(text));
  assert.ok(!html.includes("Удалить"));
});
check("Audit renders every result and offers only detail viewing", () => {
  const rows = Array.from({length: 101}, (_, index) => ({time:"13.11.2026", userId:`user-${index}`, role:"Врач", action:"Вход", details:`event-${index}`}));
  const html = renderToStaticMarkup(<AuditTable rows={rows} />);
  assert.equal((html.match(/Подробнее о событии /g) || []).length, 101);
  assert.ok(html.includes("event-100"));
  assert.ok(!html.includes("Удалить") && !html.includes("Сохранить"));
});
check("Empty directories omit file tables and expose only permitted actions", () => {
  const props = { files: [], folders: ["Empty"], selected: "Empty", onSelect: () => {}, onDownload: () => {}, onDelete: () => {}, onDeleteFolder: () => {}, onCreate: () => {}, onUpload: () => {} };
  const doctor = renderToStaticMarkup(<FileTree {...props} canManage={false} />);
  assert.ok(doctor.includes("Папка пуста") && !doctor.includes("<table"));
  assert.ok(!doctor.includes("Загрузить файл") && !doctor.includes("Создать папку"));
  const manager = renderToStaticMarkup(<FileTree {...props} canManage />);
  assert.ok(manager.includes("Загрузить файл") && manager.includes("Создать папку"));
});
check("Folders with child directories are not labelled empty and omit empty file tables", () => {
  const html = renderToStaticMarkup(<FileTree files={[]} folders={["Parent / Child"]} selected="Parent" onSelect={() => {}} canManage={false} onDownload={() => {}} onDelete={() => {}} onDeleteFolder={() => {}} />);
  assert.ok(!html.includes("<table") && !html.includes("Папка пуста"));
  assert.ok(html.includes('aria-label="Открыть папку Parent"'));
  assert.ok(html.includes('aria-label="Открыть папку Parent / Child (пусто)"'));
});
console.log(`${count} design/component checks passed`);
