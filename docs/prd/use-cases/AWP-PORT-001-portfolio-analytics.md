---
id: AWP-PORT-001
title: Portfolio Analytics v1 (cross-project health & risk heatmap)
pillar: P7 Portfolio
phase: Development
roadmap_phase: 2
owning_agent: none
type: read-only
status: ready
priority: P1
estimate: L
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: internal
    object: service
    ref: per-project health + risks over the knowledge graph (from AWP-HEALTH-001 / AWP-RISK-001), tenant/RBAC-scoped via AWP-PLAT-001
    content_hash: runtime
external_apis: []
dependencies:
  depends_on: [AWP-HEALTH-001, AWP-RISK-001, AWP-PLAT-001]
  relates_to: [AWP-AGENT-004]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a portfolio lead, I want a single cross-project view — a health heatmap, risks
aggregated by kind, and delivery throughput per window — scoped to exactly the projects
I'm allowed to see, so that I can spot the projects in trouble across the whole portfolio
without opening each project's hub one at a time, and without ever seeing a project I have
no source access to.

## Context / Background
This is **Portfolio Analytics v1** for pillar **P7 Portfolio** — the **read-only**
cross-project rollup layer that sits on top of the per-project intelligence built in
earlier phases. It **does not** recompute health or risk; it **aggregates** what the
per-project engines already produce:
- per-project **health** from [`AWP-HEALTH-001`](./AWP-HEALTH-001-project-health-score.md),
- per-project **risks** from [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md),
- read over the knowledge graph,
- all of it **tenant + RBAC scoped** by
  [`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md).

Decisions an implementer must **not** re-derive:
- **Scope is the requester's *visible* projects, never all projects in the tenant.**
  [`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md) establishes that visibility
  **honors source-tool permissions** — an app role grants a *capability*, the **source
  ACL** grants *which artifacts/projects* ([`02`](../02-technical-foundation.md) §4: "if a
  user can't see a Jira project at the source, they must not see its artifacts in the
  hub"). The portfolio inherits this verbatim: a project the requester lacks source access
  to is **absent** from every rollup — not greyed out, not zero-valued, *absent*.
- **Degrade gracefully on incomplete project data.** A project missing health/risk inputs
  or with partial source coverage is shown with a **partial-coverage indicator** rather
  than being dropped or crashing the view — consistent with the
  `data_completeness`/"coverage" surfacing that [`02`](../02-technical-foundation.md) §5
  (Risk 5) and [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md) already
  establish for incomplete data.
- This packet is `read-only`: it serves an **internal API over the graph** and renders a
  view; it never writes back to a source tool, so it carries **no Guardrails block**
  ([`03`](../03-work-packet-format.md) §3, Rule 2). `external_apis: []` because it reads
  only internal platform services.

This is **v1**: heatmap + risk-by-kind aggregation + throughput-per-window. Forecasting
rollups, trend lines, and the portfolio agent narrative are out of scope (the agent is
[`AWP-AGENT-004`](./AWP-AGENT-004-executive-agent.md), a `relates_to`).

## Data Sources & External APIs
- **Per-project health** (`system: internal`): health scores/status per project from
  [`AWP-HEALTH-001`](./AWP-HEALTH-001-project-health-score.md) — the input to the heatmap cell
  colour/value.
- **Per-project risks** (`system: internal`): risks per project from
  [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md), each carrying a `kind` — aggregated to
  counts-per-kind across the visible projects.
- **Delivery signal** (`system: internal`): completed/delivered work events over the
  knowledge graph, used to compute throughput per project over the window.
- **Visibility / RBAC** (`system: internal`): the set of projects **visible** to the
  requester, resolved by [`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md) honoring
  source-tool permissions; the portfolio query is filtered to this set **before** any
  aggregation. No external API key is held — `external_apis: []`.
- **Volumes:** size for a tenant with up to a few hundred projects; the rollup is linear
  over the *visible* project set, computed from already-materialized per-project outputs.

## Inputs
- `tenant_id` (required) — every query is tenant-scoped
  ([`02`](../02-technical-foundation.md) §4).
- `requester_id` (required) — the actor whose **visible-project** set bounds the entire
  portfolio (RBAC + source ACL via
  [`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md)).
- `throughput_window_days` (default `30`) — the rolling window (ending at `as_of`) over
  which delivery throughput per project is computed.
- `as_of` (default = now) — the instant the rollup is evaluated against.
- Secrets by reference: read-scoped graph/health/risk-store credentials only.
- Trigger: a portfolio view load / refresh, or an internal-API request for the portfolio
  rollup.

## Outputs / Artifacts
A `PortfolioRollup` object (plus a rendered heatmap view) over the requester's **visible**
projects:
- `health_heatmap[]`: one cell per visible project `{project_id, health_value,
  health_band, partial_coverage}` — the heatmap grid.
- `risk_by_kind`: a map `{kind → count}` aggregating risks across the visible projects
  (counts per kind).
- `throughput[]`: per visible project `{project_id, delivered_count,
  window_days = throughput_window_days}` — delivery throughput over the window.
- `visible_projects[]` / `excluded_count`: the projects included, and the **number**
  excluded by RBAC/source-access (so the exclusion is an observable, not silent).
- `partial_coverage[]`: project ids flagged with the **partial-coverage indicator**
  (incomplete health/risk inputs or partial source coverage).
- `generated_at`, `inputs_echo` (including `throughput_window_days`, `as_of`).

## Acceptance Criteria

