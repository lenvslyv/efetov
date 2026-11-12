const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE = process.env.PMI_BASE_URL || 'http://127.0.0.1:8002';
const OUT = process.env.PMI_OUTPUT_DIR;
const checks = [];
function assert(value, message) { if (!value) throw Error(message); }
async function api(url, token, method='GET', body) {
 const response = await fetch(BASE+url, {method, headers:{'Content-Type':'application/json', ...(token?{Authorization:'Bearer '+token}:{})}, ...(body?{body:JSON.stringify(body)}:{})});
 const data = await response.json();
 assert(response.ok, method+' '+url+' '+response.status+' '+JSON.stringify(data));
 return data;
}
async function login(page, name, password='Doctor123') {
 await page.goto(BASE+'/login', {waitUntil:'domcontentloaded'});
 await page.getByLabel('Логин', {exact:true}).fill(name);
 await page.getByLabel('Пароль', {exact:true}).fill(password);
 await page.getByRole('button', {name:'Войти в систему', exact:true}).click();
 await page.waitForURL(url=>url.pathname==='/journal', {waitUntil:'domcontentloaded'});
 await page.locator('tbody tr').first().waitFor();
}
(async()=>{
 const owner = await api('/api/login', null, 'POST', {login:'stationary_doctor',password:'Doctor123'});
 const other = await api('/api/login', null, 'POST', {login:'stationary_doctor_2',password:'Doctor123'});
 const own = await api('/api/patients', owner.token, 'POST', {center:'Проверка прав'});
 const foreign = await api('/api/patients', other.token, 'POST', {center:'Проверка чужой карточки'});
 const browser = await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const errors=[];
 try {
  const ctx = await browser.newContext(); const page=await ctx.newPage();
  page.on('pageerror',error=>errors.push(error.message));
  const requests=[];page.on('request',r=>{if(r.url().includes('/api/'))requests.push(r.url());});
  await login(page,'stationary_doctor');
  await page.goto(BASE+'/patients/'+foreign.id, {waitUntil:'domcontentloaded'});
  await page.locator('.clinical-control').first().waitFor();
  assert(await page.locator('.clinical-control').first().evaluate(e=>e.readOnly), 'Foreign card editable by stationary doctor');
  assert(await page.getByRole('button',{name:'Взять в работу',exact:true}).count()===0, 'Foreign card lock button present');
  checks.push('stationary foreign card read-only and cannot take lock');
  await page.goto(BASE+'/patients/'+own.id, {waitUntil:'domcontentloaded'});
  const tabs=page.locator('[aria-label="Разделы карточки пациента"] button');
  await tabs.first().waitFor(); assert(await tabs.count()===15,'All fifteen sections must remain visible');
  const field=page.getByLabel('ФИО',{exact:true});
  assert(!await field.evaluate(e=>e.readOnly),'Own card is read-only');
  const marker='Проверка сохранения '+Date.now();await field.fill(marker);
  const start=requests.length;
  await Promise.all([page.waitForResponse(r=>r.url().endsWith('/sections')&&r.request().method()==='PUT'&&r.status()===200),page.getByRole('button',{name:'Сохранить',exact:true}).click()]);
  await page.getByText('Изменения сохранены в карточке пациента',{exact:true}).waitFor();
  assert(!requests.slice(start).some(url=>url.includes('/api/runtime')),'Save needlessly reloaded entire journal');
  await page.reload({waitUntil:'domcontentloaded'});await field.waitFor();assert(await field.inputValue()===marker,'Save lost on reload');
  await tabs.nth(10).click();assert(await page.locator('.clinical-control').first().evaluate(e=>e.readOnly),'Stationary can edit ambulatory section');
  checks.push('stationary own card saved and survives reload without full journal refresh');
  await ctx.close();
  const ac=await browser.newContext(), ap=await ac.newPage();await login(ap,'ambulatory_doctor');
  await ap.goto(BASE+'/patients/'+own.id,{waitUntil:'domcontentloaded'});
  const at=ap.locator('[aria-label="Разделы карточки пациента"] button');await at.nth(10).click();
  assert(!await ap.locator('.clinical-control').first().evaluate(e=>e.readOnly),'Ambulatory cannot edit section 11 of stationary card');
  await at.first().click();assert(await ap.locator('.clinical-control').first().evaluate(e=>e.readOnly),'Ambulatory can edit section 1');
  checks.push('ambulatory can edit section 11, section 1 remains read-only');await ac.close();
  const mc=await browser.newContext(), mp=await mc.newPage();await login(mp,'manager','Manager123');
  await mp.goto(BASE+'/audit',{waitUntil:'domcontentloaded'});await mp.locator('tbody tr').first().waitFor();
  assert(await mp.locator('tbody tr').count()>0,'Audit lazy loading failed');
  await mp.goto(BASE+'/files',{waitUntil:'domcontentloaded'});
  await mp.waitForResponse(r=>r.url().endsWith('/api/file-index')&&r.status()===200);
  checks.push('leader audit and file index loaded on opening pages');await mc.close();
  assert(errors.length===0,JSON.stringify(errors));checks.push('no browser JavaScript errors');
  fs.writeFileSync(path.join(OUT,'browser-access.json'),JSON.stringify({status:'PASS',checks},null,2));
  console.log(JSON.stringify({status:'PASS',checks}));
 } finally { await browser.close(); }
})().catch(error=>{if(OUT)fs.writeFileSync(path.join(OUT,'browser-access.json'),JSON.stringify({status:'FAIL',checks,error:error.message},null,2));console.error(error);process.exitCode=1;});
