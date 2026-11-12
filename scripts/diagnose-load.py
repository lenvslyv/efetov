"""Run the PMI load scenario on a disposable copy, retaining server tracebacks."""
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import time
import httpx

ROOT=Path(__file__).resolve().parents[1]
name=sys.argv[1] if len(sys.argv)>1 else 'baseline'
OUT=ROOT/'.cache/pmi-diagnostics'/name
OUT.mkdir(parents=True,exist_ok=True)
DB=OUT/'efetov.db'
if DB.exists():raise SystemExit('Use a new run name; refusing to overwrite an existing diagnostic database')
with sqlite3.connect(ROOT/'.cache/pmi-20261112/data/efetov.db') as source, sqlite3.connect(DB) as dest:source.backup(dest)
port=os.environ.get('PMI_DIAGNOSTIC_PORT','8002')
env={**os.environ,'EFETOV_DB_PATH':str(DB),'EFETOV_DATA_DIR':str(OUT),'EFETOV_JWT_SECRET':'isolated-diagnostics-20261112-secret','PMI_BASE_URL':f'http://127.0.0.1:{port}','PMI_OUTPUT_DIR':str(OUT),'PYTHONUNBUFFERED':'1'}
with (OUT/'server.log').open('w',encoding='utf-8') as log:
 server=subprocess.Popen([sys.executable,'-m','uvicorn','app.main:app','--app-dir','backend','--host','127.0.0.1','--port',port],cwd=ROOT,env=env,stdout=log,stderr=subprocess.STDOUT)
 try:
  with httpx.Client(trust_env=False,timeout=2) as client:
   for _ in range(40):
    if server.poll() is not None:raise RuntimeError('Server exited; inspect server.log')
    try:
     if client.get(env['PMI_BASE_URL']+'/api/health').status_code==200:break
    except httpx.HTTPError:pass
    time.sleep(.25)
   else:raise RuntimeError('Diagnostic server was unreachable')
  command = [sys.executable,'scripts/pmi-api.py','--only-load']
  if len(sys.argv)>2 and sys.argv[2]=='fields':
   command = ['C:/Program Files/nodejs/node.exe','scripts/check-field-layout.cjs']
  if len(sys.argv)>2 and sys.argv[2]=='navigation':
   command = ['C:/Program Files/nodejs/node.exe','scripts/check-navigation-drafts.cjs']
  if len(sys.argv)>2 and sys.argv[2]=='browser':
   command = ['C:/Program Files/nodejs/node.exe','scripts/check-access-ui.cjs']
  if len(sys.argv)>2 and sys.argv[2]=='creation':
   command = ['C:/Program Files/nodejs/node.exe','scripts/check-create-code.cjs']
  if len(sys.argv)>2 and sys.argv[2]=='layout':
   import shutil
   shutil.copyfile(ROOT/'.cache/pmi-repeat-20261112-191634/main/fixture.json',OUT/'fixture.json')
   env['PMI_ONLY_LAYOUT']='1'
   command = ['C:/Program Files/nodejs/node.exe','scripts/pmi-browser.cjs']
  completed=subprocess.run(command,cwd=ROOT,env=env)
  print('Scenario exit',completed.returncode,'Evidence',OUT,flush=True)
 finally:
  server.terminate()
  try:server.wait(timeout=5)
  except subprocess.TimeoutExpired:server.kill();server.wait()
sys.exit(completed.returncode)
