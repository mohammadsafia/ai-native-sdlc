---
id: AWP-ER-001
title: Entity Resolution — Tier 0 (deterministic) + Tier 1 (heuristic)
pillar: P2 Knowledge Graph
phase: Development
roadmap_phase: 0
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
    ref: canonical entities + graph store (from AWP-NORM-001 / AWP-GRAPH-001)
    content_hash: runtime
external_apis: []
dependencies:
  depends_on: [AWP-NORM-001, AWP-GRAPH-001]
  relates_to: [AWP-INTEL-002]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's entity-resolution pipeline, I want to collapse the same logical
unit of work scattered across tools into one graph entity using **cheap
deterministic IDs first (Tier 0)** then **explainable heuristics (Tier 1)** — every
link carrying confidence, method, and evidence, auto-accepting the certain ones,
suggesting the medium ones (kept out of the spine), and queuing the rest for a
human whose "No" sticks — so that the traceability spine is built on trustworthy,
auditable links and never silently rests on a guess.

## Context / Background
This packet implements the **tiered entity-resolution strategy** that
[`02`](../02-technical-foundation.md) §2 calls *the crux* — and is the part of
Phase 0 that turns single-source canonical entities into a cross-tool graph. It
consumes canonical entities from
[`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) and **writes versioned
edges into the graph store owned by
[`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)** — it does not
stand up its own store or query surface.

Two tiers are in scope (per [`02`](../02-technical-foundation.md) §2):
- **Tier 0 — deterministic ID links (~0.95–1.0):** Jira issue keys (`PROJ-123`)
  parsed from Bitbucket commit messages, **branch names**, and PR titles/descriptions;
  Bitbucket↔Jira native links (the dev panel); Confluence↔Jira macros/remote links;
  PR → deployment → release via pipeline/deployment metadata. **This is the
  traceability spine** — harvest aggressively.
