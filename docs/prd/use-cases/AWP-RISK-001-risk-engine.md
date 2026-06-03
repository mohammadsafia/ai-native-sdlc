---
id: AWP-RISK-001
title: Risk Engine v1 (rule-based, cited evidence)
pillar: P3 Intelligence
phase: Development
roadmap_phase: 1
owning_agent: PM
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
    ref: knowledge-graph (AWP-GRAPH-001 canonical store)
    content_hash: runtime
external_apis: []
dependencies:
  depends_on: [AWP-GRAPH-001, AWP-ER-001]
  relates_to: [AWP-INTEL-014, AWP-HUB-009]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a delivery manager, I want an explainable, rule-based risk engine that detects
delivery, scope-creep, dependency, and resource-overload risks over the project
knowledge graph, so that I can trust and act on each risk because it cites the exact
graph artifact that triggered it — not an opaque score.

## Context / Background
This is the **Risk Engine v1** for Phase 1 — one of the headline read-only intelligence
capabilities (see [`01`](../01-product-architecture.md) §2 P3 and §3 Phase 1 anchor).
It reads the normalized knowledge graph built by Phase 0 ([`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md))
with people/links resolved by entity resolution ([`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md)),
and emits a list of risks. It overlaps the `risks[]` shape produced by the weekly report
([`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md)) and feeds the Project Hub
([`AWP-HUB-009`](./AWP-HUB-009-project-hub.md)).

**Hard design constraint: v1 is rule-based and explainable — NO black-box / ML scoring.**
Every risk is produced by a named, deterministic rule, and **every** emitted risk MUST cite a
real graph artifact (a changelog entry id, an issue key, a PR id, a sprint id). This directly
implements the grounding/citation requirement in [`02`](../02-technical-foundation.md) §4:
ground every AI/derived assertion in the source artifact it came from, separate deterministic
graph facts from inferences, and **never fabricate** a risk. A risk with no triggering rule is
never emitted (no hallucinated risks).

This packet is **strictly read-only**: it reads the graph and returns risks. It does not write
to Jira/Bitbucket/Confluence and does not publish anywhere (that is a later active packet, out of
scope). Because it only consumes the already-permission-filtered graph, tenant/RBAC scoping is
enforced upstream by the graph store and honored by the hub that renders these risks; this engine
must not widen the visibility of any artifact it cites.

Risk kinds in v1 (each backed by exactly one named rule):
- **delivery** — stale in-progress stories (no activity within `staleness_days`), idle open PRs
  (no update within `idle_pr_days`), and a sprint slipping (remaining committed work projects to
  miss the sprint end by more than `sprint_slip_pct`).
- **scope_creep** — scope (a story / points) added to an **active** sprint **after** its start date.
- **dependency** — an in-progress/blocked issue sitting on a `blocked-by` / `depends-on` chain whose
  blocker is not yet Done.
- **resource_overload** — an assignee with more than `overload_threshold` concurrent in-progress issues.

## Data Sources & External APIs
- **Internal knowledge graph only** (no external API calls; `external_apis: []`). The engine reads a
  **frozen graph snapshot** for a single `project_key` via the internal graph query layer
  ([`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)). Entities/edges consumed:
  - **Issue** nodes: `key`, `type`, `status`, `statusCategory`, `assignee`, `story_points`,
    `sprint`, `updated`, and the **changelog** (status/sprint/scope transition entries, each with an
    `entry_id` and timestamp).
  - **Sprint** nodes: `sprint_id`, `start_date`, `end_date`, `state`, committed vs. remaining points.
  - **PullRequest** nodes: `pr_id`, `state`, `updated_on`, linked issue keys.
  - **Relationship** edges: `blocked-by` / `depends-on` between issues; `assigned-to` (Issue→Person).
- The graph snapshot is already **tenant-scoped and RBAC-filtered upstream**; this engine consumes it
  as-is and never re-fetches from source tools. No external auth or scopes are required.

## Inputs
- `project_key` (required) — the project whose graph snapshot is evaluated.
- `snapshot_ref` (required) — identifier of the frozen graph snapshot to read (guarantees determinism).
- `overload_threshold` (default `5`) — max concurrent in-progress issues per assignee before
  `resource_overload` is flagged.
- `idle_pr_days` (default `2`) — an open PR with no update within this many days is an idle-PR `delivery` risk.
- `staleness_days` (default `3`) — an in-progress story with no activity within this many days is a
  stale-story `delivery` risk.
