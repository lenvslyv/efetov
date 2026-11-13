// Layout review on a disposable database. Does not modify production data.
const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE=process.env.PMI_BASE_URL,OUT=process.env.PMI_OUTPUT_DIR,checks=[],errors=[],issues=[];
function assert(value,message){if(!value)throw Error(message);}
async function settle(page){await page.evaluate(async()=>{await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});}
async function snapshot(page,name){await settle(page);await page.screenshot({path:path.join(OUT,name+'.png')});}
async function geometry(page,name){
 await settle(page);
 const result=await page.evaluate(()=>{
  const problems=[];
  if(document.documentElement.scrollWidth>innerWidth+1)problems.push('horizontal page overflow: '+document.documentElement.scrollWidth+'/'+innerWidth);
  for(const node of document.querySelectorAll('button,input:not([type=checkbox]):not([type=hidden]),select,textarea')){
   const box=node.getBoundingClientRect(),style=getComputedStyle(node);if(!box.width||!box.height||style.visibility==='hidden')continue;
   if(node.tagName==='BUTTON'&&node.scrollWidth>node.clientWidth+2)problems.push('button text clipped: '+(node.textContent||node.getAttribute('aria-label')).slice(0,90));
   if(box.width<16||box.height<16)problems.push('control too small: '+(node.getAttribute('aria-label')||node.id));
  }
  for(const dialog of document.querySelectorAll('[role=dialog]')){
   const box=dialog.getBoundingClientRect();if(box.x< -1||box.y< -1||box.right>innerWidth+1||box.bottom>innerHeight+1)problems.push('dialog outside viewport');
   const scroller=dialog.querySelector('.dialog-scroll-area')||dialog;
   if(scroller.scrollWidth>scroller.clientWidth+1)problems.push('dialog content horizontally clipped');
  }
  return problems;
 });
 issues.push(...result.map(problem=>({screen:name,problem})));checks.push({screen:name,issues:result.length});
}
async function login(page){await page.goto(BASE+'/login');await page.getByLabel('Логин',{exact:true}).fill('manager');await page.getByLabel('Пароль',{exact:true}).fill('Manager123');await page.getByRole('button',{name:'Войти в систему',exact:true}).click();await page.waitForURL('**/journal');}
async function closeDialog(page){await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();await page.getByRole('dialog').waitFor({state:'hidden'});}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',async d=>{if(d.type()==='beforeunload')await d.accept();else errors.push('Unexpected native dialog: '+d.message());});
 try{
  for(const [width,height] of [[1920,1080],[1366,768],[1024,768],[768,1024],[390,844]]){await page.setViewportSize({width,height});await page.goto(BASE+'/login');await page.getByRole('heading',{name:'Вход в систему',exact:true}).waitFor();await geometry(page,'login-'+width);if([1920,1024,390].includes(width))await snapshot(page,'review-login-'+width);}
  await login(page);
  for(const [width,height] of [[1920,1080],[1366,768],[1280,800],[1024,768],[768,1024],[390,844]]){
   await page.setViewportSize({width,height});
   for(const route of ['journal','files','audit','admin','patients/new','patients/1']){
    await page.goto(BASE+'/'+route);await page.locator('h1').waitFor();
    if(route==='audit')await page.getByRole('button',{name:'Подробнее о событии 1',exact:true}).waitFor();
    if(route==='admin')await page.getByRole('button',{name:'Редактировать manager',exact:true}).waitFor();
    if(route==='journal')await page.getByRole('button',{name:/^Открыть карточку /}).first().waitFor();
    if(route.startsWith('patients'))await page.locator('.clinical-control').first().waitFor();
    await geometry(page,route+'-'+width);
    if([1920,1024,390].includes(width))await snapshot(page,'review-'+route.replace('/','-')+'-'+width);
    // Longest selections must not make a filter or the entire page overflow.
    for(const select of await page.locator('select').all()){
     const option=await select.locator('option').evaluateAll(nodes=>nodes.map(n=>({value:n.value,label:n.textContent})).sort((a,b)=>b.label.length-a.label.length)[0]);
     if(option){await select.selectOption(option.value);await geometry(page,route+'-long-select-'+width);}
    }
   }
   await page.goto(BASE+'/admin');await page.getByRole('button',{name:'Редактировать manager',exact:true}).waitFor();await page.getByRole('button',{name:'Добавить пользователя',exact:true}).click();
   const dialog=page.getByRole('dialog');await dialog.getByLabel('Врач стационара',{exact:true}).check();await dialog.getByLabel('Врач амбулатории',{exact:true}).check();
   await geometry(page,'create-user-dialog-'+width);if([1920,1024,390].includes(width))await snapshot(page,'review-create-user-'+width);
   await dialog.getByRole('button',{name:'Создать',exact:true}).scrollIntoViewIfNeeded();const saveBox=await dialog.getByRole('button',{name:'Создать',exact:true}).boundingBox();assert(saveBox.y>=0&&saveBox.y+saveBox.height<=height,'Create user submit unreachable '+width);
   const closeButton=dialog.getByRole('button',{name:'Закрыть окно',exact:true});assert(await closeButton.evaluate(n=>{const box=n.getBoundingClientRect(),container=n.closest('[role=dialog]').getBoundingClientRect();return box.top>=container.top&&box.bottom<=container.bottom&&n.contains(document.elementFromPoint(box.x+box.width/2,box.y+box.height/2));}),'Close button scrolls away in tall dialog '+width);
   assert(await dialog.getByRole('heading',{name:'Добавить пользователя',exact:true}).evaluate(n=>{const box=n.getBoundingClientRect(),container=n.closest('[role=dialog]').getBoundingClientRect();return box.top>=container.top&&box.bottom<=container.bottom;}),'Account dialog title scrolls away '+width);
   if([1024,390].includes(width))await snapshot(page,'review-create-user-bottom-'+width);await closeDialog(page);
   await page.getByRole('button',{name:'Редактировать manager',exact:true}).click();await geometry(page,'edit-user-dialog-'+width);await closeDialog(page);
   await page.getByRole('button',{name:'Действия пользователя manager',exact:true}).click();await page.getByRole('menuitem',{name:'Сменить пароль',exact:true}).click();await geometry(page,'password-dialog-'+width);await closeDialog(page);
   await page.goto(BASE+'/journal');await page.getByLabel('Шифр пациента',{exact:true}).fill('NO-MATCH-VISUAL-REVIEW');await page.getByRole('status').filter({hasText:'Нет карточек для отображения'}).waitFor();await geometry(page,'empty-journal-'+width);
   await page.getByRole('button',{name:'Итоговая выгрузка',exact:true}).click();await geometry(page,'export-dialog-'+width);if([1024,390].includes(width))await snapshot(page,'review-export-'+width);await closeDialog(page);
   await page.goto(BASE+'/audit');await page.getByRole('button',{name:'Подробнее о событии 1',exact:true}).click();await geometry(page,'audit-detail-'+width);if([1024,390].includes(width))await snapshot(page,'review-audit-detail-'+width);await closeDialog(page);
   await page.goto(BASE+'/files');await page.getByRole('button',{name:'Загрузить файл',exact:true}).first().click();await geometry(page,'upload-dialog-'+width);await closeDialog(page);
   await page.getByRole('button',{name:'Создать папку',exact:true}).first().click();await geometry(page,'folder-dialog-'+width);await closeDialog(page);
  }
  assert(!errors.length,errors.join(';'));
  const report={status:issues.length?'FAIL':'PASS',checks,issues,errors};fs.writeFileSync(path.join(OUT,'visual-review.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({status:report.status,screens:checks.length,issues,errors}));if(issues.length)process.exitCode=1;
 }catch(error){await page.screenshot({path:path.join(OUT,'review-failure.png')});fs.writeFileSync(path.join(OUT,'visual-review.json'),JSON.stringify({status:'FAIL',checks,issues,errors,error:error.message},null,2));throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
