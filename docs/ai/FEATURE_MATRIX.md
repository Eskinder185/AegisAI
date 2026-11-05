# Feature matrix (updated 2026-11-05)

Status vocabulary: `VERIFIED_WORKING` (real execution + automated test), `SIMULATED_WORKING` (works against fixtures; evidence is SIMULATED), `PARTIAL`, `PLANNED`, `BLOCKED`, `FAILED`.

| Area | Feature | Status | Last test evidence |
|---|---|---|---|
| Foundation | API + migrations + seed + health | VERIFIED_WORKING | pytest 79 pass; `alembic upgrade head` run |
| Foundation | Standalone worker (claim, heartbeat, stale recovery) | VERIFIED_WORKING | E2E demos use the real worker; stale-recovery code path is **not** unit-tested |
| Safety | Policy engine (scope, SSRF, rebinding, redirect, kill switch) | VERIFIED_WORKING | `test_policy.py` 30 pass |
| Safety | Approvals (single-use, expiring, digest-bound), rollback | VERIFIED_WORKING | `test_api_workflows.py` |
| Safety | Audit hash chain + tamper detection | VERIFIED_WORKING | test |
| Safety | Roles, CSRF, Argon2id, login throttle | VERIFIED_WORKING | tests |
| Demo 1-4 | Full find, fix, verify journeys via UI + API + worker | SIMULATED_WORKING | pytest + Playwright (39 pass) |
| Red | Passive header/cookie checks on a **fixture** | SIMULATED_WORKING | Demo 1 |
| Red | Checks against a real local lab container | PLANNED | no container ships; LOCAL_LAB path only unit-tested |
| Blue | Rule replay, incidents, detection lab sandbox | SIMULATED_WORKING | Demo 3 |
| Blue | AegisSOC / Wazuh / Suricata connector | PLANNED | contract not yet written in docs/integrations |
| Purple | Before/after metrics, signed manifests, reports | SIMULATED_WORKING | tests |
| AI lab | 7-case mock-agent suite, deterministic evaluators | SIMULATED_WORKING | tests + Demo 4 |
| AI lab | Optional model-graded review | PLANNED | |
| Cloud | IAM + Terraform offline analyzer with line evidence | SIMULATED_WORKING | Demo 2, Cloud E2E |
| Cloud | CloudFormation, S3 policy docs, Checkov/Semgrep adapters | PLANNED | |
| Cloud | AWS read-only connector | PLANNED (disabled) | |
| Assistant | Deterministic explain / Verifier / Coordinator plan | SIMULATED_WORKING | tests |
| Assistant | Ollama / OpenAI-compatible adapters | PARTIAL | verified with a fake provider only; **never run against a real model** |
| UI | Public site (11 pages), app shell, 10 sections, dark/light, Guided/Analyst | VERIFIED_WORKING | Playwright incl. axe (serious/critical) light+dark on all pages; no horizontal overflow at 390 and 820 px |
| UI | Attack-path graph visualisation | PLANNED | not built |
| UI | Cost/token dashboards | PLANNED | no real usage data exists |
| Ops | Docker Compose | PARTIAL | built and booted; one job completed through containers; no automated test; Postgres untested |
| Ops | CI workflow | PARTIAL | file written, **never executed** |
| Ops | Dependency / secret scanning | PLANNED | not run |
| Quality | mypy | PARTIAL | 11 type errors remain |
| Quality | Manual screenshot review | PARTIAL | desktop light, tablet, case page viewed; dark and phone only via axe/overflow checks |
