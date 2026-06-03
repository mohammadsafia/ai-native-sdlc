# AI-Native SDLC Platform — UI Showcase · Design Spec

**Date:** 2026-06-03
**Status:** Approved design → ready for implementation plan
**Owner:** mohammadsafia17@gmail.com

---

## Context

The platform PRD ([`docs/prd/`](../../prd/00-overview.md)) defines a full AI-Native SDLC platform across 42 packets and 7 phases — a multi-year program. To produce something complete, working, and demoable now, we are building the **UI first**: a frontend-only showcase of the platform's key screens, on the **RSK design kit** (`github.com/mohammadsafia/rsk`), against **realistic mock data**, with no backend.

This validates the product's look, feel, and information architecture, and produces a strong demo. The mock data sits behind the same data-fetching hooks a real backend would expose, so a NestJS backend (the PRD's recommended stack) slots in later by swapping the data source — not rewriting components.

**Approved decisions (from brainstorming):** UI-first showcase · RSK kit · **Narrative-First** Project Hub layout · **warm-earth OKLCH** aesthetic · **full showcase** = 7 screens.

## Goals

- Seven polished, navigable screens on the RSK kit, consistent with the approved warm-earth / Narrative-First aesthetic.
- A typed mock-data layer shaped like the real API contract (swap-in ready).
- Responsive, dark-mode, and RTL (en/ar) support throughout.
- Runs with `yarn dev`; no backend, no external services.

## Non-Goals (YAGNI)

No real backend; no tool integrations or OAuth; no auth provider (a mock current user); no live AI calls (reports are fixtures); no write-back or real-time; no test of real entity resolution. These belong to the PRD's later phases.

---

## Tech & Structure

- **Base:** RSK cloned into `web/` (its `.git` stripped; committed as the frontend base). React + TypeScript + Vite + Radix + CVA + TanStack Query/Table + React Hook Form + Zod + i18n (en/ar) + the OKLCH warm-earth design system.
- **Built with the skills:** `forge:*` for scaffolding (`forge-create-page`, `-create-component`, `-create-table`, `-create-context`, `-add-translations`), `ui-ux-pro-max` and `frontend-design` for visual quality, and `forge-audit-{a11y,dark-mode,rtl,imports}` for the polish passes.
- **Mock API layer (`web/src/mock/`):** typed fixtures + handlers exposed through React Query hooks (`useProjects`, `useProject`, `useWeeklyReport`, `usePortfolio`, `useRisks`, `useTraceability`, `useForecast`). Handlers add small artificial latency and surface loading/empty/error states. Hook signatures mirror the eventual REST/GraphQL contract; swapping to a real backend replaces only the fetcher.

## Component Architecture (RSK tiers)

- **UI tier** — reuse RSK Radix+CVA primitives (Card, Badge, Button, Table, Tabs, Tooltip, Skeleton, Dialog).
- **Shared (compound) components** to build: `HealthRing`, `ReportNarrative` (renders narrative + cited evidence chips + grounding footer), `RiskRow`, `SeverityBadge`, `MetricStat`, `TimelineForecastBar`, `HealthHeatmap`, `TraceabilityGraph`, `ProjectCard`, `HealthBadge`, `DecisionRow`, `EvidenceList`.
- **Views** (`web/src/views/<feature>/`) compose shared components per feature (hub, portfolio, traceability, risks, reports, projects).
- **Pages** (`web/src/pages/`) are route-level, lazy-loaded and layout-guarded per RSK conventions.

---

## The Seven Screens

### 1. App Shell (`/`)
Fixed 236px sidebar + main (sticky topbar + scroll content). Sidebar: brand, nav groups (**Overview:** Portfolio, Projects, Traceability · **Intelligence:** Risks, Reports, Forecast · **Workspace:** Settings), user footer. Topbar: project switcher, global search, notifications, export, avatar. Collapses to an icon-rail / drawer on mobile. Dark-mode and RTL aware. Components: `AppShell`, `Sidebar`, `NavItem`, `TopBar`, `ProjectSwitcher`.

### 2. Projects List (`/projects`)
Card-grid ⇄ table toggle. Per project: name, `HealthBadge` (score + label), open-risk count, lead, last-synced, a velocity sparkline. Filter bar: status (healthy / at-risk / blocked), text search, sort. States: loading skeleton, empty, populated. Components: `ProjectCard`, `ProjectsTable` (TanStack), `HealthBadge`, `FilterBar`.

### 3. Project Hub — Narrative-First (`/projects/:id`)
The centerpiece (matches the approved hi-fi mockup). **Hero:** `ReportNarrative` (AI weekly report, evidence chips, AI tag, grounding footer). **Right rail:** `HealthRing` with the four sub-scores, two `MetricStat` (open risks, blockers), `TimelineForecastBar` with confidence band. **Below:** Top risks (`RiskRow` list with cited evidence) and Key decisions (`DecisionRow`). Page header shows health pill + Generate-report / Export actions.

