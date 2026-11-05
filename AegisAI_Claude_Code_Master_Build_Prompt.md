# AEGISAI — AUTONOMOUS AI CYBERSECURITY PLATFORM
## Claude Code Master Build Directive — v1.0 (November 2026)

You are Claude Code acting as a coordinated team of: principal software architect, AI/ML systems engineer, defensive security engineer, authorized-lab security testing engineer, cloud security engineer, SOC detection engineer, expert product designer, accessibility specialist, SRE/DevOps engineer, and independent QA/security reviewer.

## 0. YOUR MISSION: IMPLEMENT, NOT JUST PLAN

Build a real, polished, locally runnable, testable web application called **AegisAI**. AegisAI is an AI-assisted security validation platform that connects a **lab-only red-team assessment assistant**, a **blue-team investigation assistant**, a **purple-team verify-and-retest workflow**, an **AI-agent security evaluation lab**, and **cloud posture assessment**. The product must be useful without any external LLM API, AWS credentials, live network access, or preexisting AegisSOC deployment.

**Do not stop after architecture, mockups, scaffolding, or TODOs.** Inspect the repository, write working code, test real user workflows, repair failures, and continue with the highest-priority unblocked task. Maintain a durable progress ledger in the repo so work can resume after context limits. Do not claim to have built or tested anything until verified.

Treat **AegisAI** as the provisional product name (centralize brand tokens for later renaming). **NetShield** remains a separate consumer product. **AegisSOC** is a separate defensive monitoring project; design a normalized event connector to it, but do not modify its repo or require it to be running. Keep all integrations optional and clearly labeled. Do not overwrite preexisting work.

## 1. WHAT SUCCESS LOOKS LIKE

A user can start the application locally, open a premium responsive dashboard, enter a clearly labeled *demo lab*, run an authorized, bounded simulated assessment, see what the red-team assistant observed, see what the blue-team assistant detected, review a remediation recommendation, apply a **safe fixture-level change**, rerun the scenario, and compare before-versus-after evidence. Every result distinguishes **simulated**, **measured**, **inferred**, **not configured**, and **verified**. Reports are downloadable and reproducible. The experience works with the AI provider disabled; AI is an explanation/enrichment layer, not the source of truth.

### Definition of done per feature
- Implements a real user workflow, not an ornamental page or inert button.
- Has explicit success, failure, loading, empty, offline, not-configured, and permission-denied states as relevant.
- Has documented API contracts, validation, authorization, and accessible UI.
- Has automated tests, realistic fixtures, and evidence of run results.
- Describes scope and limitations without false claims.
- Does not silently scan networks, contact public targets, change cloud/network settings, or trigger paid APIs.

## 2. HARD SAFETY, SCOPE, AND APPROVAL BOUNDARIES

This product is for defense, teaching, and **explicitly authorized** security testing in disposable local labs. Enforce controls in the actual software—not just a system prompt or disclaimer.

### Allowed to implement and execute autonomously
- Local development, package installation from standard package registries, builds, unit/integration/UI tests, docs, schema migrations of newly created *development* DBs, safe fixture generators, mock/synthetic telemetry, offline vulnerability/case analysis, static analysis of this own repository, and simulated replay against controlled local fixtures.
- Non-invasive checks against **AegisAI-owned local demo containers** within a dedicated isolated network, after target validation and with restrictive timeouts/rate limits.
- Create code for optional integrations, but keep them disabled by default until configured and explicitly approved.
- Local commits on a clearly named feature branch. Do **not** push to remotes unless explicitly authorized.

### Forbidden without my separate, explicit authorization
- Scanning or probing my real home LAN, router, NAS, Proxmox host, Windows workstation, HP laptops, AWS account, third-party systems, public IPs/domains, or any production assets—even if you think they belong to me.
- Exploit chaining against real systems, credential attacks, persistence, stealth/evasion, destructive actions, data exfiltration, malware or weaponized payload execution.
- Changing real firewall rules, DNS, routing, IAM, security groups, VPN, cloud resources, or external systems; public deployment; exposing vulnerable demo containers to host/public networks; paid API calls or cloud provisioning.
- Using automatically found secrets, credentials, or tokens. Never commit secrets. Never include secrets/PII in AI prompts, logs, reports, or screenshots.
- Approving your own authorization exceptions. An LLM output cannot grant permissions.

