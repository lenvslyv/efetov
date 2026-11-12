const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE = process.env.PMI_BASE_URL || 'http://127.0.0.1:8001';
const OUT = process.env.PMI_OUTPUT_DIR || path.resolve(__dirname, '../.cache/pmi-20261112');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
let browser;
let keepActive;
const result = { pmi: '4.1.4', status: 'RUNNING', startedAt: new Date().toISOString(), pulses: 0 };
function write() { fs.writeFileSync(path.join(OUT, 'idle-result.json'), JSON.stringify(result, null, 2)); }
async function login(page, name, password) {
  await page.goto(BASE + '/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Логин', { exact: true }).fill(name);
  await page.getByLabel('Пароль', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Войти в систему', exact: true }).click();
  await page.waitForURL(url => !url.pathname.endsWith('/login'), { waitUntil: 'domcontentloaded' });
}
(async () => {
  async function api(url,token,method='GET',body){
    const r=await fetch(BASE+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});
    if(!r.ok)throw Error('Idle fixture '+url+' HTTP '+r.status);return r.json();
  }
  const owner=await api('/api/login',null,'POST',{login:'stationary_doctor_2',password:'Doctor123'});
  const ownCard=await api('/api/patients',owner.token,'POST',{center:'ПМИ таймаут'});
  const manager=await api('/api/login',null,'POST',{login:'manager',password:'Manager123'});
  let fixture=await api('/api/runtime',manager.token);
  while(fixture.patients.length<88){await api('/api/patients',manager.token,'POST',{center:'ПМИ синтетические данные'});fixture=await api('/api/runtime',manager.token);}
  result.patients=fixture.patients.length;
  browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
  const activeContext = await browser.newContext();
  const active = await activeContext.newPage();
  await login(active, 'manager', 'Manager123');
  keepActive = setInterval(() => { void active.keyboard.press('Shift').then(() => { result.pulses++; }).catch(error => { result.activeError = error.message; }); }, 25000);
  const idleContext = await browser.newContext();
  const idle = await idleContext.newPage();
  await login(idle, 'stationary_doctor_2', 'Doctor123');
  await idle.goto(BASE+'/patients/'+ownCard.id,{waitUntil:'domcontentloaded'});
  const patientPath = new URL(idle.url()).pathname;
  await idle.getByRole('button', { name: 'Взять в работу', exact: true }).click();
  await idle.getByRole('button', { name: 'Снять блокировку', exact: true }).waitFor();
  const editor = idle.locator('.clinical-field input').first();
  result.savedOriginal = await editor.inputValue();
  await editor.fill('ПМИ несохранённый черновик после 15 минут');
  const pages = [idle];
  for (let index = 0; index < 4; index++) {
    const page = await idleContext.newPage();
    await page.goto(BASE + '/journal', { waitUntil: 'domcontentloaded' });
    await page.getByRole('button', { name: 'Выйти', exact: true }).waitFor();
    pages.push(page);
  }
  // Begin the measured interval after all setup actions. Do not change the clock.
  result.idleStartedAt = new Date().toISOString();
  result.patientPath = patientPath;
  result.tabs = pages.length;
  const start = Date.now();
  write();
  console.log('Real 15-minute inactivity test started in five tabs', result.idleStartedAt);
  let expiredAt;
  while (Date.now() - start < 930000) {
    await wait(15000);
    result.elapsedSeconds = (Date.now() - start) / 1000;
    result.urls = pages.map(page => new URL(page.url()).pathname);
    result.activePath = new URL(active.url()).pathname;
    write();
    if (result.urls.every(url => url === '/login')) { expiredAt = result.elapsedSeconds; break; }
  }
  if (!expiredAt) throw new Error('Not all five tabs logged out within 15 minutes plus 30 seconds');
  if (expiredAt < 880) throw new Error(`Premature logout: ${expiredAt} seconds`);
  if (new URL(active.url()).pathname === '/login') throw new Error('Active independent account was also logged out');
  await login(idle, 'stationary_doctor_2', 'Doctor123');
  if (new URL(idle.url()).pathname !== patientPath) throw new Error('Patient route was not restored after inactivity login');
  await idle.getByRole('button', { name: 'Продолжить редактирование', exact: true }).click();
  await idle.locator('.clinical-field input').first().waitFor();
  const value = await idle.locator('.clinical-field input').first().inputValue();
  if (value !== 'ПМИ несохранённый черновик после 15 минут') throw new Error('Unsaved draft was not restored');
  if (!await idle.getByRole('button', { name: 'Снять блокировку', exact: true }).isVisible()) throw new Error('Lock was lost during timeout');
  await idle.getByRole('button', { name: 'Снять блокировку', exact: true }).click();
  result.status = 'PASS';
  result.expiredSeconds = expiredAt;
  result.activeSessionSurvived = true;
  result.routeRestored = true;
  result.draftRestored = true;
  result.lockSurvived = true;
  result.finishedAt = new Date().toISOString();
  write();
})().catch(error => { result.status = 'FAIL'; result.error = error.message; result.stack = error.stack; write(); process.exitCode = 1; })
  .finally(async () => { clearInterval(keepActive); if (browser) await browser.close(); });
