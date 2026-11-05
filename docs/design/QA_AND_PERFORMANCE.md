# Redesign QA and performance (2026-11-05)

## What was inspected
Rendered screenshots (Playwright/Chromium, reduced motion on) are in [screenshots/](screenshots/):
home (full page), overview and case (full page), attack path, replay, agents, AI security, findings, cloud, settings at **375, 768, 1280, 1440, 1920 px in dark**, and at **375 and 1440 px in light**.
Homepage product previews in `apps/web/public/previews/` are regenerated from the running app by `specs/design-qa.spec.ts`.

**Individually viewed by me:** home 1440 dark (full), home 375 dark (full, at thumbnail scale only), overview 1440 dark and light, attack path 1440 dark, replay 1440 dark, agents 1920 dark, case 768 dark, plus the first-pass hero and command-center renders.
**Captured but not individually viewed:** the remaining images. Automated checks below cover them for overflow and accessibility, not for visual taste.

## Defects found by inspection and fixed
| Defect | Found in | Fix |
|---|---|---|
| Outer 3D agent nodes clipped at the canvas edge | home 1440 | camera distance |
| Hero taller than the fold (agent list under the scene) | home 1440 | compact agent buttons, smaller scene |
| Five agent cards wrapped 3+2 | home full page | 5-column grid, then 2+full-width |
| Product preview undersized | home full page | 0.55fr / 1.9fr split |
| `.callout.brand` rendered as a logo-style flex row (class collision with `.brand`) | replay | scoped override |
| Agent role cards 3+1 orphan; tool names broke mid-word | agents 1920 | 2-column role grid, nowrap code |
| Before/after chart text tiny in narrow cards | case 768 | re-sized viewBox |
| Long chip forced 62 px horizontal scroll on phone | overflow test | chips wrap on small screens |
| Agent accent colours failed contrast in light mode | axe | tint mixed toward text colour |

## Automated results (final run)
| Suite | Result |
|---|---|
| Playwright (functional, axe light+dark, 3D, overflow, design QA) | **66 passed** |
| Frontend vitest | 12 passed |
| axe (serious/critical) | none on home, public pages, all app pages light+dark, palette, graph, replay, agents |
| Horizontal overflow, 10 pages x 5 widths (dark) + light at 2 widths | none |
| 3D tests | WebGL mounts and draws (screenshot differs with canvas hidden); selection works; static SVG fallback when WebGL is unavailable; recovers from context loss; reduced motion shows all content and still renders; app workflows run with WebGL disabled |

## Performance (production build, `vite preview`, headless Chromium, **software WebGL via SwiftShader**)
| Page | FCP | LCP | Long tasks | CLS | JS transferred |
|---|---|---|---|---|---|
| Home, 1440 px | 236 ms | 288 ms | 172 ms | 0 | 1,078 KB raw (index 273 KB + lazy 3D chunk 805 KB) |
| Home, 390 px | 112 ms | 148 ms | 0 | 0 | same |
| Login (no 3D) | 72 ms | 72 ms | 0 | 0 | 273 KB raw |

Build sizes (gzip): app bundle **89 KB**, 3D chunk **222 KB**, CSS **10 KB**; Geist fonts ~51 KB (self-hosted).
- The 3D chunk is lazy-loaded and **never loads on app pages or login**. LCP is the text headline, so the scene does not gate first paint.
- The render loop pauses when the scene is off-screen or the tab is hidden; DPR is capped at 1.75; reduced motion renders on demand only.
- **Limits of this measurement:** localhost, no network throttling, no real GPU, no real phone. A measured 60 rAF/s in headless software GL says the main thread is not saturated; it is **not** a frame-rate measurement of the scene on real devices. The 805 KB raw chunk (all of three.js) is heavy for slow connections; tree-shaking to hand-picked three modules is a backlog item.

## Not done from the redesign brief
- No 3D attack-path view: the attack-path explorer stays 2D SVG (with path highlighting) as the accessible primary view.
- Purple-team "simulation theater" is the replay studio with a density/detection timeline and run comparison; it is not a cinematic animation of experiment stages.
- Motion for React / GSAP / drei were not added: CSS + IntersectionObserver + R3F were sufficient.
- Workspace pages other than Overview, Agents, replay and graph received the new design-system treatment (typography, surfaces, tabs, tables, chips) but **not** individually re-composed layouts (Red/Blue/Cloud/Settings still use the earlier page structure).
- Marketing sub-pages (Product, Red team, ...) use the new type and surfaces but are not rebuilt as bespoke layouts.
- No Figma file exists; tokens and components are in code (`design.css`).
- Not tested: real GPU hardware, Safari/Firefox, screen readers.
