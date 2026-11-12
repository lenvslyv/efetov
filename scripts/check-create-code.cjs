const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE=process.env.PMI_BASE_URL;
const OUT=process.env.PMI_OUTPUT_DIR;
const checks=[];
function assert(x,message){if(!x)throw Error(message);}
async function login(page){
 await page.goto(BASE+'/login',{waitUntil:'domcontentloaded'});
 await page.getByLabel('Логин',{exact:true}).fill('manager');await page.getByLabel('Пароль',{exact:true}).fill('Manager123');
 await page.getByRole('button',{name:'Войти в систему',exact:true}).click();await page.waitForURL('**/journal',{waitUntil:'domcontentloaded'});await page.locator('tbody tr').first().waitFor();
}
(async()=>{
 const auth=await fetch(BASE+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({login:'manager',password:'Manager123'})}).then(r=>r.json());
 const headers={Authorization:'Bearer '+auth.token};
 const before=await fetch(BASE+'/api/runtime',{headers}).then(r=>r.json());
 const existingCode=before.patients[0].code;
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const created=[];
 try{
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(15000);
  await login(page);
  await page.route('**/api/runtime*',async route=>{await new Promise(r=>setTimeout(r,800));await route.continue();});
  await page.goto(BASE+'/patients/new',{waitUntil:'domcontentloaded'});
  await page.waitForResponse(r=>r.url().includes('/api/runtime')&&r.status()===200);
  const candidate=String(Math.max(...before.patients.map(p=>Number(p.id)))+1);
  const code=page.locator('form input').nth(1);
  await page.waitForFunction(id=>document.querySelector('form input')?.value===id,candidate);
  const displayed=await code.inputValue();assert(displayed.endsWith(candidate.padStart(3,'0')),'Auto code did not follow loaded ID');
  const marker='ПМИ новый шифр '+Date.now();await page.getByLabel('ФИО',{exact:true}).fill(marker);
  const [saved]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/patients')&&r.request().method()==='POST'),page.getByRole('button',{name:'Сохранить карточку',exact:true}).click()]);
  assert(saved.status()===200,'Automatic creation HTTP '+saved.status());assert(saved.request().postDataJSON().code==='','Frontend did not delegate automatic allocation to server');
  const card=await saved.json();created.push(card.id);assert(card.code===displayed,'Displayed automatic code differs');
  await page.waitForURL('**/patients/'+card.id,{waitUntil:'domcontentloaded'});await page.reload({waitUntil:'domcontentloaded'});await page.getByLabel('ФИО',{exact:true}).waitFor();assert(await page.getByLabel('ФИО',{exact:true}).inputValue()===marker,'Created data lost');
  checks.push({case:'cold direct form after delayed runtime',status:'PASS',id:card.id,code:card.code,serverAllocation:true,survivesReload:true});
  await page.goto(BASE+'/patients/new',{waitUntil:'domcontentloaded'});
  await page.waitForResponse(r=>r.url().includes('/api/runtime')&&r.status()===200);await code.waitFor();
  await code.fill('PMI temporary input');await code.fill(existingCode);await page.getByLabel('ФИО',{exact:true}).fill('ПМИ дубликат');
  const [conflict]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/patients')&&r.request().method()==='POST'),page.getByRole('button',{name:'Сохранить карточку',exact:true}).click()]);
  if(conflict.status()===200)created.push((await conflict.json()).id);
  assert(conflict.status()===409,'Duplicate HTTP '+conflict.status()+' request '+conflict.request().postData());await page.getByText('Карточка с таким шифром уже существует. Укажите другой шифр.',{exact:true}).waitFor();assert(await code.inputValue()===existingCode,'Duplicate error discarded input');
  checks.push({case:'manual duplicate',status:'PASS',http:409,readableMessage:true,draftRetained:true});
  const custom='PMI-MANUAL-'+Date.now();await code.fill(custom);page.once('dialog',dialog=>dialog.accept());await page.reload({waitUntil:'domcontentloaded'});await code.waitFor();assert(await code.inputValue()!==custom,'Ordinary reload restored a non-idle draft');await code.fill(custom);await page.getByLabel('ФИО',{exact:true}).fill('ПМИ ручной шифр');
  const [manual]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/patients')&&r.request().method()==='POST'),page.getByRole('button',{name:'Сохранить карточку',exact:true}).click()]);
  assert(manual.status()===200,'Manual unique code failed');const manualCard=await manual.json();created.push(manualCard.id);assert(manualCard.code===custom,'Manual code changed');
  checks.push({case:'manual unique code and draft',status:'PASS',ordinaryReloadClearsDraft:true,codePreserved:true});
 }finally{
  await browser.close();for(const id of created)await fetch(BASE+'/api/patients/'+id,{method:'DELETE',headers});
 }
 fs.writeFileSync(path.join(OUT,'creation-fixed.json'),JSON.stringify({status:'PASS',checks},null,2));console.log('CREATION',JSON.stringify(checks));
})().catch(error=>{fs.writeFileSync(path.join(OUT,'creation-fixed.json'),JSON.stringify({status:'FAIL',checks,error:error.message},null,2));console.error(error);process.exitCode=1;});
