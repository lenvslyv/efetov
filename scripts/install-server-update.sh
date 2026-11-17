#!/usr/bin/env bash
# Install a locally built update while keeping server configuration and data.
set -Eeuo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo: sudo bash $0 /tmp/Sechenov_Scientific_server_update.tar.gz" >&2
  exit 1
fi

archive=$(realpath -e -- "${1:?Supply the update archive}")
app_dir=$(systemctl show efetov.service -p WorkingDirectory --value)
app_dir=$(realpath -e -- "$app_dir")
case "$app_dir" in
  /opt/efetov|/opt/efetov-releases/*) ;;
  *) echo "Unexpected service directory: $app_dir. Nothing changed." >&2; exit 1 ;;
esac
test -d "$app_dir/backend/app"
test -d "$app_dir/dist"
test -d /var/lib/efetov
test -f /etc/efetov/efetov.env
systemctl is-active --quiet efetov.service
app_mode=$(stat -c '%a' "$app_dir")
app_uid=$(stat -c '%u' "$app_dir")
app_gid=$(stat -c '%g' "$app_dir")

stage=$(mktemp -d /tmp/efetov-update.XXXXXXXX)
# Validate members before extracting the package into a temporary directory.
python3 - "$archive" <<'PY'
import sys, tarfile
from pathlib import PurePosixPath
with tarfile.open(sys.argv[1], 'r:gz') as archive:
    for member in archive.getmembers():
        path = PurePosixPath(member.name)
        if path.is_absolute() or not path.parts or '..' in path.parts or not (member.isfile() or member.isdir()):
            raise SystemExit('Unsafe archive member; update aborted')
        if not path.parts or path.parts[0] not in {
            'dist', 'src', 'backend', 'public', 'index.html', 'package.json',
            'package-lock.json', 'tsconfig.json', 'vite.config.ts',
            'postcss.config.js', 'tailwind.config.js', 'components.json'
        }:
            raise SystemExit('Unexpected archive member; update aborted')
        if path.parts[0] == 'backend' and len(path.parts) > 1 and path.parts[1] not in {'app', 'seed.json', 'requirements.txt'}:
            raise SystemExit('Data or environment files must not be in the update')
PY
tar -xzf "$archive" -C "$stage" --no-same-owner
test -s "$stage/dist/index.html"
test -s "$stage/backend/app/main.py"
test -s "$stage/dist/deployment-manifest.json" || {
  echo 'Release manifest missing. Prepare this update with scripts/update-server.ps1.' >&2
  exit 1
}
grep -q '<title>Sechenov Scientific</title>' "$stage/dist/index.html"
# No dependency installation is required for this update.
python3 - "$app_dir/backend/requirements.txt" "$stage/backend/requirements.txt" <<'PY'
import difflib, sys
from pathlib import Path

def requirements(path):
    # Windows CRLF, Linux LF and an optional UTF-8 BOM do not change dependencies.
    return [line.strip() for line in Path(path).read_text(encoding='utf-8-sig').splitlines()
            if line.strip() and not line.lstrip().startswith('#')]

before, after = (requirements(path) for path in sys.argv[1:])
if before != after:
    print('Backend dependency requirements differ. Nothing changed.', file=sys.stderr)
    print('\n'.join(difflib.unified_diff(before, after, fromfile='server requirements',
                                      tofile='update requirements', lineterm='')), file=sys.stderr)
    raise SystemExit(1)
PY

# Check imports and syntax before stopping the running service. Use disposable
# database paths and never initialize the production database during preflight.
python_bin="$app_dir/venv/bin/python3"
test -x "$python_bin"
EFETOV_DATA_DIR="$stage/.preflight-data" EFETOV_DB_PATH="$stage/.preflight-data/check.db" PYTHONPATH="$stage/backend" \
  "$python_bin" -c 'from app.main import app; app.openapi(); print("Preflight imports OK")'
python3 - "$stage/dist" <<'PY'
import hashlib, json, sys
from pathlib import Path
dist = Path(sys.argv[1])
manifest = json.loads((dist / 'deployment-manifest.json').read_text(encoding='utf-8-sig'))
if not manifest.get('releaseId') or hashlib.sha256((dist / 'index.html').read_bytes()).hexdigest() != manifest.get('indexSha256'):
    raise SystemExit('Package manifest or index checksum is invalid')
PY

backup="/var/backups/efetov/update-$(date +%Y%m%d-%H%M%S)-$$"
mkdir -p "$backup"
chmod 700 "$backup"
code_ready=0
stopped=0
complete=0
recover() {
  result=$?
  trap - EXIT INT TERM
  if [[ $complete -eq 0 && $stopped -eq 1 ]]; then
    echo "Update failed. Restoring the previous code..." >&2
    systemctl stop efetov.service || true
    if [[ $code_ready -eq 1 ]]; then
      tar -xzf "$backup/code-before.tar.gz" -C "$app_dir"
    fi
    # Archives contain children only. Preserve the service directory itself.
    chown "$app_uid:$app_gid" "$app_dir"
    chmod "$app_mode" "$app_dir"
    systemctl reset-failed efetov.service || true
    systemctl start efetov.service || true
    python3 - <<'PY' || true
import json, time, urllib.request
for attempt in range(20):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2) as response:
            if not json.load(response).get('ok'):
                raise RuntimeError('Health response was not OK')
        print('ROLLBACK OK: previous application responds')
        break
    except Exception as error:
        if attempt == 19:
            print('ROLLBACK FAILED:', type(error).__name__, str(error), flush=True)
        else:
            time.sleep(1)
PY
    systemctl status efetov.service --no-pager -l || true
    journalctl -u efetov.service -n 20 --no-pager || true
    echo "Backup: $backup" >&2
  fi
  exit "$result"
}
trap recover EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "Application: $app_dir"
echo "Backup: $backup"
# Stop writers before copying SQLite, including its WAL and attachments.
stopped=1
systemctl stop efetov.service
tar -czf "$backup/data-before.tar.gz" -C /var/lib efetov
if [[ -d /etc/systemd/system/efetov.service.d ]]; then
  cp -a /etc/systemd/system/efetov.service.d "$backup/service-overrides"
fi
cp -a /etc/efetov/efetov.env "$backup/efetov.env"
members=()
for path in dist src backend/app backend/seed.json backend/requirements.txt public index.html package.json package-lock.json tsconfig.json vite.config.ts postcss.config.js tailwind.config.js components.json; do
  [[ ! -e "$app_dir/$path" ]] || members+=("$path")
done
tar -czf "$backup/code-before.tar.gz" -C "$app_dir" "${members[@]}"
code_ready=1
# Never copy the staging directory itself: mktemp gives it mode 700.
# The archive has already been validated and has no root-directory member.
tar -xzf "$archive" -C "$app_dir" --no-same-owner
chown "$app_uid:$app_gid" "$app_dir"
chmod "$app_mode" "$app_dir"
systemctl reset-failed efetov.service
systemctl start efetov.service

python3 - "$stage/dist/deployment-manifest.json" <<'PY'
import hashlib, json, sys, time, urllib.request
from pathlib import Path
expected = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8-sig'))
for attempt in range(30):
    try:
        with urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=2) as response:
            if not json.load(response).get('ok'):
                raise RuntimeError('Health check failed')
        with urllib.request.urlopen('http://127.0.0.1:8000/openapi.json', timeout=2) as response:
            schema = json.load(response)
        assert '/api/ui-events/{action}' in schema['paths']
        assert 'get' in schema['paths']['/api/patients/{patient_id}']
        assert 'center' in schema['components']['schemas']['CreateUserBody']['properties']
        with urllib.request.urlopen('http://127.0.0.1:8000/', timeout=2) as response:
            index = response.read()
        assert hashlib.sha256(index).hexdigest() == expected['indexSha256'], 'Served index does not match the new build'
        with urllib.request.urlopen('http://127.0.0.1:8000/deployment-manifest.json', timeout=2) as response:
            served = json.load(response)
        assert served.get('releaseId') == expected['releaseId'], 'Server is serving a different release'
        break
    except Exception as error:
        if attempt == 29:
            raise SystemExit(f'Post-install checks failed: {type(error).__name__}: {error}')
        time.sleep(1)
PY
systemctl is-active --quiet efetov.service
complete=1
echo "UPDATE OK"
python3 -c 'import json,sys; print("Release: " + json.load(open(sys.argv[1]))["releaseId"])' "$stage/dist/deployment-manifest.json"
echo "Backup retained: $backup"
echo "Reload the website with Ctrl+F5."
