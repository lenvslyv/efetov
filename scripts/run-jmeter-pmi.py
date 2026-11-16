"""Isolated, reproducible JMeter PMI run. Never writes the source database."""
import argparse, csv, hashlib, json, os, platform, secrets, shutil, socket, sqlite3, subprocess, sys, time
from pathlib import Path
from datetime import datetime, timezone
from xml.etree import ElementTree as E
import httpx

ROOT=Path(__file__).resolve().parents[1]
JAVA=Path('C:/Program Files/Java/jdk-21.0.12.1/bin/java.exe')
JMETER=Path('C:/SECHENOV/tools/apache-jmeter-5.6.3/bin/ApacheJMeter.jar')
HTTP_PROPERTIES = {
    'language': 'en',
    # Retire idle client connections before Uvicorn's default 5 second timeout.
    # Keep the original server timeout and think times for comparability.
    'httpclient4.idletimeout': '4000',
    'httpclient4.validate_after_inactivity': '1000',
    'httpclient4.retrycount': '0',
    'httpclient4.request_sent_retry_enabled': 'false',
}
def stamp(): return datetime.now(timezone.utc).isoformat()
def prop(parent,name,value,kind='stringProp'):
    e=E.SubElement(parent,kind,name=name);e.text=str(value);return e
def element(tree,tag,name,gui=None):
    e=E.SubElement(tree,tag,guiclass=gui or tag+'Gui',testclass=tag,testname=name,enabled='true')
    return e,E.SubElement(tree,'hashTree')
def script(tree,name,code,tag='JSR223Assertion'):
    e,h=element(tree,tag,name,'TestBeanGUI')
    for k,v in {'scriptLanguage':'groovy','cacheKey':'true','script':code,'parameters':'','filename':''}.items():prop(e,k,v)
    return h
def request(tree,name,method,path,body=None,assertion=None):
    e,h=element(tree,'HTTPSamplerProxy',name,'HttpTestSampleGui')
    a=E.SubElement(e,'elementProp',name='HTTPsampler.Arguments',elementType='Arguments');c=E.SubElement(a,'collectionProp',name='Arguments.arguments')
    if body is not None:
        b=E.SubElement(c,'elementProp',name='',elementType='HTTPArgument');prop(b,'HTTPArgument.always_encode','false','boolProp');prop(b,'Argument.value',body);prop(b,'Argument.metadata','=')
    for k,v in {'HTTPSampler.implementation':'HttpClient4','HTTPSampler.domain':'127.0.0.1','HTTPSampler.port':'${__P(port,8001)}','HTTPSampler.protocol':'http','HTTPSampler.path':path,'HTTPSampler.method':method,'HTTPSampler.contentEncoding':'UTF-8','HTTPSampler.connect_timeout':'10000','HTTPSampler.response_timeout':'65000'}.items():prop(e,k,v)
    for k,v in {'HTTPSampler.postBodyRaw':body is not None,'HTTPSampler.follow_redirects':False,'HTTPSampler.auto_redirects':False,'HTTPSampler.use_keepalive':True}.items():prop(e,k,str(v).lower(),'boolProp')
    script(h,'HTTP and business assertions',"if(prev.getResponseCode() != '200') { AssertionResult.setFailure(true); AssertionResult.setFailureMessage('Expected HTTP 200; actual '+prev.getResponseCode()); return }\n"+(assertion or ''))
    return h
