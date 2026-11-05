# Task board

## Directive items not built (premium UX directive, ranked by value)
1. **Guided red-team assessment wizard** (8 steps) with test-category selection. Today: one-click runs and the Verify Fixes case flow.
2. **Purple-team studio extras:** scenario configuration, multi-run experiment history and comparison charts beyond the replay table.
3. **AI Security Evaluation Lab extras:** test-case editor, model comparison, regression history by suite version, uncertainty visualisation.
4. **Contextual AI assistant panel** (ask questions about a finding or run with source links). Today: per-finding "explain" with a verified optional model; no chat.
5. **Customisable/saved dashboard layouts, saved filters, resizable panels, undo for reversible UI actions, notification preferences, workspace/lab selector.**
6. **Cloud workspace extras:** account inventory, resource relationship diagrams, configuration-drift history, security-group analysis.
7. **Marketing site:** architecture overview page, product demo page, pricing placeholder page, original graphics/diagrams.
8. **PDF export** (today: printable HTML for browser Save-as-PDF, plus JSON).
9. Interactive in-app tutorials beyond the onboarding wizard.
10. Locale-aware date formatting is browser-default only; no localisation framework.

## Engineering backlog
1. Run the CI workflow for real; add dependency + secret scanning.
2. Fix the remaining 11 mypy errors, then make CI mypy blocking.
3. Re-run Docker Compose after the latest changes and add an automated container smoke test.
4. Write `docs/integrations/` (AegisSOC event contract, NetShield summary export, AWS read-only adapter spec).
5. Unit-test worker stale-job recovery and retry limits.
6. Ship one real isolated lab container + `LOCAL_LAB` E2E (first real exercise of the lab-container policy path).
7. Test PostgreSQL migrations and multi-worker claim (the audit lock and `scope="function"` sessions are written to work on both, but only SQLite is tested).
8. Screen-reader testing (NVDA / VoiceOver); Firefox/WebKit runs.
9. Test graph drag-pan and wheel zoom.

## Done
Phases 0-5 vertical slice; premium shell, agents, attack paths and replay (this pass).
