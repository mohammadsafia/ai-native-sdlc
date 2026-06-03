---
id: AWP-INTEL-002
title: Issue↔Commit Link Index
pillar: P2 Knowledge Graph
phase: Development
roadmap_phase: 1
owning_agent: none
type: read-only
status: ready
priority: P0
estimate: M
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: internal
    object: service
    ref: ER Tier-0 issue↔commit edges in the graph store (from AWP-ER-001)
    content_hash: runtime
external_apis: []
dependencies:
  depends_on: [AWP-ER-001]
  relates_to: [AWP-INTEL-014]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a delivery-intelligence consumer, I want a fast, queryable index that returns —
for any issue key — its linked commits with dates, for any commit — its resolved
issue key, and the **latest linked commit date per issue**, so that the Weekly
Status & Risk Report can compute its staleness signal without re-walking the graph
on every run.

## Context / Background
This packet builds the **issue↔commit link index** that
[`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md) depends on for its
staleness detection. It is a thin, read-optimized projection over the **Tier-0
deterministic** issue↔commit edges produced by
[`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md) and stored in the
[`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) graph. It does
**not** parse commit messages or resolve links itself — that is ER's job; this
packet only *indexes and serves* what ER already resolved.

The critical query is **"latest linked commit date per issue"** — the exact
staleness signal the Weekly Report's `stale_stories[]` and "no linked commit ever"
evidence rely on (see [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md)).

Trust boundary: by default the index includes **only deterministic + human-confirmed**
links — it must **not** silently absorb low-confidence guesses, mirroring
[`02`](../02-technical-foundation.md) §2 ("a Go/No-Go must never silently rest on a
0.7 guess"). This is controlled by `include_suggested` (default `false`); ER
"suggested" edges are excluded unless an operator explicitly opts in. The index is
**read-only** (no source-tool writes) and **tenant-scoped** like every graph query
([`02`](../02-technical-foundation.md) §4).

## Data Sources & External APIs
- **ER Tier-0 issue↔commit edges** (`system: internal`): edges in the
  [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) store written by
  [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md), each carrying
  `{confidence, method, evidence, created_by, status}`. The index reads
  `status ∈ {accepted}` plus human-confirmed links by default (and `suggested` only
  when `include_suggested` = true).
- **Commit canonical entities** for the commit `date` (authored/committed date) and
  hash; **Story/Issue canonical entities** for the issue key.
- No external tool API is called — `external_apis: []`. The index is a derived
  read-model, refreshed as ER edges change.
- **Volumes:** size for org-scale history (≥ 20k commits per active project window,
  consistent with [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md));
  lookups must be index-backed, not full graph walks.

## Inputs
- `tenant_id` (required) — every lookup is tenant-scoped.
- `issue_key` (for the issue→commits and latest-date queries).
- `commit_hash` (for the commit→issue query).
- `include_suggested` (default `false`) — when false, ER "suggested" edges are
  excluded; when true, they are included and the result marks them.
- `min_confidence` (default = `auto_accept_threshold` from
  [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md), i.e. `0.9`) — floor for
  inclusion when `include_suggested` = true.
- Trigger: an index query, or an incremental rebuild when ER edges for the tenant
  change.

## Outputs / Artifacts
- **`issue → commits` lookup**: for an `issue_key`, `commits[]` of
  `{commit_hash, date}` (empty list when none) — sorted by `date` descending.
- **`commit → issue` lookup**: for a `commit_hash`, the single resolved
  `issue_key` (or `null` when the commit has no deterministic/confirmed link).
- **`latest linked commit date per issue`**: for an `issue_key`,
  `latest_linked_commit_date` = max(`date`) over its included commits, or `null`
  when the issue has no linked commit ever (the staleness signal).
- An index `provenance` note per entry: which ER edge `status` values were included
  (reflecting `include_suggested` / `min_confidence`).

## Acceptance Criteria

Scenario: Issue with three linked commits returns all three with dates
  Given an issue key with exactly 3 deterministic linked commits in the tenant
  When the issue→commits query runs for that key
  Then `commits[]` has length 3
    And each element has a non-null `commit_hash` and a non-null `date`.

Scenario: Issue with no linked commits returns an empty list (the staleness signal)
  Given an issue key with zero linked commits in the tenant
  When the issue→commits query runs for that key
  Then `commits[]` is the empty list
    And the latest-linked-commit-date query returns `latest_linked_commit_date` = null (interpreted as "no linked commit ever").

Scenario: Latest-linked-commit-date returns the maximum commit date
  Given an issue key with linked commits dated D1, D2, D3 where D2 is the maximum
  When the latest-linked-commit-date query runs for that key
  Then `latest_linked_commit_date` = D2.

Scenario: With include_suggested=false, a suggested (0.7) link is not in the index
  Given a commit linked to an issue by an ER edge with `status` = "suggested" at confidence 0.7
    And `include_suggested` = false
  When the issue→commits and commit→issue queries run
  Then that commit is absent from the issue's `commits[]`
    And the commit→issue query for that commit returns `issue_key` = null.

Scenario: The index is tenant-scoped
  Given a tenant-B commit deterministically linked to a tenant-B issue
  When any index query runs with `tenant_id` = A
  Then the tenant-B commit and issue are absent from every result
    And a commit→issue query for the tenant-B `commit_hash` under `tenant_id` = A returns `issue_key` = null (never tenant-B data).

## Out of Scope
- Parsing commit messages / branch names / PR titles or resolving links — owned by
  [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md); this packet only indexes
  resolved edges.
- Computing staleness, risks, or the report narrative — owned by
  [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md), which consumes
  this index.
- Tier-2 / semantic issue↔commit inference (Phase 2).
- PR / deployment / release link indexing (separate concern of the spine; this
  packet is issue↔commit only).
- Any write-back to a source tool.

## Dependencies / Linked Packets
- **depends_on** [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md) — the
  source of the deterministic issue↔commit edges this index projects; without ER
  Tier 0 there are no links to index.
- **relates_to** [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md) —
  the Weekly Status & Risk Report whose staleness signal is the
  latest-linked-commit-date query this packet provides.

## Non-Functional Requirements
- **Performance:** issue→commits, commit→issue, and latest-date lookups are
  index-backed and return within an interactive bound (e.g. ≤ 200ms) at org-scale
  history; no full graph walk per query.
- **Security/Privacy:** tenant-scoped on every lookup; read-only; never logs
  secrets; commit authorship handled under PII policy per
  [`02`](../02-technical-foundation.md) §4.
- **Idempotency/Reliability:** an incremental rebuild after ER edge changes is
  idempotent — the same edge set yields the same index; the index reflects the
  current ER `status` (a link later rejected by a human disappears on rebuild).
- **Observability:** expose per-tenant indexed-edge counts, count of issues with
  `latest_linked_commit_date` = null (the staleness population), and last-rebuild
  freshness.
- **Cost:** deterministic projection — **zero LLM calls**.

## Verification / Test Notes
- **Fixtures:** `fixtures/issue_three_commits.json` (one issue, 3 deterministic
  linked commits with distinct dates), `fixtures/issue_no_commits.json` (an issue
  with none), `fixtures/commit_suggested_link.json` (a `status` = "suggested" 0.7
  edge), and a **two-tenant** fixture with a tenant-B linked pair.
- **Three-commits AC:** query the issue; assert `commits[]` length 3 with non-null
  hash + date each.
- **Empty / staleness AC:** query the no-commit issue; assert `commits[]` empty and
  `latest_linked_commit_date` = null.
- **Latest-date AC:** assert `latest_linked_commit_date` equals the max of the three
  fixture dates.
- **Suggested-exclusion AC:** with `include_suggested` = false, assert the suggested
  commit is absent from `commits[]` and commit→issue returns null; flip to true and
  assert it now appears, marked suggested.
- **Tenant-scope AC:** run all queries as tenant A against the two-tenant fixture;
  assert zero tenant-B rows and commit→issue for the tenant-B hash returns null.

## Open Questions
- *(none — packet is `ready`)*
