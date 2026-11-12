"""Repeat the PMI on newly seeded disposable databases, never production data."""
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import httpx

ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'.cache'/('pmi-repeat-'+time.strftime('%Y%m%d-%H%M%S'))
OUT.mkdir(parents=True)
servers=[]
logs=[]
children=[]
def start(kind,port):
 directory=OUT/kind;directory.mkdir()
 env={**os.environ,'EFETOV_DATA_DIR':str(directory),'EFETOV_DB_PATH':str(directory/'efetov.db'),
      'EFETOV_JWT_SECRET':'repeat-pmi-isolated-secret-20261112-32bytes',
      'PMI_BASE_URL':f'http://127.0.0.1:{port}','PMI_OUTPUT_DIR':str(directory),'PYTHONUNBUFFERED':'1'}
 log=(directory/'server.log').open('w',encoding='utf-8');logs.append(log)
 server=subprocess.Popen([sys.executable,'-m','uvicorn','app.main:app','--app-dir','backend','--host','127.0.0.1','--port',str(port)],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT);servers.append(server)
 with httpx.Client(trust_env=False,timeout=2) as client:
  for _ in range(60):
   if server.poll() is not None:raise RuntimeError(f'{kind} server exited')
   try:
    if client.get(env['PMI_BASE_URL']+'/api/health').status_code==200:return env
   except httpx.HTTPError:pass
   time.sleep(.25)
 raise RuntimeError(f'{kind} server unavailable')
def run(args,env):
 completed=subprocess.run(args,cwd=ROOT,env=env)
 print('SCENARIO',args[-1],completed.returncode,flush=True)
 return completed.returncode
node='C:/Program Files/nodejs/node.exe'
print('REPEAT_OUTPUT',OUT,flush=True)
try:
 main=start('main',8002);idle=start('idle',8003)
 (OUT/'run.json').write_text(json.dumps({'commit':subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip(),'startedAt':time.strftime('%Y-%m-%d %H:%M:%S'),'directory':str(OUT)},indent=2),encoding='utf8')
 child=subprocess.Popen([node,'scripts/pmi-idle.cjs'],cwd=ROOT,env=idle);children.append(child)
 run([sys.executable,'scripts/pmi-api.py'],main)
 run([node,'scripts/pmi-browser.cjs'],main)
 run([node,'scripts/pmi-ui-actions.cjs'],main)
 run([node,'scripts/check-create-code.cjs'],main)
 run([sys.executable,'scripts/pmi-extra.py'],main)
 while child.poll() is None:time.sleep(1)
 print('IDLE_EXIT',child.returncode,flush=True)
finally:
 for process in children+servers:
  if process.poll() is None:
   process.terminate()
   try:process.wait(timeout=5)
   except subprocess.TimeoutExpired:process.kill();process.wait()
 for log in logs:log.close()
