# AegisAI (provisional name)

> **Safely test your defenses. Understand every finding. Verify every improvement.**

A local-first, lab-bound security validation platform: a red-team assessment assistant, a blue-team investigation
assistant, a purple-team *verify-the-fix* loop, an AI-agent guardrail lab and offline cloud-posture checks.
It needs **no API key, no AWS account, no GPU and performs no real-network scanning.**

> **Honest status:** early development build. All evidence is **SIMULATED** against built-in fixtures. It is not
> certified, not independently reviewed and not production-hardened. See [docs/ai/FEATURE_MATRIX.md](docs/ai/FEATURE_MATRIX.md)
> and [docs/security/THREAT_MODEL.md](docs/security/THREAT_MODEL.md).

## Quick start (Windows PowerShell; needs Python 3.11+ and Node 20+)

```powershell
powershell scripts/setup.ps1     # venv, deps, migrations, dev seed users, npm install
powershell scripts/dev.ps1       # API :8000, worker, web :5173
```

Open <http://localhost:5173>, choose **Open demo lab**, sign in as `analyst@aegis.local`
(password = `AEGIS_DEV_SEED_PASSWORD` from `.env`, default in `.env.example`). Then **Verify Fixes → Start this demo**.
API reference: <http://localhost:8000/api/docs>.

Docker alternative: `docker compose -f infra/compose/docker-compose.yml up --build` → <http://127.0.0.1:8088>
(set `AEGIS_WEB_PORT` to change the port). Uses SQLite on a volume; PostgreSQL is not yet tested.

Reset / teardown: Settings → *Reset demo data*, or `python -m aegis.cli reset`; delete `apps/api/data/` to start fresh.

## The four demos (each runs as real queued worker jobs and persists results)

| # | Demo | What you see |
|---|------|--------------|
| 1 | Web hardening | Missing security headers on a fixture site → blue telemetry → approve fixture fix → re-run → verified |
| 2 | Cloud access (offline) | Over-broad IAM policy flagged by exact line; least-privilege fix; access simulation proves needed access still works |
| 3 | Detection gap | Password spraying evades v1 rule (recall 0.5) → guided rule → recall 1.0, false-positive caveat shown |
| 4 | AI agent guardrails | Prompt injection obeyed by weak mock agent → enable gates → gate denials + trace, 7/7 pass |

## Repository layout

```
apps/api        FastAPI + SQLAlchemy 2 + Alembic (policy engine, scenarios, purple workflow, reports)
apps/web        React + TypeScript + Vite UI (public site + app)
services/worker standalone job worker (DB-backed queue)
tests/e2e       Playwright + axe
docs/           ai/ (status, decisions, handoff), architecture/, security/
infra/compose   Dockerfiles + compose
```

## Tests

```powershell
cd apps/api;  .venv\Scripts\python -m pytest --cov=aegis      # backend + safety boundaries
cd apps/web;  npm run typecheck; npm run lint; npm test; npm run build
cd tests/e2e; npx playwright test                                # needs API+worker+web running
```

## Safety model in one paragraph

A deny-by-default policy engine ([apps/api/aegis/policy.py](apps/api/aegis/policy.py)) runs before job creation and
before **every** step. Default mode is `SIMULATION_ONLY`; `EXTERNAL_AUTHORIZED` is runtime-disabled. Metadata,
link-local and public addresses can never be in scope. Fixture changes need a named analyst's single-use,
15-minute approval bound to the exact change. A kill switch, per-job cancel and a hash-chained audit log are built in.
An AI model (optional) can only explain: its output is verified against stored evidence and it has no path into policy.

## Optional AI

Set `AEGIS_MODEL_PROVIDER=ollama` (local) in `.env`. Without it every feature still works.
