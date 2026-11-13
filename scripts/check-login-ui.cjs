const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE=process.env.PMI_BASE_URL,OUT=process.env.PMI_OUTPUT_DIR,checks=[],errors=[];
function assert(value,message){if(!value)throw Error(message);}
async function request(url,token,body,method='POST') {const response=await fetch(BASE+url,{method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},...(body?{body:JSON.stringify(body)}:{})});return {status:response.status,data:await response.json()};}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto(BASE+'/login');
  for(const width of [1920,1024,390]) {
   await page.setViewportSize({width,height:width===1024?768:1080});
   const form=page.locator('form'),box=await form.boundingBox();assert(Math.abs(box.x+box.width/2-width/2)<2,'Login not horizontally centered');assert(box.width<=400,'Login form too wide');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Login overflow');
   await page.getByRole('button',{name:'Тестовые учётные записи',exact:true}).evaluate(n=>n.style.display='none');const withoutDemo=await form.boundingBox();assert(Math.abs(box.y-withoutDemo.y)<1,'Demo block controls login layout');await page.getByRole('button',{name:'Тестовые учётные записи',exact:true,includeHidden:true}).evaluate(n=>n.style.display='');
   await page.screenshot({path:path.join(OUT,'login-'+width+'.png')});
  }
  await page.setViewportSize({width:1920,height:1080});await page.getByRole('button',{name:'Тестовые учётные записи',exact:true}).click();await page.getByRole('dialog').waitFor();await page.getByRole('button',{name:'Закрыть окно',exact:true}).click();
  const password=page.getByLabel('Пароль',{exact:true});await password.fill('Wrong123');await page.getByRole('button',{name:'Показать пароль',exact:true}).click();assert(await password.getAttribute('type')==='text','Show password failed');assert(await password.inputValue()==='Wrong123','Toggle lost password');await page.getByRole('button',{name:'Скрыть пароль',exact:true}).click();assert(await password.getAttribute('type')==='password','Hide password failed');
  await password.evaluate(n=>n.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'A',modifierCapsLock:true})));await page.getByText('Включён Caps Lock',{exact:true}).waitFor();await password.evaluate(n=>n.dispatchEvent(new KeyboardEvent('keyup',{bubbles:true,key:'a',modifierCapsLock:false})));await page.getByText('Включён Caps Lock',{exact:true}).waitFor({state:'hidden'});
  await page.getByLabel('Логин',{exact:true}).fill('manager');
  let submissions=0;await page.route('**/api/login',async route=>{submissions++;await new Promise(resolve=>setTimeout(resolve,350));await route.continue();});
  await page.getByRole('button',{name:'Войти в систему',exact:true}).click();await page.getByRole('button',{name:'Выполняется вход…',exact:true}).waitFor();assert(await page.getByRole('button',{name:'Выполняется вход…',exact:true}).isDisabled(),'Login pending not disabled');
  await page.getByRole('alert').waitFor();assert(await page.getByLabel('Логин',{exact:true}).inputValue()==='manager','Error cleared login');assert(submissions===1,'Duplicate submit');
  await page.unroute('**/api/login');await password.fill('Manager123');await password.press('Enter');await page.waitForURL('**/journal');
  checks.push('centered login with/without demo launcher on desktop/tablet/mobile, demo dialog, show/hide password, Caps Lock, pending state, retained login on error, Enter login');
  await page.goto(BASE+'/admin');await page.getByRole('button',{name:'Добавить пользователя',exact:true}).click();const dialog=page.getByRole('dialog');
  const newLogin='initial-roles-'+Date.now();await dialog.getByLabel('ФИО',{exact:true}).fill('Начальные роли');await dialog.getByLabel('Логин',{exact:true}).fill(newLogin);await dialog.getByLabel('Почта',{exact:true}).fill('initial@example.test');await dialog.getByLabel('Пароль',{exact:true}).fill('Initial123');await dialog.getByLabel('Повтор пароля',{exact:true}).fill('Initial123');
  await dialog.getByRole('button',{name:'Создать',exact:true}).click();await dialog.getByRole('alert').getByText('Назначьте хотя бы одну роль',{exact:true}).waitFor();
  await dialog.getByLabel('Врач стационара',{exact:true}).check();await dialog.getByLabel('Врач амбулатории',{exact:true}).check();await dialog.getByLabel('Рабочая роль',{exact:true}).selectOption('ambulatory');
  assert(await page.locator('select').evaluateAll(nodes=>nodes.every(n=>n.classList.contains('app-select'))),'Unstyled select');
  const style=await dialog.getByLabel('Рабочая роль',{exact:true}).evaluate(n=>({supported:CSS.supports('appearance','base-select'),appearance:getComputedStyle(n).appearance,radius:getComputedStyle(n,'::picker(select)').borderRadius}));assert(style.supported&&style.appearance==='base-select','Custom picker unsupported in test Chrome');assert(style.radius!=='0px','Picker not rounded');
  await dialog.getByLabel('Рабочая роль',{exact:true}).click();await page.getByRole('option',{name:'Врач стационара',exact:true}).click();assert(await dialog.getByLabel('Рабочая роль',{exact:true}).inputValue()==='stationary','Picker pointer selection failed');
  await dialog.getByLabel('Рабочая роль',{exact:true}).click();await page.getByRole('option',{name:'Врач амбулатории',exact:true}).click();
  await dialog.getByLabel('Рабочая роль',{exact:true}).click();await page.screenshot({path:path.join(OUT,'select-in-dialog.png')});await page.keyboard.press('Escape');
  const [createdResponse]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/users')&&r.request().method()==='POST'),dialog.getByRole('button',{name:'Создать',exact:true}).click()]);assert(createdResponse.ok(),'Create with roles failed');const created=await createdResponse.json();assert(created.role==='ambulatory'&&created.roles.length===2,'Initial roles/effective role incorrect');await dialog.waitFor({state:'hidden'});
  const row=page.locator('tbody tr').filter({hasText:newLogin});assert(await row.getByRole('checkbox',{name:'Начальные роли, Врач стационара',exact:true}).isChecked(),'Initial stationary checkbox absent');assert(await row.getByRole('checkbox',{name:'Начальные роли, Врач амбулатории',exact:true}).isChecked(),'Initial ambulatory checkbox absent');
  const newSession=await request('/api/login',null,{login:newLogin,password:'Initial123'});assert(newSession.status===200,'Created account not immediately usable');
  checks.push('creation requires a role; multiple roles and effective role saved atomically, table checkboxes and immediate login verified; styled picker works inside modal');
  const manager=await request('/api/login',null,{login:'manager',password:'Manager123'}),token=manager.data.token;
  const prefix='invalid-role-'+Date.now();
  for(const [suffix,roles,role] of [['empty',[], ''],['unknown',['administrator'],'administrator'],['main',['stationary','ambulatory'],'leader']]) {const result=await request('/api/users',token,{name:'Invalid',login:prefix+suffix,email:'invalid@example.test',password:'Invalid123',passwordRepeat:'Invalid123',roles,role});assert(result.status===400,'Invalid roles accepted '+suffix);}
  const users=await request('/api/users',token,null,'GET');assert(!users.data.some(u=>u.login.startsWith(prefix)),'Invalid creation left account');
  const doctor=await request('/api/login',null,{login:'stationary_doctor',password:'Doctor123'});assert((await request('/api/users',doctor.data.token,{name:'Forbidden',email:'invalid@example.test',login:'forbidden-'+Date.now(),password:'Invalid123',passwordRepeat:'Invalid123',roles:['leader']})).status===403,'Doctor may create privileged user');
  checks.push('API rejects empty/unknown roles and unassigned effective role without partial account creation; doctor cannot create users');
  await page.getByLabel('Назначенная роль',{exact:true}).selectOption('ambulatory');await row.waitFor();await page.getByLabel('Статус',{exact:true}).selectOption('active');await row.waitFor();await page.getByRole('button',{name:'Сбросить фильтры',exact:true}).click();
  await page.goto(BASE+'/journal');await page.getByLabel('Группа / центр',{exact:true}).selectOption({label:'Все центры'});
  await page.goto(BASE+'/audit');await page.getByLabel('Роль',{exact:true}).selectOption('all');
  await page.goto(BASE+'/files');await page.getByRole('button',{name:'Создать папку',exact:true}).first().click();await dialog.getByLabel('Имя новой папки',{exact:true}).fill('Очень длинное название папки из нескольких отдельных слов');await dialog.getByRole('button',{name:'Создать папку',exact:true}).click();await dialog.waitFor({state:'hidden'});
  for(const width of [1920,1024,390]) {await page.setViewportSize({width,height:width===1024?768:1080});if(width<1024)await page.getByRole('button',{name:'Папки',exact:true}).click();const nav=page.getByRole('navigation',{name:'Папки хранилища',exact:true});const box=await nav.boundingBox();if(width>=1024)assert(box.width>=300,'Folder pane still narrow');assert(await nav.locator('.folder-name').evaluateAll(nodes=>nodes.every(n=>getComputedStyle(n).wordBreak==='normal'&&getComputedStyle(n).overflowWrap==='normal')),'Folder names split inside words');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Folder page overflow');await page.screenshot({path:path.join(OUT,'folder-width-'+width+'.png')});}
  checks.push('styled selects retain admin/journal/audit filters; wider folder tree and word-only wrapping at desktop/tablet/mobile');
  assert(!errors.length,errors.join(';'));fs.writeFileSync(path.join(OUT,'login-ui.json'),JSON.stringify({status:'PASS',checks,errors},null,2));console.log(JSON.stringify({status:'PASS',checks,errors}));
 }catch(error){await page.screenshot({path:path.join(OUT,'login-failure.png')});fs.writeFileSync(path.join(OUT,'login-ui.json'),JSON.stringify({status:'FAIL',checks,errors,error:error.message},null,2));throw error;}finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