- `sprint_slip_pct` (default `20`) — projected sprint shortfall (as a % of committed work) above which
  the active sprint is flagged as slipping (`delivery`).
- `as_of` (default = the snapshot's capture time) — the reference "now" for all age/projection math.
- Secrets by reference: none (internal graph access via the platform's service identity).

## Outputs / Artifacts
A single `RiskReport` JSON object:
- `risks[]`: each item is `{kind, severity, subject_ref, evidence, recommendation}` where:
  - `kind` ∈ `{delivery, scope_creep, dependency, resource_overload}`.
  - `severity` ∈ `{low, medium, high}`.
  - `subject_ref`: the primary graph entity the risk is about (e.g. `issue:PROJ-123`,
    `pr:42`, `sprint:Sprint-7`, `person:<id>`).
  - `evidence`: **non-empty** human-readable string that **cites a real artifact id present in the
    snapshot** (e.g. the changelog `entry_id`, the issue key, the PR id, the blocking issue key,
    the list of overloaded issue keys). This is what makes each risk explainable and verifiable.
  - `recommendation`: a short suggested next action (e.g. "rebalance assignee", "split the sprint",
    "unblock PROJ-120 first").
  - `rule_id`: the name of the deterministic rule that fired (provenance; e.g. `stale_story`,
    `scope_added_after_start`, `assignee_overload`).
- `generated_at`, `inputs_echo` (the resolved input values incl. defaults), `snapshot_ref`,
  and `rule_coverage` (the set of rule_ids evaluated). No free-form LLM narrative is produced here.

## Acceptance Criteria

Scenario: Scope added to an active sprint after its start is flagged as scope_creep
  Given a sprint with state "active" and a `start_date`
    And a story whose changelog has an entry adding it (or adding story points) to that sprint
        dated AFTER the sprint `start_date`
  When the engine runs on `snapshot_ref` for `project_key`
  Then `risks[]` contains an item with `kind` = "scope_creep"
    And its `subject_ref` is that story's issue key
    And its `evidence` references the changelog `entry_id` (a real artifact id) of that scope-add entry.

Scenario: An assignee over the overload threshold is flagged as resource_overload
  Given an assignee with a count of concurrent in-progress issues strictly greater than `overload_threshold`
  When the engine runs
  Then `risks[]` contains an item with `kind` = "resource_overload"
    And its `subject_ref` is that person's id
    And its `evidence` lists the in-progress issue keys (real artifact ids) whose count exceeds `overload_threshold`.

Scenario: An assignee at or below the overload threshold is not flagged
  Given an assignee whose count of concurrent in-progress issues equals `overload_threshold`
  When the engine runs
  Then `risks[]` contains no `resource_overload` item whose `subject_ref` is that person's id.

Scenario: Every emitted risk carries non-empty evidence citing a real artifact
  Given the engine produced a `RiskReport`
  When each item in `risks[]` is inspected
  Then every item's `evidence` is a non-empty string
    And every artifact id named in `evidence` (issue key / PR id / sprint id / changelog entry_id)
        exists verbatim in the `snapshot_ref` graph.

Scenario: Severity is always within the allowed set
  Given the engine produced a `RiskReport`
  When each item in `risks[]` is inspected
  Then every item's `severity` is one of {low, medium, high}.

Scenario: Kind is always within the allowed set
  Given the engine produced a `RiskReport`
  When each item in `risks[]` is inspected
  Then every item's `kind` is one of {delivery, scope_creep, dependency, resource_overload}.

Scenario: Deterministic on a frozen graph snapshot
  Given identical inputs and the same `snapshot_ref`
  When the engine runs twice
  Then the two `risks[]` outputs are byte-identical (same items, same order).

Scenario: No risk is emitted without a triggering rule (no hallucinated risks)
  Given a `snapshot_ref` in which no rule's condition is satisfied
        (every in-progress story is fresh within `staleness_days`, every open PR updated within
        `idle_pr_days`, no scope added after any sprint start, no unresolved blocker, and no assignee
        above `overload_threshold`)
  When the engine runs
  Then `risks[]` is empty.

Scenario: Stale in-progress story is flagged as a delivery risk
  Given an in-progress issue whose last activity is older than `staleness_days` relative to `as_of`
  When the engine runs
  Then `risks[]` contains an item with `kind` = "delivery" and `rule_id` = "stale_story"
    And its `evidence` names that issue key and its last-activity date.

Scenario: Idle open PR is flagged as a delivery risk
  Given an open PR whose `updated_on` is older than `idle_pr_days` relative to `as_of`
  When the engine runs
  Then `risks[]` contains an item with `kind` = "delivery" and `rule_id` = "idle_pr"
    And its `subject_ref` is that PR id
    And its `evidence` names that PR id and its `updated_on` date.

Scenario: Dependency risk on an unresolved blocked-by chain
  Given an in-progress issue with a `blocked-by` edge to another issue that is not in statusCategory "Done"
  When the engine runs
  Then `risks[]` contains an item with `kind` = "dependency"
    And its `subject_ref` is the blocked issue key
    And its `evidence` names the blocking issue key (a real artifact id).

## Out of Scope
- Any **black-box / ML / learned scoring** of risk — v1 is rule-based and explainable only.
- A composite Project Health Score (separate Phase 1 packet).
- Timeline / velocity **forecasting** beyond the simple deterministic sprint-slip projection (Phase 2).
- **Publishing, posting, or writing** risks anywhere (Jira/Bitbucket/Confluence/Teams) — strictly read-only.
- Rendering or visualizing risks — that is the Project Hub ([`AWP-HUB-009`](./AWP-HUB-009-project-hub.md)).
- Cross-project / portfolio risk rollups (P7, later phase).
- Live re-fetching from source tools — the engine reads only the frozen graph snapshot.

## Dependencies / Linked Packets
- **depends_on** [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) — the canonical graph
  store and query layer the engine reads; without normalized Issue/Sprint/PR nodes, changelog entries,
  and dependency edges there is nothing to evaluate or cite.
- **depends_on** [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md) — entity resolution stitches
  people across tools and resolves issue↔PR links; `resource_overload` (per-assignee counts) and PR-linked
  delivery risks require resolved person/link identity.
- **relates_to** [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md) — shares the
  `{kind, severity, subject_ref, evidence, recommendation}` risk shape; the report and this engine must
  agree on that contract.
- **relates_to** [`AWP-HUB-009`](./AWP-HUB-009-project-hub.md) — the hub's Risk Overview widget renders
  this engine's `risks[]`.

## Non-Functional Requirements
- **Performance:** evaluate all rules for a project of ≤ 5k issues / ≤ 20k commits / ≤ 2k PRs within 30s
  against an in-memory frozen snapshot.
- **Security/Privacy:** read-only; consumes an already tenant-scoped, RBAC-filtered graph snapshot and
  never widens artifact visibility; never log assignee PII (redact person identifiers per org policy);
  no secrets handled.
- **Idempotency/Reliability:** pure function of (`snapshot_ref`, inputs) — same snapshot + same inputs
  ⇒ byte-identical output; tolerate a missing optional field on a node by skipping only the rule it
  feeds, never crashing the whole run, and record the skip in `rule_coverage`.
- **Observability:** emit per-rule fire counts, per-rule evaluation latency, total nodes/edges scanned,
  and a count of risks emitted by kind and severity.
- **Cost:** **zero LLM calls** — all detection is deterministic rule code; no model inference in v1.

## Verification / Test Notes
- **Fixtures:** a frozen `fixtures/graph_snapshot_risk.json` containing, at minimum: (1) an active sprint
  with a story whose changelog has a scope-add entry dated after `start_date` → scope_creep with the
  `entry_id` cited; (2) an assignee with 6 in-progress issues (`overload_threshold`=5) → resource_overload
  listing the 6 keys; (3) an assignee with exactly 5 → NOT flagged; (4) an in-progress issue last touched
  6 days ago (`staleness_days`=3) → stale delivery risk; (5) a fresh in-progress issue touched today →
  not flagged; (6) an open PR not updated for 4 days (`idle_pr_days`=2) → idle_pr delivery risk; (7) an
  issue with a `blocked-by` edge to a non-Done issue → dependency risk; (8) a "clean" snapshot variant
  with no rule satisfied → empty `risks[]`.
- Run the engine against the fixture with a fixed `as_of`; assert membership/absence of each AC's item,
  and assert each `kind` ∈ allowed set and each `severity` ∈ {low, medium, high}.
- **Evidence-grounding AC:** for every emitted risk, parse artifact ids out of `evidence` and assert each
  exists verbatim in the snapshot (no id that is not in the graph).
- **No-hallucination AC:** run against the clean snapshot variant; assert `risks[]` is exactly empty.
- **Determinism AC:** run twice on the same `snapshot_ref`; diff the serialized `risks[]` → must be
  byte-identical including ordering.
- **No-LLM / read-only AC:** assert zero outbound model-gateway calls and zero write verbs in the run's
  request log.

## Open Questions
- *(none — packet is `ready`)*
