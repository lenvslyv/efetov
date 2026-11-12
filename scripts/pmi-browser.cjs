// Real-browser checks. Connect only to the isolated PMI environment on port 8001.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const ROOT = path.resolve(__dirname, '..');
const OUT = path.join(ROOT, '.cache/pmi-20261112');
const BASE = 'http://127.0.0.1:8001';
const fixture = JSON.parse(fs.readFileSync(path.join(OUT, 'fixture.json'), 'utf8'));
const results = [];
const errors = [];
function record(pmi, status, evidence) {
  results.push({ pmi, status, evidence });
  fs.writeFileSync(path.join(OUT, 'browser-results.json'), JSON.stringify({ results, consoleErrors: errors }, null, 2));
  console.log(`${pmi}: ${status}`);
}
async function check(pmi, action) {
  try { const result = await action(); const status = result.status || 'PASS'; delete result.status; record(pmi, status, result); }
  catch (error) { record(pmi, 'FAIL', { error: error.message, stack: error.stack }); }
}
function assert(value, message) { if (!value) throw new Error(message); }
async function login(page, user, password) {
  await page.goto(BASE + '/login');
  await page.getByLabel('Логин', { exact: true }).fill(user);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти в систему', exact: true }).click();
  await page.waitForURL(url => !url.pathname.endsWith('/login'), { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Выйти', exact: true }).waitFor();
}
function countRows(file) {
  return Number(execFileSync(path.join(ROOT, '.venv/Scripts/python.exe'), ['-c',
    "import sys,zipfile,xml.etree.ElementTree as E; z=zipfile.ZipFile(sys.argv[1]); r=E.fromstring(z.read('xl/worksheets/sheet1.xml')); n={'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}; print(sum(int(x.get('r'))>=3 and bool(x.findall('m:c',n)) for x in r.findall('.//m:sheetData/m:row',n)))", file], { encoding: 'utf8' }).trim());
}

(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(15000);
  await login(page, 'manager', 'Manager123');
  await check('4.1.1', async () => {
    assert(new URL(page.url()).pathname === '/journal', 'First login did not open journal');
    return { firstLoginPath: '/journal', authenticatedHeader: await page.getByRole('button', { name: 'Выйти', exact: true }).isVisible() };
  });
  await check('4.3.1', async () => {
    await page.goto(BASE + '/journal');
    await page.locator('tbody tr').first().waitFor();
    const headings = await page.locator('thead th').allTextContents();
    for (const text of ['ID', 'Шифр', 'Группа/центр']) assert(headings.some(value => value.includes(text)), `Missing ${text}`);
    return { columns: headings, rows: await page.locator('tbody tr').count() };
  });

  await check('4.2.4', async () => {
    await page.goto(BASE + '/admin');
    await page.getByRole('button', { name: 'Добавить пользователя', exact: true }).click();
    const dialog = page.getByRole('dialog', { name: 'Добавить пользователя', exact: true });
    await dialog.getByLabel('ФИО', { exact: true }).fill('ПМИ незавершённая форма');
    await page.mouse.click(5, 5);
    assert(await dialog.isVisible(), 'Backdrop closed modal');
    assert(await dialog.getByLabel('ФИО', { exact: true }).inputValue() === 'ПМИ незавершённая форма', 'Modal lost text');
    await page.keyboard.press('Escape');
    assert(await dialog.isVisible(), 'Escape unexpectedly closed modal');
    await dialog.getByRole('button', { name: 'Отмена', exact: true }).click();
    assert(await page.getByRole('dialog').count() === 0, 'Cancel failed');
    return { modalBackdropKeepsForm: true, escapeKeepsForm: true, explicitCancelCloses: true };
  });

  await check('4.5.2', async () => {
    await page.goto(BASE + '/audit');
    await page.locator('tbody tr').first().waitFor();
    const controls = await page.locator('tbody button, tbody input, tbody textarea').count();
    assert(controls === 0, 'Audit has editing controls');
    return { auditRows: await page.locator('tbody tr').count(), editingControls: controls };
  });
  await check('4.5.3', async () => {
    await page.goto(BASE + '/audit');
    await page.locator('tbody tr').first().waitFor();
    await page.locator('#audit-user').fill('U-LEAD-001');
    await page.locator('#audit-action').fill('Вход в систему');
    const today = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow' }).format(new Date());
    await page.locator('#audit-date-from').fill(today);
    await page.locator('#audit-date-to').fill(today);
    await page.waitForTimeout(250);
    const rows = await page.locator('tbody tr').allTextContents();
    assert(rows.length > 0 && rows.every(row => row.includes('U-LEAD-001') && row.includes('Вход в систему') && row.includes(today)), 'Combined audit filters mismatch: ' + JSON.stringify(rows.slice(0,3)));
    await page.getByRole('button', { name: 'Сбросить фильтры', exact: true }).click();
    assert(await page.locator('tbody tr').count() >= rows.length, 'Reset failed');
    return { filters: ['dateFrom', 'dateTo', 'userId', 'action'], matchedRows: rows.length };
  });

  await check('4.7.1', async () => {
    const observations = [];
    for (const viewport of [{ width: 1920, height: 1080 }, { width: 1024, height: 768 }]) {
      await page.setViewportSize(viewport);
      for (const route of ['/journal', '/admin', '/audit', '/files', `/patients/${fixture.target}`, '/patients/new']) {
        await page.goto(BASE + route);
        if (route.includes('/patients/')) await page.locator('.clinical-field').first().waitFor();
        const measurements = await page.evaluate(() => {
          const controls = [...document.querySelectorAll('.clinical-field')].map(field => {
            const label = field.querySelector('label').getBoundingClientRect();
            const input = field.querySelector('input, textarea').getBoundingClientRect();
            return { label: field.querySelector('label').textContent.slice(0, 80), gap: input.top - label.bottom, right: input.right, width: input.width };
          });
          return { screen: innerWidth, page: document.documentElement.scrollWidth, controls };
        });
        const issue = measurements.controls.find(field => field.gap < -1 || field.gap > 12 || field.right > viewport.width + 1 || field.width < 120);
        observations.push({ viewport, route, width: measurements.page, controlCount: measurements.controls.length, issue });
        assert(measurements.page <= viewport.width + 1, `Page overflow ${route} at ${viewport.width}: ${measurements.page}`);
        assert(!issue, `Field alignment ${route} at ${viewport.width}: ${JSON.stringify(issue)}`);
        if (route === `/patients/${fixture.target}`) {
          const sections = page.locator('[aria-label="Разделы карточки пациента"] button');
          assert(await sections.count() === 15, 'Not all 15 sections present');
          const bounds = await sections.evaluateAll(buttons => buttons.map(button => {
            const rect = button.getBoundingClientRect(); return { left: rect.left, right: rect.right, width: rect.width, display: getComputedStyle(button).display };
          }));
          assert(bounds.every(rect => rect.display !== 'none' && rect.left >= 0 && rect.right <= viewport.width), 'Sections require horizontal scrolling');
          await page.screenshot({ path: path.join(OUT, `card-${viewport.width}.png`), fullPage: true });
          // Check the exceptionally long labels and coded fields of all 15 sections.
          for (let section = 0; section < 15; section++) {
            await sections.nth(section).click();
            const overflowing = await page.locator('.clinical-control').evaluateAll(elements => elements.filter(element => element.getBoundingClientRect().right > innerWidth + 1).length);
            assert(overflowing === 0, `Section ${section+1} control overflow`);
          }
        }
      }
    }
    return { viewportChecks: observations, all15SectionsChecked: true };
  });

  await page.setViewportSize({ width: 1920, height: 1080 });
  await check('4.3.3', async () => {
    await page.goto(BASE + `/patients/${fixture.target}`);
    await page.locator('[aria-label="Разделы карточки пациента"] button').first().click();
    const input = page.locator('.clinical-field input').first();
    const marker = `ПМИ интерфейс сохранение ${Date.now()}`;
    await input.fill(marker);
    await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
    const confirmation = page.getByRole('dialog', { name: 'Подтверждение редактирования', exact: true });
    if (await confirmation.isVisible()) await confirmation.getByRole('button', { name: 'Внести исправления', exact: true }).click();
    await page.getByRole('status').filter({ hasText: 'Изменения сохранены' }).waitFor();
    await page.reload();
    await page.locator('.clinical-field input').first().waitFor();
    assert(await page.locator('.clinical-field input').first().inputValue() === marker, 'Save did not survive reload');
    return { uiSaveSurvivesReload: true, note: 'Автор и время дополнительно проверены через API' };
  });

  let exportTimes = [];
  for (const kind of ['full', 'slice']) {
    await check(kind === 'full' ? '4.6.1' : '4.6.2', async () => {
      await page.goto(BASE + '/journal');
      await page.locator('tbody tr').first().waitFor();
      await page.locator('#journal-id').fill(fixture.target);
      await page.waitForTimeout(200);
      const filteredRows = await page.locator('tbody tr').count();
      assert(filteredRows > 0, 'ID filter returned no patients');
      await page.getByRole('button', { name: kind === 'full' ? 'Итоговая выгрузка' : 'Статистический срез', exact: true }).click();
      const dialog = page.getByRole('dialog');
      const start = performance.now();
      const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Excel', exact: true }).click()]);
      const filename = path.join(OUT, `browser-${kind}.xlsx`);
      await download.saveAs(filename);
      const seconds = (performance.now() - start) / 1000;
      const rows = countRows(filename);
      assert(rows === (kind === 'full' ? 88 : filteredRows), `Wrong export rows: ${rows}, filtered: ${filteredRows}`);
      assert(seconds <= 60, `Export exceeds minute: ${seconds}`);
      if (kind === 'full') exportTimes.push(seconds);
      return { activeIDFilter: fixture.target, rows, secondsFromClickToSavedFile: seconds };
    });
  }
  record('4.8.3', exportTimes.length ? 'PASS' : 'NOT_RUN', { fullExportUISeconds: exportTimes });

  await check('4.8.1', async () => {
    await page.goto(BASE + '/journal');
    await page.locator('tbody tr').first().waitFor();
    await page.evaluate(() => window.efetovPerformance.reset());
    for (let repeat = 0; repeat < 10; repeat++) {
      await page.getByRole('button', { name: 'Обновить журнал', exact: true }).click();
      await page.getByRole('button', { name: 'Обновить журнал', exact: true }).waitFor();
      await page.waitForTimeout(100);
    }
    const journalMeasures = await page.evaluate(() => performance.getEntriesByName('efetov.journal.load', 'measure').slice(-10).map(row => row.duration));
    for (let repeat = 0; repeat < 10; repeat++) {
      await page.locator('#journal-id').fill(fixture.target);
      await page.locator('tbody tr').filter({ has: page.locator('td:first-child').filter({ hasText: new RegExp('^' + fixture.target + '$') }) }).getByRole('button', { name: 'Открыть', exact: true }).click();
      await page.locator('.clinical-control').first().waitFor();
      await page.waitForTimeout(100);
      await page.getByRole('button', { name: 'Назад в журнал', exact: true }).click();
    }
    const openMeasures = await page.evaluate(() => performance.getEntriesByName('efetov.patient.open', 'measure').slice(-10).map(row => row.duration));
    await page.locator('#journal-id').fill(fixture.target);
    await page.locator('tbody tr').filter({ has: page.locator('td:first-child').filter({ hasText: new RegExp('^' + fixture.target + '$') }) }).getByRole('button', { name: 'Открыть', exact: true }).click();
    await page.locator('[aria-label="Разделы карточки пациента"] button').first().click();
    for (let repeat = 0; repeat < 10; repeat++) {
      const before = await page.evaluate(() => performance.getEntriesByName('efetov.patient.save', 'measure').length);
      await page.locator('.clinical-field input').first().fill(`ПМИ замер ${repeat}`);
      await page.getByRole('button', { name: 'Сохранить', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'Подтверждение редактирования', exact: true });
      if (await dialog.isVisible()) await dialog.getByRole('button', { name: 'Внести исправления', exact: true }).click();
      await page.waitForFunction(count => performance.getEntriesByName('efetov.patient.save', 'measure').length > count, before);
    }
    const report = await page.evaluate(() => ({ summary: window.efetovPerformance.summary(), measures: performance.getEntriesByType('measure').filter(row => row.name.startsWith('efetov.')).map(row => ({ name: row.name, ms: row.duration })) }));
    const saveMeasures = report.measures.filter(row => row.name === 'efetov.patient.save').slice(-10).map(row => row.ms);
    const operations = { 'journal.load': journalMeasures, 'patient.open': openMeasures, 'patient.save': saveMeasures };
    const averages = Object.fromEntries(Object.entries(operations).map(([name, values]) => [name, values.reduce((sum,value)=>sum+value,0)/values.length]));
    return { status: Object.values(operations).every(values => values.length === 10) && Object.values(averages).every(value => value <= 2000) ? 'PASS' : 'FAIL', samplesMs: operations, averagesMs: averages, method: 'Performance API to painted UI; open uses cached patient data and has no separate HTTP request.' };
  });
  await check('4.6.3', async () => {
    const doctors = [];
    for (const name of ['stationary_doctor', 'ambulatory_doctor']) {
      const doctorContext = await browser.newContext();
      const doctor = await doctorContext.newPage();
      await login(doctor, name, 'Doctor123');
      const exports = await doctor.getByRole('button', { name: 'Итоговая выгрузка', exact: true }).count();
      assert(exports === 0, 'Doctor can see export action');
      await doctor.goto(BASE + '/audit');
      await doctor.waitForURL('**/journal');
      await doctor.goto(BASE + '/admin');
      await doctor.waitForURL('**/journal');
      doctors.push({ name, exports, guardedAuditAndAdmin: true });
      await doctorContext.close();
    }
    return { doctors };
  });
  record('browser-console', errors.length ? 'FAIL' : 'PASS', { errors });
  await browser.close();
})().catch(error => { record('browser-run', 'BLOCKED', { error: error.message, stack: error.stack }); process.exitCode = 1; });
