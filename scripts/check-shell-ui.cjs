const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE=process.env.PMI_BASE_URL,OUT=process.env.PMI_OUTPUT_DIR,checks=[],errors=[];
function assert(value,message){if(!value)throw Error(message);}
async function login(page){await page.goto(BASE+'/login');await page.getByLabel('Логин',{exact:true}).fill('manager');await page.getByLabel('Пароль',{exact:true}).fill('Manager123');await page.getByRole('button',{name:'Войти в систему',exact:true}).click();await page.waitForURL('**/journal');}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(BASE+'/login');const logo=page.getByRole('img',{name:'Сеченовский университет — дерево и ДНК',exact:true});await logo.waitFor();assert(await logo.evaluate(n=>n.complete&&n.naturalWidth>0),'Official logo failed to load');assert(await logo.getAttribute('src')==='/brand/sechenov-tree.svg','Logo is externally hosted');
  assert(await page.locator('.login-surface').evaluate(n=>getComputedStyle(n).backgroundImage.includes('radial-gradient')),'Login gradient absent');
  for(const width of [1920,1024,390]){await page.setViewportSize({width,height:width===1024?768:1080});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Login horizontal overflow');await page.screenshot({path:path.join(OUT,'login-brand-'+width+'.png')});}
  checks.push('official local logo loads, proportions retained, static gradient/texture and responsive login');
  await page.setViewportSize({width:1920,height:1080});await login(page);await page.locator('tbody tr').first().waitFor();
  assert(await page.locator('.journal-table th,.journal-table td').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).boxShadow==='none')),'Column shadow remains');
  await page.getByRole('button',{name:'Свернуть меню',exact:true}).click();assert(await page.locator('#desktop-sidebar').evaluate(n=>Math.round(n.getBoundingClientRect().width))===80,'Sidebar not collapsed');assert(await page.getByRole('navigation',{name:'Основная навигация',exact:true}).getByRole('link',{name:'Файловое хранилище',exact:true}).getAttribute('title')==='Файловое хранилище','Collapsed icon tooltip absent');
  await page.reload();await page.getByRole('button',{name:'Развернуть меню',exact:true}).waitFor();assert(await page.locator('#desktop-sidebar').evaluate(n=>Math.round(n.getBoundingClientRect().width))===80,'Collapse preference not restored');
  await page.goto(BASE+'/patients/new');await page.getByLabel('Адрес',{exact:true}).waitFor();assert(Math.abs((await page.locator('.patient-form-actions').boundingBox()).x-80)<1,'Footer does not follow collapsed sidebar');
  await page.getByRole('button',{name:'Развернуть меню',exact:true}).click();assert(Math.abs((await page.locator('.patient-form-actions').boundingBox()).x-256)<1,'Footer does not follow expanded sidebar');
  checks.push('journal column shadows removed; desktop sidebar collapse/expand, accessible icons, persisted preference; patient footer follows both widths');
  await page.goto(BASE+'/files');await page.getByRole('button',{name:'Загрузить файл',exact:true}).first().waitFor();
  for(const width of [2560,1920,1024]) {
   await page.setViewportSize({width,height:width===1024?768:1080});
   const geometry=await page.locator('.files-explorer').evaluate(n=>{const r=n.getBoundingClientRect();return {x:r.x,right:r.right,bottom:r.bottom,height:r.height,pane:document.querySelector('.workspace-files').getBoundingClientRect().width,tree:document.querySelector('.files-folders').getBoundingClientRect().width};});
   assert(width-geometry.right<=34,'File explorer right margin too wide '+width);assert(Math.abs((width===1024?768:1080)-geometry.bottom)<=34,'File explorer does not fill vertical area '+JSON.stringify(geometry));assert(geometry.pane>width-(width>=1280?260:4)-4,'Workspace retains width cap');assert(geometry.tree>=300&&geometry.tree<=321,'Tree width changed');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'File explorer page overflow');
   await page.screenshot({path:path.join(OUT,'explorer-'+width+'.png')});
  }
  await page.setViewportSize({width:1920,height:1080});
  const independent=await page.evaluate(()=>{const tree=document.querySelector('.files-folders'),content=document.querySelector('.files-content');const filler=document.createElement('div');filler.style.height='2000px';tree.append(filler);tree.scrollTop=300;const result=tree.scrollTop>0&&content.scrollTop===0;filler.remove();tree.scrollTop=0;return result;});assert(independent,'Folder pane cannot scroll independently');
  checks.push('file explorer fills available width/height at 2560/1920/1024, bounded tree width and independent folder/content scrolling');
  await page.setViewportSize({width:1024,height:768});await page.getByRole('button',{name:'Меню',exact:true}).click();let drawer=page.getByRole('dialog',{name:'Навигация',exact:true});await drawer.waitFor();const drawerBox=await drawer.boundingBox();assert(drawerBox.x===0&&drawerBox.width<=321&&drawerBox.height===768,'Tablet menu is not a side drawer');await drawer.getByRole('link',{name:'Общий журнал пациентов',exact:true}).click();await page.waitForURL('**/journal');assert(await drawer.count()===0,'Tablet menu did not close on navigation');
  await page.getByRole('button',{name:'Меню',exact:true}).click();await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();assert(await drawer.count()===0,'Explicit drawer close failed');
  await page.getByRole('button',{name:'Меню',exact:true}).click();await drawer.getByRole('link',{name:'Файловое хранилище',exact:true}).click();await page.waitForURL('**/files');
  await page.setViewportSize({width:390,height:844});await page.getByRole('button',{name:'Папки',exact:true}).click();await page.getByRole('navigation',{name:'Папки хранилища',exact:true}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Mobile folder overlay causes overflow');await page.screenshot({path:path.join(OUT,'mobile-folders.png')});
  await page.getByRole('navigation',{name:'Папки хранилища',exact:true}).getByRole('button',{name:'Корень хранилища',exact:true}).click();assert(!await page.getByRole('navigation',{name:'Папки хранилища',exact:true}).isVisible(),'Folder overlay does not close on selection');
  await page.getByRole('button',{name:'Меню',exact:true}).click();await page.setViewportSize({width:1920,height:1080});await page.getByRole('dialog',{name:'Навигация',exact:true}).waitFor({state:'hidden'});
  checks.push('tablet drawer navigation and explicit close, responsive transition to desktop, mobile folders overlay and selection');
  assert(!errors.length,errors.join(';'));fs.writeFileSync(path.join(OUT,'shell-ui.json'),JSON.stringify({status:'PASS',checks,errors},null,2));console.log(JSON.stringify({status:'PASS',checks,errors}));
 }catch(error){await page.screenshot({path:path.join(OUT,'shell-failure.png')});fs.writeFileSync(path.join(OUT,'shell-ui.json'),JSON.stringify({status:'FAIL',checks,errors,error:error.message},null,2));throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
