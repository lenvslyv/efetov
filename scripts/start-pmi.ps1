$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$env:EFETOV_DATA_DIR = Join-Path $projectRoot '.cache\pmi-20261112\data'
$env:EFETOV_DB_PATH = Join-Path $env:EFETOV_DATA_DIR 'efetov.db'
$env:EFETOV_JWT_SECRET = 'pmi-isolated-test-secret-20261112-32bytes'
$env:EFETOV_CORS_ORIGINS = 'http://127.0.0.1:8001'
Write-Host 'PMI test environment: http://127.0.0.1:8001'
Write-Host "Separate database: $env:EFETOV_DB_PATH"
& (Join-Path $projectRoot '.venv\Scripts\python.exe') -m uvicorn app.main:app --host 127.0.0.1 --port 8001 --app-dir backend
