# AI-Native SDLC Platform — UI Showcase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a frontend-only, 7-screen showcase of the platform on the RSK kit (in `web/`) against realistic mock data, matching the approved warm-earth / Narrative-First aesthetic.

**Architecture:** RSK (React + TS + Vite + Tailwind v4 + Radix + CVA + TanStack Query/Table + react-router + i18next) is the base. We add a typed mock-data layer behind TanStack Query hooks (same shape a real backend would expose), a set of compound shared components, and 7 lazy-loaded dashboard pages wired into RSK's existing `DashboardLayout` shell and config-driven sidebar. Theme uses RSK's existing OKLCH tokens (no hardcoded colors) so dark mode is automatic.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind v4 (OKLCH `@theme` tokens in `src/index.css`), Radix UI, class-variance-authority, `cn()` (`@utils`), TanStack Query, TanStack Table, react-router-dom, i18next/react-i18next, @faker-js/faker (mock data), lucide-react (icons), dayjs.

**Key RSK conventions (confirmed):**
- Aliases: `@api`, `@components` (`/ui`,`/shared`,`/forms`), `@pages`, `@views`, `@layouts`, `@utils`, `@hooks` (`src/lib/hooks`), `@contexts`, `@constants`, `@routes`, `@locales` (`src/locales`), `@app-types` (`src/types`), `@app-config`, `@assets`.
- Nav is config-driven: `APP_MENU` in `src/routes/routes.ts` (the sidebar renders it). Routes in `src/routes/router.tsx` (dashboard routes are children of `<AuthGuard/>` → `<DashboardLayout/>`, lazy-loaded).
- Auth already mocked: `src/lib/hooks/shared/useAuth.ts` returns `isAuthed: true` → no gate.
- Components: compound + CVA + `data-slot`, e.g. `src/components/ui/card/Card.tsx` (`Card.Header/Title/Content/Footer`), `Badge`. Merge classes with `cn()`.
- Theme tokens (semantic, use these — never hex): `bg-background`, `text-foreground`, `text-muted-foreground`, `border-border`, `bg-primary`/`text-primary` (+ tints `primary-15..900`), `bg-success`/`-200`, `text-warning`, `text-destructive`, `bg-surface`. Dark mode via `.dark` class (managed by `@contexts/ThemeContext`).
- Query hooks live in `src/lib/hooks/queries/`; `queryClient` is already provided in `src/main.tsx`.
- Dev: `yarn` in `web/`; `yarn dev` → http://localhost:3000.

---

## File Structure (what we create/modify)

```
web/src/
  types/sdlc.ts                         domain types (Project, HealthScore, Risk, WeeklyReport, …)
  api/mock/
    latency.ts                          delay() helper
    seed.ts                             seeded faker instance (deterministic)
    generators.ts                       faker generators per entity
    fixtures.ts                         the ~6 sample projects (built once from generators)
    index.ts                            barrel for the mock dataset + query fns
  lib/hooks/queries/
    useProjects.ts  useProject.ts  useWeeklyReport.ts  usePortfolio.ts
    useRisks.ts  useRisk.ts  useTraceability.ts                 mock TanStack Query hooks
  lib/contexts/ActiveProjectContext.tsx provides selected projectId (for switcher/traceability/reports)
  components/shared/
    health-ring/HealthRing.tsx          health gauge + sub-scores
    health-badge/HealthBadge.tsx        score+label pill (CVA by status)
    severity-badge/SeverityBadge.tsx    risk severity pill (CVA)
    metric-stat/MetricStat.tsx          big-number stat card
    report-narrative/ReportNarrative.tsx  narrative + evidence chips + AI tag + grounding footer
    evidence-chip/EvidenceChip.tsx      monospace cited-artifact chip
    risk-row/RiskRow.tsx                risk line (severity dot, title, evidence)
    decision-row/DecisionRow.tsx        date + statement
    timeline-forecast-bar/TimelineForecastBar.tsx  expected date + confidence band
    health-heatmap/HealthHeatmap.tsx    portfolio grid of health cells
    risk-rollup/RiskRollup.tsx          counts by kind (portfolio)
    project-card/ProjectCard.tsx        project tile for the list
    traceability-graph/TraceabilityGraph.tsx  columnar lanes Req→…→Release
    empty-state/EmptyState.tsx          shared empty/partial state
  views/
    projects/ProjectsView.tsx           list + filters
    hub/ProjectHubView.tsx              the Narrative-First hub
    portfolio/PortfolioView.tsx         management dashboard
    traceability/TraceabilityView.tsx   lanes + coverage
    risks/RisksView.tsx  risks/RiskDetailView.tsx
    reports/WeeklyReportView.tsx        standalone report
  pages/dashboard/
    ProjectsPage.tsx ProjectHubPage.tsx PortfolioPage.tsx
    TraceabilityPage.tsx RisksPage.tsx RiskDetailPage.tsx WeeklyReportPage.tsx
  locales/en.json  locales/ar.json  locales/i18n.ts
MODIFY:
  src/routes/routes.ts                  add APP_MENU nav items
  src/routes/router.tsx                 add lazy routes under DashboardLayout
  src/layouts/dashboard-sidebar/DashboardSidebar.tsx  branding "Pulse IQ"
  src/main.tsx                          import '@locales/i18n'; wrap ActiveProjectProvider
```