def plan(out):
    root=E.Element('jmeterTestPlan',version='1.2',properties='5.0',jmeter='5.6.3');tree=E.SubElement(root,'hashTree')
    p,t=element(tree,'TestPlan','PMI 4.8 twenty independent users','TestPlanGui');prop(p,'TestPlan.serialize_threadgroups','false','boolProp')
    heads,hh=element(t,'HeaderManager','JSON and per-user JWT','HeaderPanel');coll=E.SubElement(heads,'collectionProp',name='HeaderManager.headers')
    for name,value in [('Content-Type','application/json'),('Authorization','Bearer ${token}')]:
        x=E.SubElement(coll,'elementProp',name='',elementType='Header');prop(x,'Header.name',name);prop(x,'Header.value',value)
    for group,count,offset in [('read',10,0),('write',8,10),('export',2,18)]:
        g,gt=element(t,'ThreadGroup',group,'ThreadGroupGui')
        prop(g,'ThreadGroup.on_sample_error','continue')
        lp=E.SubElement(g,'elementProp',name='ThreadGroup.main_controller',elementType='LoopController',guiclass='LoopControlPanel',testclass='LoopController',enabled='true');prop(lp,'LoopController.continue_forever','false','boolProp');prop(lp,'LoopController.loops','1')
        for k,v in {'ThreadGroup.num_threads':count,'ThreadGroup.ramp_time':'${__P(ramp,60)}','ThreadGroup.duration':'${__P(watchdog,1080)}','ThreadGroup.delay':'0'}.items():prop(g,k,v)
        prop(g,'ThreadGroup.scheduler','true','boolProp')
        once,ot=element(gt,'OnceOnlyController','Independent login once','OnceOnlyControllerGui')
        script(ot,'Load private account',f"def a=new groovy.json.JsonSlurper().parse(new File(props.get('accounts')))[ctx.getThreadNum()+{offset}]; a.each{{k,v -> vars.put(k,v.toString())}}",'JSR223Sampler')
        request(ot,'Login','POST','/api/login','{"login":"${login}","password":"${password}"}',"def j=new groovy.json.JsonSlurper().parseText(prev.getResponseDataAsString()); if(!j.token) { AssertionResult.setFailure(true); AssertionResult.setFailureMessage('Missing JWT') } else vars.put('token',j.token.toString())")
        script(gt,'Wait for all 20 authenticated users', '''
if (!vars.get('token')) throw new IllegalStateException('Cannot start plateau without JWT')
def barrier
synchronized(props) {
    barrier = props.get('pmi_ready_barrier')
    if (barrier == null) {
        barrier = new java.util.concurrent.CyclicBarrier(20, {
            long start = System.currentTimeMillis()
            props.put('pmi_plateau_start_ms', Long.toString(start))
            props.put('pmi_plateau_end_ms', Long.toString(start + Long.parseLong(props.getProperty('hold', '900')) * 1000L))
            log.info('PMI_PLATEAU_START ' + start)
        } as Runnable)
        props.put('pmi_ready_barrier', barrier)
    }
}
barrier.await(120, java.util.concurrent.TimeUnit.SECONDS)
vars.put('plateau_end_ms', props.getProperty('pmi_plateau_end_ms'))
''','JSR223Sampler')
        group_tree=gt
        loop,work=element(gt,'WhileController','Full load until common plateau end','WhileControllerGui')
        prop(loop,'WhileController.condition',"${__groovy(System.currentTimeMillis() < Long.parseLong(vars.get('plateau_end_ms')))}")
        # Finish each started business iteration, including Unlock, before stopping.
        gt=work
        request(gt,'Session touch','POST','/api/session/touch','{}')
        if group!='export':
            h=request(gt,'Journal','GET','/api/runtime?include_audit=false&include_files=false',assertion="def j=new groovy.json.JsonSlurper().parseText(prev.getResponseDataAsString()); if(j.patients.size()!=88) { AssertionResult.setFailure(true); AssertionResult.setFailureMessage('Expected 88 patients') }")
            timer,th=element(h,'UniformRandomTimer','Think time 2 to 5 seconds','UniformRandomTimerGui');prop(timer,'ConstantTimer.delay','2000');prop(timer,'RandomTimer.range','3000')
        if group=='write':
            request(gt,'Lock','POST','/api/patients/${patient_id}/lock','{}')
            script(gt,'Unique write marker',"vars.put('marker','JMETER-'+vars.get('login')+'-'+System.nanoTime())",'JSR223Sampler')
            request(gt,'Save','PUT','/api/patients/${patient_id}/sections','{"sections":{"${section}":{"${field}":"${marker}"}}}',"def j=new groovy.json.JsonSlurper().parseText(prev.getResponseDataAsString()); def fields=j.blocks.values().flatten(); if(!fields.any{it.key==vars.get('field') && it.value==vars.get('marker')}) {AssertionResult.setFailure(true);AssertionResult.setFailureMessage('Save response missing marker')}")
            request(gt,'Verify persisted','GET','/api/runtime?include_audit=false&include_files=false',assertion="def j=new groovy.json.JsonSlurper().parseText(prev.getResponseDataAsString()); def p=j.patients.find{it.id.toString()==vars.get('patient_id')}; if(!p || !p.blocks.values().flatten().any{it.key==vars.get('field') && it.value==vars.get('marker')}) {AssertionResult.setFailure(true);AssertionResult.setFailureMessage('Read-after-write mismatch')}")
            request(gt,'Unlock','POST','/api/patients/${patient_id}/unlock','{}')
        if group=='export':
            h=request(gt,'Excel export','GET','/api/export/final.xlsx',assertion="if(prev.getTime()>60000 || prev.getResponseData().length<100 || prev.getResponseData()[0]!=80 || prev.getResponseData()[1]!=75) {AssertionResult.setFailure(true);AssertionResult.setFailureMessage('Invalid Excel or download over 60 seconds')}")
            timer,th=element(h,'ConstantTimer','Export pause 30 seconds','ConstantTimerGui');prop(timer,'ConstantTimer.delay','30000')
        # The completion marker is outside the WhileController.
        script(group_tree,'Plateau participant completed',"log.info('PMI_PARTICIPANT_END ' + ctx.getThread().getThreadName() + ' ' + System.currentTimeMillis())",'JSR223Sampler')
    E.indent(root);E.ElementTree(root).write(out/'pmi-load.jmx',encoding='utf-8',xml_declaration=True)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--duration',type=int,default=960,help='Ramp plus target full-load duration; excludes graceful completion');ap.add_argument('--ramp',type=int,default=60);ap.add_argument('--port',type=int,default=8001);a=ap.parse_args()
    if a.ramp < 0 or a.duration <= a.ramp:ap.error('--duration must exceed the nonnegative --ramp')
    hold=a.duration-a.ramp
    out=ROOT/'.cache'/('jmeter-pmi-'+time.strftime('%Y%m%d-%H%M%S'));out.mkdir(parents=True)
    print('OUTPUT '+str(out),flush=True)
    with socket.socket() as s:s.bind(('127.0.0.1',a.port))
    source=ROOT/'.cache/pmi-20261112/data/efetov.db'
    source_hash=hashlib.sha256(source.read_bytes()).hexdigest()
    with sqlite3.connect('file:'+source.as_posix()+'?mode=ro',uri=True) as src,sqlite3.connect(out/'efetov.db') as dst:src.backup(dst)
    env={**os.environ,'EFETOV_DATA_DIR':str(out),'EFETOV_DB_PATH':str(out/'efetov.db'),'EFETOV_JWT_SECRET':secrets.token_hex(32),'EFETOV_CORS_ORIGINS':f'http://127.0.0.1:{a.port}'}
    os.environ.update({k:v for k,v in env.items() if k.startswith('EFETOV_')})
    sys.path.insert(0,str(ROOT/'backend'))
    from app.database import SessionLocal
    from app.models import User,Patient
    from app.security import hash_password
    fields=json.loads((ROOT/'src/entities/crf/catalog.json').read_text(encoding='utf8'))['fields']
    accounts=[]
    with SessionLocal() as db:
        patients=db.query(Patient).order_by(Patient.id).all();assert len(patients)==88
        for p in patients:p.lock_user_id=None
        for i in range(20):
            role=('stationary' if i%2==0 else 'ambulatory') if i<18 else 'leader'
            login=f'jmeter_{i+1:02d}';password=secrets.token_hex(10)+'Aa1';uid='JMETER-'+str(i+1)
            db.add(User(id=uid,login=login,password_hash=hash_password(password),role=role,name=f'JMeter user {i+1}',assigned_roles=json.dumps([role]),blocked=0))
            section=1 if role!='ambulatory' else 11
            field=next(f['key'] for f in fields if f['section']==section and not f.get('computedFrom') and f.get('type','text')=='text')
            p=patients[i]
            if 10<=i<18 and role=='stationary':p.created_by=uid
            accounts.append(dict(login=login,password=password,role=role,patient_id=p.id,section=section,field=field))
        db.commit()
    (out/'accounts.private.json').write_text(json.dumps(accounts),encoding='utf8')
    plan(out)
    (out/'log4j2.xml').write_text('''<?xml version="1.0"?><Configuration status="ERROR"><Appenders><File name="file" fileName="${sys:jmeter.logfile}"><PatternLayout pattern="%d %p %c %m%n"/></File></Appenders><Loggers><Root level="info"><AppenderRef ref="file"/></Root></Loggers></Configuration>''',encoding='utf8')
    manifest={'started_utc':stamp(),'port':a.port,'duration_s':a.duration,'ramp_s':a.ramp,'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'source_db':str(source),'source_sha256':source_hash,'patients':88,'users':20,'groups':{'read':10,'write':8,'export':2},'platform':platform.platform(),'cpu_count':os.cpu_count(),'python':sys.version,'jdk':str(JAVA),'jmeter':str(JMETER),'source_worktree_status':subprocess.check_output(['git','status','--short'],cwd=ROOT,text=True),'java_version':subprocess.check_output([str(JAVA),'-version'],stderr=subprocess.STDOUT,text=True),'accounts':[ {k:v for k,v in u.items() if k!='password'} for u in accounts]}
    manifest.update(scenario_version=2,full_load_target_s=hold,graceful_completion_s=120,http_properties=HTTP_PROPERTIES,script_sha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest())
    (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
    log=(out/'server.log').open('w',encoding='utf8');server=subprocess.Popen([sys.executable,'-m','uvicorn','app.main:app','--app-dir','backend','--host','127.0.0.1','--port',str(a.port)],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
    try:
        with httpx.Client(trust_env=False,timeout=2) as c:
            for _ in range(80):
                if server.poll() is not None:raise RuntimeError('Server exited')
                try:
                    if c.get(f'http://127.0.0.1:{a.port}/api/health').status_code==200:break
                except httpx.HTTPError:pass
                time.sleep(.25)
            else:raise RuntimeError('Server not ready')
        command=[str(JAVA),'-Xms256m','-Xmx1g','-Djava.awt.headless=true','-jar',str(JMETER),'-n','-t',str(out/'pmi-load.jmx'),'-l',str(out/'results.jtl'),'-j',str(out/'jmeter.log'),'-i',str(out/'log4j2.xml'),'-Jaccounts='+str(out/'accounts.private.json'),'-Jport='+str(a.port),'-Jduration='+str(a.duration),'-Jramp='+str(a.ramp),'-Jsummariser.interval=30','-e','-o',str(out/'dashboard')]
        command += ['-Jhold='+str(hold), '-Jwatchdog='+str(a.duration+120)]
        command += ['-J'+key+'='+value for key,value in HTTP_PROPERTIES.items()]
        manifest['jmeter_started_utc']=stamp();manifest['server_pid']=server.pid
        (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
        with (out/'console.log').open('w',encoding='utf8') as console:
            process=subprocess.Popen(command,cwd=ROOT,env=env,stdout=console,stderr=subprocess.STDOUT)
            manifest['jmeter_pid']=process.pid
            (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
            while process.poll() is None:
                time.sleep(1)
        manifest['jmeter_exit_code']=process.returncode;manifest['finished_utc']=stamp()
        with SessionLocal() as db:
            manifest['remaining_locks']=[p.id for p in db.query(Patient).all() if p.lock_user_id]
            manifest['final_patient_count']=db.query(Patient).count()
        manifest['source_unchanged']=hashlib.sha256(source.read_bytes()).hexdigest()==source_hash
        rows=list(csv.DictReader((out/'results.jtl').open(encoding='utf-8-sig'))) if (out/'results.jtl').exists() else []
        http_rows=[row for row in rows if row.get('URL','').startswith('http')]
        failures=[row for row in rows if row.get('success')!='true']
        ends=[row for row in rows if row.get('label')=='Plateau participant completed' and row.get('success')=='true']
        barrier_ends=[int(row['timeStamp'])+int(row['elapsed']) for row in rows if row.get('label')=='Wait for all 20 authenticated users' and row.get('success')=='true']
        manifest['http_requests']=len(http_rows);manifest['failed_samples']=len(failures)
        manifest['completed_participants']=len(ends)
        manifest['full_load_observed_s']=(min(int(row['timeStamp']) for row in ends)-max(barrier_ends))/1000 if len(ends)==20 and len(barrier_ends)==20 else None
        manifest['acceptance_checks']={
            'jmeter_completed':process.returncode==0,
            'no_failed_samples':bool(http_rows) and not failures,
            'all_participants_completed':len(ends)==20,
            'full_load_duration_met':manifest['full_load_observed_s'] is not None and manifest['full_load_observed_s']>=hold-0.1,
            'no_remaining_locks':not manifest['remaining_locks'],
            'patient_count_preserved':manifest['final_patient_count']==88,
            'source_unchanged':manifest['source_unchanged'],
        }
        exit_code=process.returncode or (0 if all(manifest['acceptance_checks'].values()) else 2)
        (out/'manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2),encoding='utf8')
        print('FINISHED '+str(exit_code)+' '+str(out),flush=True)
        return exit_code
    finally:
        server.terminate()
        try:server.wait(timeout=5)
        except subprocess.TimeoutExpired:server.kill();server.wait()
        log.close()
if __name__=='__main__':sys.exit(main())
