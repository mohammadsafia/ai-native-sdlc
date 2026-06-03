---
id: AWP-HEALTH-001
title: Project Health Score (scope/timeline/velocity/tech-risk composite)
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
  depends_on: [AWP-RISK-001, AWP-FCST-001, AWP-GRAPH-001]
  relates_to: [AWP-HUB-009]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a project manager, I want a single project health score in [0,100] that **decomposes** into
four named sub-scores — scope, timeline, velocity, technical risk — each with the cited evidence
that drove it, so that I can trust the headline number because I can see exactly what produced it,
not an opaque gauge.

## Context / Background
This is the **Phase 2 composite Project Health Score** — the executive-readable roll-up that sits
on top of the read-only intelligence built earlier. It reads the normalized knowledge graph
([`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)), consumes the rule-based risk
engine ([`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md)) for the technical-risk dimension, and the
timeline forecast ([`AWP-FCST-001`](./AWP-FCST-001-timeline-forecast.md)) for the timeline
dimension. It feeds the Project Hub ([`AWP-HUB-009`](./AWP-HUB-009-project-hub.md)).

**Hard design constraint — the number alone is never shown; it must decompose, and it must be
deterministic.** This implements [`02`](../02-technical-foundation.md) §4: *separate deterministic
graph facts from AI inferences, ground every assertion in its source artifact, and never ship an
unmeasurable opaque score*. Concretely:

- The score is a composite in **[0,100]** computed from **exactly four named sub-scores** —
  `scope_health`, `timeline_health`, `velocity_health`, `technical_risk` (each itself in [0,100]) —
  combined by a **documented weighted formula**:
  `score = Σ_d (weight_d × sub_score_d) / Σ_d weight_d`, rounded to one decimal. Recomputing the
  formula from the four sub-scores and `sub_score_weights` MUST reproduce the headline score.
- The result **exposes the decomposition**: each sub-score is returned with *what drove it* and
  **cited evidence referencing real artifacts** (issue keys, sprint ids, PR ids, changelog
  `entry_id`s, the `rule_id`s/`subject_ref`s of the risks that lowered `technical_risk`, the
  `velocity_samples` behind `timeline_health`). The headline integer alone, without the four
  sub-scores and their evidence, is **never** a valid output.
- It is **deterministic on a frozen snapshot**: a pure function of (`snapshot_ref`, inputs). Same
  inputs ⇒ byte-identical structured output, including every sub-score and citation.
- **No black-box / no hallucinated value.** Each sub-score is produced by a named, deterministic
  contribution function over cited graph facts — no learned/opaque scoring — and no sub-score is
  emitted without the evidence basis that produced it.

A **status label** `green` | `amber` | `red` maps from the score via named thresholds (see Inputs).
This packet is **strictly read-only**: it reads a frozen snapshot and returns a score object; it
writes to no external tool and publishes nowhere.

## Data Sources & External APIs
- **Internal only** (no external API calls; `external_apis: []`). For one `project_key`, reads a
  **frozen graph snapshot** and the outputs of two upstream read-only engines bound to that same
  `snapshot_ref`:
  - **Graph** ([`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)): Issue nodes
    (`key`, `status`, `statusCategory`, `story_points`, `sprint`, `updated`, changelog with
    `entry_id`s), Sprint nodes (committed vs. completed points, dates), PullRequest nodes — the
    raw facts behind `scope_health` and `velocity_health`.
  - **Risk Engine** ([`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md)): the `risks[]`
    (`{kind, severity, subject_ref, evidence, rule_id}`) that drive `technical_risk`.
  - **Timeline Forecast** ([`AWP-FCST-001`](./AWP-FCST-001-timeline-forecast.md)): the
    `completion_dates` + `velocity_samples` that drive `timeline_health`.
- All upstream inputs are evaluated against the **same `snapshot_ref`** to preserve determinism and
  citation integrity. The snapshot is already tenant-scoped and RBAC-filtered upstream; this engine
  consumes it as-is and never widens the visibility of any cited artifact. No external auth/scopes.

## Inputs
- `project_key` (required) — the project to score.
- `snapshot_ref` (required) — the frozen graph snapshot all sub-scores and upstream engines read.
- `sub_score_weights` (default equal — `{scope_health: 0.25, timeline_health: 0.25,
  velocity_health: 0.25, technical_risk: 0.25}`) — the weights in the documented combination
  formula. The platform renormalizes by their sum.