Routes (URLs): `/dashboard/portfolio`, `/dashboard/projects`, `/dashboard/projects/:id` (hub), `/dashboard/projects/:id/report`, `/dashboard/traceability`, `/dashboard/risks`, `/dashboard/risks/:id`.
Nav (`APP_MENU`): Portfolio · Projects · Traceability · Risks · Reports · Settings. (The Hub is reached by clicking a project.)

---

## Milestone 0 — Foundation

### Task 0.1: Install & boot RSK
**Files:** none (verification).
- [ ] **Step 1 — Install:** Run `cd web && yarn install`. Expected: completes without fatal errors.
- [ ] **Step 2 — Boot:** Run `yarn dev`. Expected: Vite serves http://localhost:3000; the dashboard renders with the existing sidebar. Stop the server (Ctrl-C) once confirmed.
- [ ] **Step 3 — Commit baseline:** `git add web && git commit -m "chore(web): vendor RSK kit as frontend base"` (RSK `.git` already removed).

### Task 0.2: Branding
**Files:** Modify `web/src/layouts/dashboard-sidebar/DashboardSidebar.tsx`.
- [ ] **Step 1:** Replace the brand text node (currently renders `'Starter'` / `'S'`) with `{collapse ? 'P' : 'Pulse IQ'}`. Keep surrounding classes unchanged.
- [ ] **Step 2:** Run `yarn dev`, confirm sidebar shows "Pulse IQ". Commit: `git commit -am "feat(web): brand shell as Pulse IQ"`.

### Task 0.3: i18n setup (en/ar + RTL)
**Files:** Create `web/src/locales/en.json`, `web/src/locales/ar.json`, `web/src/locales/i18n.ts`; Modify `web/src/main.tsx`.
- [ ] **Step 1 — i18n init** (`web/src/locales/i18n.ts`):
```ts
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import en from './en.json';
import ar from './ar.json';

i18next.use(LanguageDetector).use(initReactI18next).init({
  resources: { en: { translation: en }, ar: { translation: ar } },
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  detection: { order: ['localStorage', 'navigator'], caches: ['localStorage'] },
});

const applyDir = (lng: string) => { document.documentElement.dir = lng === 'ar' ? 'rtl' : 'ltr'; document.documentElement.lang = lng; };
applyDir(i18next.language);
i18next.on('languageChanged', applyDir);

export default i18next;
```
- [ ] **Step 2 — Seed locale files:** Create `en.json` with keys used in this build (`nav.*`, `common.*`, `hub.*`, `projects.*`, `portfolio.*`, `risks.*`, `report.*`, `traceability.*`). Create `ar.json` with the same keys, Arabic values. (Grow keys per screen as built; `forge-add-translations` keeps both in sync.) Minimum seed:
```json
{ "nav": { "portfolio":"Portfolio","projects":"Projects","traceability":"Traceability","risks":"Risks","reports":"Reports","settings":"Settings" },
  "common": { "search":"Search…","export":"Export","generateReport":"Generate report","lastSynced":"Last synced","aiGenerated":"AI-generated","viewAll":"View all" } }
```
- [ ] **Step 3 — Wire init:** In `web/src/main.tsx`, add `import '@locales/i18n';` near the top (before `<App/>` render).
- [ ] **Step 4:** Run `yarn dev`; no console errors. Commit: `git commit -am "feat(web): wire i18next (en/ar) with RTL direction"`.

