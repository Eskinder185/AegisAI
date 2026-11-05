# AegisAI visual redesign

## 1. Audit of the previous UI (baseline: docs/qa/screenshots, docs/design/screenshots/baseline)
| Problem | Evidence | Why it reads as "generated dashboard" |
|---|---|---|
| System font stack, flat weight range | all pages | No typographic identity; headings and body feel identical in tone |
| Every region is the same white rounded card with a heavy shadow | Overview | No hierarchy: four stat cards, two cards, three cards in identical chrome |
| Flat navy sidebar slab with saturated teal active pill | shell | Looks like a template; disconnected from the public site |
| Pill chips everywhere (DEMO 1, PENDING, SIMULATED...) | Overview journeys | Visual noise; status competes with content |
| Public home: centered hero + bar chart sample, no imagery or motion | home | No memorable moment; nothing interactive; sections repeat one layout |
| Top bar overloaded (6+ controls) | shell | Controls fight for attention |
| Mixed link styling (underlined teal links as list items) | Overview findings | Looks unfinished |
| No page transitions, no reveal, no motion language | all | Feels static |

What worked and is preserved: information architecture, honest SIMULATED labelling, evidence-first content, keyboard/axe accessibility, all backend contracts.

## 2. Direction
An AI research lab crossed with a command center: **graphite/midnight surfaces, electric-blue + violet accents, hairline borders instead of shadows, tight editorial type (Geist), restrained motion.** Dark is the default; light is a full peer. Colour carries meaning only: blue = AI/system, violet = agent orchestration, green = verified, amber = hypothesis/caution, red = critical.

## 3. Design system (apps/web/src/design.css, tokens at the top)
- **Type:** Geist Variable (+ Geist Mono), OFL-licensed, bundled locally via `@fontsource-variable` (no CDN). Scale: display 56-88, h1 36-44, h2 24-28, body 15/16, small 13, micro 11. Tight tracking on display (-0.04em).
- **Spacing:** 4 px base with an 8-pt rhythm (`--s1..--s8`). **Radii:** 6 / 10 / 14 (cards 12 max; no pill cards). **Elevation:** surface-0/1/2 + 1 px hairlines; shadow only for overlays.
- **Motion tokens:** `--t-fast 140ms`, `--t-med 240ms`, `--t-slow 600ms`, easing `cubic-bezier(.2,.7,.2,1)`; all disabled under `prefers-reduced-motion`.
- **Components:** Button, Chip/Label, Tabs (animated indicator), Panel (flat) / Card, Table, Modal, Palette, Stat (inline, not boxed), Reveal, Pipeline, PermissionBoundary, Graph, Replay stage.

## 4. 3D and motion (what is real)
- **Intelligence Core** (`components/three/CoreScene.tsx`): React Three Fiber (+ three) only; no drei/postprocessing. Lazy-loaded chunk, DPR capped, render loop paused when off-screen or tab hidden, static render under reduced motion, WebGL-context-loss + no-WebGL fallback to an SVG constellation. Five agent modules are selectable (click, keyboard via the list beside it) and link into real app sections.
- Scroll reveals use CSS + IntersectionObserver (no GSAP/Motion dependency: nothing here needs them).
- Orchestration, attack-path highlighting, replay and evaluation visuals animate only stored workflow state; the marketing demonstrations are labelled.

## 5. Implementation priorities
A audit -> B tokens/shell -> C public home + 3D -> D dashboard -> E agent/graph/replay/evaluation visuals -> F workspace polish -> G multi-width QA -> H stabilise. Status and honest gaps are at the end of this file, updated after QA.

## 6. Status
Implemented: design system v2, shell, command center, public home with 3D core and 8 further sections, orchestration pipeline, permission-boundary diagram, graph path highlighting, replay timeline, page transitions, reveal motion. Verification and honest gaps: see [QA_AND_PERFORMANCE.md](QA_AND_PERFORMANCE.md).
