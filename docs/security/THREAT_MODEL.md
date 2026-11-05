# Threat model (v1, self-assessed — not independently reviewed)

## Assets
Workspace DB (findings, audit log), session cookies, manifest HMAC key, the user's real systems (must never be touched).

## Trust boundaries
Browser ⇄ API (cookie session + CSRF) · API ⇄ DB · Worker ⇄ DB (no API dependency) · API ⇄ optional model provider · fixtures (trusted code, untrusted *text*).

## Threats and controls

| Threat | Control (where) | Tested by |
|---|---|---|
| Tool/scan pointed at real or out-of-scope systems | Deny-by-default policy engine; fixtures addressed by identity only; external mode disabled (`policy.py`) | `test_policy.py` (30), `test_scope_fail_closed_api` |
| SSRF / metadata / link-local / DNS rebinding / redirect | All resolved IPs must be in scope; link-local & metadata always blocked; redirects re-validated; userinfo blocked | `test_policy.py` |
| Scope too broad via registry | CIDR must be private, ≤ /16, never link-local; actions allowlisted | `test_target_validation_*` |
| Privilege misuse | Roles admin/analyst/viewer on every write; CSRF double-submit; Argon2id; login throttle | `test_viewer_cannot_mutate`, `test_csrf_*`, `test_login_throttle` |
| Unapproved change | Single-use, expiring, digest-bound approval; fixture-version staleness check | `test_approval_*`, `test_expired_approval_rejected` |
| Runaway / unsafe execution | Per-step policy re-check, kill switch, cancel, max runtime, rate limit, no shell tool exists | `test_kill_switch_*`, `test_cancel_*` |
| Audit tampering | Hash-chained append-only log; `/audit/verify` | `test_audit_chain_and_tamper_detection` |
| Result tampering | HMAC-signed manifest + result/state hashes | `test_demo1…` manifest check |
| Prompt injection via logs/fixtures/documents | Text is data; policy is code; model output verified (unknown citations/IPs rejected); prompts redacted | `test_safety_ai.py` |
| Secret leakage | `redact()` on audit, prompts, reports; keys env-only; config export strips secrets | `test_redaction_helpers`, `test_config_export_has_no_secrets` |
| XSS in reports/UI | React escaping; reports HTML-escaped with `default-src 'none'` CSP | `test_report_exports` |

## Known limitations / residual risk
- The manifest HMAC key lives beside the data: it detects accidental/unsophisticated edits, not a privileged attacker with DB access.
- The audit chain detects edits but a DB admin could rewrite the whole chain.
- Sessions are in-DB cookies; login throttling is in-memory (per process).
- `LOCAL_LAB` mode and lab containers are **designed but not shipped**; the lab-container path of the policy engine is only unit-tested, never exercised against a running container.
- The "AI agent" is a deterministic mock; results say nothing about real models.
- Rule/benchmark metrics use tiny synthetic datasets (2 campaigns, 7 cases).
- SQLite concurrency is adequate for one worker; multi-worker use needs PostgreSQL (untested).
- No dependency/secret scanning has been run in CI yet; no penetration test or external review.