---

## Milestone 1 — Mock data layer

### Task 1.1: Domain types
**Files:** Create `web/src/types/sdlc.ts`.
- [ ] **Step 1 — Write types** (complete):
```ts
export type ProjectStatus = 'healthy' | 'at-risk' | 'blocked';
export type RiskKind = 'delivery' | 'scope_creep' | 'dependency' | 'resource_overload';
export type Severity = 'low' | 'medium' | 'high';
export type TraceType = 'requirement' | 'epic' | 'story' | 'task' | 'pr' | 'deployment' | 'release';

export interface Person { id: string; name: string; initials: string; role: string; }
export interface SubScores { scope: number; timeline: number; velocity: number; techRisk: number; }
export interface HealthScore { overall: number; label: ProjectStatus; subScores: SubScores; }
export interface Sprint { id: string; name: string; committed: number; completed: number; start: string; end: string; }
export interface Risk { id: string; projectId: string; kind: RiskKind; severity: Severity; title: string; subjectRef: string; evidence: string; recommendation: string; }
export interface Decision { id: string; date: string; statement: string; adrRef?: string; }
export interface Blocker { id: string; title: string; since: string; owner: string; }
export interface TimelineForecast { expected: string; low: string; high: string; confidence: number; basisSprints: string[]; }
export interface TraceNode { id: string; type: TraceType; label: string; parentId: string | null; status: 'ok' | 'orphan' | 'in-progress'; }
export interface ReportItem { key: string; title: string; assignee: string; }
export interface WeeklyReport {
  projectId: string; periodEnd: string; generatedAt: string; dataCompleteness: number;
  summary: { done: number; inProgress: number; todo: number; blocked: number; pointsCompleted: number; pointsCommitted: number };
  narrative: string;            // contains [[KEY]] tokens to render as evidence chips
  completed: ReportItem[]; inProgress: ReportItem[]; staleStories: ReportItem[]; idlePrs: { id: string; daysIdle: number }[];
  risks: Risk[];
}
export interface Project {
  id: string; key: string; name: string; lead: Person; status: ProjectStatus;
  lastSyncedAt: string; health: HealthScore; sprint: Sprint;
  risks: Risk[]; decisions: Decision[]; blockers: Blocker[];
  forecast: TimelineForecast; report: WeeklyReport; trace: TraceNode[];
  velocityHistory: number[]; // sparkline
}
export interface PortfolioSummary {
  projects: Pick<Project,'id'|'key'|'name'|'status'|'health'>[];
  riskByKind: Record<RiskKind, number>;
  throughput: { window: string; merged: number; trend: number };
  executiveSummary: string;
}
```
- [ ] **Step 2 — Commit:** `git commit -am "feat(web): SDLC domain types for mock layer"`.