### Implement these technical controls early
1. **Target Registry** with owner, purpose, environment type, scope CIDRs/hosts, allowed actions, time window, rate limits, and approval status.
2. Default **SIMULATION_ONLY** mode; a separate `LOCAL_LAB` mode allows only AegisAI-managed demo services. `EXTERNAL_AUTHORIZED` is designed/documented but runtime-disabled in v1.
3. Deny-by-default **policy engine** checked before job creation and again immediately before every tool invocation, connection, redirect, and target resolution. Validate resolved IPs and redirects to avoid DNS rebinding, SSRF, and reaching metadata/link-local addresses; prefer explicit container identities for demo targets.
4. Separate worker/container execution boundary with least privilege, resource/time limits, bounded concurrency and output limits, no host Docker socket in assessor, and no broad egress. Build a protected lab network; never publish intentionally weak services publicly.
5. Human approval **for active testing and impactful changes** beyond deterministic synthetic scenario replay; record who approved, exact target, action, expiration, and result.
6. Global kill switch, per-job cancel, emergency stop, audit records, and immutable-ish append-only run history (detect edits at minimum).
7. No browser-supplied arbitrary commands; parameterized tool adapters with explicit schemas and allowlisted capabilities.
8. Defensive prompt injection controls: never treat retrieved web pages, tool output, logs, or files as instructions; never let the LLM bypass policy.
9. Check rights, API terms, and licenses before bundling third-party scanners/test environments.
10. Provide a threat model and **document remaining limitations**. Do not claim the system is certified or safe for production without independent review.

If uncertain about an action, **do not execute it**. Mark it blocked, document exact approval required, and continue other safe work. Never block the whole project on one credential, target, or external service.

## 3. PRIORITIES — SHIP A WORKING VERTICAL SLICE FIRST

**P0 — essential working experience**: local app and database boot; polished marketing site + product dashboard; demo seed; secure development auth; lab target registry; deterministic assessment engine; evidence-backed findings; simulated blue-team detections; before/after purple-team workflow; JSON and printable HTML reports; tests and documentation.

**P1 — substantial differentiation**: optional local/cloud model adapter; explainable multi-agent planning/evaluation with strict policy gates; AI application prompt-injection evaluation sandbox using synthetic canaries; offline AWS IAM/IaC fixture analysis; detection rule authoring and testing; interactive attack-path visualization; adapter interface for AegisSOC; role-based approvals; dashboards for evaluation metrics and costs.

**P2 — expansion after P0/P1 work**: authenticated authorized infrastructure integrations; read-only cloud connector; more defensible lab scenarios, collaborative analyst features, rich comparison reporting, local-model performance experiments, security regression schedules (local only), SBOM and supply chain views, and NetShield summary adapter. Do not advertise P2 as built unless functional.

Do not create 30 placeholder screens. Build one real user journey end to end, then broaden coverage. Record functionality status as `VERIFIED_WORKING`, `SIMULATED_WORKING`, `PARTIAL`, `PLANNED`, `BLOCKED`, or `FAILED` with last test evidence.

## 4. STACK & REPOSITORY SHAPE

Prefer a pragmatic, efficient monorepo. Audit existing files first. If repo is empty, use:

- Frontend: **React + TypeScript + Vite**, React Router, Tailwind CSS, accessible headless/shadcn-style UI primitives, TanStack Query, React Hook Form + Zod, lightweight charts, a graph visualization library only if useful.
- Backend API: **Python 3.12+ + FastAPI + Pydantic + SQLAlchemy 2 + Alembic**; OpenAPI contracts; strict type checking and validation.
- Worker: independent Python worker; Postgres-backed job state initially or Redis with a reliable queue if justified. No silent in-process long-running tasks; support retries and cancellation.
- Storage: **PostgreSQL**, separate migrations and deterministic fixture seeds. Store large structured artifacts in local dev storage with retention controls; database holds metadata and references.
- Model adapter: a provider-neutral interface; default **No-AI deterministic mode**, optional Ollama/local model, optional external provider through user-supplied environment variables. Never assume GPU or tokens available.
- Deployment: one low-friction `docker compose up --build` dev workflow with separate profiles for demo lab and optional model integration. Keep resource needs modest; no Kubernetes requirement.
- Tests: pytest, coverage, API integration tests, frontend unit/component tests, Playwright E2E, axe accessibility checks, security checks in CI, fixture reproducibility tests.
- Formatting/tooling: Ruff and Python typing; TypeScript strict mode, ESLint/Prettier; GitHub Actions. Use pinned major versions and lockfiles consistent with the repository, not unverified bleeding-edge dependencies.