### 4. Portfolio Dashboard (`/portfolio`)
Management cross-project view. `HealthHeatmap` (projects × health), risk rollup by kind, a throughput card, and an at-risk projects list. An AI executive-summary line at the top. Components: `HealthHeatmap`, `RiskRollup`, `ThroughputCard`, `PortfolioTable`. (RBAC is mocked — all projects shown.)

### 5. Traceability Map (`/projects/:id/traceability`)
Visualizes the spine `Requirement → Epic → Story → Task → PR → Deployment → Release` as a **columnar lane layout** (simpler and more legible than a force-directed graph). Orphan nodes (missing parent/child) are flagged; a coverage % indicator is shown. Clicking a node highlights its full chain. Components: `TraceabilityGraph` (lanes), `TraceNode`, `CoverageBar`.

### 6. Risk Register + Detail (`/risks`, `/risks/:id`)
Filterable risk list across projects: kind, severity, subject, evidence, recommendation. Drill-down panel shows full cited evidence (linked artifacts), recommendation, and related items. Filters: kind, severity, project. Components: `RiskTable` (TanStack), `RiskDetailPanel`, `SeverityBadge`, `EvidenceList`.

### 7. AI Weekly Report — standalone (`/projects/:id/report`)
The full report as a readable, print-friendly page: summary counts, completed / in-progress, stale stories, idle PRs, risks, recommendations, and the grounding / data-completeness footer. A period selector (mock). Reuses `ReportNarrative` plus `ReportSection`.

---

## Mock Data Model (`web/src/mock/types.ts`)

Typed to match the PRD's canonical entities:

- `Project { id, key, name, lead: Person, status, lastSyncedAt, health: HealthScore, sprintSummary }`
- `HealthScore { overall: number, label: 'healthy'|'at-risk'|'blocked', subScores: { scope, timeline, velocity, techRisk }, evidenceRefs }`
- `Risk { id, projectId, kind: 'delivery'|'scope_creep'|'dependency'|'resource_overload', severity: 'low'|'medium'|'high', subjectRef, evidence, recommendation }`
- `WeeklyReport { projectId, periodEnd, summary: {done,inProgress,todo,blocked,pointsCompleted,pointsCommitted}, narrative, completed[], inProgress[], staleStories[], idlePrs[], risks[], dataCompleteness, generatedAt }`
- `TimelineForecast { expected, low, high, basisSprints[], confidence }`
- `TraceNode { id, type, label, parentId, status }` + derived edges
- `Decision { id, date, statement, adrRef }` · `Blocker { id, title, since, owner }`
- `Sprint { id, name, committed, completed, start, end }` · `Person { id, name, initials, role }`

**Sample data:** ~6 projects spanning states — *Falcon Payments* (at-risk, the mockup), *Orion CRM* (healthy), *Atlas Mobile* (blocked), *Nimbus Data* (healthy), *Vega Portal* (at-risk), *Kepler Analytics* (new / low-data, to exercise empty/partial states). Each with believable health, risks, a weekly report, a forecast, and a traceability chain.

## Theming · i18n · a11y · Responsive

- **Theme:** RSK's warm-earth OKLCH; light + dark, verified with `forge-audit-dark-mode`.
- **i18n:** en + ar via `forge-add-translations`; RTL verified with `forge-audit-rtl`.
- **a11y:** keyboard nav, ARIA, focus management; `forge-audit-a11y`.
- **Responsive:** sidebar → drawer; hero grid and heatmap reflow on narrow viewports.

---

## Build Order (milestones)

- **M1 — Foundation:** clone RSK into `web/`, confirm it builds and `yarn dev` runs; lock design tokens; set up routing, `AppShell`, the mock-data layer + types + fixtures.
- **M2 — Shared components:** the compound component library (HealthRing, ReportNarrative, RiskRow, MetricStat, TimelineForecastBar, HealthHeatmap, TraceabilityGraph, ProjectCard, badges).
- **M3 — Screens:** build the Project Hub first (reference screen), then the other six (parallelizable across the shared components).
- **M4 — Polish:** i18n en/ar + RTL, dark mode, responsive, a11y audits, import hygiene; final visual QA against the approved aesthetic.

## Success Criteria / Verification

- `yarn dev` runs; all seven routes navigable with no console errors.
- Each data-driven screen shows loading → data → empty/error states (Kepler exercises empty/partial).
- Dark-mode toggle and RTL (ar) both render correctly across all screens.
- Mock API hooks are documented to mirror the real API contract (swap-in note in `web/src/mock/README.md`).
- Visual consistency with the approved warm-earth / Narrative-First hub mockup.
- Audit passes: `forge-audit-dark-mode`, `-rtl`, `-a11y`, `-imports` report clean (or tracked exceptions).
