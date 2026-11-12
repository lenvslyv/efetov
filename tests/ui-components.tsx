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

let count = 0;
function check(name: string, run: () => void) { run(); count++; console.log(`PASS ${name}`); }
const field = (value: string, editable = true, name = "ФИО") => renderToStaticMarkup(<FieldControl name={name} value={value} editable={editable} onChange={() => {}} />);

check("Long values do not change input type or grid span", () => {
  const short = field("Тест");
  const long = field("Очень длинное значение ".repeat(30));
  assert.ok(short.includes("<input") && long.includes("<input"));
  assert.ok(!short.includes("clinical-field-wide") && !long.includes("clinical-field-wide"));
  assert.ok(!long.includes("<textarea"));
});
check("Multiline and long-label layouts depend only on the field definition", () => {
  assert.ok(field("", true, "Комментарий").includes("<textarea"));
  assert.ok(field("Текст", true, "Комментарий").includes("clinical-field-wide"));
  assert.ok(field("1", true, "Длинная подпись ".repeat(15)).includes("clinical-field-wide"));
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
console.log(`${count} design/component checks passed`);