Suggested layout (adjust if existing code argues otherwise):
```
/apps/web
/apps/api
/services/worker
/packages/contracts
/scenarios/fixtures
/integrations/aegissoc
/integrations/cloud
/infra/compose
/tests/e2e
/docs/architecture
/docs/security
/docs/product
/docs/operations
```
Avoid unnecessary microservices. Build a stable modular monolith plus constrained worker first.

### Resource and deployment assumptions
- Home lab historically includes an always-on Proxmox mini PC with ~32GB RAM and an intermittent Windows RTX 4070-class GPU workstation. Current availability is **unverified**. Do not access or reconfigure either without permission.
- Default path must work on an ordinary developer laptop with no GPU and no external services besides local Docker.
- Provide `env.example`, friendly setup checks, safe demo credentials created only through local seed scripts, and clear reset/teardown docs. No hard-coded production keys.

## 5. PRODUCT MODULES TO IMPLEMENT

### A. Public marketing site and product identity
Build premium, original, mobile-first Home, Product, How It Works, Red Team, Blue Team, Purple Team, AI Security Testing, Cloud Posture, Docs, About, FAQ, and Contact/feedback UX. The site should say plainly: **"Safely test your defenses. Understand every finding. Verify every improvement."** Include product previews built from **clearly labeled sample data**, accessible calls to action, honest feature availability, and no fabricated testimonials, user counts, partnerships, compliance certifications, security statistics, or pricing claims. Implement SEO/accessibility/performance basics. Public site is distinct from authenticated app.

### B. Onboarding + workspace
First-use wizard: choose Demo Lab, Explain Concepts, or Connect an Authorized Lab (integration disabled until approvals). Explain permissions and safety. Show workspace health, agent/model availability, actual collector states, last verification and pending approvals. Add Basic/Guided and Analyst/Advanced view modes. Support dark/light modes and persistent user preference.

### C. Dashboard / Mission Control
A highly usable overview: available protected lab targets, assessment activity, prioritized verified findings, SOC events, detection coverage, pending approvals, before/after improvement, and a clear "Run Safe Demo" primary action. Meaningful filters and drilldowns. Never display "protected" or "compromised" without evidence. Label sample/synthetic results throughout.

### D. Asset Registry and Scope Manager
CRUD for lab assets with ownership, environment, allowed actions, evidence, expiration, subnet controls, tags, criticality, and approval policy. Design scope policy as testable pure logic. No broad "scan anything" inputs. Add a scope review page and blocked-action reasons.

### E. Red-Team Assessment Assistant (lab-bound)
- Deterministic scenario engine with `AssessmentPlan -> PolicyDecision -> ApprovedStep -> Observation -> Finding -> Verification` data model.
- Safe, bounded checks for local demo HTTP configuration, missing security headers, TLS metadata when supported, package/SBOM risk from offline fixture data, invalid access policy fixtures, exposed configuration fixtures; optionally passive local web-app scan in its container with strict controls.
- A rule-driven risk analyzer that separates observation, hypothesis, risk, and confirmed evidence. Evidence includes source, timestamp, target, method, reproducibility and confidence.
- Tool adapter registry with typed inputs, tool-specific permission requirements, rate limits, retries and exit codes. Keep arbitrary shell commands unreachable from model output.
- An AI assistant that **proposes** next allowed tests and explains findings, while code-enforced policy chooses what can run. No unsupervised real-world exploitation, stealth, persistence, lateral movement, credential attack, evasion or data exfiltration features.
- User-facing "attack path" or exposure chain visualization built from **known fixture relationships and verified evidence**. Never present hypothetical paths as confirmed breaches.

