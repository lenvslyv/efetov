"""PMI checks against the explicitly isolated localhost:8001 test environment."""
import concurrent.futures
import io
import json
import os
import statistics
import sys
import threading
import time
import traceback
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from xml.etree import ElementTree as ET
import httpx

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get('PMI_OUTPUT_DIR', ROOT / '.cache' / 'pmi-20261112'))
OUT.mkdir(parents=True, exist_ok=True)
BASE = os.environ.get('PMI_BASE_URL', 'http://127.0.0.1:8001')
client = httpx.Client(base_url=BASE, trust_env=False, timeout=45)
results = []
ONLY_LOAD = '--only-load' in sys.argv
catalog = json.loads((ROOT / 'src/entities/crf/catalog.json').read_text(encoding='utf8'))['fields']
keys = {i: next(field['key'] for field in catalog if field['section'] == i and not field.get('computedFrom')) for i in range(1, 16)}

def request(method, path, token=None, **kwargs):
    headers = kwargs.pop('headers', {})
    if token: headers['Authorization'] = 'Bearer ' + token
    return client.request(method, path, headers=headers, **kwargs)

def ok(response, status=200):
    assert response.status_code == status, f'HTTP {response.status_code}, expected {status}: {response.text[:240]}'
    return response

def login(name, password):
    return ok(request('POST', '/api/login', json={'login': name, 'password': password})).json()

def snapshot(token): return ok(request('GET', '/api/runtime', token)).json()
def save(token, pid, section, value):
    return request('PUT', f'/api/patients/{pid}/sections', token, json={'sections': {str(section): {keys[section]: value}}})
def record(number, status, evidence):
    if ONLY_LOAD and number != '4.8.2': return
    row = {'pmi': number, 'status': status, 'evidence': evidence}
    results.append(row)
    (OUT / ('api-load-recheck.json' if ONLY_LOAD else 'api-results.json')).write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding='utf8')
    print(f'{number}: {status}', flush=True)
def run(number, fn):
    if ONLY_LOAD and number != '4.8.2': return
    try:
        result = fn()
        record(number, result.pop('status', 'PASS'), result)
    except Exception as error:
        record(number, 'FAIL', {'error': str(error), 'traceback': traceback.format_exc()})

