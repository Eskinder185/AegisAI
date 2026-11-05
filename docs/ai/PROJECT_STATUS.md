# Project status — 2026-11-05

**Branch** `feature/aegisai-v1` in a dedicated repo at `github/AegisAI`. It is nested inside the home-directory git repo, which has unrelated uncommitted work and was not touched. Local commits only; nothing pushed or deployed.

## Verified results (commands actually run)
| Check | Result |
|---|---|
| `pytest --cov=aegis` (apps/api) | **79 passed**, 84 % line coverage |
| `ruff check aegis tests` | clean |
| `mypy aegis` | **11 errors** (annotation-level; not clean) |
| `npm run typecheck` / `lint` / `build` (apps/web) | pass |
| `npm test` (vitest) | 9 passed |
| Playwright + axe (real API + worker + Vite) | **39 passed** |
| Docker Compose up --build | images built, api healthy, worker started, one job succeeded via nginx on :8088 |

Flake note: one full Playwright run had 2 timeouts in Demo 1/2. The cause was not diagnosed and 3 later full runs passed.

## Bugs found by real runs (and fixed)
Feedback endpoint crash (missing import), Ollama non-local URL accepted, job progress total lost, missing `@types/node` in a clean build, comparison buried below results, guardrail demo never showed gate denials.

## Not done / blocked
See TASK_BOARD.md. Nothing is blocked on credentials; no external system was contacted.