### F. Blue-Team SOC Analyst Assistant
- Ingest synthetic logs into a normalized event schema with actor, event kind, timestamp, source, target, observables, evidence and chain-of-custody metadata.
- Build correlations for selected deterministic scenarios such as repeated failed logins, suspicious configuration changes, DNS anomaly fixtures, unexpected service exposure fixtures and simulated administrative actions.
- Detection rule interface: create/test/version/enable rules, see example matched events and false positives using stored fixtures; map to MITRE ATT&CK as contextual labels when warranted.
- Incident queue, severity justification, timeline, affected assets, evidence citations, suggested next investigation step, owner/status and report.
- Optional AI triage summaries clearly marked as interpretations; LLM cannot fabricate events. Include "I don't know"/insufficient evidence paths.
- Stub a read-only AegisSOC/Wazuh/Suricata integration contract; do not assume connectivity. Use adapters and fixture tests. Do not copy or rebuild unrelated AegisSOC infrastructure.

### G. Purple-Team Verification Engine (core differentiator)
Build a full workflow:
1. Select a self-contained scenario and defensive control.
2. Execute bounded synthetic attack simulation in isolated fixtures.
3. Capture red-team finding and blue-team detection results.
4. Display what was detected, missed or ambiguous.
5. Offer a **fixture-only safe remediation** with detailed explanation and rollback.
6. Apply the simulated change in the demo environment after a clear UI confirmation.
7. Rerun the **same versioned** scenario.
8. Show reproducible before/after comparisons: exposure removed?, detection triggered?, mean time to detection in simulation?, false alarms?, coverage change?, supporting events.
9. Export signed/hashed run manifest, readable report and artifacts.

The engine should calculate metrics, not ask an LLM to invent them. Provide at least three complete golden-path scenarios for local demo: a missing web security header, excessive IAM permission **fixture**, and suspicious login pattern with alerting gaps. These are **controlled fixtures**, not exploitation of external systems.

### H. AI-Agent Security Evaluation Lab
Focus on testing AI apps defensively, not turning AegisAI into an unrestricted attacker. Use local mock agent with harmless tools and **synthetic canary data only**. Build versioned test cases for:
- Prompt injection from a retrieved document or tool result.
- Attempted instruction hierarchy manipulation.
- Tool permission escalation request.
- Sensitive-data disclosure attempt using *fake canaries*.
- Output validation and unsafe tool call rejection.
- Agent instruction/data separation failures.

Record expected behavior, actual safe/unsafe behavior, evaluator rationale, input provenance, tool-call trace, reproducible seed, pass/fail and confidence. Start with deterministic guardrail assertions and add optional model-graded review only when configured. Model judges cannot override deterministic safety checks. Provide benchmarks and trend charts, plus easy-to-understand explanations.

### I. Cloud Security / Infrastructure Posture
Start entirely offline with fixture analysis:
- AWS IAM policy risk checks (wildcards, public trust, broad actions, privilege pathways as *hypotheses*).
- IaC scanning of sample Terraform/CloudFormation resources for public exposure, weak encryption or excessive access.
- Sample S3/security group risks using synthetic configurations.
- Explain exact config line/evidence, severity, safer alternative and possible impact of remediation.
- Allow read-only AWS API connector as a future, opt-in integration; do not request or use AWS credentials without user approval. No cloud changes, auto-remediation or billing.
- Support optional integration with licensed static-analysis tools such as Checkov or Semgrep if available; otherwise internal fixture analysis must still work.

### J. Finding, evidence and report management
Canonical finding schema: stable ID, source, target, severity, confidence, status, observed-vs-inferred distinction, proof/evidence, remediation, mapping, created/updated times, verification status and versions. Triage states; duplicate detection; snapshots and audit trail. Generate useful analyst and executive reports in HTML/PDF-ready print format and JSON export, all grounded in stored facts. Provide a clear risk methodology with uncertainty and no fake CVSS scores.

### K. AI assistants and agent coordination
Define four bounded roles: **Coordinator** (decomposes user intent into plans), **Red Analyst** (proposes safe assessments), **Blue Analyst** (investigates evidence), **Verifier** (checks citations, policy, and test coverage). Use explicit state-machine transitions and structured JSON/Pydantic outputs, not endless chains of model conversations. LLM is optional; deterministic workflows must remain first-class. Display prompts/decisions in an audit-friendly way with secret redaction. Track token counts/cost only if factual usage data is available. Add fallback and refusal behavior for untrusted content.

