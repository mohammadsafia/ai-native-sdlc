---
id: AWP-GRAPH-001
title: Knowledge Graph Persistence & Traceability Spine
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
    ref: normalized-entities stream (from AWP-NORM-001)
    content_hash: runtime
  - system: internal
    object: service
    ref: graph store (Neo4j | Postgres + Apache AGE)
    content_hash: runtime
external_apis: []
dependencies:
  depends_on: [AWP-NORM-001]
  relates_to: [AWP-ER-001, AWP-HUB-009]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's knowledge graph, I want to persist canonical entities and their
relationships and expose traceability queries over the
`Requirement → Epic → Story → Task → PR → Deployment → Release` spine — with
orphan detection, strict tenant scoping, and point-in-time replay — so that every
downstream dashboard, report, and agent can answer "how does this connect, who
owns it, and what did we know when" from one trustworthy source.

## Context / Background
This is **Layer 4 (Knowledge Graph)** of the reference architecture
([`02`](../02-technical-foundation.md) §1) and the second half of Phase 0's
deterministic spine. It consumes the canonical `Artifact` / `Event` /
`Relationship` / `Actor` entities emitted by
[`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) and persists them in a
**graph store** ([`02`](../02-technical-foundation.md) §1 says *buy the store* —
Neo4j or Postgres + Apache AGE). It then exposes the **traceability spine** and
**orphan/coverage detection** that pillar P2 promises
([`01`](../01-product-architecture.md) §P2).

Scope boundaries: this packet persists the canonical entities and the
**single-source relationships already present on them** (e.g. Story→Epic from a
Jira parent field). It does **not** infer cross-tool links — Tier-0/Tier-1 entity
resolution is [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md), which
*writes additional edges into this store*; the spine therefore gets richer once ER
lands, but the store and its query surface are owned here. Per
[`02`](../02-technical-foundation.md) §4, **tenant isolation is existential**:
every graph query MUST be tenant-scoped — a tool ingesting an org's whole IP
cannot leak across tenants. Per P2, the graph must support a **temporal/event
log** for point-in-time replay ("what did we know when").

This packet is strictly **read-only with respect to source tools** — it never
writes back to Jira/Bitbucket/Confluence. Its only writes are into the
platform-owned graph store.

## Data Sources & External APIs
- **Normalized-entities stream** (`system: internal`): the output of
  [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) — canonical entities
  with `canonical_id`, `provenance`, and `raw_ref`.
- **Graph store** (`system: internal`): Neo4j or Postgres + Apache AGE, deployed
  schema/DB-per-tenant per [`02`](../02-technical-foundation.md) §4. Nodes =
  Artifacts/Actors; edges = Relationships (versioned, carrying ER metadata once
  [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md) populates them).
- No external tool API is called — `external_apis: []`.
- **Volumes:** size for ≥ 3 real projects ingested at Phase-0 exit
  ([`01`](../01-product-architecture.md) §3) and growth to org scale; spine
  queries must remain bounded by walking edges, not scanning all nodes.

## Inputs
- `tenant_id` (required) — every persist and every query is scoped to it.
- `entity` / `entity_batch` (required for persistence) — canonical entities from
  the normalized stream.
- `root_artifact_ref` (required for a traceability query) — the entity to trace
  from/through (e.g. a Requirement key).
- `as_of` (default = now) — point-in-time timestamp for temporal queries; `now`
  returns the current graph state.
- `spine_order` (default = `Requirement, Epic, Story, Task, PR, Deployment,
  Release`) — the ordered artifact types defining the traceability spine.
- `orphan_scope` (default = `Story, Task, PR`) — which artifact types are subject
  to "must have a parent on the spine" orphan checks.
- Trigger: new canonical entities on the stream (persistence) or an API/GraphQL
  traceability request (query).

## Outputs / Artifacts
- **Persisted graph**: canonical nodes + versioned relationship edges in the
  tenant-scoped store, each node carrying its `provenance` and `raw_ref`.
- **Traceability query result** (GraphQL/REST per
  [`02`](../02-technical-foundation.md) §1): for a `root_artifact_ref`, the ordered
  path along `spine_order` with each hop's `{artifact_type, canonical_id, edge_id}`,
  and a `complete` flag (true iff every consecutive spine link exists).
- **Orphan report**: `orphans[]` — artifacts in `orphan_scope` with no parent edge
  to the next-higher spine type — each `{canonical_id, artifact_type,
  missing_parent_type}`.
- **`orphan_rate`** — a per-tenant metric = `|orphans| / |artifacts in
  orphan_scope|`, exposed for the Phase-0 exit gate ("measured orphan rate").
- **Point-in-time snapshot**: the same query surface evaluated as-of `as_of`,
  excluding entities/edges created after that timestamp.

## Acceptance Criteria

Scenario: Fully-linked chain returns the complete spine path
  Given a tenant with a chain Requirement→Epic→Story→Task→PR→Deployment→Release where every consecutive edge exists
  When a traceability query runs for the Requirement as `root_artifact_ref` with default `spine_order`
  Then the result path contains all 7 artifact types in `spine_order`
    And the result `complete` flag = true.

Scenario: Artifact with no parent link is flagged as an orphan
  Given a Story in `orphan_scope` that has no parent edge to any Epic in the same tenant
  When the orphan report is computed
  Then that Story's `canonical_id` appears exactly once in `orphans[]` with `missing_parent_type` = "Epic".

Scenario: Tenant-scoped query returns zero cross-tenant entities (adversarial isolation)
  Given tenant A and tenant B each have entities, including a tenant-B Requirement chain
  When any traceability or orphan query runs with `tenant_id` = A
  Then the count of returned entities whose owning tenant is B equals 0
    And a query for a known tenant-B `root_artifact_ref` under `tenant_id` = A returns not-found, never tenant-B data.

Scenario: Point-in-time query returns graph state as-of a timestamp
  Given an edge E created at time T2, and `as_of` = T1 with T1 < T2
  When a traceability query runs with that `as_of`
  Then edge E (and anything created after T1) is absent from the result
    And re-running with `as_of` = now (≥ T2) includes edge E.

Scenario: orphan_rate is computed and exposed as a metric
  Given a tenant with K artifacts in `orphan_scope` of which M are orphans
  When the orphan report runs
  Then a per-tenant `orphan_rate` metric is emitted equal to M / K
    And `0 ≤ orphan_rate ≤ 1`.

## Out of Scope
- Cross-tool entity-resolution inference (Jira-key-in-commit, person stitching,
  URL/permalink extraction) — owned by
  [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md), which writes edges into
  this store.
- Mapping raw payloads to canonical entities — owned by
  [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md).
- Health scores, risk, forecasting, and report narratives (Phase 1 intelligence,
  e.g. [`AWP-HUB-009`](./AWP-HUB-009-project-hub.md) and
  [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md)).
- Vector/semantic search and embeddings (Phase 2).
- Any write-back to a source tool.

## Dependencies / Linked Packets
- **depends_on** [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) — the
  source of the canonical entities this store persists; without it there is nothing
  to graph.
- **relates_to** [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md) — adds
  cross-tool versioned edges into this store, enriching the spine; and
  [`AWP-HUB-009`](./AWP-HUB-009-project-hub.md) — the hub that renders traceability
  and orphan/coverage over this graph.

## Non-Functional Requirements
- **Performance:** a single-root spine traversal returns within an interactive
  bound (e.g. ≤ 1s) for a Phase-0-scale tenant by walking edges, not full scans;
  orphan-rate computation scoped to one tenant completes in batch within minutes.
- **Security/Privacy:** schema/DB-per-tenant; **every** query carries `tenant_id`
  and is enforced at the store boundary (not just app code); honor source-tool
  ACLs propagated via connectors per [`02`](../02-technical-foundation.md) §4;
  support PII redaction cascading into nodes/edges.
- **Idempotency/Reliability:** persisting the same `canonical_id` twice updates in
  place (upsert), never duplicates a node; edge writes are versioned so a re-derived
  link supersedes rather than duplicates.
- **Observability:** expose per-tenant `orphan_rate`, node/edge counts, spine
  coverage %, and graph sync freshness ("last updated") feeding the Phase-0 exit
  gate.
- **Cost:** deterministic graph operations only — **zero LLM calls**.

## Verification / Test Notes
- **Fixtures:** `fixtures/graph_full_chain.json` (one complete
  Requirement→…→Release chain), `fixtures/graph_orphan_story.json` (a parentless
  Story), and a **two-tenant** fixture seeding tenant A and tenant B with disjoint
  chains.
- **Spine AC:** load the full-chain fixture; query from the Requirement; assert all
  7 types present in order and `complete` = true.
- **Orphan AC:** load the orphan fixture; assert the Story appears once in
  `orphans[]` with `missing_parent_type` = "Epic".
- **Isolation AC (adversarial):** with the two-tenant fixture, run every query as
  tenant A; assert 0 tenant-B entities returned and that a tenant-B root resolves to
  not-found under tenant A. Repeat symmetrically for B.
- **Temporal AC:** insert edge E at T2; query with `as_of` = T1 (< T2) → E absent;
  query with `as_of` = now → E present.
- **Metric AC:** with M known orphans out of K in-scope artifacts, assert emitted
  `orphan_rate` == M / K and within [0,1].

## Open Questions
- *(none — packet is `ready`)*