- `amber_threshold` (default `70`) — at or above ⇒ `green`; below ⇒ at least `amber`.
- `red_threshold` (default `40`) — below ⇒ `red`. (`red_threshold` < `amber_threshold`.)
- `stale_story_days` (default `3`) — in-progress story with no activity within this many days
  counts as a stale story; rising stale-story count is a `scope_health` drag driver.
- `target_date` (optional) — the scope's committed target; `timeline_health` degrades as the
  forecast `expected` date exceeds it.
- `as_of` (default = the snapshot's capture time) — reference "now" for all age/projection math.
- Secrets by reference: none (internal graph access via the platform service identity).

## Outputs / Artifacts
A single `HealthScore` JSON object:
- `score`: a number in **[0,100]** (one decimal).
- `status`: `green` | `amber` | `red`, mapped from `score` via `amber_threshold` / `red_threshold`.
- `sub_scores`: **exactly four** keys — `scope_health`, `timeline_health`, `velocity_health`,
  `technical_risk` — each:
  `{value (0–100), weight, drivers: [{factor, direction (raises|lowers), magnitude,
  evidence_refs[]}]}`, where every id in `evidence_refs[]` (issue key / sprint id / PR id /
  changelog `entry_id` / risk `subject_ref`+`rule_id`) **exists verbatim in `snapshot_ref`** (or in
  the cited upstream report bound to it). This is the decomposition — the number is never shown alone.
- `formula`: the human-readable combination rule actually applied, e.g.
  `"score = Σ(weight×sub_score)/Σweight"`, plus the resolved `sub_score_weights` used.
- `generated_at`, `inputs_echo` (resolved inputs incl. defaults), `snapshot_ref`. Any optional
  `narrative` is grounded only in the fields above (no invented numbers).

## Acceptance Criteria

Scenario: The health score is a number within the allowed range
  Given a `snapshot_ref` for `project_key`
  When the scorer runs
  Then `score` is a number with 0 <= `score` <= 100.

Scenario: The result decomposes into exactly the four named sub-scores that combine per the formula
  Given the scorer produced a `HealthScore` for `snapshot_ref`
  When `sub_scores` is inspected
  Then `sub_scores` has exactly the four keys
       {scope_health, timeline_health, velocity_health, technical_risk}, each with a `value` in [0,100]
    And recomputing Σ(`weight`×`value`)/Σ(`weight`) over those four sub-scores, rounded to one
        decimal, equals the headline `score` (the documented formula is reproducible).

Scenario: Each sub-score carries cited evidence referencing real artifacts
  Given the scorer produced a `HealthScore`
  When each of the four `sub_scores` and its `drivers[].evidence_refs[]` are inspected
  Then every sub-score has at least one driver
    And every id named in any `evidence_refs[]` (issue key / sprint id / PR id / changelog entry_id /
        risk subject_ref+rule_id) exists verbatim in `snapshot_ref` or its bound upstream report
        (no sub-score value is produced without an evidence basis).

Scenario: A worsening signal lowers the relevant sub-score (direction of change)
  Given a baseline `snapshot_ref` A and its `HealthScore` H_A
    And a snapshot B identical to A except the count of stale in-progress stories
        (no activity within `stale_story_days`) is higher
  When the scorer runs on B with identical inputs, producing H_B
  Then H_B.`sub_scores.scope_health.value` < H_A.`sub_scores.scope_health.value`
    And scope_health has a driver with `direction` = "lowers" and `factor` naming stale stories,
        whose `evidence_refs[]` lists the additional stale issue keys present in snapshot B.

Scenario: The status label maps from the score per the named thresholds
  Given `amber_threshold` = 70 and `red_threshold` = 40
  When the scorer produces `score`
  Then `status` = "green" if `score` >= `amber_threshold`,
         "red" if `score` < `red_threshold`,
         and "amber" otherwise
    And the mapping uses no boundary other than `amber_threshold` and `red_threshold`.

Scenario: Re-weighting changes the headline score but not the sub-scores
  Given a fixed `snapshot_ref` and resulting four `sub_scores` whose values are not all equal
  When the scorer runs once with equal `sub_score_weights` and once with a weight set that favors
       the lowest-valued sub-score
  Then the two headline `score` values differ
    And each individual `sub_scores[*].value` is identical across both runs
        (weights affect only the combination, not the sub-score computation).

Scenario: Deterministic on a frozen snapshot
  Given identical inputs and the same `snapshot_ref`
  When the scorer runs twice
  Then the two `HealthScore` structured outputs are byte-identical
       (`score`, all four `sub_scores` incl. drivers/evidence_refs, and `status` all match;
        any free-form narrative is excluded from this comparison).

## Out of Scope
- **Black-box / learned (ML) scoring** of health, or any score whose value cannot be recomputed
  from the four cited sub-scores — v1 is a documented deterministic weighted composite only.
- Showing the headline number **without** its four sub-scores and their evidence — forbidden by
  design (decomposition is mandatory).
- Re-deriving risks or forecasts — those are owned by [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md)
  and [`AWP-FCST-001`](./AWP-FCST-001-timeline-forecast.md); this packet consumes their outputs.
- **Publishing / posting** the score anywhere (Confluence/Teams/Jira) — strictly read-only.
- Rendering/visualizing the gauge — that is the Project Hub ([`AWP-HUB-009`](./AWP-HUB-009-project-hub.md)).
- Live re-fetching from source tools; cross-project / portfolio health roll-ups (P7, later phase).

## Dependencies / Linked Packets
- **depends_on** [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md) — supplies the cited `risks[]` that
  drive `technical_risk`; without rule-based, evidence-cited risks the technical dimension cannot be
  decomposed or grounded.
- **depends_on** [`AWP-FCST-001`](./AWP-FCST-001-timeline-forecast.md) — supplies the
  `completion_dates` + `velocity_samples` that drive `timeline_health` (slack vs. `target_date`).
- **depends_on** [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) — the canonical
  graph store providing the Issue/Sprint/PR facts and changelog `entry_id`s behind `scope_health`
  and `velocity_health` and behind every citation.
- **relates_to** [`AWP-HUB-009`](./AWP-HUB-009-project-hub.md) — the hub's Health widget renders this
  score and, critically, its decomposition (sub-scores + evidence), never the bare number.

## Non-Functional Requirements
- **Performance:** compute the composite for a project of ≤ 5k issues / ≤ 200 sprints within 15s
  against an in-memory frozen snapshot (assuming upstream risk/forecast outputs are available for
  the same `snapshot_ref`).
- **Security/Privacy:** read-only; consumes an already tenant-scoped, RBAC-filtered snapshot and
  upstream reports; never widens artifact visibility; redact assignee PII in any persisted artifact
  per org policy; no secrets handled.
- **Idempotency/Reliability:** pure function of (`snapshot_ref`, inputs) ⇒ byte-identical output; if
  an upstream report (risk/forecast) is unavailable, mark that sub-score `unavailable` with a
  recorded reason and exclude its weight from the renormalized denominator rather than fabricating a
  value or crashing.
- **Observability:** emit each of the four sub-score values, the applied weights, the resolved
  `status`, and a count of evidence_refs cited per sub-score.
- **Cost:** **zero LLM calls** for the score math (deterministic composite); any optional narrative
  is ≤ 1 grounded LLM call and never the source of a number.

## Verification / Test Notes
- **Fixtures:** a frozen `fixtures/graph_snapshot_health.json` plus pinned upstream risk/forecast
  outputs bound to the same `snapshot_ref`, containing, at minimum: (1) a normal project →
  `score` in [0,100], four sub-scores present, recomputed formula matches headline; (2) snapshot
  pair A/B identical except B has more stale in-progress stories → assert
  scope_health(B) < scope_health(A) and the extra stale issue keys are cited; (3) inputs at the
  boundaries — a snapshot scoring exactly `amber_threshold` → `green`, one just below
  `red_threshold` → `red`, one between → `amber`; (4) a sub-score whose upstream report is absent →
  marked `unavailable`, weight excluded.
- **Range AC:** assert 0 <= score <= 100 for fixture (1).
- **Decomposition AC:** assert exactly the four sub-score keys; independently recompute
  Σ(weight×value)/Σweight to one decimal and assert it equals `score`.
- **Citation AC:** parse every `evidence_refs[]` id; assert each exists verbatim in `snapshot_ref`
  or its bound upstream report; assert every sub-score has ≥ 1 driver.
- **Direction AC:** run on A then B; assert scope_health drops and the new stale issue keys appear
  in the lowering driver's evidence.
- **Threshold AC:** run on fixture (3) boundary snapshots; assert the green/amber/red mapping uses
  only `amber_threshold` / `red_threshold`.
- **Re-weight AC:** run with equal vs. skewed `sub_score_weights`; assert headline differs while
  each `sub_scores[*].value` is unchanged.
- **Determinism AC:** run twice on the same `snapshot_ref`; diff structured fields → byte-identical.
- **No-LLM / read-only AC:** assert zero outbound model-gateway calls for the score path and zero
  write verbs in the run's request log.

## Open Questions
- *(none — packet is `ready`)*