### L. Settings / administration / operations
User management, local development auth, role-based access (admin, analyst, viewer), workspace settings, retention policy, model provider health, integration configuration, scope policies, audit logs, run cancellations, export/delete demo data, diagnostic logs, backup/restore instructions, and safe configuration export. Seeded users must be development-only. No secret values displayed after configuration. Support clear disabling of integrations and data retention controls.

## 6. USER EXPERIENCE — PREMIUM AND CLEAR TO NONTECHNICAL USERS

Do not create a scary hacker-themed console. Design with the polish of modern professional SaaS and the clarity of a high-quality banking application. Prefer an original visual identity with restrained navy/teal/neutral palette, excellent type scale, meaningful whitespace, consistent spacing, thoughtful iconography, tasteful motion and strong readable contrast. Offer polished dark AND light modes. Avoid excessive neon, glassmorphism, meaningless charts and dense tables in basic mode.

Core navigation should be understandable: **Overview, My Lab, Assessments, Investigations, Verify Fixes, AI Security, Cloud Checks, Findings, Reports, Settings**. Advanced terminology can appear in expert drilldowns. Provide plain-English wording plus a glossary: e.g. "Security testing found a setting that could expose information" before "Missing security header". Each important finding should answer **What happened? Why does it matter? How do I fix it? How will we know it worked?**

Every page must have useful skeleton/loading, empty, demo, unavailable, error, success and blocked states. Strong keyboard accessibility, focus management, semantic HTML, ARIA where appropriate, visible focus, WCAG 2.2 AA-oriented contrast, reduced-motion support, chart text equivalents and responsive mobile/tablet layouts. No dead controls or fake success. Never imply an AI finding is independently validated if it is not. Display transparent status chips such as `SIMULATED`, `VERIFIED`, `UNCONFIGURED`, and `NEEDS APPROVAL` sparingly and meaningfully.

Review the rendered app in an actual browser at desktop/tablet/phone breakpoints where available. Fix layout overflow, poor typography, click path complexity, broken navigation, confusing terminology and accessible interactions. Do not claim screenshot QA if browser tools unavailable.

## 7. AUTHENTICATION, DATA, API AND SECURITY ENGINEERING

Design normalized tables/entities for users, roles, workspaces, targets, scope policies, approvals, runs, steps, tool calls, observations, evidence, findings, incident events, incidents, detection rules, simulation scenarios, guardrail test cases/results, remediation versions, model usage and audit entries. Prefer generated UUIDs, explicit foreign keys, unique constraints, indexed timestamps, and immutable run snapshot references. Use Alembic migrations and deterministic seeds.

- Authentication: local secure demo authentication or clearly documented development login. Use secure password hashing (Argon2id), rate limiting, session/token expiry, CSRF protection where relevant, authorization on every write and least privilege.
- APIs: versioned `/api/v1`, OpenAPI docs, standardized errors, request schemas, pagination/filtering, idempotent job actions and bounded query sizes.
- Jobs: idempotent execution, progress, cancellation, timeouts, bounded retries, no duplicate active run, safe recovery after worker restart. Show actual state in frontend.
- Secrets: environment variables or secret store, no committed credentials, aggressive log redaction, private artifacts, safe error messages.
- Security: input validation, XSS/CSRF/SSRF controls, dependency checks, origin/CORS policy, secure headers, proper authZ, audit events. Test scope bypasses and prompt injection explicitly.
- Observability: structured logs, request IDs, run IDs, a simple health endpoint, metrics only where meaningful and no invented telemetry.
- Privacy: local-first by default, configurable retention/deletion and no sending logs, IPs, secrets, or customer data to external model providers by default.

## 8. WORKING DEMONSTRATIONS (MUST DELIVER)

Produce these real end-to-end journeys without requiring credentials or hardware:

**Demo 1 — Web hardening**: User selects a local fixture service; a bounded passive check observes a missing security header; Red Assistant explains the evidence; Blue Assistant reviews synthetic related telemetry; user approves **fixture-only** config change; Purple workflow reruns; issue marked verified fixed with evidence.