def rows_xlsx(content):
    with zipfile.ZipFile(io.BytesIO(content)) as book:
        root = ET.fromstring(book.read('xl/worksheets/sheet1.xml'))
        ns = {'m':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        rows = [row for row in root.findall('.//m:sheetData/m:row', ns) if int(row.get('r')) >= 3 and row.findall('m:c', ns)]
        return rows, book.read('xl/styles.xml')

ok(client.get('/api/health'))
manager = login('manager', 'Manager123')
stationary = login('stationary_doctor', 'Doctor123')
ambulatory = login('ambulatory_doctor', 'Doctor123')
other = login('stationary_doctor_2', 'Doctor123')
M, S, A, B = [item['token'] for item in (manager, stationary, ambulatory, other)]
data = snapshot(M)
assert len(data['patients']) <= 88, 'Isolated database already contains more than 88 patients; inspect before rerunning'
for index in range(88 - len(data['patients'])):
    ok(request('POST', '/api/patients', M, json={'center':'Сеченовский университет', 'values':{keys[1]:f'ПМИ синтетический пациент {index+1:03d}'}}))
data = snapshot(M)
ids = [row['id'] for row in data['patients']]
for pid in ids:
    ok(request('POST', f'/api/patients/{pid}/unlock', M))
target = ids[-1]
(OUT / 'fixture.json').write_text(json.dumps({'base': BASE, 'patients': len(ids), 'target': target, 'stationaryUser': stationary['user']['id'], 'ambulatoryUser': ambulatory['user']['id'], 'catalogFields': len(catalog)}, indent=2), encoding='utf8')

run('4.1.1', lambda: {'roles_authenticated': [item['user']['role'] for item in (manager,stationary,ambulatory)], 'invalid_password_status': ok(request('POST','/api/login',json={'login':'manager','password':'invalid'}),401).status_code})

def passwords():
    outcomes = []
    for password in ('Ab12', 'Password', '12345678'):
        r = ok(request('POST','/api/users', M, json={'name':'ПМИ пароль', 'login':'pmi-invalid', 'email':'pmi@example.org', 'password':password,'passwordRepeat':password}),400)
        outcomes.append({'sample':password,'status':r.status_code,'message':r.json()['detail']})
    account = ok(request('POST','/api/users',M,json={'name':'ПМИ пароль', 'login':'pmi-password', 'email':'pmi@example.org', 'password':'Doctor12','passwordRepeat':'Doctor12'})).json()
    for password in ('Ab12','Password','12345678'):
        ok(request('PUT',f"/api/users/{account['id']}/password",M,json={'password':password,'passwordRepeat':password}),400)
    ok(request('DELETE',f"/api/users/{account['id']}",M))
    return {'creation_and_change_reject_invalid':outcomes,'valid_8_character_password_accepted': True}
run('4.1.2', passwords)
record('4.1.3','EXCLUDED',{'reason':'Исключено по ранее данному указанию пользователя; хэши и содержимое поля пароля не проверялись.'})

def rights_leader():
    ok(request('GET','/api/users',M))
    for section in range(1,16): ok(save(M,target,section,f'ПМИ руководитель раздел {section}'))
    return {'all_15_sections_saved':True,'patients_available':len(snapshot(M)['patients'])}
run('4.2.1', rights_leader)

def rights_doctor(token, allowed, denied):
    all_data = snapshot(token)
    assert all_data['audit'] == [], 'Audit leaked through runtime'
    ok(request('GET','/api/audit',token),403)
    pid = target
    if token == S:
        created = ok(request('POST','/api/patients',token,json={'center':'PMI ownership'})).json()
        pid = created['id']
    try:
        for section in allowed: ok(save(token,pid,section,f'PMI role section {section}'))
        for section in denied: ok(save(token,pid,section,'forbidden'),403)
        if token == S:
            for section in range(1,11): ok(save(token,target,section,'foreign'),403)
            ok(request('POST',f'/api/patients/{target}/lock',token),403)
        ok(request('GET','/api/users',token),403)
        return {'allowed_sections':list(allowed),'denied_sections':list(denied),
                'stationary_foreign_card_denied':token==S,'audit_events_exposed_in_runtime':0,
                'ambulatory_can_edit_stationary_card':token==A}
    finally:
        if token == S: ok(request('DELETE',f'/api/patients/{pid}',M))
run('4.2.2',lambda:rights_doctor(S,range(1,11),range(11,16)))
run('4.2.3',lambda:rights_doctor(A,range(11,16),range(1,11)))

def accounts():
    account = ok(request('POST','/api/users',M,json={'name':'ПМИ управление','login':'pmi-managed','email':'pmi@example.org','password':'Doctor12','passwordRepeat':'Doctor12'})).json()
    uid=account['id']
    ok(request('PUT',f'/api/users/{uid}/roles',M,json={'roles':['stationary']}))
    assert login('pmi-managed','Doctor12')['user']['role']=='stationary'
    ok(request('POST',f'/api/users/{uid}/block',M))
    ok(request('POST','/api/login',json={'login':'pmi-managed','password':'Doctor12'}),401)
    ok(request('POST',f'/api/users/{uid}/unblock',M))
    ok(request('PUT',f'/api/users/{uid}/roles',M,json={'roles':['ambulatory']}))
    assert login('pmi-managed','Doctor12')['user']['role']=='ambulatory'
    ok(request('DELETE',f'/api/users/{uid}',M))
    return {'created_assigned_blocked_unblocked_changed_role':True}
run('4.2.4',accounts)

run('4.3.1',lambda:{'patients':len(snapshot(S)['patients']),'key_fields_present':all(all(key in row for key in ('id','code','center')) for row in snapshot(S)['patients'])})

def create_cards():
    created=[]
    for token in (S,M):
        row=ok(request('POST','/api/patients',token,json={'center':'Сеченовский университет','values':{keys[1]:'ПМИ временная карточка'}})).json()
        assert row['code'] and row['id'] and any(key['code'] == row['code'] for key in snapshot(M)['patients'])
        created.append({'id':row['id'],'code':row['code']})
    assert len(set(row['code'] for row in created))==2
    ok(request('POST','/api/patients',A,json={'center':'Сеченовский университет','values':{}}),403)
    for row in created: ok(request('DELETE',f"/api/patients/{row['id']}",M))
    return {'generated_unique_codes':created,'ambulatory_creation':403}
run('4.3.2',create_cards)

def author():
    row=ok(save(A,target,11,'ПМИ автор изменения')).json()
    assert row['updatedBy']==ambulatory['user']['id']
    assert row['updatedAt']
    return {'patient':target,'editor':row['updatedBy'],'updatedAt':row['updatedAt'],'createdBy_unchanged':row['createdBy']}
run('4.3.3',author)

def lock():
    created = ok(request('POST','/api/patients',S,json={'center':'PMI locking'})).json()
    pid = created['id']
    try:
        ok(request('POST',f'/api/patients/{pid}/lock',S))
        ok(request('POST',f'/api/patients/{pid}/unlock',B),403)
        ok(save(B,pid,1,'forbidden'),403)
        ok(request('POST','/api/session/end',S,json={'reason':'manual'}))
        new=login('stationary_doctor','Doctor123')
        row=next(row for row in snapshot(M)['patients'] if row['id']==pid)
        assert stationary['user']['id'] in row['lock']
        ok(request('POST',f'/api/patients/{pid}/unlock',new['token']))
        return {'second_doctor_save_and_unlock':403,'lock_survives_logout':True}
    finally:
        ok(request('DELETE',f'/api/patients/{pid}',M))
run('4.3.4',lock)
S=login('stationary_doctor','Doctor123')['token']

payload=b'PMI file content 2026-11-12\n'
def files_leader():
    ok(request('POST','/api/folders',M,json={'parent':'','name':'ПМИ файлы'}))
    row=ok(request('POST','/api/files',M,files={'file':('pmi-file.txt',payload)},data={'folder':'ПМИ файлы','comment':'ПМИ комментарий'})).json()
    downloaded=ok(request('GET','/api/files/content',M,params={'name':'pmi-file.txt'}))
    assert downloaded.content==payload
    return {'uploaded_downloaded_bytes_equal':True,'metadata':row}
run('4.4.1',files_leader)

def files_doctor():
    for token in (S,A):
        ok(request('POST','/api/files',token,files={'file':('forbidden.txt',b'no')},data={'folder':''}),403)
        ok(request('DELETE','/api/files',token,params={'name':'pmi-file.txt'}),403)
        assert ok(request('GET','/api/files/content',token,params={'name':'pmi-file.txt'})).content==payload
    return {'both_doctors_download_only':True}
run('4.4.2',files_doctor)
def metadata():
    row=next(row for row in snapshot(M)['files'] if row['name']=='pmi-file.txt')
    assert row['comment']=='ПМИ комментарий' and row['author']==manager['user']['id'] and row['date']
    ok(request('DELETE','/api/files',M,params={'name':'pmi-file.txt'}))
    ok(request('GET','/api/files/content',M,params={'name':'pmi-file.txt'}),404)
    return {'metadata':row,'leader_file_delete':True}
run('4.4.3',metadata)

def audit():
    ok(request('POST','/api/export',M,json={'details':'ПМИ экспорт'}))
    events=snapshot(M)['audit']
    wanted=['Вход в систему','Создание карты пациента','Редактирование разделов','Экспорт','Загрузка файла']
    missing=[name for name in wanted if not any(event['action']==name for event in events)]
    assert not missing, str(missing)
    assert all(all(key in event for key in ('userId','action','details')) for event in events)
    return {'checked_actions':wanted,'event_count':len(events)}
run('4.5.1',audit)

def full_export():
    start=time.perf_counter(); r=ok(request('GET','/api/export/final.xlsx',M)); seconds=time.perf_counter()-start
    (OUT/'final-88.xlsx').write_bytes(r.content)
    rows,styles=rows_xlsx(r.content)
    assert len(rows)==88,f'Expected 88 rows, found {len(rows)}'
    assert seconds<=60
    with zipfile.ZipFile(ROOT/'Шаблон выгрузки Бражников.xlsx') as template: assert styles==template.read('xl/styles.xml')
    return {'data_rows':len(rows),'seconds':seconds,'bytes':len(r.content),'template_styles_part_unchanged':True,
            'limitation':'Проверены структура ZIP/XML, число строк и сохранение styles.xml; визуальное открытие Excel проверяется отдельно.'}
run('4.6.1',full_export)

def slice_export():
    chosen=ids[-3:]
    r=ok(request('POST','/api/export/slice.xlsx',M,json={'ids':chosen}))
    (OUT/'slice-3.xlsx').write_bytes(r.content)
    rows,_=rows_xlsx(r.content)
    assert len(rows)==3
    return {'selected_ids':chosen,'data_rows':len(rows),'limitation':'UI-фильтры проверяются браузерным прогоном.'}
run('4.6.2',slice_export)
def export_permissions():
    for token in (S,A):
        ok(request('GET','/api/export/final.xlsx',token),403)
        ok(request('POST','/api/export/slice.xlsx',token,json={'ids':ids[:1]}),403)
    return {'both_doctors_export_denied':403}
run('4.6.3',export_permissions)

def export_time():
    times=[]
    for _ in range(3):
        start=time.perf_counter(); ok(request('GET','/api/export/final.xlsx',M)); times.append(time.perf_counter()-start)
    assert max(times)<=60
    return {'server_download_seconds':times,'patients':88,'limitation':'Время HTTP-запроса, не полный интервал от клика до сохранения браузером.'}
run('4.8.3',export_time)

def load():
    users=[]
    prefix = f'pmi-load-{int(time.time())}-'
    for index in range(20):
        role='leader' if index%5==0 else 'stationary' if index%2==0 else 'ambulatory'
        account=ok(request('POST','/api/users',M,json={'name':f'ПМИ нагрузка {index:02d}','login':f'{prefix}{index:02d}','email':f'pmi{index}@example.org','password':'Doctor12','passwordRepeat':'Doctor12'})).json()
        ok(request('PUT',f"/api/users/{account['id']}/roles",M,json={'roles':[role]}))
        users.append({'id':account['id'],'token':login(f'{prefix}{index:02d}','Doctor12')['token'],'role':role,'pid':ids[-20+index]})
    # Ownership is part of the clarified rights model. Preserve the 88-card
    # dataset while giving each stationary writer a card they actually created.
    for user in users:
        if user['role'] == 'stationary':
            created = ok(request('POST', '/api/patients', user['token'], json={'center':'Сеченовский университет'})).json()
            ok(request('DELETE', f"/api/patients/{user['pid']}", M))
            user['pid'] = created['id']
    barrier=threading.Barrier(20)
    def worker(index):
        user=users[index]; samples=[]
        with httpx.Client(base_url=BASE,trust_env=False,timeout=90,headers={'Authorization':'Bearer '+user['token']}) as local:
            barrier.wait(timeout=15)
            for repeat in range(3):
                operations=[('GET','/api/runtime',{}),('PUT',f"/api/patients/{user['pid']}/sections",{'json':{'sections':{str(11 if user['role']=='ambulatory' else 1):{keys[11 if user['role']=='ambulatory' else 1]:f'ПМИ нагрузка {index} {repeat}'}}}})]
                if user['role']=='leader': operations.append(('GET','/api/export/final.xlsx',{}))
                for method,path,kwargs in operations:
                    start=time.perf_counter()
                    try:
                        response=local.request(method,path,**kwargs)
                        samples.append({'user':index,'operation':'export' if 'export' in path else 'save' if method=='PUT' else 'runtime','seconds':time.perf_counter()-start,'status':response.status_code})
                    except Exception as error: samples.append({'user':index,'operation':path,'seconds':time.perf_counter()-start,'error':str(error)})
        return samples
    with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
        samples=[sample for batch in pool.map(worker,range(20)) for sample in batch]
    (OUT/('load-20-recheck.json' if ONLY_LOAD else 'load-20.json')).write_text(json.dumps(samples,ensure_ascii=False,indent=2),encoding='utf8')
    failures=[row for row in samples if row.get('status')!=200]
    normal=[row['seconds'] for row in samples if row['operation']!='export']
    for user in users: ok(request('DELETE',f"/api/users/{user['id']}",M))
    return {'status':'FAIL' if failures or max(normal)>2 else 'PASS','concurrent_users':20,'rounds_each':3,'requests':len(samples),'failed_requests':len(failures),'normal_average_seconds':statistics.mean(normal),'normal_max_seconds':max(normal),'normal_over_2s':sum(value>2 for value in normal),'method':'20 HTTP-клиентов и барьер одновременного старта, ThreadPoolExecutor; JMeter не использовался.'}
run('4.8.2',load)
record('4.9.1','EXCLUDED',{'reason':'HTTPS исключён по ранее данному указанию пользователя. Локальный стенд использует HTTP; проверка сертификата не выполнялась.'})
print('API checks completed',flush=True)
