"""One finite frontend-owned synthetic journey; never manages backend services."""
from pathlib import Path
import json, subprocess, os, signal, time, datetime, hashlib
ROOT=Path(__file__).resolve().parents[1]
OUT=ROOT/'artifacts/f3-account/mode-handoff'
OUT.mkdir(parents=True,exist_ok=True)
def ps(pid,fields='lstart=,command='):
 r=subprocess.run(['ps','-p',str(pid),'-o',fields],capture_output=True,text=True)
 return r.stdout.strip() if r.returncode==0 else None
def listeners():
 r=subprocess.run(['lsof','-nP','-t','-iTCP:5173','-sTCP:LISTEN'],capture_output=True,text=True)
 return r.stdout.split()
normal=json.loads((ROOT/'artifacts/normal-preview-restore/20261101T104923328060Z/handle.json').read_text())
assert normal['pid']==12560 and ps(normal['pid'])==normal['identity'], 'Normal frontend identity changed; nothing stopped'
assert listeners()==[str(normal['pid'])], 'Unexpected frontend listener; nothing stopped'
stale_path=ROOT/'.local/prototype-session.json'
stale_raw=stale_path.read_bytes();stale=json.loads(stale_raw)
assert stale['pid']==16437 and stale['vitePid']==16454 and ps(stale['pid']) is None and ps(stale['vitePid']) is None, 'Stale handle is not proven stale'
backend_pids=[58162,59588,89891,90268,96560]
before={str(p):ps(p)for p in backend_pids}
assert all(before.values()), 'An expected preserved service is absent'
(OUT/'one-attempt.marker').open('x').close()
(OUT/'before.json').write_text(json.dumps({'normal':normal,'preserved_processes':before,'stale_handle_sha256':hashlib.sha256(stale_raw).hexdigest()},indent=2)+'\n')
assert stale_path.read_bytes()==stale_raw
stale_path.rename(OUT/'proven-stale-public-handle.json')
os.kill(normal['pid'],signal.SIGTERM)
for _ in range(40):
 if not listeners():break
 time.sleep(.1)
assert not listeners(), 'Owned normal frontend did not release its listener'
result={'journey_exit_code':None,'restored':False}
try:
 with (OUT/'actual-journey.log').open('w')as log:
  child=subprocess.Popen([normal['command'][0],str(ROOT/'tools/check-f3-synthetic.mjs')],cwd=ROOT,stdout=log,stderr=subprocess.STDOUT)
  (OUT/'runner.json').write_text(json.dumps({'pid':child.pid,'command':'node tools/check-f3-synthetic.mjs','controller':'existing launchPrototype export','attempts':1},indent=2)+'\n')
  result['journey_exit_code']=child.wait()
finally:
 if listeners():
  result['restoration_error']='Port5173 still occupied after owned runner; inspect its handle before any action'
 else:
  env=dict(os.environ)
  for k in list(env):
   if k.startswith('VITE_PROTOTYPE_'):env.pop(k)
  env['VITE_API_URL']='http://127.0.0.1:8788';env['VITE_DEMO_BUILD']='1'
  log=(OUT/'normal-vite.log').open('ab')
  proc=subprocess.Popen(normal['command'],cwd=ROOT,env=env,stdin=subprocess.DEVNULL,stdout=log,stderr=subprocess.STDOUT,start_new_session=True)
  log.close()
  for _ in range(80):
   if listeners()==[str(proc.pid)]:break
   if proc.poll()is not None:break
   time.sleep(.1)
  result['restored']=listeners()==[str(proc.pid)]
  result['normal']={'pid':proc.pid,'identity':ps(proc.pid),'command':normal['command'],'url':'http://127.0.0.1:5173','api':'http://127.0.0.1:8788','demo_build':'1','prototype_opt_in':False,'log':str(OUT/'normal-vite.log')}
 result['preserved_processes_after']={str(p):ps(p)for p in backend_pids}
 result['preserved_processes_unchanged']=result['preserved_processes_after']==before
 result['prototype_handle_remaining']=stale_path.exists()
 result['recorded_at_utc']=datetime.datetime.now(datetime.timezone.utc).isoformat()
 (OUT/'result.json').write_text(json.dumps(result,indent=2)+'\n')
 print(json.dumps(result),flush=True)
assert result['restored'] and result['preserved_processes_unchanged'] and not result['prototype_handle_remaining']
assert result['journey_exit_code']==0, 'Journey failed; inspect the retained actual evidence; never launch another fixture blindly'