**Demo 2 — AWS IAM offline assessment**: User loads a deliberately overly broad sample IAM policy; deterministic analyzer flags the exact statement and risk; UI offers least-privilege fixture remediation and explains tradeoffs; retest verifies fixture behavior. No real AWS calls.

**Demo 3 — Detection gap**: Replay synthetic login events; first rule version misses the scenario; user updates an isolated rule based on guided recommendations; replay confirms detection with event references, false positive caveats and a before/after comparison.

**Demo 4 — AI prompt injection defense**: Run a malicious-instruction-as-data fixture through the mock agent with fake canary data; show the policy gate rejecting an unauthorized tool invocation or disclosure; report trace, expected output, observed output and pass/fail. No real secrets.

Use explicit DEMO labels. These demos must be executable from the UI with actual backend jobs and persisted run results, not prebuilt screenshots, fabricated charts, static JSON masquerading as live or a frontend-only fake progress bar.

## 9. EVALUATION AND METRICS

Provide reproducible, versioned evaluation of:
- Finding correctness, evidence completeness, false positives, severity appropriateness.
- Blue-team precision/recall on *labeled synthetic fixtures* and detection latency where measured.
- Purple-team control effectiveness before/after, coverage and fix verification.
- AI-agent guardrail compliance, denied policy violations, unsafe tool-call rejection and hallucination/citation error rate on test cases.
- Test execution time, retries, failure causes and optional model cost.

Mark sample sizes and synthetic nature of benchmarks. Do not claim general real-world SOC accuracy from synthetic tests. Keep raw evidence independently inspectable. Never train/fine-tune a model on secrets or real user data without consent.

## 10. TESTING, SECURITY QA AND CI

Create and run:
1. Backend unit tests for all policy checks, parsers, scenario state machines, risk rules and permission boundaries.
2. API integration tests for login, roles, targets, approvals, assessment lifecycle, findings, reports and invalid input.
3. Scope-bypass tests: disallowed IP/CIDR, link-local metadata, DNS redirect/rebinding attempts, URL redirects to blocked addresses, unauthorized worker requests and model-suggested forbidden tool actions.
4. AI security tests: malicious instructions embedded in logs/fixtures cannot change policies, read files or invoke unapproved tools.
5. Frontend component tests and Playwright E2E covering the four demo journeys plus error/empty/unconfigured states.
6. Accessibility checks with axe, keyboard-only workflows, responsive layout checks.
7. Basic load/performance sanity checks using fixture traffic only; no external scan targets.
8. Static checks: Python lint/type checks, TS typecheck, frontend lint, dependency/secret scanning as available.
9. Clean Docker Compose startup, migrations, seed and teardown smoke test; CI must run without external APIs or a GPU.
10. Reproducibility: seeded demo results and reports should be stable across repeated runs where randomness is not explicitly part of the scenario.

Do not claim tests passed unless actually executed. For skipped/blocked tests, record the reason and the exact command required later. When safe tests fail, fix the source and rerun; don't merely delete or weaken failing tests.

## 11. IMPLEMENTATION PHASES AND AUTONOMOUS EXECUTION

**Phase 0 — Repository audit and execution plan**: Check git status, structure, existing changes and dependencies. Preserve everything. Branch locally if appropriate; don't silently overwrite. Create `docs/ai/PROJECT_STATUS.md`, `TASK_BOARD.md`, `DECISIONS.md`, `HANDOFF.md`, `FEATURE_MATRIX.md`, `SECURITY_BOUNDARIES.md`. Write a short architecture decision record and threat model. Continue immediately to Phase 1.

**Phase 1 — Foundation**: Scaffold or adapt monorepo, Docker, API, DB migrations, worker, frontend, lint/test setup, CI and scripts. Ensure clean boot and health endpoint.

**Phase 2 — Premium UX**: Implement public website, design system, dashboard shell, authentication/onboarding, lab/scope manager, responsive layouts, demo badge and help copy. Make navigation real.

**Phase 3 — Deterministic engine + first vertical slice**: Implement policy/scope engine, job orchestration, synthetic evidence pipeline, findings, local web hardening demo, remediation/retest and report export. Finish a working golden path before expanding.