### Task 1.2: Mock dataset (deterministic, faker-seeded)
**Files:** Create `web/src/api/mock/{latency.ts,seed.ts,generators.ts,fixtures.ts,index.ts}`.
- [ ] **Step 1 — latency** (`latency.ts`): `export const delay = (ms = 600) => new Promise<void>(r => setTimeout(r, ms));`
- [ ] **Step 2 — seed** (`seed.ts`): create a seeded faker so data is stable across reloads:
```ts
import { faker } from '@faker-js/faker';
faker.seed(42);
export { faker };
```
- [ ] **Step 3 — generators** (`generators.ts`): pure functions building a `Project` from the types in Task 1.1 using `faker` — believable names, sub-scores, a `WeeklyReport.narrative` containing `[[FAL-412]]` style tokens, 2–4 risks, a forecast, and a `trace[]` chain (Requirement→Epic→Story→Task→PR→Deployment→Release with a couple `orphan` nodes). Keep each generator small and focused.
- [ ] **Step 4 — fixtures** (`fixtures.ts`): build exactly 6 named projects covering states: `Falcon Payments` (at-risk — mirror the approved mockup data), `Orion CRM` (healthy), `Atlas Mobile` (blocked), `Nimbus Data` (healthy), `Vega Portal` (at-risk), `Kepler Analytics` (new/low-data → empty/partial states). Export `export const PROJECTS: Project[]`. Derive `export const PORTFOLIO: PortfolioSummary` from them.
- [ ] **Step 5 — index/query fns** (`index.ts`): export async fns that mirror a real API and add latency:
```ts
import { delay } from './latency'; import { PROJECTS, PORTFOLIO } from './fixtures';
export const api = {
  listProjects: async () => { await delay(); return PROJECTS.map(({trace,report,...p}) => p); },
  getProject: async (id: string) => { await delay(); const p = PROJECTS.find(x => x.id === id); if (!p) throw new Error('not found'); return p; },
  getReport: async (id: string) => { await delay(700); return PROJECTS.find(x => x.id === id)!.report; },
  getPortfolio: async () => { await delay(); return PORTFOLIO; },
  listRisks: async () => { await delay(); return PROJECTS.flatMap(p => p.risks); },
  getRisk: async (id: string) => { await delay(300); return PROJECTS.flatMap(p => p.risks).find(r => r.id === id) ?? null; },
  getTraceability: async (id: string) => { await delay(); return PROJECTS.find(x => x.id === id)!.trace; },
};
```
- [ ] **Step 6 — Commit:** `git commit -am "feat(web): seeded mock SDLC dataset (6 projects)"`.

### Task 1.3: Query hooks
**Files:** Create `web/src/lib/hooks/queries/{useProjects,useProject,useWeeklyReport,usePortfolio,useRisks,useRisk,useTraceability}.ts`.
- [ ] **Step 1 — Pattern** (e.g. `useProjects.ts`), repeat shape for each (queryKey + `api.*`):
```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@api/mock';
export const projectsKey = ['projects'] as const;
export const useProjects = () => useQuery({ queryKey: projectsKey, queryFn: api.listProjects });
```
`useProject(id)` → `['project', id]`, `api.getProject(id)`, `enabled: !!id`. `useWeeklyReport(id)`, `usePortfolio()`, `useRisks()`, `useRisk(id)`, `useTraceability(id)` follow identically.
- [ ] **Step 2 — Commit:** `git commit -am "feat(web): mock query hooks (projects, report, portfolio, risks, traceability)"`.

### Task 1.4: ActiveProject context
**Files:** Create `web/src/lib/contexts/ActiveProjectContext.tsx`; Modify `web/src/main.tsx`.
- [ ] **Step 1:** Context exposing `{ activeId, setActiveId }`, default = first project id (`PROJECTS[0].id`). Provider + `useActiveProject()` hook (RSK context pattern). Used by the topbar switcher, Traceability and Reports pages.
- [ ] **Step 2:** Wrap the app with `<ActiveProjectProvider>` in `main.tsx` (inside QueryClientProvider). Commit: `git commit -am "feat(web): active-project context"`.

---

## Milestone 2 — Shared components

> Each: create `web/src/components/shared/<name>/<Name>.tsx`, compound/CVA + `data-slot`, semantic theme classes only, `cn()` for merge. Build, eyeball, commit per component. Visual reference: the approved hub mockup.

### Task 2.1: HealthBadge & SeverityBadge (CVA pills)
**Files:** `health-badge/HealthBadge.tsx`, `severity-badge/SeverityBadge.tsx`.
- [ ] **Step 1 — HealthBadge:** props `{ score:number; label:ProjectStatus }`. CVA `variant` keyed on label → `healthy: text-success bg-success-200`, `at-risk: text-warning bg-warning/15`, `blocked: text-destructive bg-destructive/15`. Renders a dot + `● {score} · {Label}`. `data-slot="health-badge"`.
- [ ] **Step 2 — SeverityBadge:** props `{ severity:Severity }`; CVA → high=destructive, medium=warning, low=success tints; uppercase label.
- [ ] **Step 3 — Commit:** `git commit -am "feat(web): HealthBadge + SeverityBadge"`.

