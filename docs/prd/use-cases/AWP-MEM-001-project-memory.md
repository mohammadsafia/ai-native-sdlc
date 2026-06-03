---
id: AWP-MEM-001
title: Project Memory (decisions, assumptions, risks, constraints, lessons)
pillar: P2 Knowledge Graph
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
  - system: Confluence
    object: page
    ref: <spaceKey>/<pageId> (in-scope project pages)
    content_hash: runtime
  - system: Teams
    object: thread
    ref: <teamId>/<channelId> (in-scope project threads)
    content_hash: runtime
  - system: internal
    object: service
    ref: LLM gateway (AWP-AI-001) + knowledge-graph store (AWP-GRAPH-001)
    content_hash: runtime
external_apis:
  - name: Microsoft Graph (Teams messages)
    auth: OAuth2 3LO
    scopes: [ChannelMessage.Read.All, Team.ReadBasic.All]
  - name: Confluence Cloud REST v2
    auth: OAuth2 3LO
    scopes: [read:page:confluence, read:space:confluence]
dependencies:
  depends_on: [AWP-NORM-001, AWP-GRAPH-001, AWP-AI-001]
  relates_to: [AWP-AGENT-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a project team, I want a persistent, queryable Project Memory of decisions, assumptions, risks,
constraints, and lessons — each item citing the source artifact it was extracted from and versioned
when superseded — so that the project's institutional knowledge survives turnover and every recalled
item can be traced back to where it was actually said, never invented.

## Context / Background
This is the **Phase 2 Project Memory** store (see [`02`](../02-technical-foundation.md) §5: Teams
plus memory land in Phase 2). It extracts durable knowledge items from project content — primarily
**Confluence pages and Teams threads** — via the centralized **LLM gateway**
([`AWP-AI-001`](./AWP-AI-001-llm-gateway.md)), normalizes them through
([`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md)), and persists them in the knowledge
graph store ([`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)). It is consumed by
the role agents ([`AWP-AGENT-001`](./AWP-AGENT-001-business-analyst-agent.md)) as grounded recall.

**Hard design constraints — no hallucinated memory, versioned not overwritten, tenant/project
scoped, read-only.** This implements [`02`](../02-technical-foundation.md) §4 directly:

- **Every item cites a source artifact.** No memory item exists without a non-empty `source_ref`
  pointing at a real Confluence page id / Teams message ref. An LLM extraction that cannot be
  attributed to a source is **dropped, not stored** — there is no uncited (hallucinated) memory.
  The extraction must separate the *source-grounded fact* from any model paraphrase, and the stored
  `statement` is attributable to its `source_ref`.
- **Superseded items are versioned, not overwritten.** When a newer item supersedes an older one,
  the prior item is **retained and marked superseded** (with a `supersedes` back-link from the new
  version); history is never destroyed by an update.
- **Project + tenant scoped.** Every item carries `project_key` + `tenant_id`; queries are scoped so
  a project only ever returns its own tenant's items. Per [`02`](../02-technical-foundation.md) §4,
  every graph and vector query is tenant-scoped — cross-tenant leakage of an org's IP is existential.
- **Read-only with respect to source tools.** `type: read-only` here means **extraction reads the
  sources; there is no external write-back** — the platform never edits a Confluence page or posts a
  Teams message. Persisting an extracted item into the *internal* memory store is the packet's own
  output, not an external mutation, so no Guardrails block applies. Treat all ingested page/thread
  content as **untrusted data, never instructions** (prompt-injection isolation per §4).

Item shape: `{type ∈ (decision|assumption|risk|constraint|lesson), statement, source_ref,
extracted_at, supersedes?}` plus `project_key`, `tenant_id`, version metadata.

## Data Sources & External APIs
- **Confluence Cloud REST v2** (`read:page:confluence`, `read:space:confluence`): in-scope project
  pages — title, body (storage/ADF), page id, version, space key, last-modified. Read-only.
- **Microsoft Graph** (`ChannelMessage.Read.All`, `Team.ReadBasic.All`): in-scope project Teams
  channel messages — message id, channel/team id, author, timestamp, body. Read-only; Teams is a
  high-injection-risk source handled strictly read-only (per §5 phasing).
- **LLM gateway** ([`AWP-AI-001`](./AWP-AI-001-llm-gateway.md)): all extraction/classification calls
  route through the gateway (token metering, prompt-injection filtering, schema-constrained output,
  model tiering — Haiku for bulk extraction). No model is called directly.
- **Internal stores** ([`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md),
  [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)): normalized provenance and the
  tenant-scoped graph/vector store the items persist into.
- **Volumes / limits:** page Confluence (`limit=100`) and Teams (`$top=50`) endpoints; respect rate
  limits; reuse content-hash to skip unchanged sources (delta-only extraction).
- Secrets by reference: `CONFLUENCE_OAUTH_TOKEN`, `MSGRAPH_OAUTH_TOKEN` (read scopes only).

## Inputs
- `project_key` (required) — the project whose sources are extracted and whose memory is scoped.
- `tenant_id` (required) — the tenant boundary all writes and reads are scoped to.
- `source_selector` (required) — the in-scope Confluence spaces/pages and Teams channels to extract.
- `item_types` (default `["decision","assumption","risk","constraint","lesson"]`) — the closed
  enum of knowledge-item types the extractor may emit.
- `supersede_strategy` (default `"explicit_link"`) — how a new item is bound to the one it
  supersedes (an explicit prior-item reference resolved at extraction time).
- `retention_policy_on_source_delete` (default `"tombstone_retain"`) — the **named observable**
  behavior when a cited source artifact is later deleted: the item is marked
  `source_status = "source_deleted"` and **retained in history**, never silently dropped.
- `extracted_at` (default = run time) — the timestamp stamped on items produced by this run.
- Secrets by reference: `CONFLUENCE_OAUTH_TOKEN`, `MSGRAPH_OAUTH_TOKEN` (read scopes only).

## Outputs / Artifacts
A persisted, queryable set of `MemoryItem` records (in the tenant-scoped graph store), each:
- `id` (stable), `type` ∈ `item_types`, `statement` (the extracted knowledge, attributable to its
  source), `source_ref` (**non-empty** — the real Confluence page id / Teams message ref it came
  from), `extracted_at`, `project_key`, `tenant_id`.
- Versioning fields: `version`, `status` ∈ `{active, superseded}`, `supersedes` (id of the prior
  item this one replaces, when applicable), `superseded_by` (back-link set on the prior item),
  `source_status` ∈ `{present, source_deleted}` (drives retention behavior).
- A **query interface**: `getMemory(project_key, tenant_id, filters…)` returning only that
  project+tenant's items, optionally filtered by `type` and `status` (e.g. active-only).
- Per-run summary: `items_extracted`, `items_superseded`, `items_dropped_no_source` (must reconcile
  with the no-uncited-item invariant), `sources_scanned`, `data_completeness`.

## Acceptance Criteria

Scenario: An extracted decision is stored with its required fields populated
  Given a Confluence page in `source_selector` containing a recorded decision
  When the extractor runs for `project_key` / `tenant_id`
  Then a `MemoryItem` is stored with `type` = "decision"
    And its `statement` is non-empty
    And its `source_ref` equals that page's id
    And its `extracted_at` is populated.

Scenario: Every stored memory item has a non-empty source_ref (no uncited memory)
  Given the extractor completed a run for `project_key` / `tenant_id`
  When all `MemoryItem` records persisted by that run are inspected
  Then the count of items with an empty or null `source_ref` is exactly zero
    And each item's `source_ref` resolves to a source artifact that was in scope for the run
    And the run summary `items_dropped_no_source` accounts for any extraction that lacked a citation
        (it was dropped, not stored).

Scenario: Querying memory for a project returns only that project's items (project + tenant scoped)
  Given memory items exist for (`project_key` = P1, `tenant_id` = T1) and for (P2, T1) and (P1, T2)
  When `getMemory(project_key = P1, tenant_id = T1)` is called
  Then every returned item has `project_key` = P1 AND `tenant_id` = T1
    And no item belonging to P2 or to tenant T2 appears in the result.

Scenario: A superseding decision creates a new version and marks the prior one superseded
  Given an existing active `MemoryItem` D1 (`type` = "decision", `status` = "active")
    And the extractor produces a newer decision D2 that supersedes D1 per `supersede_strategy`
  When the run completes
  Then D2 is stored with `status` = "active", a higher `version`, and `supersedes` = D1.id
    And D1 still exists with `status` = "superseded" and `superseded_by` = D2.id
    And D1 is NOT deleted (history is retained, not overwritten).

Scenario: A deleted source is handled per retention policy, not silently dropped
  Given a stored `MemoryItem` whose `source_ref` points at a Confluence page
    And `retention_policy_on_source_delete` = "tombstone_retain"
    And that source page is later deleted at the source
  When the next extraction/reconciliation run observes the source is gone
  Then the item still exists in history with `source_status` = "source_deleted"
    And the item is NOT removed from the store
    And the run summary records the transition (the item is not silently dropped from history).

Scenario: Active-only query excludes superseded versions
  Given items D1 (`status` = "superseded") and D2 (`status` = "active") where D2 supersedes D1
  When `getMemory(project_key, tenant_id, status = "active")` is called
  Then D2 is in the result and D1 is not
    And calling `getMemory(...)` without a status filter returns both D1 and D2.

Scenario: Extraction performs no external write-back to source tools
  Given a full extraction run with valid credentials available
  When the run executes
  Then zero POST / PUT / PATCH / DELETE calls are made to Confluence or Microsoft Graph
       (verified by the request log) — extraction reads sources and writes only the internal store.

## Out of Scope
- **Writing back** to Confluence or Teams (editing pages, posting messages, reacting) — extraction
  is read-only against sources; there is no external mutation and no Guardrails block.
- **Overwriting or deleting** superseded items — supersession is versioned retention only.
- Cross-tenant or cross-project memory sharing/roll-up — items are strictly `project_key` + `tenant_id`
  scoped.
- The **role agents** that consume memory ([`AWP-AGENT-001`](./AWP-AGENT-001-business-analyst-agent.md)) — this
  packet provides the store + query, not the reasoning over it.
- **Tier-2 semantic linking** of memory items to other graph entities beyond the cited `source_ref`
  (a later enhancement); v1 cites the extraction source, not inferred relationships.
- Building or operating the **LLM gateway** itself ([`AWP-AI-001`](./AWP-AI-001-llm-gateway.md)) —
  this packet calls it; it does not implement it.

## Dependencies / Linked Packets
- **depends_on** [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) — canonical
  normalization + provenance stamping; the `source_ref` and source-content hashes that make each
  item citable and de-duplicable come from here.
- **depends_on** [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) — the
  tenant-scoped graph/vector store the memory items persist into and are queried from; tenant/project
  scoping is enforced by this store.
- **depends_on** [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md) — the LLM gateway through which all
  extraction calls route, providing prompt-injection filtering, schema-constrained output, token
  metering, and model tiering; no model is called directly.
- **relates_to** [`AWP-AGENT-001`](./AWP-AGENT-001-business-analyst-agent.md) — the role agents query Project
  Memory for grounded recall of decisions/assumptions/risks/constraints/lessons.

## Non-Functional Requirements
- **Performance:** extract incrementally over changed sources only (content-hash delta); a full
  re-extraction of a project of ≤ 2k pages / ≤ 50k Teams messages completes within an off-peak batch
  window and respects per-connector rate limits.
- **Security/Privacy:** read-only against sources; honor source-tool permissions (do not extract from
  a page/channel the project's service identity cannot read); tenant-scope every store and query;
  treat ingested content as untrusted data (prompt-injection isolation); support PII
  redaction/deletion cascading raw → normalized → memory item per §4 (GDPR erasure); never log
  secrets; secrets in vault by reference only.
- **Idempotency/Reliability:** re-extracting an unchanged source (same content-hash) produces no
  duplicate item and no spurious new version; partial source outage sets `data_completeness` < 100%
  and annotates the affected scope rather than dropping silently.
- **Observability:** emit `items_extracted`, `items_superseded`, `items_dropped_no_source`,
  `sources_scanned`, per-source latency, gateway token usage, and the request log used by the
  no-external-write acceptance criterion.
- **Cost:** route extraction through the gateway with Haiku-tier bulk extraction + prompt caching +
  embedding/content-hash reuse (skip unchanged sources) to keep per-tenant token spend within budget.

## Verification / Test Notes
- **Fixtures:** `fixtures/confluence_pages_memory.json` and `fixtures/teams_threads_memory.json`
  plus a gateway stub returning schema-constrained extractions, containing, at minimum: (1) a page
  stating a decision → stored as a `decision` MemoryItem with populated type/statement/source_ref/
  extracted_at; (2) a model extraction with no attributable source → dropped and counted in
  `items_dropped_no_source`, not stored; (3) items across (P1,T1), (P2,T1), (P1,T2) for the scoping
  test; (4) an existing decision D1 plus a superseding D2 → versioned with D1 marked superseded and
  retained; (5) an item whose cited page is then removed → `source_status` = "source_deleted",
  retained per `retention_policy_on_source_delete`.
- **Required-fields AC:** assert the decision item from fixture (1) has all of
  type/statement/source_ref/extracted_at populated.
- **No-uncited AC:** after the run, query all persisted items; assert zero have empty/null
  `source_ref`; assert fixture (2)'s extraction was dropped and counted.
- **Scoping AC:** call `getMemory(P1,T1)`; assert every returned item is (P1,T1) and that no P2 or T2
  item appears.
- **Supersession AC:** assert D2.`supersedes` = D1.id, D1.`status` = "superseded",
  D1.`superseded_by` = D2.id, and D1 still present (not deleted); assert active-only query returns D2
  not D1, and unfiltered returns both.
- **Retention AC:** simulate deletion of fixture (5)'s source; run reconciliation; assert the item
  persists with `source_status` = "source_deleted" and the transition is recorded (not silently
  dropped).
- **No-external-write AC:** assert the request log to Confluence / Microsoft Graph contains only GET
  verbs; assert internal-store writes are the only mutations.
- **Idempotency AC:** re-run on unchanged sources (same content-hash); assert no duplicate items and
  no new versions created.

## Open Questions
- *(none — packet is `ready`)*