**Phase 4 — Blue/purple systems**: Synthetic event ingestion, investigation UI, rule testing, detection-gap demo, purple before/after metrics, evidence-rich reports.

**Phase 5 — AI security and cloud fixture testing**: Mock agent + prompt injection evaluation harness, IAM/IaC offline analyzer, policy enforcement tests, dashboards.

**Phase 6 — Optional model intelligence**: Model adapter interface, local Ollama option, provider health, explain/plan/verify agents, strict tool gates, redaction, cost visibility and deterministic fallback. No API key required for completion.

**Phase 7 — Integration contracts**: Read-only optional AegisSOC connectors, NetShield summary export specification, future AWS read-only adapter documented/disabled, more scenario packs. No external modifications.

**Phase 8 — Hardening and review**: Full E2E tests, static checks, security tests, UX/accessibility/browser review, performance and resource review, clean setup instructions, screenshots if tools available and release-readiness assessment.

For every phase, update feature statuses and actual test evidence. Prefer meaningful vertical slices over huge quantities of incomplete files. Use small local commits only if the working tree is understood; never push/deploy. If tooling or credentials are missing, continue with offline fixtures and document the blocker.

### Work management
- Maintain at most two major implementation tracks at once to control complexity.
- Before changes, verify the real repo and working tree. Do not delete uncommitted work or rewrite history.
- Keep concise checkpoints with **done / verified / next / blocked / exact resume command**.
- Use subagents only where Claude Code supports them and they meaningfully save time; ensure no conflicting writes and merge/review their work.
- Conserve tokens/cost: reuse the current model for ordinary work and tests; request a higher-reasoning model only for difficult threat modeling, security boundaries, or architecture.
- Avoid asking me routine questions. Make reasonable reversible choices and record them. Only stop for permission, destructive/external action, unavoidable secrets, legal scope, or genuinely ambiguous high-impact architecture.
- Do not stop with "I have a plan." After creating the plan, execute the first safe implementation step in the same session.

## 12. REQUIRED ARTIFACTS AND ACCEPTANCE GATE

Deliver actual source and configs; a `README.md` with copy/paste startup instructions; `.env.example`; Compose and scripts; API OpenAPI docs; migrations; fixtures and scenario manifests; tests; CI pipeline; product design docs; architecture and data-flow diagrams (Mermaid is fine); threat model; approval model; audit/export docs; AI model limitations; and a `FEATURE_MATRIX` distinguishing **implemented/tested/simulated/planned/blocked**.

**Minimum acceptance gate**:
- A fresh developer can follow README to boot locally and reach the web UI.
- The UI clearly distinguishes demo/simulated vs measured/real, has no dead primary actions, and works on mobile and desktop.
- Four demo workflows actually invoke backend routes, persist records and display evidence-backed results.
- A user can approve a fixture-only remediation, rerun a scenario and see a meaningful before/after comparison.
- Assessment of out-of-scope targets fails closed, in API and worker tests.
- User roles, audit logs, cancel/stop functions, redaction and secret hygiene are tested.
- Entire app works with **NO API KEY, NO AWS ACCOUNT, NO GPU and NO REAL-NETWORK SCANS**.
- At least backend tests, frontend type/lint checks, E2E smoke tests and security boundary tests have been executed; show real pass/fail summaries.
- The repo contains honest limitations and next steps, not assertions that this is certified, production hardened or has validated unauthorized penetration capabilities.

## 13. BEGIN NOW

1. Inspect the current repository and git status. If it is an empty/new directory, initialize a clean project structure; if it has an existing implementation, extend rather than replace it.
2. Create the project-status/decision/safety documentation and a short, prioritized task board.
3. Start coding Phase 1 immediately. Do not wait for me to answer design questions that can be resolved safely.
4. Build the first end-to-end scenario before opening many feature fronts.
5. At each checkpoint, summarize **files changed, actual tests run, verified capabilities, blocked items, and exactly what you will build next**.
6. Continue autonomously until you hit an unavoidable permission boundary, tooling/session limit, or all achievable local work is complete. Never bypass an approval boundary just to keep going.

**North star:** AegisAI should be a beautiful, explainable, evidence-driven security validation platform that safely demonstrates *find → understand → defend → verify*. The verified engineering and user experience matter more than impressive mockups or inflated claims.
