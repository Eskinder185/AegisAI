# Starts API (8000), worker, and web UI (5173) as separate processes. Ctrl+C stops all.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$py = "$root/apps/api/.venv/Scripts/python.exe"
if (-not (Test-Path $py)) { Write-Error 'Run scripts/setup.ps1 first.'; exit 1 }

# Load .env into this process (child processes inherit it)
if (Test-Path "$root/.env") {
  Get-Content "$root/.env" | Where-Object { $_ -match '^\s*[A-Z_]+=' } | ForEach-Object {
    $k, $v = $_ -split '=', 2; [Environment]::SetEnvironmentVariable($k.Trim(), $v.Trim())
  }
}
Push-Location "$root/apps/api"; & $py -m aegis.cli migrate; Pop-Location

$procs = @()
$procs += Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root/apps/api" $py '-m', 'uvicorn', 'aegis.main:app', '--host', '127.0.0.1', '--port', '8000'
$procs += Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root" $py "services/worker/worker.py"
$procs += Start-Process -PassThru -NoNewWindow -WorkingDirectory "$root/apps/web" npm.cmd 'run', 'dev', '--', '--host', '127.0.0.1'
Write-Host "`nAegisAI is starting:  http://localhost:5173   (API docs: http://localhost:8000/api/docs)`n"
try { Wait-Process -Id $procs[0].Id } finally { $procs | ForEach-Object { if (-not $_.HasExited) { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } } }
