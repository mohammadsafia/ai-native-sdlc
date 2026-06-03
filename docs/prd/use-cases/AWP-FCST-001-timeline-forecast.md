---
id: AWP-FCST-001
title: Timeline Forecast (velocity + sprint history + blockers + scope)
pillar: P3 Intelligence
phase: Development
roadmap_phase: 2
owning_agent: PM
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
    ref: knowledge-graph (AWP-GRAPH-001 canonical store, frozen snapshot)
    content_hash: runtime
external_apis: []
dependencies:
  depends_on: [AWP-GRAPH-001, AWP-INTEL-002]
  relates_to: [AWP-HEALTH-001, AWP-EVAL-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a project manager, I want a completion-date **range** (low / expected / high) for a
scope, derived from historical velocity, sprint history, open blockers, and scope-change
signal — with the exact velocity samples cited — so that I can plan against an honest
confidence interval instead of a single hard date I cannot defend.

## Context / Background
This is the **Phase 2 timeline-forecasting** packet (see [`02`](../02-technical-foundation.md)
§5 phasing: forecasting lands in Phase 2). It reads the normalized knowledge graph built in
Phase 0 ([`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)) and uses the
issue↔commit link index ([`AWP-INTEL-002`](./AWP-INTEL-002-issue-commit-link-index.md)) to
establish per-sprint *completed* work. It produces a forecast for a **scope** — a set of
issues/points identified by an epic, a sprint set, a label, or an explicit issue-key list.

**Hard design constraint — decision support, never a decision.** This packet directly implements
[`02`](../02-technical-foundation.md) §4: *present forecasts as decision support, not decisions,
with error bands*; *ground every assertion in the source artifact it came from*; *separate
deterministic graph facts from AI inferences*. Concretely:

- The output is **always a range** `{low, expected, high}` at `confidence_level`. It **never**
  emits a single hard date. The interval is the product, not an afterthought.
- The forecast is **not a black-box number.** Every produced date decomposes into named,
  evidence-cited components — `velocity_samples` (the specific sprint ids and their
  completed-points, the citation), `remaining_work`, `blocker_adjustment`, and
  `scope_change_signal` — each traceable to a real graph artifact. The interval alone, with no
  decomposition, is never the deliverable.
- The forecast is **deterministic on a frozen snapshot**: a pure function of
  (`snapshot_ref`, scope selector, inputs). Same inputs ⇒ byte-identical structured output.
- **No hallucinated output.** A scope with **zero velocity history** yields an explicit
  `insufficient_data` result with a stated reason — never a guessed date. A forecast is only
  emitted when there is a triggering basis (≥1 usable velocity sample).

The forecasting math is **deterministic statistics over the velocity samples** (e.g. an
empirical/quantile or bootstrap interval), *not* an LLM. Any optional natural-language gloss must
be grounded only in the structured fields below. This packet is **strictly read-only**: it reads a
frozen graph snapshot and returns a forecast; it writes to no external tool and publishes nowhere.

## Data Sources & External APIs
- **Internal knowledge graph only** (no external API calls; `external_apis: []`). The forecaster
  reads a **frozen graph snapshot** for one `project_key` via the internal graph query layer
  ([`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)). Entities/edges consumed:
  - **Sprint** nodes: `sprint_id`, `start_date`, `end_date`, `state` (active/closed/future),
    committed vs. completed points per sprint (completed = points of issues that reached
    statusCategory Done within the sprint window).
  - **Issue** nodes: `key`, `status`, `statusCategory`, `story_points`, `sprint`, `updated`, and
    the **changelog** (sprint/scope/status transitions, each with an `entry_id` + timestamp) — the
    source of the scope-change signal.
  - **Relationship** edges: `blocked-by` / `depends-on` between issues (open-blocker signal),
    issue↔commit links from [`AWP-INTEL-002`](./AWP-INTEL-002-issue-commit-link-index.md)
    (corroborates real activity per sprint).
- The snapshot is already **tenant-scoped and RBAC-filtered upstream**; this engine consumes it
  as-is, never re-fetches from source tools, and never widens the visibility of any cited artifact.
  No external auth or scopes are required.

## Inputs
- `project_key` (required) — the project whose snapshot is evaluated.
- `snapshot_ref` (required) — identifier of the frozen graph snapshot (guarantees determinism).
- `scope_selector` (required) — how the forecast scope is identified: one of
  `{epic_key, sprint_ids[], label, issue_keys[]}`. Defines the `remaining_work` set.
- `lookback_sprints` (default `6`) — number of most-recent **closed** sprints whose completed
  points form the velocity sample set used as evidence.
- `confidence_level` (default `0.8`) — the probability mass of the reported interval; `low`/`high`
  are the (`(1−confidence_level)/2`, `1−(1−confidence_level)/2`) quantiles of the modelled
  completion-date distribution. Drives the width of the band.
- `scope_change_lookback_days` (default `14`) — window, ending at `as_of`, over which net
  story-points added to the scope are summed into `scope_change_signal`.
- `as_of` (default = the snapshot's capture time) — reference "now" for all age/projection math.
- Secrets by reference: none (internal graph access via the platform service identity).

## Outputs / Artifacts
A single `TimelineForecast` JSON object:
- `result`: `forecast` | `insufficient_data`.
- When `forecast`:
  - `completion_dates`: `{low, expected, high}` — calendar dates; **always all three**, never a
    single date. `low` ≤ `expected` ≤ `high`.
  - `confidence_level`: echoed `confidence_level`; `interval_method`: the named method used
    (e.g. `empirical_quantile` / `bootstrap`).
  - `velocity_samples[]`: the **evidence** — one entry per sampled sprint:
    `{sprint_id, completed_points, sprint_end_date}`. `sprint_id` values are real artifact ids
    present in `snapshot_ref`. This is the citation that makes the forecast non-black-box.
  - `decomposition`: the named drivers, each with cited evidence —
    `{remaining_work_points, remaining_work_issue_keys[], velocity_per_sprint_summary
    {mean, p_low, p_high, n_samples}, blocker_adjustment {open_blocker_issue_keys[], effect},
    scope_change_signal {net_points_added, contributing_changelog_entry_ids[], effect}}`.
    Every `*_issue_keys[]` / `*_entry_ids[]` value exists verbatim in `snapshot_ref`.
- When `insufficient_data`:
  - `reason` (e.g. `no_velocity_history`), `velocity_samples` = `[]`, and **no** dates.
- `generated_at`, `inputs_echo` (resolved inputs incl. defaults), `snapshot_ref`. No free-form LLM
  date is produced; any optional `narrative` is grounded only in the fields above.

## Acceptance Criteria

Scenario: A forecast produces a low/expected/high completion date for a scope
  Given a `snapshot_ref` for `project_key` with at least one closed sprint having completed points
    And a `scope_selector` resolving to a non-empty `remaining_work` set
  When the forecaster runs
  Then `result` = "forecast"
    And `completion_dates` contains all three of `low`, `expected`, `high` as calendar dates
    And `low` <= `expected` <= `high`.

Scenario: The forecast cites the specific velocity samples (sprint ids) used as evidence
  Given a `snapshot_ref` whose most-recent closed sprints are S-4, S-5, S-6
    And `lookback_sprints` = 3
  When the forecaster runs and returns `result` = "forecast"
  Then `velocity_samples[]` has exactly 3 entries with `sprint_id` in {S-4, S-5, S-6}
    And every `sprint_id` in `velocity_samples[]` exists verbatim in `snapshot_ref`
    And each entry's `completed_points` equals that sprint's completed points in the snapshot.

Scenario: The output is a confidence interval at confidence_level, not a single date
  Given a `snapshot_ref` that yields a non-degenerate velocity sample (samples are not all equal)
    And `confidence_level` = 0.8
  When the forecaster runs
  Then `completion_dates.high` is strictly later than `completion_dates.low`
    And the echoed `confidence_level` field equals 0.8
    And the response contains no field that is a single scalar completion date outside
        `completion_dates` (the deliverable is the interval, not one date).

Scenario: Adding scope mid-window pushes the expected date later (direction of change)
  Given a baseline `snapshot_ref` A and forecast F_A for a fixed `scope_selector` and inputs
    And a snapshot B identical to A except story points were added to that scope via a changelog
        entry dated within `scope_change_lookback_days` of `as_of`
  When the forecaster runs on B with the same inputs, producing F_B
  Then F_B.`completion_dates.expected` is later than (>) F_A.`completion_dates.expected`
    And F_B.`decomposition.scope_change_signal.net_points_added` > 0
    And `scope_change_signal.contributing_changelog_entry_ids[]` names that scope-add entry id,
        which exists verbatim in snapshot B.

Scenario: The forecast is deterministic on a frozen snapshot
  Given identical inputs and the same `snapshot_ref`
  When the forecaster runs twice
  Then the two `TimelineForecast` structured outputs are byte-identical
       (`completion_dates`, `velocity_samples[]`, and `decomposition` all match;
        any free-form narrative is excluded from this comparison).

Scenario: No forecast is emitted for a scope with zero velocity history
  Given a `snapshot_ref` in which the `lookback_sprints` window contains no closed sprint with any
        completed points (zero usable velocity samples)
  When the forecaster runs
  Then `result` = "insufficient_data"
    And `reason` = "no_velocity_history"
    And `velocity_samples` is the empty list
    And the response contains no `completion_dates` (no guessed date is emitted).

Scenario: A backtest computes forecast error vs. actual completion when actuals exist
  Given a closed scope in `snapshot_ref` whose actual completion date is known
    And a forecast produced from data available strictly before that actual date
  When the backtest runs with named metric `mae_days` (mean absolute error in days)
  Then the backtest emits `mae_days` >= 0 computed as the mean absolute difference in days
       between each forecast's `completion_dates.expected` and the recorded actual completion date
    And the backtest is skipped (not failed) for any scope with no recorded actual.

## Out of Scope
- Emitting a **single hard completion date** or any forecast without an error band — forbidden by
  design; the interval is the product.
- **Black-box / learned (ML) forecasting** whose output cannot be decomposed into cited
  components — v1 is deterministic statistics over cited velocity samples only.
- The **Project Health Score** composite ([`AWP-HEALTH-001`](./AWP-HEALTH-001-project-health-score.md))
  — this packet feeds it, it does not compute it.
- The standing **eval harness** itself ([`AWP-EVAL-001`](./AWP-EVAL-001-eval-harness.md)) — this
  packet exposes a backtest hook and an error metric; the harness orchestrates golden-set runs.
- **Publishing / posting** the forecast anywhere (Confluence/Teams/Jira) — strictly read-only.
- Rendering/visualizing the forecast — that is the Project Hub ([`AWP-HUB-009`](./AWP-HUB-009-project-hub.md)).
- Live re-fetching from source tools, and cross-project / portfolio roll-ups (P7, later phase).

## Dependencies / Linked Packets
- **depends_on** [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) — the canonical
  graph store and query layer; without normalized Sprint/Issue nodes, per-sprint completed points,
  changelog entries, and dependency edges there is no velocity sample to cite and nothing to forecast.
- **depends_on** [`AWP-INTEL-002`](./AWP-INTEL-002-issue-commit-link-index.md) — the issue↔commit
  link index corroborates real per-sprint activity and grounds the completed-work basis of velocity.
- **relates_to** [`AWP-HEALTH-001`](./AWP-HEALTH-001-project-health-score.md) — the health score's
  `timeline_health` sub-score consumes this forecast (e.g. slack between `expected` and the target date).
- **relates_to** [`AWP-EVAL-001`](./AWP-EVAL-001-eval-harness.md) — the eval harness drives the
  backtest defined here against golden sets and tracks `mae_days` as forecast-error telemetry.

## Non-Functional Requirements
- **Performance:** produce a forecast for a scope over a project of ≤ 5k issues / ≤ 200 sprints
  within 10s against an in-memory frozen snapshot.
- **Security/Privacy:** read-only; consumes an already tenant-scoped, RBAC-filtered snapshot and
  never widens artifact visibility; redact assignee PII in any persisted artifact per org policy;
  no secrets handled.
- **Idempotency/Reliability:** pure function of (`snapshot_ref`, `scope_selector`, inputs) —
  byte-identical output for identical inputs; a missing optional node field degrades only the
  affected driver (e.g. blocker_adjustment effect = 0 with a recorded note), never crashing the run.
- **Observability:** emit sample-count used, interval width (`high − low` in days), counts of open
  blockers and net scope-points considered, and whether the result was `forecast` vs.
  `insufficient_data`.
- **Cost:** **zero LLM calls** for the forecast math (deterministic statistics); any optional
  narrative is ≤ 1 grounded LLM call and never the source of a date.

## Verification / Test Notes
- **Fixtures:** a frozen `fixtures/graph_snapshot_forecast.json` containing, at minimum:
  (1) a scope with ≥ `lookback_sprints` closed sprints having varied completed points → a normal
  `forecast` with low<expected<high and `velocity_samples[]` citing those `sprint_id`s;
  (2) snapshot pair A/B identical except B adds story points to the scope via a changelog entry
  inside `scope_change_lookback_days` → assert F_B.expected > F_A.expected and the entry id is cited;
  (3) a scope whose lookback window has no closed sprint with completed points → `insufficient_data`
  / `no_velocity_history` and no dates; (4) a closed scope with a recorded actual completion date →
  backtest produces a numeric `mae_days` >= 0; (5) a scope with no recorded actual → backtest skipped.
- **Range AC:** assert all three dates present and ordered for fixture (1).
- **Citation AC:** parse `sprint_id`s and all `*_issue_keys[]` / `*_entry_ids[]` out of
  `velocity_samples[]` + `decomposition`; assert each exists verbatim in `snapshot_ref` (no
  fabricated id).
- **Interval-not-single-date AC:** assert high>low and `confidence_level` echoed; assert no scalar
  completion-date field exists outside `completion_dates`.
- **Scope-direction AC:** run on A then B with identical inputs; assert expected date moves later
  and `net_points_added` > 0.
- **No-hallucination AC:** run on fixture (3); assert `result` = "insufficient_data",
  `velocity_samples` = [], and `completion_dates` absent.
- **Determinism AC:** run twice on the same `snapshot_ref`; diff structured fields → byte-identical.
- **Backtest AC:** run the backtest on fixtures (4) and (5); assert numeric `mae_days` >= 0 on (4)
  and a recorded skip (not a failure) on (5).
- **No-LLM / read-only AC:** assert zero outbound model-gateway calls for the forecast path and zero
  write verbs in the run's request log.

## Open Questions
- *(none — packet is `ready`)*
