const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE=process.env.PMI_BASE_URL,OUT=process.env.PMI_OUTPUT_DIR,checks=[],errors=[];
function assert(value,message){if(!value)throw Error(message);}
async function login(page,name,password){await page.goto(BASE+'/login');await page.getByLabel('Логин',{exact:true}).fill(name);await page.getByLabel('Пароль',{exact:true}).fill(password);await page.getByRole('button',{name:'Войти в систему',exact:true}).click();await page.waitForURL('**/journal');}
async function menu(page,name,item){await page.getByRole('button',{name,exact:true}).click();await page.getByRole('menuitem',{name:item,exact:true}).click();}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await login(page,'manager','Manager123');await page.goto(BASE+'/admin');await page.getByRole('button',{name:'Редактировать manager',exact:true}).waitFor();
  const selfMenu='Действия пользователя manager';await page.getByRole('button',{name:selfMenu,exact:true}).click();
  assert(await page.getByRole('menuitem',{name:'Удалить пользователя',exact:true}).isDisabled(),'Self deletion enabled');
  assert(await page.getByRole('menuitem',{name:'Заблокировать',exact:true}).isDisabled(),'Self blocking enabled');
  await page.keyboard.press('Escape');assert(await page.getByRole('menu').count()===0,'Menu Escape failed');
  checks.push('self block/delete remain disabled; keyboard closes action menu');
  const loginName='ui-user-'+Date.now(),password='UiCheck123';
  await page.getByRole('button',{name:'Добавить пользователя',exact:true}).click();
  const dialog=page.getByRole('dialog');await dialog.getByLabel('ФИО',{exact:true}).fill('Проверка интерфейса');await dialog.getByLabel('Логин',{exact:true}).fill(loginName);await dialog.getByLabel('Почта',{exact:true}).fill('ui@example.test');await dialog.getByLabel('Пароль',{exact:true}).fill(password);await dialog.getByLabel('Повтор пароля',{exact:true}).fill(password);
  await dialog.getByLabel('Врач стационара',{exact:true}).check();
  await dialog.getByRole('button',{name:'Создать',exact:true}).click();await dialog.waitFor({state:'hidden'});
  const row=page.locator('tbody tr').filter({hasText:loginName});await row.waitFor();
  const stationary = row.getByRole('checkbox',{name:'Проверка интерфейса, Врач стационара',exact:true});
  assert(await stationary.isChecked(),'Role not assigned at creation');
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/roles')&&r.status()===200),row.getByRole('checkbox',{name:'Проверка интерфейса, Врач амбулатории',exact:true}).click()]);
  await page.reload();await row.waitFor();assert(await row.getByRole('checkbox',{name:'Проверка интерфейса, Врач амбулатории',exact:true}).isChecked(),'Inline role not persisted');
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/roles')&&r.status()===200),row.getByRole('checkbox',{name:'Проверка интерфейса, Врач амбулатории',exact:true}).click()]);
  await page.getByRole('button',{name:'Редактировать '+loginName,exact:true}).click();await dialog.getByLabel('ФИО',{exact:true}).fill('Обновлённое имя');await dialog.getByRole('button',{name:'Сохранить',exact:true}).click();await dialog.waitFor({state:'hidden'});await row.getByText('Обновлённое имя',{exact:true}).waitFor();
  checks.push('create/edit account with initial role; inline role checkbox saves immediately and survives reload');
  await menu(page,'Действия пользователя '+loginName,'Сменить пароль');await dialog.getByLabel('Новый пароль',{exact:true}).fill('Updated123');await dialog.getByLabel('Повтор пароля',{exact:true}).fill('Updated123');await dialog.getByRole('button',{name:'Сменить пароль',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await menu(page,'Действия пользователя '+loginName,'Заблокировать');await dialog.getByRole('button',{name:'Отмена',exact:true}).click();await row.getByText('Активна',{exact:true}).waitFor();
  await menu(page,'Действия пользователя '+loginName,'Заблокировать');await dialog.getByRole('button',{name:'Заблокировать',exact:true}).click();await dialog.waitFor({state:'hidden'});await row.getByText('Заблокирована',{exact:true}).waitFor();
  const denied=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:loginName,password:'Updated123'})});assert(!denied.ok,'Blocked login accepted');
  await menu(page,'Действия пользователя '+loginName,'Разблокировать');await dialog.getByRole('button',{name:'Разблокировать',exact:true}).click();await dialog.waitFor({state:'hidden'});await row.getByText('Активна',{exact:true}).waitFor();
  const allowed=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:loginName,password:'Updated123'})});assert(allowed.ok,'Unblocked login rejected');
  checks.push('password change; block cancel, confirmed block denies login, confirmed unblock restores login');
  for(const width of [1920,1024,390]){await page.setViewportSize({width,height:width===1024?768:1080});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Admin overflow '+width);await page.getByRole('button',{name:'Действия пользователя '+loginName,exact:true}).click();const box=await page.getByRole('menu').boundingBox();assert(box.x>=0&&box.x+box.width<=width+1,'Menu out of viewport');await page.keyboard.press('Escape');await page.screenshot({path:path.join(OUT,'admin-'+width+'.png')});}
  await page.setViewportSize({width:1920,height:1080});await menu(page,'Действия пользователя '+loginName,'Удалить пользователя');await dialog.getByRole('button',{name:'Отмена',exact:true}).click();await row.waitFor();await menu(page,'Действия пользователя '+loginName,'Удалить пользователя');await dialog.getByRole('button',{name:'Удалить',exact:true}).click();await row.waitFor({state:'hidden'});
  checks.push('responsive admin table/portal menu at desktop/tablet/mobile; confirmed deletion and cancellation');
  await page.goto(BASE+'/files');await page.getByRole('button',{name:'Создать папку',exact:true}).first().click();await dialog.getByLabel('Имя новой папки',{exact:true}).fill('Полностью пустая');await dialog.getByRole('button',{name:'Создать папку',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByRole('heading',{name:'Папка пуста',exact:true}).waitFor();assert(await page.locator('table').count()===0,'Empty folder still has a table');await page.getByRole('navigation',{name:'Папки хранилища',exact:true}).getByRole('button',{name:'Открыть папку Полностью пустая (пусто)',exact:true}).waitFor();
  await page.getByRole('button',{name:'Создать папку',exact:true}).first().click();await dialog.getByLabel('Имя новой папки',{exact:true}).fill('Вложенная');await dialog.getByRole('button',{name:'Создать папку',exact:true}).click();await dialog.waitFor({state:'hidden'});
  await page.getByRole('navigation',{name:'Путь к папке',exact:true}).getByRole('button',{name:'Полностью пустая',exact:true}).click();assert(await page.locator('table').count()===0,'Folders-only directory has file table');assert(await page.getByRole('heading',{name:'Папка пуста',exact:true}).count()===0,'Nonempty parent incorrectly empty');
  const tree=page.getByRole('navigation',{name:'Папки хранилища',exact:true});await tree.getByRole('button',{name:'Свернуть папку Полностью пустая',exact:true}).click();assert(await tree.getByRole('button',{name:'Открыть папку Полностью пустая / Вложенная (пусто)',exact:true}).count()===0,'Folder collapse failed');await tree.getByRole('button',{name:'Раскрыть папку Полностью пустая',exact:true}).click();await tree.getByRole('button',{name:'Открыть папку Полностью пустая / Вложенная (пусто)',exact:true}).waitFor();
  assert(await page.locator('.folder-tree ul').first().evaluate(n=>getComputedStyle(n).borderLeftStyle==='solid'),'Tree connector missing');await page.screenshot({path:path.join(OUT,'folder-tree.png')});
  await menu(page,'Действия с папкой','Удалить папку');await dialog.getByText(/Файлов: 0/).waitFor();await dialog.getByRole('button',{name:'Отмена',exact:true}).click();
  checks.push('empty/folders-only directories have no table, empty markers correct, tree connectors and collapse, delete moved into header menu');
  await page.goto(BASE+'/patients/new');await page.getByLabel('Адрес',{exact:true}).waitFor();await page.getByLabel('Адрес',{exact:true}).fill('Тест');
  for(const width of [1920,1024,390]) {await page.setViewportSize({width,height:width===1024?768:1080});await page.locator('.clinical-groups').evaluate(n=>n.scrollIntoView({block:'start'}));const geometry=await page.locator('.patient-context').evaluate(n=>({top:n.getBoundingClientRect().top,header:document.querySelector('header').getBoundingClientRect().bottom,bottom:n.getBoundingClientRect().bottom}));assert(geometry.top>=geometry.header-1,'Context overlaps application header');assert(geometry.top<=geometry.header+10,'Context not sticky');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Card overflow '+width);await page.screenshot({path:path.join(OUT,'patient-context-'+width+'.png')});}
  assert(await page.locator('.clinical-group h3').count()>0,'Semantic group headings absent');
  await page.setViewportSize({width:1920,height:1080});await page.getByRole('button',{name:'Сохранить карточку',exact:true}).click();await page.waitForURL(/\/patients\/(?!new)[^/]+$/);await page.getByLabel('Адрес',{exact:true}).waitFor();assert(await page.getByLabel('Адрес',{exact:true}).inputValue()==='Тест','Card value lost');
  checks.push('sticky patient context below dynamic header, semantic group cards, responsive widths and successful card save');
  assert(!errors.length,errors.join(';'));fs.writeFileSync(path.join(OUT,'admin-ui.json'),JSON.stringify({status:'PASS',checks,errors},null,2));console.log(JSON.stringify({status:'PASS',checks,errors}));
 }catch(error){await page.screenshot({path:path.join(OUT,'admin-failure.png')});fs.writeFileSync(path.join(OUT,'admin-ui.json'),JSON.stringify({status:'FAIL',checks,errors,error:error.message},null,2));throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
