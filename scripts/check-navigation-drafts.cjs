const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE = process.env.PMI_BASE_URL, OUT = process.env.PMI_OUTPUT_DIR;
const checks = [], errors = [];
function assert(value, message) { if (!value) throw Error(message); }
const fio = page => page.getByLabel('ФИО', { exact: true });
const leave = page => page.getByRole('dialog').filter({ hasText: 'Есть несохранённые изменения' });
const recovery = page => page.getByRole('dialog').filter({ hasText: 'Восстановить несохранённые данные?' });
async function login(page) {
 await page.getByLabel('Логин', {exact:true}).fill('manager');
 await page.getByLabel('Пароль', {exact:true}).fill('Manager123');
 await page.getByRole('button', {name:'Войти в систему',exact:true}).click();
}
async function journal(page) { await page.getByRole('link',{name:'Общий журнал пациентов',exact:true}).click(); }
async function fresh(page) { await page.goto(BASE+'/patients/new'); await fio(page).waitFor(); }
async function idle(page) {
 await page.evaluate(() => {
  const key='efetovAuth:'+sessionStorage.getItem('efetovSelectedAccount');
  const data=JSON.parse(localStorage.getItem(key)); data.activity=Date.now()-901000;
  localStorage.setItem(key,JSON.stringify(data));
 });
 await page.waitForURL('**/login');
}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 let page, failure;
 try {
  const context=await browser.newContext({viewport:{width:1920,height:1080}});page=await context.newPage();page.setDefaultTimeout(12000);
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(BASE+'/login');await login(page);await page.waitForURL('**/journal');
  await fresh(page);await fio(page).fill('PMI stay discard');await journal(page);await leave(page).waitFor();
  await leave(page).getByRole('button',{name:'Остаться',exact:true}).click();
  assert(page.url().endsWith('/patients/new'),'Stay navigated');assert(await fio(page).inputValue()==='PMI stay discard','Stay lost input');
  await journal(page);await leave(page).getByRole('button',{name:'Уйти без сохранения',exact:true}).click();await page.waitForURL('**/journal');
  await fresh(page);assert(await fio(page).inputValue()==='','Discard leaked into new form');
  checks.push('create: stay retains input; discard leaves; next create is empty');
  await fio(page).fill('PMI save and go');await journal(page);
  const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/patients')&&r.request().method()==='POST'),leave(page).getByRole('button',{name:'Сохранить и перейти',exact:true}).click()]);
  assert(response.ok(),'SaveGo failed');const card=await response.json();await page.waitForURL('**/journal');
  await fresh(page);assert(await fio(page).inputValue()==='','Saved input leaked into next create');
  checks.push('create: save and go creates exactly one card, then empty new form');
  await fio(page).fill('PMI failed save');await journal(page);
  await page.route('**/api/patients',route=>route.request().method()==='POST'?route.fulfill({status:500,contentType:'application/json',body:JSON.stringify({detail:'PMI controlled failure'})}):route.continue());
  await leave(page).getByRole('button',{name:'Сохранить и перейти',exact:true}).click();await page.getByText('PMI controlled failure',{exact:true}).waitFor();
  assert(page.url().endsWith('/patients/new'),'Failed save navigated');assert(await fio(page).inputValue()==='PMI failed save','Failed save lost input');
  await page.unroute('**/api/patients');await leave(page).getByRole('button',{name:'Уйти без сохранения',exact:true}).click();await page.waitForURL('**/journal');
  checks.push('failed save blocks transition and preserves input');
  await page.goto(BASE+'/patients/'+card.id);await fio(page).waitFor();assert(await fio(page).inputValue()==='PMI save and go','Saved create missing');
  await fio(page).fill('PMI edit discard');await journal(page);await leave(page).getByRole('button',{name:'Уйти без сохранения',exact:true}).click();await page.waitForURL('**/journal');
  await page.goto(BASE+'/patients/'+card.id);await fio(page).waitFor();assert(await fio(page).inputValue()==='PMI save and go','Discard changed saved card');
  await fio(page).fill('PMI edit saved');await journal(page);await leave(page).getByRole('button',{name:'Сохранить и перейти',exact:true}).click();await page.waitForURL('**/journal');
  await page.goto(BASE+'/patients/'+card.id);await fio(page).waitFor();assert(await fio(page).inputValue()==='PMI edit saved','Edit SaveGo did not persist');
  checks.push('edit: discard preserves database; save and go persists changes');
  await fresh(page);await fio(page).fill('PMI idle create');await idle(page);
  assert(await leave(page).count()===0,'Forced timeout triggered leave confirmation');
  await login(page);await recovery(page).waitFor();await recovery(page).getByRole('button',{name:'Продолжить создание',exact:true}).click();await fio(page).waitFor();
  assert(await fio(page).inputValue()==='PMI idle create','Idle recovery lost create input');
  // Repeat without touching restored input: restored data must be checkpointed again.
  await idle(page);await login(page);await recovery(page).waitFor();await recovery(page).getByRole('button',{name:'Продолжить создание',exact:true}).click();await fio(page).waitFor();
  assert(await fio(page).inputValue()==='PMI idle create','Second timeout lost untouched restored input');
  await idle(page);await login(page);await recovery(page).waitFor();await recovery(page).getByRole('button',{name:'Начать новую карточку',exact:true}).click();await fio(page).waitFor();assert(await fio(page).inputValue()==='','Declined recovery not empty');
  checks.push('idle creation: explicit recovery choice, repeated timeout, decline starts empty');
  await page.goto(BASE+'/patients/'+card.id);await fio(page).waitFor();await fio(page).fill('PMI idle edit');await idle(page);await login(page);await recovery(page).waitFor();
  await recovery(page).getByRole('button',{name:'Открыть сохранённую версию',exact:true}).click();await fio(page).waitFor();assert(await fio(page).inputValue()==='PMI edit saved','Decline edit did not show saved version');
  await fio(page).fill('PMI restore edit');await idle(page);await login(page);await recovery(page).waitFor();await recovery(page).getByRole('button',{name:'Продолжить редактирование',exact:true}).click();await fio(page).waitFor();assert(await fio(page).inputValue()==='PMI restore edit','Edit recovery failed');
  checks.push('idle edit: saved version or recovered unsaved input');
  await page.getByRole('button',{name:'Выйти',exact:true}).click();await leave(page).getByRole('button',{name:'Уйти без сохранения',exact:true}).click();await page.waitForURL('**/login');
  await login(page);await page.waitForURL('**/journal');assert(await recovery(page).count()===0,'Manual logout offered recovery');await fresh(page);assert(await fio(page).inputValue()==='','Manual logout retained draft');
  checks.push('manual logout: confirmation then no recovery');
  await fio(page).fill('PMI reload');page.once('dialog',dialog=>dialog.accept());await page.reload();await fio(page).waitFor();assert(await fio(page).inputValue()==='','Ordinary reload persisted draft');
  checks.push('ordinary reload: browser confirmation; no timeout recovery');
  // Section switches are within one editor and must not discard or prompt.
  await journal(page);await page.waitForURL('**/journal');
  await page.getByRole('row').filter({has:page.getByRole('cell',{name:String(card.id),exact:true})}).getByRole('button',{name:/^Открыть карточку /}).click();
  await fio(page).waitFor();await fio(page).fill('PMI sections');
  const tabs=page.getByLabel('Разделы карточки пациента',{exact:true}).getByRole('button');
  await tabs.nth(1).click();assert(await leave(page).count()===0,'Section switch prompted');
  await tabs.nth(0).click();assert(await fio(page).inputValue()==='PMI sections','Section switch lost input');
  await page.goBack();await leave(page).waitFor();await leave(page).getByRole('button',{name:'Остаться',exact:true}).click();assert(await fio(page).inputValue()==='PMI sections','Browser back lost input');
  await journal(page);await leave(page).getByRole('button',{name:'Уйти без сохранения',exact:true}).click();await page.waitForURL('**/journal');
  checks.push('section switches keep edits; browser back uses leave confirmation');
  // Independent drafts in two tabs must both be checkpointed on shared logout.
  const second=await context.newPage();second.setDefaultTimeout(12000);second.on('pageerror',error=>errors.push(error.message));
  const clean=await context.newPage();await clean.goto(BASE+'/files');
  await fresh(second);await fio(second).fill('PMI second tab');await fresh(page);await fio(page).fill('PMI first tab');
  await idle(page);await second.waitForURL('**/login');
  await login(page);await recovery(page).waitFor();await recovery(second).waitFor();
  await recovery(page).getByRole('button',{name:'Продолжить создание',exact:true}).click();
  await recovery(second).getByRole('button',{name:'Продолжить создание',exact:true}).click();
  await fio(page).waitFor();await fio(second).waitFor();await clean.waitForURL('**/files');
  assert(await fio(page).inputValue()==='PMI first tab','First tab recovery mixed');assert(await fio(second).inputValue()==='PMI second tab','Second tab recovery mixed');
  await second.close({runBeforeUnload:false});await clean.close();await journal(page);await leave(page).getByRole('button',{name:'Уйти без сохранения',exact:true}).click();await page.waitForURL('**/journal');
  checks.push('three tabs: shared idle logout, independent drafts, clean tab restores its route');
  // A server-side idle 401 also checkpoints the form before auth is cleared.
  await fresh(page);await fio(page).fill('PMI server idle');
  await page.route('**/api/patients',route=>route.request().method()==='POST'?route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({detail:'Сеанс завершён из-за неактивности'})}):route.continue());
  await page.getByRole('button',{name:'Сохранить карточку',exact:true}).click();await page.waitForURL('**/login');await page.unroute('**/api/patients');
  await login(page);await recovery(page).waitFor();await recovery(page).getByRole('button',{name:'Продолжить создание',exact:true}).click();await fio(page).waitFor();assert(await fio(page).inputValue()==='PMI server idle','Server idle lost input');
  await journal(page);await leave(page).getByRole('button',{name:'Уйти без сохранения',exact:true}).click();await page.waitForURL('**/journal');
  checks.push('server inactivity 401: recovery offered with input retained');
  await page.goto(BASE+'/patients/'+card.id);await fio(page).waitFor();await fio(page).fill('PMI server idle edit');
  await page.route('**/api/patients/*/sections',route=>route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({detail:'Сеанс завершён из-за неактивности'})}));
  await journal(page);await leave(page).getByRole('button',{name:'Сохранить и перейти',exact:true}).click();await page.waitForURL('**/login');await page.unroute('**/api/patients/*/sections');
  await login(page);await recovery(page).waitFor();await recovery(page).getByRole('button',{name:'Продолжить редактирование',exact:true}).click();await fio(page).waitFor();assert(await fio(page).inputValue()==='PMI server idle edit','Server idle edit lost input');
  await journal(page);await leave(page).getByRole('button',{name:'Уйти без сохранения',exact:true}).click();await page.waitForURL('**/journal');
  checks.push('server inactivity 401 while editing: input checkpointed before runtime clears');
  const ownerAuth=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'stationary_doctor',password:'Doctor123'})}).then(r=>r.json());
  const foreignResponse=await fetch(BASE+'/api/patients',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+ownerAuth.token},body:JSON.stringify({center:'PMI foreign',values:{fio:'PMI foreign original'}})});
  assert(foreignResponse.ok,'Foreign fixture failed');const foreign=await foreignResponse.json();
  await page.goto(BASE+'/patients/'+foreign.id);await fio(page).waitFor();await fio(page).fill('PMI leader save');await journal(page);
  await leave(page).getByRole('button',{name:'Сохранить и перейти',exact:true}).click();
  const leader=page.getByRole('dialog').filter({hasText:'Подтверждение редактирования'});
  await leader.getByRole('button',{name:'Отмена',exact:true}).click();
  assert(page.url().endsWith('/patients/'+foreign.id),'Leader cancel navigated');assert(await fio(page).inputValue()==='PMI leader save','Leader cancel lost input');
  await leave(page).getByRole('button',{name:'Сохранить и перейти',exact:true}).click();
  await leader.getByRole('button',{name:'Внести исправления',exact:true}).click();await page.waitForURL('**/journal');
  await page.goto(BASE+'/patients/'+foreign.id);await fio(page).waitFor();assert(await fio(page).inputValue()==='PMI leader save','Leader confirmation save failed');
  checks.push('leader save and go retains foreign-card confirmation; cancel preserves input');
  assert(errors.length===0,'Browser errors: '+errors.join(';'));
  console.log(JSON.stringify({status:'PASS',checks,errors}));
 } catch(error) { failure=error.message;if(page)await page.screenshot({path:path.join(OUT,'navigation-failure.png'),fullPage:true});throw error; }
 finally {await browser.close();fs.writeFileSync(path.join(OUT,'navigation.json'),JSON.stringify({status:failure?'FAIL':'PASS',checks,errors,...(failure?{failure}:{})},null,2));}
})().catch(error=>{console.error(error);process.exitCode=1;});
