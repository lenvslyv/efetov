"""Checks for the additional/duplicated identifiers in the source PMI."""
import json
import os
from pathlib import Path
import httpx

OUT=Path(os.environ['PMI_OUTPUT_DIR'])
client=httpx.Client(base_url=os.environ['PMI_BASE_URL'],trust_env=False,timeout=30)
results=[]
def login(name,password):
 r=client.post('/api/login',json={'login':name,'password':password});r.raise_for_status();return {'Authorization':'Bearer '+r.json()['token']}
manager=login('manager','Manager123')
results.append({'pmi':'4.2.4-admin','status':'EXCLUDED','evidence':{'reason':'Роль исключена пользователем; проверка не выполнялась.'}})
results.append({'pmi':'4.9.2','status':'EXCLUDED','evidence':{'reason':'Проверка ФИО и обезличивания исключена пользователем; данные и поля не изменялись.'}})
browser=json.loads((OUT/'browser-results.json').read_text(encoding='utf8'))['results']
layout=next(x for x in browser if x['pmi']=='4.7.1')
results.append({'pmi':'4.3.3-blocks','status': 'PASS' if all(r['status']=='PASS' for r in json.loads((OUT/'ui-actions.json').read_text(encoding='utf8')) if r['pmi'] in ['4.2.2','4.2.3']) else 'PARTIAL','evidence':{'all15Sections':layout['evidence'].get('all15SectionsChecked'),
 'clarification':'Применено уточнение пользователя: все 15 разделов видны, стационар редактирует 1–10 в своих карточках, амбулатория 11–15. В исходном ПМИ есть противоречащая этому формулировка о блоках 1–2 и 5.'}})
(OUT/'extra-results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf8')
print([(r['pmi'],r['status']) for r in results],flush=True)
