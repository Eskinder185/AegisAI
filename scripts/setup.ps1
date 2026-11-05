# One-time local setup: Python venv, API deps, database migration + dev seed, web deps.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

if (-not (Test-Path .env)) { Copy-Item .env.example .env; Write-Host 'Created .env from .env.example' }

Set-Location "$root/apps/api"
if (-not (Test-Path .venv)) { python -m venv .venv }
& .\.venv\Scripts\python.exe -m pip install -q --upgrade pip
& .\.venv\Scripts\python.exe -m pip install -q -e ".[dev]"
& .\.venv\Scripts\python.exe -m aegis.cli migrate
& .\.venv\Scripts\python.exe -m aegis.cli seed

Set-Location "$root/apps/web"
npm install --no-audit --no-fund

Write-Host "`nSetup complete. Start everything with: powershell scripts/dev.ps1"
