const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE='http://127.0.0.1:8001';
const OUT=path.resolve(__dirname,'../.cache/pmi-20261112');
const fixture=JSON.parse(fs.readFileSync(path.join(OUT,'fixture.json'),'utf8'));
const results=[];
function assert(value,message){if(!value)throw Error(message);}
async function check(pmi,fn){try{results.push({pmi,status:'PASS',evidence:await fn()});}catch(error){results.push({pmi,status:'FAIL',evidence:{error:error.message}});} fs.writeFileSync(path.join(OUT,'ui-actions.json'),JSON.stringify(results,null,2)); console.log(pmi,results.at(-1).status);}
async function login(page,name,password='Doctor123'){
 await page.goto(BASE+'/login',{waitUntil:'domcontentloaded'});
 await page.getByLabel('Логин',{exact:true}).fill(name);
 await page.getByLabel('Пароль',{exact:true}).fill(password);
 await page.getByRole('button',{name:'Войти в систему',exact:true}).click();
 await page.waitForURL(url=>url.pathname!='/login',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Выйти',exact:true}).waitFor();
}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1920,height:1080},acceptDownloads:true});
 const page=await context.newPage(); page.setDefaultTimeout(15000);
 await login(page,'manager','Manager123');
 await check('4.1.2',async()=>{
  await page.goto(BASE+'/admin');
  await page.getByRole('button',{name:'Добавить пользователя',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Добавить пользователя',exact:true});
  await dialog.getByLabel('ФИО',{exact:true}).fill('ПМИ проверка пароля');
  await dialog.getByLabel('Логин',{exact:true}).fill('pmi-invalid-ui');
  await dialog.getByLabel('Почта',{exact:true}).fill('pmi@example.org');
  const errors=[];
  for(const password of ['Ab12','Password','12345678']){
   await dialog.getByLabel('Пароль',{exact:true}).fill(password);
   await dialog.getByLabel('Повтор пароля',{exact:true}).fill(password);
   await dialog.getByRole('button',{name:'Создать',exact:true}).click();
   await dialog.getByText('Пароль должен содержать:',{exact:false}).waitFor();
   assert(await dialog.isVisible(),'Invalid password closed form');
   errors.push(await dialog.getByText('Пароль должен содержать:',{exact:false}).innerText());
  }
  await dialog.getByRole('button',{name:'Отмена',exact:true}).click();
  return {invalidPasswordsRejectedInUI:3,messages:errors};
 });
 await check('4.2.4',async()=>{
  const name='ПМИ браузер УЗ '+Date.now(), loginName='pmi-ui-'+Date.now();
  await page.getByRole('button',{name:'Добавить пользователя',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Добавить пользователя',exact:true});
  for(const [label,value] of [['ФИО',name],['Логин',loginName],['Почта','pmi@example.org'],['Пароль','Doctor12'],['Повтор пароля','Doctor12']])await dialog.getByLabel(label,{exact:true}).fill(value);
  await dialog.getByRole('button',{name:'Создать',exact:true}).click();
  const row=page.locator('tbody tr').filter({hasText:loginName});
  await row.waitFor();
  await row.getByRole('checkbox',{name:name+', Врач стационара',exact:true}).click();
  await page.waitForTimeout(1500);
  assert(await row.getByRole('checkbox',{name:name+', Врач стационара',exact:true}).isChecked(),'Role not saved');
  await page.waitForTimeout(200);
  await row.getByRole('button',{name:'Заблокировать',exact:true}).click();
  await row.getByRole('button',{name:'Разблокировать',exact:true}).waitFor({state:'visible'});
  const blockedContext=await browser.newContext();
  const blocked=await blockedContext.newPage();
  await blocked.goto(BASE+'/login');
  await blocked.getByLabel('Логин',{exact:true}).fill(loginName);
  await blocked.getByLabel('Пароль',{exact:true}).fill('Doctor12');
  await blocked.getByRole('button',{name:'Войти в систему',exact:true}).click();
  await blocked.getByText('Учётная запись заблокирована',{exact:false}).waitFor();
  await blockedContext.close();
  await row.getByRole('button',{name:'Разблокировать',exact:true}).click();
  await row.getByRole('checkbox',{name:name+', Врач амбулатории',exact:true}).click();
  await page.waitForTimeout(1500);
  assert(await row.getByRole('checkbox',{name:name+', Врач амбулатории',exact:true}).isChecked(),'Ambulatory role not saved');
  await row.getByRole('checkbox',{name:name+', Врач стационара',exact:true}).click();
  await page.waitForTimeout(1500);
  await row.getByRole('button',{name:'Удалить',exact:true}).click();
  await row.waitFor({state:'hidden'});
  return {createdViaUI:true,roleAssignedViaCheckbox:true,blockedUserLoginRejected:true,unblockedAndRoleChanged:true,testAccountRemoved:true};
 });
 await check('4.3.2',async()=>{
  const replies=[];page.on('response',async r=>{if(r.url().includes('/api/patients'))replies.push({status:r.status(),body:await r.text()});});
  await page.goto(BASE+'/patients/new');
  const marker='ПМИ новая карточка '+Date.now();
  await page.getByLabel('ФИО',{exact:true}).fill(marker);
  await page.getByRole('button',{name:'Сохранить карточку',exact:true}).click();
  try { await page.waitForURL(/\/patients\/\d+$/,{waitUntil:'domcontentloaded'}); } catch(e) { throw Error(e.message+' RESPONSES: '+JSON.stringify(replies)+' ALERTS: '+JSON.stringify(await page.locator('[role="alert"],[role="status"]').allTextContents())+' INPUTS: '+JSON.stringify(await page.locator('form input').evaluateAll(xs=>xs.slice(0,4).map(x=>({value:x.value,message:x.validationMessage}))))); }
  const pid=new URL(page.url()).pathname.split('/').at(-1);
  await page.reload();
  await page.locator('[aria-label="Разделы карточки пациента"] button').first().click();
  assert(await page.getByLabel('ФИО',{exact:true}).inputValue()===marker,'Created patient data lost');
  await page.goto(BASE+'/journal');
  const row=page.locator('tbody tr').filter({has:page.locator('td:first-child').filter({hasText:new RegExp('^'+pid+'$')})});
  await row.waitFor();
  const code=await row.locator('td').nth(1).innerText(); assert(code.length>0,'Code not generated');
  page.once('dialog',dialog=>dialog.accept());
  await row.getByRole('button',{name:'Удалить',exact:true}).click();
  await row.waitFor({state:'hidden'});
  return {createdPatient:pid,generatedCode:code,survivesReload:true,testPatientRemoved:true};
 });
 for(const [number,name,editableSection,readonlySection] of [['4.2.2','stationary_doctor',1,11],['4.2.3','ambulatory_doctor',11,1]])await check(number,async()=>{
  const ctx=await browser.newContext(), doctor=await ctx.newPage();
  await login(doctor,name);
  await doctor.goto(BASE+'/patients/'+fixture.target);
  const tabs=doctor.locator('[aria-label="Разделы карточки пациента"] button');
  await tabs.nth(editableSection-1).click();
  await doctor.locator('.clinical-control').first().waitFor();
  assert(!await doctor.locator('.clinical-control').first().evaluate(element=>element.readOnly),'Allowed section is read-only');
  await tabs.nth(readonlySection-1).click();
  assert(await doctor.locator('.clinical-control').first().evaluate(element=>element.readOnly),'Forbidden section editable');
  const count=await tabs.count(); assert(count===15,'Not all sections visible');
  await ctx.close();return {all15SectionsVisible:true,editableSection,readonlySection};
 });
 await check('4.4.1',async()=>{
  await page.goto(BASE+'/files');
  await page.locator('#file-parent').selectOption('ПМИ файлы');
  await page.locator('#file-comment').fill('ПМИ браузерный комментарий');
  await page.locator('input[type="file"]').setInputFiles({name:'pmi-ui-file.txt',mimeType:'text/plain',buffer:Buffer.from('PMI UI actual bytes')});
  const filename=page.getByText('pmi-ui-file.txt',{exact:true}); await filename.waitFor();
  const row=filename.locator('..').locator('..');
  const [download]=await Promise.all([page.waitForEvent('download'),row.getByRole('button',{name:'Скачать',exact:true}).click()]);
  const bytes=fs.readFileSync(await download.path()); assert(bytes.toString()==='PMI UI actual bytes','Downloaded bytes differ');
  const metadata=await row.innerText(); assert(metadata.includes('ПМИ браузерный комментарий')&&metadata.includes('U-LEAD-001'),'Metadata missing');
  await row.getByRole('button',{name:'Удалить',exact:true}).click(); await filename.waitFor({state:'hidden'});
  return {uploadDownloadDeleteViaUI:true,byteEquality:true,metadataVisible:true};
 });
 await browser.close();
})().catch(error=>{results.push({pmi:'supplementary-run',status:'BLOCKED',evidence:{error:error.message}});fs.writeFileSync(path.join(OUT,'ui-actions.json'),JSON.stringify(results,null,2));console.error(error);process.exitCode=1;});
