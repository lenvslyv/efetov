const fs=require('node:fs'),path=require('node:path');
const {chromium}=require('C:/Users/Admin/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const BASE=process.env.PMI_BASE_URL,OUT=process.env.PMI_OUTPUT_DIR;
const checks=[];function assert(value,message){if(!value)throw Error(message);}
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:1920,height:1080}}),page=await context.newPage();page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 try {
  await page.goto(BASE+'/login');await page.getByLabel('Логин',{exact:true}).fill('manager');await page.getByLabel('Пароль',{exact:true}).fill('Manager123');
  await page.getByRole('button',{name:'Войти в систему',exact:true}).click();await page.waitForURL('**/journal');
  await page.goto(BASE+'/patients/new');await page.getByLabel('Адрес',{exact:true}).waitFor();
  assert(await page.getByLabel('Социальный статус',{exact:true}).count()===1,'Social status missing');
  assert(!(await page.locator('.clinical-hint').allTextContents()).some(t=>/^\s*позиция\s/i.test(t)),'Technical hints remain in creation');
  for(const width of [1920,1280,1024,768,390]) {
   await page.setViewportSize({width,height:1080});
   let fieldCount=0;
   for(let section=1;section<=10;section++){
   await page.getByLabel('Разделы карточки пациента',{exact:true}).getByRole('button').nth(section-1).click();
   const geometry=await page.locator('.clinical-grid').evaluateAll(grids=>({
    overflow:document.documentElement.scrollWidth>innerWidth+1,
    fields:grids.flatMap(grid=>[...grid.querySelectorAll('.clinical-field')].map(field=>{
     const c=field.querySelector('.clinical-control').getBoundingClientRect(),l=field.querySelector('.clinical-label').getBoundingClientRect();
     return {label:field.querySelector('label').textContent,width:c.width,gap:c.top-l.bottom,compact:field.classList.contains('clinical-field-compact'),left:c.left,right:c.right};
    }))
   }));
   assert(!geometry.overflow,'Page overflow '+width);
   assert(geometry.fields.every(f=>f.left>=0&&f.right<=width+1),'Control outside viewport '+width);
   assert(geometry.fields.every(f=>f.gap>=-1&&f.gap<=5),'Label too far from control '+width+' '+JSON.stringify(geometry.fields.filter(f=>f.gap< -1||f.gap>5)));
   assert(geometry.fields.filter(f=>f.compact).every(f=>f.width<=193),'Compact control too wide '+width);
   if(width>=768&&section===2){
    const rows=await Promise.all(['Рост','Вес','ИМТ (вычисляемый параметр)','Ожирение (степень)'].map(name=>page.getByLabel(name,{exact:true}).boundingBox()));
    assert(rows.every(r=>Math.abs(r.y-rows[0].y)<2),'Section 2 not on one line at '+width);
   }
   fieldCount+=geometry.fields.length;
   }
   checks.push({case:'creation layout across ten tabs',width,fields:fieldCount});
  }
  await page.setViewportSize({width:1920,height:1080});
  await page.getByLabel('Разделы карточки пациента',{exact:true}).getByRole('button').first().click();
  await page.getByLabel('Адрес',{exact:true}).fill('Москва, Тестовая улица, 10');await page.getByLabel('Социальный статус',{exact:true}).fill('Работает');
  const [response]=await Promise.all([page.waitForResponse(r=>r.url().endsWith('/api/patients')&&r.request().method()==='POST'),page.getByRole('button',{name:'Сохранить карточку',exact:true}).click()]);
  assert(response.ok(),'Create failed');const card=await response.json();await page.waitForURL('**/patients/'+card.id);await page.reload();
  await page.getByLabel('Адрес',{exact:true}).waitFor();assert(await page.getByLabel('Адрес',{exact:true}).inputValue()==='Москва, Тестовая улица, 10','Address lost');assert(await page.getByLabel('Социальный статус',{exact:true}).inputValue()==='Работает','Social status lost');
  await page.getByLabel('Социальный статус',{exact:true}).fill('Пенсионер');await page.getByRole('button',{name:'Сохранить',exact:true}).click();await page.getByText('Изменения сохранены в карточке пациента',{exact:true}).waitFor();await page.reload();await page.getByLabel('Социальный статус',{exact:true}).waitFor();assert(await page.getByLabel('Социальный статус',{exact:true}).inputValue()==='Пенсионер','Edit social status lost');assert(await page.getByLabel('Адрес',{exact:true}).inputValue()==='Москва, Тестовая улица, 10','Edit social changed address');
  checks.push({case:'independent address and social status survive creation, edit, reload'});
  for(const width of [1920,1024,390]){
   await page.setViewportSize({width,height:1080});
   for(let section=0;section<15;section++){
    await page.getByLabel('Разделы карточки пациента',{exact:true}).getByRole('button').nth(section).click();
    assert(!(await page.locator('.clinical-hint').allTextContents()).some(t=>/^\s*позиция\s/i.test(t)),'Technical hint in section '+(section+1));
    assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Section overflow '+(section+1)+' at '+width);
   }
   checks.push({case:'all 15 editing sections: no overflow or position hints',width});
  }
  await page.setViewportSize({width:1920,height:1080});await page.getByLabel('Разделы карточки пациента',{exact:true}).getByRole('button').nth(1).click();await page.screenshot({path:path.join(OUT,'section2-desktop.png')});
  assert(errors.length===0,errors.join(';'));console.log(JSON.stringify({status:'PASS',checks,errors}));fs.writeFileSync(path.join(OUT,'field-layout.json'),JSON.stringify({status:'PASS',checks,errors},null,2));
 }catch(error){await page.screenshot({path:path.join(OUT,'field-failure.png')});console.error(error);throw error;}
 finally{await browser.close();}
})().catch(()=>process.exitCode=1);