### Task 2.2: HealthRing
**Files:** `health-ring/HealthRing.tsx`.
- [ ] **Step 1:** props `{ score:number; subScores:SubScores }`. Render a conic-gradient ring (`background: conic-gradient(var(--color-warning) <score>%, var(--color-muted-200) 0)` via inline style using the score), centered number + "Health", and four labeled sub-score bars (Scope/Timeline/Velocity/Tech risk) with fill width = value%, fill color by threshold (≥75 success, ≥50 warning, else destructive). Use Card as container.
- [ ] **Step 2 — Commit:** `git commit -am "feat(web): HealthRing gauge"`.

### Task 2.3: EvidenceChip & ReportNarrative
**Files:** `evidence-chip/EvidenceChip.tsx`, `report-narrative/ReportNarrative.tsx`.
- [ ] **Step 1 — EvidenceChip:** monospace pill (`bg-surface border border-border rounded text-primary font-mono text-xs px-1`), `data-slot="evidence-chip"`, props `{ label:string }`.
- [ ] **Step 2 — ReportNarrative:** props `{ report:WeeklyReport }`. Parse `narrative` for `[[KEY]]` tokens and render each as `<EvidenceChip>`; render paragraphs; an "✦ AI-generated" tag (primary tint) in the header; a grounding footer (`Grounded in N issues · M commits …`, from `report.summary`/`dataCompleteness`, `generatedAt` via dayjs relative). Use `Card`.
- [ ] **Step 3 — Commit:** `git commit -am "feat(web): ReportNarrative with cited evidence chips"`.

### Task 2.4: MetricStat, RiskRow, DecisionRow, EvidenceList
**Files:** `metric-stat/`, `risk-row/`, `decision-row/`, `evidence-list/`.
- [ ] **Step 1 — MetricStat:** `{ value, label, tone? }` big number + caption (Card).
- [ ] **Step 2 — RiskRow:** `{ risk:Risk }` → severity dot (color by severity), title + `SeverityBadge`, evidence line rendering `subjectRef` as `EvidenceChip`. Top border between rows.
- [ ] **Step 3 — DecisionRow:** `{ decision:Decision }` → date (muted) + statement.
- [ ] **Step 4 — EvidenceList:** `{ items:string[] }` → list of `EvidenceChip` (used in risk detail).
- [ ] **Step 5 — Commit:** `git commit -am "feat(web): MetricStat, RiskRow, DecisionRow, EvidenceList"`.

### Task 2.5: TimelineForecastBar
**Files:** `timeline-forecast-bar/`.
- [ ] **Step 1:** `{ forecast:TimelineForecast }` → expected date (dayjs) + "±N days", a track with a confidence band (low→high) and an expected marker; basis caption ("Based on K sprints · 1 active blocker"). Commit.

### Task 2.6: ProjectCard, HealthHeatmap, RiskRollup
**Files:** `project-card/`, `health-heatmap/`, `risk-rollup/`.
- [ ] **Step 1 — ProjectCard:** `{ project }` → name, `HealthBadge`, open-risk count, lead, lastSynced (dayjs relative), a tiny velocity sparkline (inline SVG from `velocityHistory`). Clickable → `/dashboard/projects/:id`.
- [ ] **Step 2 — HealthHeatmap:** `{ projects }` → grid of cells colored by status, score shown, hover tooltip; click → hub.
- [ ] **Step 3 — RiskRollup:** `{ riskByKind }` → horizontal bars per kind with counts.
- [ ] **Step 4 — Commit:** `git commit -am "feat(web): ProjectCard, HealthHeatmap, RiskRollup"`.

