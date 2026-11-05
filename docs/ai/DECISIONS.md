# Decisions

| # | Decision | Why / consequence |
|---|---|---|
| 1 | Dedicated nested git repo in `AegisAI/` | The enclosing repo is the home directory with unrelated uncommitted work; avoids touching it. |
| 2 | Python 3.11 compatible (spec says 3.12+) | Only 3.11 installed locally. Code avoids 3.12-only features; the Docker image uses 3.12. |
| 3 | SQLite default, `AEGIS_DATABASE_URL` for Postgres | Zero-setup laptop path. Postgres is **untested**. Job claim uses a conditional UPDATE valid on both. |
| 4 | Plain CSS design tokens instead of Tailwind; no react-hook-form/Zod | Fewer dependencies and full control of dark/light contrast. |
| 5 | Scenarios are in-process deterministic fixtures, not network checks | Reproducible and safe; labelled SIMULATED everywhere. Real lab containers are a later task. |
| 6 | Approval = explicit confirm creating a single-use record, then apply | Keeps the human gate in the API (tested) while the UI stays one modal. |
| 7 | Cosmetic `AEGIS_STEP_DELAY_MS` (350 in dev) | Lets the UI show per-step progress; the progress itself is real DB state. Set 0 in CI. |
| 8 | HMAC with a workspace-local key for manifests | Tamper-evidence within a workspace; not public-key signing. |
| 9 | Prompt-injection cases flagged `bypasses_separation` | Models defense in depth: separation is imperfect, gates are the code-enforced backstop. Scenario bumped to 1.1.0. |
| 10 | Compose web port defaults to 8088 | 8080 was already in use on this machine; left alone. |
