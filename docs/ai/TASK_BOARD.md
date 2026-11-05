# Task board

## Next (priority order)
1. Run the CI workflow for real; add dependency + secret scanning (`pip-audit`, `npm audit`, `gitleaks`).
2. Fix the remaining 11 mypy errors, then make CI mypy blocking.
3. Write `docs/integrations/` (AegisSOC normalized-event contract, NetShield summary export, AWS read-only adapter spec).
4. Unit-test worker stale-job recovery and retry limits.
5. Ship one real lab container (nginx with weak headers) on an isolated internal Docker network plus a `LOCAL_LAB` E2E; first real exercise of the lab-container policy path.
6. Test PostgreSQL (`psycopg`) migrations and multi-worker claim.
7. Attack-path / exposure-chain visualisation from fixture relationships.
8. Model-graded review (never overriding deterministic checks); test against a real Ollama model.
9. CloudFormation + S3 policy analyzers; optional Checkov/Semgrep adapters.
10. Playwright at phone viewport for the full demo journey; dark-mode screenshot review.

## Done
Phases 0-5 vertical slice (see FEATURE_MATRIX); Phase 6 partial (adapters, Verifier); Phase 7 only as UI states; Phase 8 partial.