Scenario: Renders a health heatmap across all projects visible to the requester
  Given `tenant_id` and `requester_id` with a set V of source-visible projects
  When the portfolio rollup runs
  Then `health_heatmap[]` contains exactly one cell per project in V
    And every cell has a `health_value`/`health_band` sourced from AWP-HEALTH-001
    And no project outside V appears in `health_heatmap[]`.

Scenario: Aggregates risks by kind across the visible projects
  Given the visible projects V each carry risks with a `kind` from AWP-RISK-001
  When the portfolio rollup runs
  Then `risk_by_kind[kind]` equals the count of risks of that `kind` summed over V
    And the sum over all kinds equals the total risk count across V.

Scenario: A user without source access to a project does NOT see it in the portfolio
  Given a project P in `tenant_id` that `requester_id` cannot see at the source tool
    (per AWP-PLAT-001 source-permission honoring)
  When the portfolio rollup runs for `requester_id`
  Then P does NOT appear in `health_heatmap[]`, `risk_by_kind`, or `throughput[]`
    And P's risks are NOT counted in any `risk_by_kind` bucket
    And `excluded_count` includes P (the exclusion is reported as a count).

Scenario: Delivery throughput is computed over throughput_window_days
  Given `throughput_window_days` = 30 and `as_of`
    And a visible project with N delivery events in [`as_of` − 30 days, `as_of`]
  When the portfolio rollup runs
  Then that project's `throughput[].delivered_count` = N
    And its `throughput[].window_days` = `throughput_window_days`
    And delivery events outside that window are not counted.

Scenario: A project with incomplete data shows a partial-coverage indicator (not dropped, not crashed)
  Given a visible project missing some health/risk inputs or with partial source coverage
  When the portfolio rollup runs
  Then that project STILL appears in `health_heatmap[]`
    And its `partial_coverage` flag = true (and it is listed in `partial_coverage[]`)
    And the rollup completes successfully (the view does not error out).

## Out of Scope
- Computing per-project **health** or **risk** — owned by
  [`AWP-HEALTH-001`](./AWP-HEALTH-001-project-health-score.md) and
  [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md); this packet only **aggregates** them.
- **Cross-project forecasting**, trend lines, and predictive rollups (a later portfolio
  iteration).
- The **portfolio agent narrative** / conversational portfolio Q&A — that is
  [`AWP-AGENT-004`](./AWP-AGENT-004-executive-agent.md) (`relates_to`).
- Establishing identity/RBAC/source-permission resolution — owned by
  [`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md); this packet **consumes** the
  visible-project set.
- Any write-back to a source tool.

## Dependencies / Linked Packets
- **depends_on** [`AWP-HEALTH-001`](./AWP-HEALTH-001-project-health-score.md) — supplies the
  per-project health that fills heatmap cells;
  [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md) — supplies the per-project risks (with
  `kind`) aggregated into `risk_by_kind`;
  [`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md) — resolves the requester's
  source-visible project set, the RBAC boundary every rollup is filtered to.
- **relates_to** [`AWP-AGENT-004`](./AWP-AGENT-004-executive-agent.md) — the portfolio
  agent that will narrate / answer questions over this rollup data.

## Non-Functional Requirements
- **Performance:** the rollup is linear over the requester's **visible** project set
  (≤ a few hundred projects), reading already-materialized per-project health/risk outputs;
  a portfolio view loads within an interactive budget for that scale.
- **Security/Privacy:** **tenant-scoped** and **RBAC + source-ACL scoped** — the
  visible-project filter is applied **before** aggregation so a project the requester
  can't see at the source never contributes a cell, a risk count, or a throughput row
  ([`02`](../02-technical-foundation.md) §4); read-scoped credentials only.
- **Idempotency/Reliability:** **degrades gracefully** — a project with missing/partial
  inputs is flagged `partial_coverage` and still rendered; a single project's data gap
  never drops the project or crashes the whole view (Risk 5,
  [`02`](../02-technical-foundation.md) §5).
- **Observability:** emit `visible_projects` count, `excluded_count`,
  `partial_coverage[]` size, and the `throughput_window_days` used; expose per-project
  coverage so the partial-coverage indicator is explainable.
- **Cost:** purely deterministic aggregation over existing per-project outputs — **zero
  LLM calls** in v1 (narrative/Q&A is the separate agent packet).

## Verification / Test Notes
- **Fixtures:** `fixtures/portfolio_projects.json` with (1) several fully-covered visible
  projects with health + risks-by-kind + delivery events; (2) one project the requester
  **cannot** see at the source (RBAC-excluded); (3) one visible project with **partial**
  coverage (missing health or partial source data); (4) delivery events straddling the
  `throughput_window_days` boundary.
- **Heatmap AC:** run for the requester; assert `health_heatmap[]` has exactly one cell
  per visible project and none outside V.
- **Risk-by-kind AC:** assert `risk_by_kind[kind]` equals the summed per-kind counts over
  V and the total over all kinds equals V's total risk count.
- **RBAC-exclusion AC:** assert the source-hidden project is absent from heatmap,
  `risk_by_kind`, and `throughput[]`, its risks are uncounted, and `excluded_count`
  includes it.
- **Throughput AC:** with `throughput_window_days` = 30 and a frozen `as_of`, assert
  `delivered_count` counts only events inside the window and `window_days` ==
  `throughput_window_days`.
- **Partial-coverage AC:** assert the partial-coverage project still appears in the
  heatmap, its `partial_coverage` flag is true, it is listed in `partial_coverage[]`, and
  the rollup returns successfully (no error).

## Open Questions
- *(none — packet is `ready`)*
