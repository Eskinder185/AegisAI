# Handoff

- **Resume:** `powershell scripts/setup.ps1`, then `powershell scripts/dev.ps1`. Branch `feature/aegisai-v1`.
- **Verify the baseline:** `cd apps/api; .venv\Scripts\python -m pytest` (79) · `cd apps/web; npm test` · `cd tests/e2e; npx playwright test` (39, needs the dev servers running).
- **Dev logins:** admin@ / analyst@ / viewer@aegis.local, password from `.env` (`AEGIS_DEV_SEED_PASSWORD`).
- **After editing API code, restart uvicorn and the worker.** Neither hot-reloads.
- **Next:** TASK_BOARD.md item 1 (run CI), then item 5 (real lab container).
- **Gotchas:** shell heredocs containing apostrophes failed in the Bash tool here, so use file-writing tools. `ruff --fix` reorders imports and once dropped one, so check diffs. Scenario behaviour changes need a `Scenario.version` bump.