### Task 2.7: TraceabilityGraph (columnar lanes)
**Files:** `traceability-graph/TraceabilityGraph.tsx`.
- [ ] **Step 1:** `{ nodes:TraceNode[] }`. Render 7 vertical lanes (Requirement→…→Release). Place nodes in their lane; draw the parent→child relationship with simple CSS connectors or an SVG overlay; flag `orphan` nodes (destructive outline). Clicking a node highlights its ancestor/descendant chain (local state: highlightedId + walk parentId). Show a coverage % header (share of non-orphan chains). Keep it a lane/list layout — no force-graph lib.
- [ ] **Step 2 — Commit:** `git commit -am "feat(web): TraceabilityGraph (columnar lanes + orphan flags)"`.

### Task 2.8: EmptyState
**Files:** `empty-state/`.
- [ ] **Step 1:** `{ title, hint? }` centered muted state (for Kepler/low-data and error fallbacks). Commit.

---

## Milestone 3 — Screens (views + pages + routes)

> Per screen: build the View (composition + states), the thin Page wrapper, add the lazy route in `router.tsx`, and (for nav-level screens) the `APP_MENU` entry. Each data screen MUST handle: loading (skeleton/`PrimeLoader`), empty/partial (`EmptyState`, exercised by Kepler), and populated. Commit per screen.

### Task 3.0: Nav + routes wiring
**Files:** Modify `web/src/routes/routes.ts`, `web/src/routes/router.tsx`.
- [ ] **Step 1 — APP_MENU:** add items (lucide icons): Portfolio `Briefcase` `/dashboard/portfolio`, Projects `FolderKanban` `/dashboard/projects`, Traceability `GitBranch` `/dashboard/traceability`, Risks `TriangleAlert` `/dashboard/risks`, Reports `FileText` `/dashboard/reports`, Settings `Settings` `/settings`.
- [ ] **Step 2 — Routes:** add lazy imports + route entries under the existing `<DashboardLayout/>` children for all 7 routes (list above in File Structure). Reports route resolves the active project (`useActiveProject`) and renders `WeeklyReportPage`.
- [ ] **Step 3:** `yarn dev`; every nav item routes without error (pages can be stubs first). Commit: `git commit -am "feat(web): nav + routes for 7 screens"`.

### Task 3.1: Projects list (`/dashboard/projects`)
**Files:** `views/projects/ProjectsView.tsx`, `pages/dashboard/ProjectsPage.tsx`.
- [ ] **Step 1:** `useProjects()`; card-grid of `ProjectCard` with a `FilterBar` (status filter via segmented control, text search, sort). Card/table toggle (table via TanStack — optional, grid first). Loading skeleton; empty state. Page wrapper sets header "Projects".
- [ ] **Step 2 — Commit:** `git commit -am "feat(web): Projects list screen"`.

### Task 3.2: Project Hub (`/dashboard/projects/:id`) — reference screen
**Files:** `views/hub/ProjectHubView.tsx`, `pages/dashboard/ProjectHubPage.tsx`.
- [ ] **Step 1:** `useProject(id)`. Layout EXACTLY like the approved mockup: page header (crumb + `HealthBadge` pill + Export/Generate-report buttons); a 2-col grid → left `ReportNarrative` (hero), right rail = `HealthRing` + two `MetricStat` (risks/blockers) + `TimelineForecastBar`; below a 2-col → `RiskRow` list (top risks) + `DecisionRow` list (key decisions). Loading + not-found states.
- [ ] **Step 2 — Commit:** `git commit -am "feat(web): Project Hub (Narrative-First) screen"`.

### Task 3.3: Portfolio (`/dashboard/portfolio`)
**Files:** `views/portfolio/PortfolioView.tsx`, `pages/dashboard/PortfolioPage.tsx`.
- [ ] **Step 1:** `usePortfolio()`. AI executive-summary line on top; `HealthHeatmap`; `RiskRollup`; a throughput `MetricStat`; an at-risk projects list (reuse `ProjectCard` compact). Loading + states. Commit.

### Task 3.4: Traceability (`/dashboard/traceability`)
**Files:** `views/traceability/TraceabilityView.tsx`, `pages/dashboard/TraceabilityPage.tsx`.
- [ ] **Step 1:** active project from `useActiveProject()`; `useTraceability(id)`; render `TraceabilityGraph` + a coverage header + project selector. Loading + empty (Kepler). Commit.

