---
id: AWP-HUB-009
title: Project Hub Dashboard
pillar: P3 Intelligence
phase: Development
roadmap_phase: 1
owning_agent: none
type: read-only
status: ready
priority: P0
estimate: L
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: internal
    object: service
    ref: platform internal API (graph + intelligence read models)
    content_hash: runtime
external_apis: []
dependencies:
  depends_on: [AWP-INTEL-014, AWP-RISK-001, AWP-PLAT-001]
  relates_to: [AWP-GRAPH-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a delivery manager or contributor on a project, I want a single per-project hub
dashboard showing health, risks, the AI weekly report, timeline, key decisions, and
blockers, so that I get one trustworthy at-a-glance view — scoped to what I'm allowed
to see, with AI narrative clearly labeled apart from graph facts, and with honest
"last synced / coverage" indicators.

## Context / Background
The Project Hub is the **Phase 1 read-only UI surface** that renders the intelligence produced by the
other Phase 1 packets (see [`01`](../01-product-architecture.md) §2 P3 and §3 Phase 1 anchor). It is a
**React dashboard, one view per project**, served from the platform's **internal API** ([`AWP-PLAT-001`](./AWP-PLAT-001-platform-api-rbac.md));
it calls **no external tool APIs directly** (`external_apis: []`) — Jira/Bitbucket data reaches it only
through the already-ingested, already-permission-filtered graph and intelligence read models.

It composes existing outputs and adds **no new analysis of its own**:
- **Health Score** widget (composite project health read model).
- **Risk Overview** widget — renders `risks[]` from the Risk Engine ([`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md)).
- **AI Weekly Status & Risk Report** widget — renders the `WeeklyReport` from ([`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md)).
- **Timeline**, **Key Decisions**, and **Blockers** widgets sourced from the graph.

Hard constraints from [`02`](../02-technical-foundation.md):
- **Tenant + RBAC scoped, honoring source-tool permissions** (§4): if a user cannot see the underlying
  Jira project at the source, they must not see that project's hub at all — visibility ACLs propagate
  from the connectors, not just app roles. Enforced server-side by [`AWP-PLAT-001`](./AWP-PLAT-001-platform-api-rbac.md);
  the hub must never render data the API would not return for that user.
- **Separate graph facts from AI inferences** (§4): every AI-generated narrative (the report narrative,
  any risk recommendation prose) is rendered with an explicit, visible **"AI"** label distinguishing it
  from deterministic graph facts, so AI inferences are contestable and not mistaken for ground truth.
- **Surface freshness & coverage** (§5 risk 5): show **"last synced"** per source and **coverage**
  indicators; when a source is incomplete the hub **degrades gracefully** rather than fabricating or
  failing — it never hides partial data behind a falsely "complete" view.

This packet is **strictly read-only**: it only reads internal read models and renders them. It performs
no write-back to any tool and carries no Guardrails block.

## Data Sources & External APIs
- **Internal platform API only** (`external_apis: []`; no third-party auth/scopes). The hub fetches, per
  `project_id`, from [`AWP-PLAT-001`](./AWP-PLAT-001-platform-api-rbac.md):
  - `GET /projects/{project_id}/health` → Health Score read model.
  - `GET /projects/{project_id}/risks` → `risks[]` from [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md).
  - `GET /projects/{project_id}/weekly-report` → `WeeklyReport` from [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md).
  - `GET /projects/{project_id}/timeline`, `/decisions`, `/blockers` → graph-sourced read models.
  - `GET /projects/{project_id}/freshness` → per-source `{source, last_synced_at, coverage_pct, complete}`.
- **RBAC is enforced server-side**: each endpoint returns `403`/empty for a user lacking source-tool
  access to `project_id`. The hub honors whatever the API returns and never bypasses it. Authn is the
  platform session (SSO/OIDC); the hub holds no tool credentials and makes no external calls.

## Inputs
- `project_id` (required) — the project whose hub is rendered (from the route, e.g. `/projects/:project_id`).
- `viewer_identity` (required) — the authenticated platform session used by the API for RBAC scoping.
- `coverage_warn_pct` (default `100`) — any source whose `coverage_pct` is below this shows a
  "partial coverage" indicator.
- `stale_after_minutes` (default `15`) — a source whose `last_synced_at` is older than this relative to
  now renders its "last synced" indicator in a warning state.
- Secrets by reference: none (the hub is a client of the internal API; no tool tokens client-side).

## Outputs / Artifacts
- A **React per-project dashboard** route (`/projects/:project_id`) composed of widgets:
  - **Health Score**, **Risk Overview** (`risks[]`), **AI Weekly Status & Risk Report**
    (the `WeeklyReport`), **Timeline**, **Key Decisions**, **Blockers**.
- A reusable **"AI" badge/label** component applied to every AI-generated narrative block, visually and
  semantically (e.g. `aria-label`/`data-source="ai-inference"`) distinct from graph-fact blocks
  (`data-source="graph-fact"`).
- A **freshness/coverage banner (or per-widget chip)** showing each source's `last_synced` timestamp and
  a "partial coverage" indicator when `coverage_pct < coverage_warn_pct`.
- A **degraded/empty placeholder** rendering per widget for the case where that widget's underlying source
  is unavailable, carrying a stable `data-state="placeholder"` observable.
- No persisted artifact and **no external write** — the hub is a render surface over read models.

## Acceptance Criteria

Scenario: Hub renders the AI weekly report for an authorized viewer
  Given a `project_id` whose API returns a `WeeklyReport` from AWP-INTEL-014
    And a `viewer_identity` with source-tool access to that project
  When the user opens `/projects/:project_id`
  Then the AI Weekly Status & Risk Report widget renders that `WeeklyReport`'s content
       (its summary counts and narrative appear in the DOM).

Scenario: A user without source access to the Jira project cannot see that project's hub (RBAC)
  Given a `viewer_identity` that lacks access to the underlying Jira project for `project_id`
    And the internal API returns 403 (or empty) for that user on that project's endpoints
  When the user navigates to `/projects/:project_id`
  Then the hub does NOT render any of that project's data
    And it shows an access-denied / not-found state (no health, risks, report, timeline, decisions,
        or blockers content present in the DOM).

Scenario: AI-generated narrative is explicitly labeled and distinguished from graph facts
  Given the hub has rendered the weekly report narrative and a risk recommendation
        (both AI inferences) alongside graph-sourced facts (e.g. issue counts)
  When the rendered page is inspected
  Then each AI narrative block carries a visible "AI" label and `data-source="ai-inference"`
    And each graph-fact block carries `data-source="graph-fact"`
    And no AI narrative block is rendered without the "AI" label.

Scenario: Incomplete data source shows a "last synced / partial coverage" indicator instead of failing
  Given the freshness endpoint reports a source with `coverage_pct` below `coverage_warn_pct`
        (or `last_synced_at` older than `stale_after_minutes`)
  When the hub renders
  Then the affected widget (or banner) shows a "last synced <timestamp>" value
    And shows a "partial coverage" indicator
    And the rest of the hub still renders its available widgets (the page does not error out).

Scenario: A widget whose data source is unavailable degrades to a placeholder, not a crash
  Given the API endpoint backing one widget (e.g. risks) returns an error or no data
  When the hub renders `/projects/:project_id`
  Then that widget renders an empty/placeholder state with `data-state="placeholder"`
    And every other widget on the hub still renders normally
    And the page does not throw an unhandled error (no error-boundary fallback replaces the whole page).

Scenario: Health, Risk Overview, and the report all render together for an authorized viewer
  Given a `project_id` whose API returns health, `risks[]`, and a `WeeklyReport`
    And an authorized `viewer_identity`
  When the user opens `/projects/:project_id`
  Then the Health Score widget, the Risk Overview widget (showing the returned `risks[]` items),
       and the AI Weekly Status & Risk Report widget are all present in the DOM.

## Out of Scope
- Any **analysis, scoring, or risk detection** in the hub itself — it only renders read models produced
  by [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md), [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md),
  and the health read model.
- **Write-back / editing** of any artifact (no transitions, comments, PRs) — strictly read-only; no Guardrails.
- **Cross-project / portfolio rollups** and executive dashboards (P7, later phase).
- Direct calls to Jira/Bitbucket/Confluence from the client (the hub uses only the internal API).
- Defining the RBAC/permission propagation logic — that is owned by [`AWP-PLAT-001`](./AWP-PLAT-001-platform-api-rbac.md);
  the hub only honors the API's authorization decisions.
- Real-time push/streaming updates (Phase 1 is request/refresh; live sync is later).

## Dependencies / Linked Packets
- **depends_on** [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md) — supplies the
  `WeeklyReport` the report widget renders.
- **depends_on** [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md) — supplies `risks[]` for the Risk
  Overview widget.
- **depends_on** [`AWP-PLAT-001`](./AWP-PLAT-001-platform-api-rbac.md) — the internal API + RBAC layer
  that enforces tenant scoping and source-tool permission honoring; the hub renders only what it returns.
- **relates_to** [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-store.md) — the ultimate source of the
  timeline, decisions, and blockers read models exposed via the API.

## Non-Functional Requirements
- **Performance:** initial hub render (above-the-fold health + risks + report summary) within 2s on a
  warm API for a project of ≤ 5k issues; widgets may lazy-load independently so one slow source never
  blocks the page.
- **Security/Privacy:** **tenant + RBAC scoped, honoring source-tool permissions** — the client renders
  only what the RBAC-enforcing API returns and never bypasses it; no tool credentials in the browser;
  do not render assignee PII beyond what the API already exposes per org policy.
- **Idempotency/Reliability:** rendering is a pure function of the fetched read models; a failure of any
  single source degrades only its widget (placeholder), never the whole page; re-fetch is safe and
  side-effect-free.
- **Observability:** emit per-widget fetch latency/error rate, an event when a widget enters its
  placeholder state, and an event when a freshness/coverage warning is shown.
- **Cost:** **zero LLM calls** in the hub — it renders precomputed read models; no model inference at
  render time.

## Verification / Test Notes
- **Fixtures / mocks:** mock the internal API per `project_id` to return: (a) a full `WeeklyReport`,
  `risks[]`, and health for an authorized viewer; (b) `403`/empty for an unauthorized viewer; (c) a
  freshness payload with one source at `coverage_pct` below `coverage_warn_pct` and one with a stale
  `last_synced_at`; (d) an error/no-data response for the risks endpoint to drive the placeholder path.
- **Report-render AC:** assert the `WeeklyReport` summary counts and narrative text appear in the rendered DOM.
- **RBAC AC:** with the unauthorized-viewer mock, assert no project data nodes render and an
  access-denied/not-found state is shown (and that the client made no external/tool calls).
- **AI-label AC:** query the DOM for AI narrative blocks; assert each has the visible "AI" label and
  `data-source="ai-inference"`, graph facts have `data-source="graph-fact"`, and there is no AI block
  lacking the label.
- **Freshness/coverage AC:** with the partial-coverage mock, assert a "last synced <timestamp>" value and
  a "partial coverage" indicator render, and the rest of the hub still renders.
- **Placeholder/degradation AC:** with the risks-endpoint-error mock, assert the risks widget renders
  `data-state="placeholder"`, all other widgets render, and no whole-page error boundary is triggered.
- Component/integration tests via the project's React testing setup (e.g. Testing Library); assert on
  the named observables (`data-source`, `data-state`, the "AI"/"last synced"/"partial coverage" text).

## Open Questions
- *(none — packet is `ready`)*
