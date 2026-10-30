#!/usr/bin/env python3
"""Isolated deployment; credentials and host identity never belong in this file."""
import argparse, datetime, hashlib, json, os, pathlib, re, stat, subprocess, tarfile, time, urllib.request, uuid

HOME=pathlib.Path.home()
ROOT=HOME/'chip-diplomacy'
ENV=HOME/'.config/chip-diplomacy/environment'
LEGACY_ENV=HOME/'.config/chip-wars/environment'
LEDGER=ROOT/'runtime/diplomacy-usage.json'
LEGACY_LEDGER=HOME/'chip-wars/runtime/llm-usage.json'
UNIT='chip-diplomacy.service'
LEGACY='chip-wars.service'
PORT=4187

def run(*args,check=True):
    return subprocess.run(args,text=True,capture_output=True,check=check).stdout.strip()
def active(unit):return subprocess.run(['systemctl','is-active','--quiet',unit]).returncode==0
def enabled(unit):return subprocess.run(['systemctl','is-enabled','--quiet',unit],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode==0
def system(*args):return run('sudo','-n','systemctl',*args)
def atomic(path,text,mode=0o600):
    temp=path.with_name(path.name+'.'+uuid.uuid4().hex+'.tmp');temp.write_text(text,encoding='utf-8');temp.chmod(mode);temp.replace(path)
def link(path,destination):
    if path.exists() and not path.is_symlink():raise RuntimeError('Release link is not a symlink')
    temp=path.with_name(path.name+'.'+uuid.uuid4().hex);temp.symlink_to(destination);temp.replace(path)
def config(path):
    values={}
    for line in path.read_text().splitlines():
        if '=' in line and not line.lstrip().startswith('#'):
            key,value=line.split('=',1);values[key.strip()]=value.strip().strip('"').strip("'")
    return values
def quota(path):
    today=datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    if not path.exists():return {'day':today,'calls':0}
    data=json.loads(path.read_text())
    if not isinstance(data,dict) or set(data)!= {'day','calls'} or type(data.get('calls')) is not int:raise RuntimeError('Invalid quota ledger')
    if isinstance(data.get('day'),int):data['day']=datetime.datetime.fromtimestamp(data['day']*86400,datetime.timezone.utc).date().isoformat()
    if not isinstance(data.get('day'),str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}',data['day']) or not isinstance(data.get('calls'),int) or data['calls']<0 or data['day']>today:raise RuntimeError('Invalid quota ledger')
    try:datetime.date.fromisoformat(data['day'])
    except ValueError:raise RuntimeError('Invalid quota ledger')
    return data if data['day']==today else {'day':today,'calls':0}
def carry_quota(source,target,legacy=False):
    a,b=quota(source),quota(target);data={'day':a['day'],'calls':max(a['calls'],b['calls'])}
    if legacy:data['day']=(datetime.date.fromisoformat(data['day'])-datetime.date(1970,1,1)).days
    atomic(target,json.dumps(data))
def wait_health(title='Chip Diplomacy'):
    for _ in range(30):
        try:
            with urllib.request.urlopen(f'http://127.0.0.1:{PORT}/api/health',timeout=2) as r:health=json.load(r)
            with urllib.request.urlopen(f'http://127.0.0.1:{PORT}',timeout=2) as r:html=r.read().decode()
            if health.get('status')=='ok' and title in html:return health
        except Exception:pass
        time.sleep(1)
    raise RuntimeError('New release health check failed')
def check_ownership():
    if ROOT.is_symlink() or ROOT.resolve()!=HOME/'chip-diplomacy':raise RuntimeError('Unsafe application root')
    for unit,description in [(UNIT,'Chip Diplomacy isolated application'),(LEGACY,'Chip-Wars isolated game service')]:
        actual=run('systemctl','show',unit,'--property=Description','--value',check=False)
        if actual and actual not in [unit,description]:raise RuntimeError('Unit belongs to another application')
    for container,label in [('chip-diplomacy','chip-diplomacy'),('chip-wars','chip-wars'),('chip-diplomacy-probe','chip-diplomacy-probe')]:
        actual=run('sudo','-n','docker','inspect','--format','{{index .Config.Labels "app"}}',container,check=False)
        if actual and actual!=label:raise RuntimeError('Container belongs to another application')
    run('sudo','-n','true')
def restore(record):
    run('sudo','-n','systemctl','stop',UNIT,check=False);run('sudo','-n','systemctl','disable',UNIT,check=False)
    if record['mode']=='diplomacy':
        target=pathlib.Path(record['release'])
        if target.parent!=ROOT/'releases' or not target.is_dir():raise RuntimeError('Invalid rollback release')
        link(ROOT/'current',target);system('enable','--now',UNIT);return wait_health()
    try:carry_quota(LEDGER,LEGACY_LEDGER,legacy=True)
    except Exception:
        # Restore availability without granting fresh model quota when usage is uncertain.
        day=(datetime.datetime.now(datetime.timezone.utc).date()-datetime.date(1970,1,1)).days
        atomic(LEGACY_LEDGER,json.dumps({'day':day,'calls':10000}))
    if record['legacy_enabled']:system('enable',LEGACY)
    if record['legacy_active']:
        system('start',LEGACY);wait_health('CHIP WARS')
    return {'restored':'legacy','active':active(LEGACY)}

def install(archive,version,digest):
    check_ownership()
    if not re.fullmatch(r'[a-f0-9]{40}',version) or not re.fullmatch(r'[a-f0-9]{64}',digest):raise RuntimeError('Invalid release identity')
    if archive.parent!=pathlib.Path('/tmp') or archive.name!=f'chip-diplomacy-{version}.tar.gz' or hashlib.sha256(archive.read_bytes()).hexdigest()!=digest:raise RuntimeError('Release digest mismatch')
    if run('ss','-H','-ltn',f'sport = :{PORT}') and not(active(UNIT) or active(LEGACY)):raise RuntimeError('Target port belongs to another service')
    image=run('sudo','-n','docker','image','inspect','--format','{{.Id}}','node:24.21.0-bookworm-slim')
    if not re.fullmatch(r'sha256:[a-f0-9]{64}',image):raise RuntimeError('Verified existing Node image missing')
    values=config(ENV if ENV.exists() else LEGACY_ENV)
    if not values.get('PUBLIC_ORIGIN'):raise RuntimeError('Existing public origin must be configured')
    ROOT.mkdir(exist_ok=True);ROOT.chmod(0o755);(ROOT/'releases').mkdir(exist_ok=True);(ROOT/'runtime').mkdir(exist_ok=True);(ROOT/'runtime').chmod(0o700)
    ENV.parent.mkdir(parents=True,exist_ok=True);ENV.parent.chmod(0o700)
    release=ROOT/'releases'/version
    if not release.exists():
        staging=ROOT/'releases'/('.staging-'+uuid.uuid4().hex);staging.mkdir()
        with tarfile.open(archive) as bundle:
            entries=bundle.getmembers()
            if sum(item.size for item in entries)>10*1024*1024:raise RuntimeError('Oversize release')
            for item in entries:
                name=pathlib.PurePosixPath(item.name)
                if name.is_absolute() or '..' in name.parts or '.env' in name.parts or (name.parts[0] not in ['dist','server','ops'] and item.name!='VERSION') or not(item.isfile() or item.isdir()):raise RuntimeError('Unsafe release member')
                target=staging.joinpath(*name.parts)
                if item.isdir():target.mkdir(parents=True,exist_ok=True)
                else:
                    target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(bundle.extractfile(item).read());target.chmod(0o644)
        if (staging/'VERSION').read_text().strip()!=version:raise RuntimeError('Incorrect bundled version')
        for folder,dirs,files in os.walk(staging):pathlib.Path(folder).chmod(0o755)
        (staging/'SHA256').write_text(digest);staging.rename(release)
    elif (release/'SHA256').read_text().strip()!=digest:raise RuntimeError('Immutable release already exists with different contents')
    run('sudo','-n','docker','run','--rm','--name','chip-diplomacy-probe','--label','app=chip-diplomacy-probe','--network','none','--user',f'{os.getuid()}:{os.getgid()}','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges','--pids-limit=100','--memory=256m','--cpus=0.5','--mount',f'type=bind,src={release},dst=/app,readonly','--workdir','/app',image,'node','ops/diplomacy-probe.mjs')
    if active(UNIT) and (ROOT/'current').resolve()==release:
        print(json.dumps({'deployed':version,'health':wait_health(),'idempotent':True}));return
    record={'mode':'diplomacy' if active(UNIT) else 'legacy','release':str((ROOT/'current').resolve()) if (ROOT/'current').exists() else None,'legacy_active':active(LEGACY),'legacy_enabled':enabled(LEGACY)}
    unit=f'''[Unit]
Description=Chip Diplomacy isolated application
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service
Conflicts=chip-wars.service
[Service]
Type=simple
WorkingDirectory={ROOT}
ExecStart=/usr/bin/docker run --rm --name chip-diplomacy --label app=chip-diplomacy --user {os.getuid()}:{os.getgid()} --read-only --cap-drop=ALL --security-opt=no-new-privileges --pids-limit=100 --memory=256m --cpus=0.5 --tmpfs /tmp:rw,noexec,nosuid,size=16m --publish {PORT}:{PORT} --env-file {ENV} --mount type=bind,src={ROOT}/current,dst=/app,readonly --mount type=bind,src={ROOT}/runtime,dst=/state --workdir /app {image} node server/diplomacy-index.mjs
ExecStop=/usr/bin/docker stop --time 10 chip-diplomacy
Restart=on-failure
RestartSec=5
TimeoutStopSec=20
[Install]
WantedBy=multi-user.target
'''
    try:
        if active(UNIT):system('stop',UNIT)
        if active(LEGACY):system('stop',LEGACY)
        carry_quota(LEGACY_LEDGER,LEDGER)
        values.update(DIPLOMACY_ALLOW_DEMO='false',HOST='0.0.0.0',PORT=str(PORT),LLM_TIMEOUT_MS='45000',LLM_MAX_TOKENS='2200',LLM_LEDGER_PATH='/state/diplomacy-usage.json')
        values.setdefault('LLM_DAILY_LIMIT','60')
        atomic(ENV,'\n'.join(k+'='+v for k,v in values.items())+'\n')
        temp=ROOT/'unit.pending';atomic(temp,unit)
        run('sudo','-n','install','-m','644',str(temp),f'/etc/systemd/system/{UNIT}')
        system('daemon-reload');link(ROOT/'current',release);system('disable',LEGACY);system('enable','--now',UNIT)
        health=wait_health();atomic(ROOT/'rollback.json',json.dumps(record));print(json.dumps({'deployed':version,'health':health,'rollback':record['mode']}))
    except Exception:
        restore(record);raise

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('operation',choices=['install','rollback']);parser.add_argument('archive',nargs='?');parser.add_argument('version',nargs='?');parser.add_argument('digest',nargs='?');args=parser.parse_args()
    if args.operation=='install':install(pathlib.Path(args.archive),args.version,args.digest)
    else:
        check_ownership();print(json.dumps(restore(json.loads((ROOT/'rollback.json').read_text()))))