### Task 3.5: Risks (`/dashboard/risks`, `/dashboard/risks/:id`)
**Files:** `views/risks/RisksView.tsx`, `views/risks/RiskDetailView.tsx`, `pages/dashboard/RisksPage.tsx`, `pages/dashboard/RiskDetailPage.tsx`.
- [ ] **Step 1 — Register:** `useRisks()`; TanStack `RiskTable` with filters (kind, severity, project) — columns: severity (`SeverityBadge`), title, subject (`EvidenceChip`), project, recommendation; row click → detail.
- [ ] **Step 2 — Detail:** `useRisk(id)`; `RiskDetailView` with full cited `EvidenceList`, recommendation, related items. Loading + not-found.
- [ ] **Step 3 — Commit:** `git commit -am "feat(web): Risk register + detail screens"`.

### Task 3.6: Weekly Report (`/dashboard/reports`)
**Files:** `views/reports/WeeklyReportView.tsx`, `pages/dashboard/WeeklyReportPage.tsx`.
- [ ] **Step 1:** active project; `useWeeklyReport(id)`; full readable page reusing `ReportNarrative` + structured sections (summary counts, completed / in-progress, stale stories, idle PRs, risks, recommendations, grounding footer); print-friendly container; a period selector (mock). Commit.

---

## Milestone 4 — Polish

### Task 4.1: i18n pass
- [ ] **Step 1:** Replace hardcoded UI strings across the 7 screens with `t('…')` keys; add keys to `en.json` and `ar.json` (use `forge-add-translations` to keep both in sync; `forge-i18n-sync` to verify parity). Add a language toggle to the header. Commit.

### Task 4.2: Dark mode audit
- [ ] **Step 1:** Run `forge-audit-dark-mode` over `web/src/components/shared` and `web/src/views`. Fix any hardcoded colors → semantic tokens. Toggle `.dark` (ThemeSwitcher) and verify all 7 screens. Commit.

### Task 4.3: RTL audit
- [ ] **Step 1:** Run `forge-audit-rtl`; switch language to `ar` and verify the shell, hub grid, heatmap, and traceability lanes mirror correctly (use logical properties / `ms-`/`me-`). Fix issues. Commit.

### Task 4.4: a11y + imports
- [ ] **Step 1:** Run `forge-audit-a11y` (focus rings via `FOCUS_RING`, ARIA on interactive cells, keyboard nav) and `forge-audit-imports` (alias usage, ordering). Fix. Commit.

### Task 4.5: Responsive + final QA
- [ ] **Step 1:** Verify sidebar→drawer and grid reflow at ~375/768/1280px on all screens. Final visual diff against the approved hub mockup. Commit `chore(web): responsive + final QA polish`.

---

## Verification (end-to-end)

- [ ] `cd web && yarn dev` → http://localhost:3000 with no console errors.
- [ ] All six nav items route; Projects → click a project → Hub; Hub matches the approved mockup; Risks row → detail; Reports/Traceability follow the active project.
- [ ] Kepler Analytics shows empty/partial states (not crashes).
- [ ] Theme toggle: all 7 screens render correctly in dark mode.
- [ ] Language = ar: layout mirrors (RTL) and strings translate.
- [ ] `yarn build` succeeds (`tsc -b && vite build`).
- [ ] `yarn lint` clean (or tracked exceptions).
- [ ] Mock note: `web/src/api/mock/index.ts` `api.*` fns mirror the eventual REST contract — document the swap in `web/src/api/mock/README.md`.

## Self-review notes
- Spec coverage: all 7 screens (shell config + projects + hub + portfolio + traceability + risks + report), mock data model, RSK tiers, theming/i18n/a11y/responsive, success criteria → each has a task. ✓
- Types: hook names (`useProjects/useProject/useWeeklyReport/usePortfolio/useRisks/useRisk/useTraceability`), `api.*` fns, and component props all reference the Task 1.1 types consistently. ✓
- No hardcoded colors in components (semantic tokens only) so dark mode is automatic. ✓
