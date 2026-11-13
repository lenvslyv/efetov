// End-to-end checks on the disposable database created by diagnose-load.py.
const fs = require('node:fs'), path = require('node:path');
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE = process.env.PMI_BASE_URL, OUT = process.env.PMI_OUTPUT_DIR;
const checks = [], errors = [];
function assert(ok, message) { if (!ok) throw Error(message); }
async function login(page, login, password) {
  await page.goto(BASE + '/login');
  await page.getByLabel('Логин', {exact:true}).fill(login);
  await page.getByLabel('Пароль', {exact:true}).fill(password);
  await page.getByRole('button', {name:'Войти в систему', exact:true}).click();
  await page.waitForURL('**/journal');
}
async function noOverflow(page, name) {
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), name + ': page overflow');
}
(async () => {
  const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe', headless:true});
  const context = await browser.newContext({viewport:{width:1920,height:1080}});
  const page = await context.newPage(); page.setDefaultTimeout(15000);
  page.on('pageerror', error => errors.push(error.message));
  try {
    await login(page, 'manager', 'Manager123');
    await page.locator('tbody tr').first().waitFor();
    const total = await page.locator('tbody tr').count();
    const code = (await page.locator('tbody tr').first().locator('td').nth(1).innerText()).trim();
    await page.getByLabel('Шифр пациента', {exact:true}).fill(code);
    await page.getByText(`Найдено: 1 из ${total}`, {exact:true}).waitFor();
    await page.getByRole('button', {name:`Убрать фильтр Шифр: ${code}`, exact:true}).waitFor();
    assert(await page.locator('tbody tr').count() === 1, 'Journal filter mismatch');
    await page.getByRole('button', {name:'Статистический срез', exact:true}).click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', {name:/Excel/}).click();
    const exported = await download; await exported.saveAs(path.join(OUT, 'slice.xlsx'));
    checks.push('journal: code filter, found/total count, active chip and filtered Excel download');
    await page.getByRole('button', {name:'Сбросить фильтры', exact:true}).click();
    await page.getByRole('button', {name:/Удалить карточку/}).first().click();
    await page.getByRole('dialog').waitFor();
    await page.mouse.click(1, 1); assert(await page.getByRole('dialog').count() === 1, 'Backdrop dismissed deletion');
    await page.getByRole('button', {name:'Отмена', exact:true}).click();
    assert(await page.locator('tbody tr').count() === total, 'Cancelled delete removed a card');
    for (const width of [1920,1024,390]) {
      await page.setViewportSize({width,height:width === 1024 ? 768 : 1080}); await noOverflow(page, 'journal '+width);
      const sticky = await page.locator('tbody tr').first().locator('td').evaluateAll(cells => cells.slice(0,2).every(cell => getComputedStyle(cell).position === 'sticky'));
      assert(sticky, 'ID/code not sticky');
      await page.screenshot({path:path.join(OUT,`journal-${width}.png`)});
    }
    checks.push('journal: deletion confirmation and cancellation; responsive toolbar and sticky ID/code at 1920/1024/390');
    await page.setViewportSize({width:1920,height:1080});
    await page.goto(BASE+'/files');
    await page.getByRole('button', {name:'Создать папку',exact:true}).first().click();
    const folder = 'UI-check-' + Date.now();
    await page.getByLabel('Имя новой папки', {exact:true}).fill(folder);
    await page.getByRole('dialog').getByRole('button', {name:'Создать папку', exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.getByRole('button', {name:'Загрузить файл',exact:true}).first().click();
    await page.getByLabel('Файл', {exact:true}).setInputFiles({name:'ui-proof.txt',mimeType:'text/plain',buffer:Buffer.from('UI regression content')});
    await page.getByLabel('Комментарий', {exact:true}).fill('Metadata remains visible');
    await page.getByRole('dialog').getByRole('button', {name:'Загрузить файл',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.getByText('Metadata remains visible', {exact:true}).waitFor();
    const row = page.locator('tbody tr').filter({hasText:'ui-proof.txt'});
    assert((await row.locator('td').nth(1).innerText()).trim(), 'Author missing');
    assert((await row.locator('td').nth(2).innerText()).trim(), 'Date missing');
    const fileDownload = page.waitForEvent('download'); await page.getByRole('button',{name:'Скачать ui-proof.txt',exact:true}).click();
    const downloaded = await fileDownload; await downloaded.saveAs(path.join(OUT,'downloaded.txt'));
    assert(fs.readFileSync(path.join(OUT,'downloaded.txt'),'utf8')==='UI regression content','Download content differs');
    checks.push('files: folder dialog, selected parent, upload with comment, author/date metadata, binary download');
    await page.getByRole('button',{name:'Создать папку',exact:true}).first().click();
    await page.getByLabel('Имя новой папки',{exact:true}).fill('Вложенная');
    await page.getByRole('dialog').getByRole('button',{name:'Создать папку',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    for (const width of [1920,1024,390]) {
      await page.setViewportSize({width,height:width === 1024 ? 768 : 1080}); await noOverflow(page, 'files '+width);
      await page.screenshot({path:path.join(OUT,`files-${width}.png`)});
    }
    await page.setViewportSize({width:1920,height:1080});
    await page.getByRole('navigation',{name:'Путь к папке',exact:true}).getByRole('button',{name:folder,exact:true}).click();
    await page.getByRole('button',{name:'Действия с папкой',exact:true}).click(); await page.getByRole('menuitem',{name:'Удалить папку',exact:true}).click();
    await page.getByRole('dialog').getByText(/Файлов: 1/).waitFor();
    await page.getByRole('button',{name:'Отмена',exact:true}).click();
    await page.getByText('ui-proof.txt',{exact:true}).waitFor();
    await page.getByRole('button',{name:'Действия с папкой',exact:true}).click(); await page.getByRole('menuitem',{name:'Удалить папку',exact:true}).click();
    await page.getByRole('dialog').getByRole('button',{name:'Удалить',exact:true}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    assert(await page.getByRole('navigation',{name:'Папки хранилища',exact:true}).getByRole('button',{name:folder,exact:true}).count()===0,'Recursive delete left folder');
    checks.push('files: breadcrumbs, nested folder selection, count in delete warning, cancel and recursive delete, responsive layout');
    await page.goto(BASE+'/audit');
    await page.getByRole('button',{name:'Подробнее о событии 1',exact:true}).waitFor();
    const eventCount=await page.locator('tbody tr').count();
    await page.getByLabel('Тип действия',{exact:true}).fill('удал');
    await page.getByRole('button',{name:'Подробнее о событии 1',exact:true}).waitFor();
    const details = await page.locator('tbody tr').first().locator('td').nth(4).innerText();
    await page.getByRole('button',{name:'Подробнее о событии 1',exact:true}).click();
    const panel=page.getByRole('dialog');await panel.getByText(details,{exact:true}).waitFor();
    await panel.evaluate(async node => { await Promise.all(node.getAnimations({subtree:true}).map(animation => animation.finished)); });
    await page.screenshot({path:path.join(OUT,'audit-details.png')});
    assert(await panel.locator('input,textarea,select').count()===0,'Audit panel editable');
    assert(await panel.getByRole('button',{name:/Удалить|Сохранить/}).count()===0,'Audit modification action');
    await page.getByRole('button',{name:'Закрыть',exact:true}).click();
    await page.getByRole('button',{name:'Сбросить фильтры',exact:true}).click();
    await page.waitForFunction(count => document.querySelectorAll('tbody tr').length === count, eventCount);
    for (const width of [1920,1024,390]) {
      await page.setViewportSize({width,height:width === 1024 ? 768 : 1080}); await noOverflow(page, 'audit '+width);
      await page.screenshot({path:path.join(OUT,`audit-${width}.png`)});
    }
    checks.push('audit: full result set, action filter/reset, read-only side panel with complete details, responsive layout');
    await page.setViewportSize({width:1920,height:1080}); await page.goto(BASE+'/patients/new');
    const tabs=page.getByLabel('Разделы карточки пациента',{exact:true}).getByRole('button');
    let text;
    for(let section=0;section<10;section++) {
      await tabs.nth(section).click();
      text=page.locator('.clinical-field-long textarea').first();
      if(await text.count()) break;
    }
    assert(await text.count(),'No long clinical field');
    const value=Array.from({length:20},(_,i)=>`Строка ${i+1}: подробное описание`).join('\n');
    await text.fill(value);
    const box=await text.boundingBox(); assert(box.height<=257&&box.height>=136,'Autogrow not capped');
    await page.locator('.clinical-field-long').first().getByRole('button',{name:/Развернуть:/}).click();
    const expanded=page.getByRole('dialog').locator('textarea'); assert(await expanded.inputValue()===value,'Expanded value lost');
    await page.getByRole('dialog').evaluate(async node => { await Promise.all(node.getAnimations({subtree:true}).map(animation => animation.finished)); });
    await page.screenshot({path:path.join(OUT,'expanded-text.png')});
    await expanded.fill(value+'\nДополнение');
    await page.getByRole('button',{name:'Готово',exact:true}).click();
    assert(await text.inputValue()===value+'\nДополнение','Expanded edit not transferred');
    await page.getByRole('button',{name:'Сохранить карточку',exact:true}).click();
    await page.waitForURL(/\/patients\/(?!new)[^/]+$/);
    await page.reload(); await page.getByLabel('Разделы карточки пациента',{exact:true}).waitFor();
    let persisted=false;
    for(let section=0;section<10;section++) { await page.getByLabel('Разделы карточки пациента',{exact:true}).getByRole('button').nth(section).click(); if((await page.locator('textarea').evaluateAll(nodes=>nodes.map(n=>n.value))).includes(value+'\nДополнение')) persisted=true; }
    assert(persisted,'Expanded text not saved');
    checks.push('long text: capped autogrow, expanded editing, transfer to form and database persistence after reload');
    const doctorContext=await browser.newContext({viewport:{width:1024,height:768},hasTouch:true}); const doctor=await doctorContext.newPage();
    doctor.on('pageerror',e=>errors.push(e.message));
    await login(doctor,'ambulatory_doctor','Doctor123');
    assert(await doctor.getByRole('button',{name:'Итоговая выгрузка',exact:true}).count()===0,'Doctor export visible');
    await doctor.goto(BASE+'/files');await doctor.getByText('Доступно скачивание файлов',{exact:true}).waitFor();
    assert(await doctor.getByRole('button',{name:'Загрузить файл',exact:true}).count()===0,'Doctor upload visible');
    assert(await doctor.getByRole('button',{name:/Удалить/}).count()===0,'Doctor delete visible');
    await doctor.goto(page.url());await doctor.getByLabel('Разделы карточки пациента',{exact:true}).waitFor();
    let readOnlyChecked=false;
    for(let section=0;section<10;section++) { await doctor.getByLabel('Разделы карточки пациента',{exact:true}).getByRole('button').nth(section).click(); const expand=doctor.locator('.clinical-field-long').first().getByRole('button',{name:/Развернуть:/}); if(await expand.count()){await expand.click();assert(await doctor.getByRole('dialog').locator('textarea').evaluate(n=>n.readOnly),'Expanded read-only field editable');readOnlyChecked=true;break;} }
    assert(readOnlyChecked,'Read-only expand missing');
    checks.push('ambulatory role: no upload/delete/export actions, expanded stationary text remains read-only on touch tablet');
    await doctorContext.close();
    assert(errors.length===0,errors.join('; '));
    fs.writeFileSync(path.join(OUT,'workspace-ui.json'),JSON.stringify({status:'PASS',checks,errors},null,2));
    console.log(JSON.stringify({status:'PASS',checks,errors}));
  } catch(error) {
    await page.screenshot({path:path.join(OUT,'failure.png')});
    fs.writeFileSync(path.join(OUT,'workspace-ui.json'),JSON.stringify({status:'FAIL',checks,errors,error:error.message},null,2));
    throw error;
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