- **Tier 1 — structured heuristics (~0.75–0.95), no LLM:** URL/permalink extraction
  from free text; **person identity stitching first** via Entra ID / email (UPN) as
  the join key — resolving people boosts everything downstream; temporal + authorship
  correlation (e.g. PR merged by the assignee within the story's sprint window).

**Tier 2 (semantic / AI matching) is explicitly OUT OF SCOPE — it is Phase 2.**
This is the deliberate phasing rule ([`01`](../01-product-architecture.md) §3,
[`02`](../02-technical-foundation.md) §5 Risk 1): *do not gate the MVP on Tier-2
quality.* No embeddings, no LLM adjudication in this packet.

Confidence & human-in-the-loop ([`02`](../02-technical-foundation.md) §2): every
edge stores `{confidence, method, evidence, created_by}` and is **versioned**.
Links **auto-accept** at/above `auto_accept_threshold`; **suggest** (provisional,
flagged "unconfirmed", **excluded from the traceability spine**) between
`suggest_threshold` and `auto_accept_threshold`; **queue for human confirmation**
below. **Negative links matter:** persisted human "No" decisions must never be
re-suggested. ER **precision/recall** is a first-class **per-tenant** metric.

## Data Sources & External APIs
- **Canonical entities** (`system: internal`): Artifacts/Actors/Events from
  [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md), including the raw
  text fields ER mines (commit messages, branch names, PR titles/descriptions, free
  text) and source-local identity fields on `Actor` (accountId, email, UPN).
- **Graph store** (`system: internal`): the
  [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) store this
  packet writes versioned edges into and reads existing edges from.
- **Person join key:** email/UPN sourced from M365 / **Entra ID** as already
  carried on canonical `Actor` records (the connectors surface it); no separate
  external identity API is called here — `external_apis: []`.
- **Volumes:** size for org-scale commit/PR history; Tier-0 parsing is linear over
  artifacts; person stitching blocks on the email key (never all-pairs).

## Inputs
- `tenant_id` (required) — ER runs and edges are tenant-scoped.
- `auto_accept_threshold` (default `0.9`) — at/above this, links auto-accept.
- `suggest_threshold` (default `0.6`) — at/above this but below
  `auto_accept_threshold`, links are "suggested" (excluded from the spine); below
  this, links are queued for human confirmation.
- `jira_key_pattern` (default `[A-Z][A-Z0-9]+-\d+`) — the issue-key regex parsed
  from commit messages / branch names / PR titles.
- `resolve_people_first` (default `true`) — run person stitching before
  artifact-level Tier-1 correlation.
- Secrets by reference: read-scoped graph-store credentials only.
- Trigger: new/updated canonical entities for the tenant, or an ER re-run / backfill.

## Outputs / Artifacts
- **Versioned edges** written to the graph store, each carrying
  `{confidence, method, evidence, created_by}` where:
  - `method` ∈ `{deterministic, heuristic}` (`deterministic` = Tier 0;
    `heuristic` = Tier 1) plus a `signal` sub-type (e.g. `commit-key`,
    `branch-name`, `native-link`, `url-extract`, `email-stitch`,
    `temporal-authorship`).
  - `evidence` = the **non-empty** cited proof (e.g. the matched substring + the
    commit hash; the two source identities + the shared email; the extracted URL).
  - `status` ∈ `{accepted, suggested, queued, rejected}` derived from the
    thresholds; `suggested` edges are flagged `in_spine = false`.
  - `created_by` ∈ `{tier0, tier1, human:<actor>}`.
- A merged **Actor** per person, stitching source-local identities that share an
  Entra email/UPN.
- A **human-confirmation queue** of below-`suggest_threshold` candidates
  `{evidence}` for "Yes / No / Different thing".
- A persisted **negative-decision set** (human "No"s) consulted to suppress
  re-suggestion.
- **Per-tenant ER metrics:** `precision` and `recall` (against a confirmed/labeled
  set), plus counts by `status` and `method`.

## Acceptance Criteria

Scenario: Jira key in a commit message creates a deterministic, auto-accepted edge
  Given a Bitbucket commit whose message contains "PROJ-123" matching `jira_key_pattern`
    And a canonical Story with key "PROJ-123" exists in the same tenant
  When Tier 0 runs
  Then an issue↔commit edge is created with `method` = "deterministic"
    And `confidence` ≥ 0.95
    And the edge `status` = "accepted" (since `confidence` ≥ `auto_accept_threshold`)
    And `evidence` is non-empty and includes the matched "PROJ-123" substring and the commit hash.

Scenario: Same Entra email stitches a person across Jira and Bitbucket into one Actor
  Given an Actor seen in Jira and an Actor seen in Bitbucket that share the same Entra email/UPN
    And `resolve_people_first` = true
  When Tier 1 person stitching runs
  Then the two source identities resolve to a single canonical `Actor`
    And the stitch edge's `method` = "heuristic" with `signal` = "email-stitch"
    And `evidence` names the shared email/UPN.

Scenario: A 0.7-confidence match is "suggested" and excluded from the spine
  Given a candidate link scored at confidence 0.7
    And `suggest_threshold` = 0.6 and `auto_accept_threshold` = 0.9
  When ER classifies it
  Then the edge `status` = "suggested"
    And the edge has `in_spine` = false
    And a traceability spine query (per AWP-GRAPH-001) does NOT traverse that edge.

Scenario: A human "No" prevents re-suggestion of that link
  Given a suggested link between entity X and entity Y
  When a human records decision "No" (not the same / wrong)
  Then the pair {X, Y} is stored in the negative-decision set
    And on the next ER run no edge between X and Y is created or re-suggested
    And the queue count for {X, Y} is 0.

Scenario: Every edge carries non-empty evidence
  Given an ER run over the tenant's canonical entities
  When all edges have been written
  Then the count of edges whose `evidence` is empty/null equals 0.

Scenario: ER precision and recall are exposed as per-tenant metrics
  Given a tenant with a confirmed/labeled link set
  When ER metrics are computed
  Then a per-tenant `precision` and `recall` value are emitted
    And each is in the range [0, 1].

## Out of Scope
- **Tier-2 semantic / AI matching (Phase 2)** — embedding artifact text, vector
  candidate retrieval, and LLM adjudication of "same thing?" are explicitly not in
  this packet ([`02`](../02-technical-foundation.md) §2; do not gate the MVP on
  Tier-2 quality).
- Owning the graph store or traceability/query surface — provided by
  [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md).
- Mapping raw payloads to canonical entities — owned by
  [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md).
- Connectors / sources beyond Jira + Bitbucket + Confluence (Teams smart-links,
  Figma, Miro, M365 — Phase 2).
- Any write-back to a source tool.

## Dependencies / Linked Packets
- **depends_on** [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) (the
  canonical entities + raw text/identity fields ER mines) and
  [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) (the store this
  packet writes versioned edges into).
- **relates_to** [`AWP-INTEL-002`](./AWP-INTEL-002-issue-commit-link-index.md) — the
  issue↔commit link index is built on this packet's Tier-0 deterministic output.

## Non-Functional Requirements
- **Performance:** Tier-0 parsing is linear in artifacts; person stitching and
  Tier-1 correlation **block on cheap keys** (email/URL) and never brute-force
  all-pairs; an incremental ER pass over a delta completes in minutes at org scale.
- **Security/Privacy:** tenant-scoped throughout; person identities handled under
  PII policy and redactable per [`02`](../02-technical-foundation.md) §4;
  read-scoped graph credentials.
- **Idempotency/Reliability:** re-running ER on unchanged inputs produces no new
  edge versions (idempotent); a re-derived link supersedes its prior version rather
  than duplicating; the negative-decision set is always consulted before creating an
  edge.
- **Observability:** per-tenant `precision`/`recall`, counts by `status` and
  `method`/`signal`, queue depth, and negative-decision-set size; confirmations and
  rejections are captured as labeled data feeding the eval/feedback loop.
- **Cost:** Tier 0/1 are deterministic, rule-based code — **zero LLM calls and zero
  embeddings** (that is the whole point of deferring Tier 2 to Phase 2).

## Verification / Test Notes
- **Fixtures:** `fixtures/commit_with_projkey.json` (commit message "PROJ-123 fix
  …" + a matching Story), `fixtures/branch_with_key.json`, `fixtures/person_dual_source.json`
  (same Entra email in Jira + Bitbucket), `fixtures/suggested_link_0_7.json` (a
  candidate scored 0.7).
- **Tier-0 AC:** run on the commit fixture; assert one edge with `method` =
  "deterministic", `confidence` ≥ 0.95, `status` = "accepted", and evidence
  containing "PROJ-123" + the commit hash.
- **Person-stitch AC:** run on the dual-source fixture; assert one merged Actor and
  a `signal` = "email-stitch" edge whose evidence names the shared email.
- **Suggested-exclusion AC:** classify the 0.7 fixture; assert `status` =
  "suggested" and `in_spine` = false; run an AWP-GRAPH-001 spine query and assert the
  edge is not traversed.
- **Negative-decision AC:** record a human "No" on a suggested pair; re-run ER;
  assert no edge between the pair and queue depth 0 for it.
- **Evidence AC:** after a full run, assert `count(edges where evidence is empty) ==
  0`.
- **Metrics AC:** with a labeled set, compute and assert `precision`/`recall` are
  emitted per tenant and within [0,1].

## Open Questions
- *(none — packet is `ready`)*
