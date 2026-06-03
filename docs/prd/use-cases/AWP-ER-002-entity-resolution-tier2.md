---
id: AWP-ER-002
title: Entity Resolution — Tier 2 (semantic / AI matching)
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
  - system: internal
    object: service
    ref: unlinked canonical artifacts + graph store (from AWP-NORM-001 / AWP-GRAPH-001) + embeddings/adjudication via AWP-AI-001
    content_hash: runtime
external_apis: []
dependencies:
  depends_on: [AWP-ER-001, AWP-GRAPH-001, AWP-AI-001]
  relates_to: [AWP-INT-004]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's entity-resolution pipeline, I want to recover the cross-tool links
that deterministic IDs and URLs miss — by **embedding** the text of an unlinked
artifact, **blocking** to a *small* candidate set via vector similarity, and having
**Claude adjudicate** that handful with a **cited evidence span** — so that genuinely
related-but-unlinked work (a Teams thread, a Miro board, a Figma frame, an M365 doc
nobody linked) becomes a *suggested* graph link that a human can confirm, while never
brute-forcing all-pairs, never polluting the traceability spine with a guess, and
never re-proposing a match a human already rejected.

## Context / Background
This packet implements **Tier 2** of the tiered entity-resolution strategy that
[`02`](../02-technical-foundation.md) §2 calls *the crux* — and is the **Phase 2**
extension that [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md) deliberately
deferred ("Tier 2 is explicitly OUT OF SCOPE — it is Phase 2"). It does **not**
re-implement Tier 0/1; it runs **only on the long tail** that survives them.

What already exists and must **not** be re-built or modified here:
- The **edge model** and thresholds are inherited verbatim from
  [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md): every edge carries
  `{confidence, method, evidence, created_by}`, is **versioned**, and is classified
  by `suggest_threshold` / `auto_accept_threshold` into
  `{accepted, suggested, queued, rejected}`. Tier 2 emits edges with
  `method` = `semantic` and `created_by` = `tier2`.
- The **graph store** and traceability/spine query surface are owned by
  [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md); this packet
  writes versioned edges into it and reads existing edges — it stands up no store.
- The **negative-decision (negative-link) store** is the **same** one
  [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md) defines: a persisted set
  of human "No" decisions. Tier 2 **consults it before adjudicating a pair and before
  emitting any edge** — a rejected pair is never re-suggested.
- **Embeddings and adjudication go through the LLM gateway**
  [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md) — there are no direct Claude/embedding
  SDK calls here. `external_apis: []` for exactly this reason: Tier 2 calls an
  *internal* platform service, not an external SDLC tool.

The non-negotiable shape of Tier 2 (per [`02`](../02-technical-foundation.md) §2, §4):
**embed → BLOCK to a small candidate set → Claude adjudicates that small set with a
cited evidence span → emit a SUGGESTED link.** Brute-force all-pairs adjudication is
forbidden — token cost explodes (§4) and it does not scale. Tier-2 links are
**hypotheses**: they are flagged `in_spine = false` and **excluded from the
traceability spine until a human confirms them**. Calibrated Tier-2 confidence lives
in the **~0.4–0.85** band ([`02`](../02-technical-foundation.md) §2); a Tier-2 match is
never auto-accepted into the spine. Embeddings are **reused** when an artifact's
content-hash is unchanged ([`02`](../02-technical-foundation.md) §4 embedding reuse via
the gateway) — re-embedding unchanged text is wasted spend.

This packet is `read-only`: it reasons over content and writes *internal* graph edges
only; it never writes back to an external SDLC tool, so it carries **no Guardrails
block** ([`03`](../03-work-packet-format.md) §3, Rule 2).

## Data Sources & External APIs
- **Unlinked canonical artifacts** (`system: internal`): Artifacts from
  [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) that survived Tier 0/1
  with **no resolvable ID and no extracted URL** — typically Teams threads,
  Miro/Figma artifacts, and M365 docs nobody linked (the connector for these arrives
  via [`AWP-INT-004`](./AWP-INT-004-teams-connector.md)). Each carries its text fields
  and a `content_hash`.
- **Embeddings + adjudication** (`system: internal`, via
  [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md)): the gateway produces text embeddings
  (with content-hash-keyed **reuse**) and runs the Claude adjudication call
  (task class → model per the gateway's routing policy). No external API key is held
  by this packet — hence `external_apis: []`.
- **Graph store** (`system: internal`): the
  [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) store this packet
  writes versioned `semantic` edges into and reads existing edges + the negative-link
  store from.
- **Volumes / cost discipline:** Tier 2 runs over the *unlinked tail only*, not the
  whole graph. Per candidate artifact, exactly **one** vector-similarity blocking pass
  and **one bounded** adjudication call over at most `candidate_block_size` candidates
  — **never** an all-pairs sweep ([`02`](../02-technical-foundation.md) §4 delta-only +
  embedding reuse).

## Inputs
- `tenant_id` (required) — Tier-2 runs, embeddings, and edges are tenant-scoped
  (tenant-scope every graph *and* vector query — [`02`](../02-technical-foundation.md) §4).
- `candidate_block_size` (default `20`) — the **maximum** number of nearest-neighbour
  candidates retained by the blocking step and handed to Claude for adjudication; caps
  the adjudication set so it is never all-pairs.
- `suggest_threshold` (default `0.6`) — at/above this (and below the inherited
  `auto_accept_threshold`), an adjudicated Tier-2 link is emitted as `suggested`
  (excluded from the spine); below it the candidate is dropped/queued rather than
  suggested. Matches the [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md)
  threshold semantics.
- `semantic_confidence_band` (default `[0.4, 0.85]`) — the calibrated range Tier-2
  `confidence` must fall within ([`02`](../02-technical-foundation.md) §2).
- Secrets by reference: read-scoped graph-store credentials only; **no** model/API
  keys (the gateway holds those).
- Trigger: a new/updated **unlinked** canonical artifact for the tenant (one with no
  Tier-0/1 link), or a Tier-2 re-run / backfill over the unlinked tail.

## Outputs / Artifacts
- **Versioned `semantic` edges** written to the graph store, each carrying
  `{confidence, method, evidence, created_by}` where:
  - `method` = `semantic` (Tier 2) with a `signal` of `embed-block-adjudicate`.
  - `confidence` ∈ `semantic_confidence_band` — the calibrated score Claude returns.
  - `evidence` = the **non-empty cited evidence span** Claude returns (the quoted text
    from the artifact and/or the candidate that justifies the link).
  - `status` ∈ `{suggested, queued}` derived from `suggest_threshold`; a `suggested`
    edge is flagged **`in_spine = false`** (Tier 2 never produces `accepted` spine
    edges).
  - `created_by` = `tier2` until a human confirms (which a separate
    confirmation flow records).
- A **blocking record** per adjudicated artifact: the candidate set actually scored,
  with its size (asserted ≤ `candidate_block_size`) — the audit that no all-pairs
  comparison occurred.
- **Reused-embedding signal:** a per-artifact indication that the embedding was served
  from the content-hash cache (no new embedding call) when content is unchanged.
- **Negative-link suppression:** for any pair present in the inherited negative-decision
  set, **no** Tier-2 edge is emitted and the pair is excluded from adjudication.
- **Per-tenant Tier-2 telemetry:** counts of suggested vs. dropped, embedding cache
  hit-rate, mean candidate-set size, and adjudication-call count (cost surface).

## Acceptance Criteria

Scenario: An unlinked Teams thread receives a suggested semantic link with cited evidence
  Given an unlinked canonical artifact (a Teams thread) for `tenant_id` with no Tier-0/1 link
    And a candidate Story exists whose embedding is within the blocking neighbourhood
  When Tier 2 embeds the thread, blocks to candidates, and Claude adjudicates them
  Then a link edge is created between the thread and the Story with `method` = "semantic"
    And the edge `evidence` (the cited evidence span) is non-empty
    And the edge `status` = "suggested" with `in_spine` = false.

Scenario: Candidates are blocked to at most candidate_block_size before adjudication (no all-pairs)
  Given an unlinked artifact for `tenant_id`
    And `candidate_block_size` = 20
  When Tier 2 runs the blocking step and then adjudicates
  Then the candidate set handed to adjudication has size ≤ `candidate_block_size`
    And the number of adjudication comparisons performed for that artifact equals the
        blocked candidate count (a bounded number), NOT the total artifact count in the tenant.

Scenario: A suggested Tier-2 link is excluded from the traceability spine until human-confirmed
  Given a Tier-2 edge with `status` = "suggested" and `in_spine` = false
  When a traceability spine query (per AWP-GRAPH-001) traverses links for that artifact
  Then the spine query does NOT traverse the suggested Tier-2 edge
    And the edge becomes spine-eligible only after a human records "Yes" (confirmation),
        which sets `in_spine` = true.

Scenario: An unchanged artifact reuses its embedding (no new embedding call)
  Given an artifact already embedded in a prior run
    And its `content_hash` is unchanged on this run
  When Tier 2 processes it again
  Then the embedding is served from the content-hash cache
    And the count of new embedding calls to the gateway for that artifact equals 0.

Scenario: A prior human "No" prevents that pair from being re-suggested
  Given a pair {X, Y} present in the inherited negative-decision (negative-link) set
        from a previous human "No"
  When Tier 2 runs over `tenant_id`
  Then {X, Y} is excluded from the adjudication candidate set
    And no `semantic` edge between X and Y is created or suggested
    And the suggested-link count for {X, Y} is 0.

Scenario: Emitted semantic confidence falls within the calibrated band
  Given a Tier-2 link emitted for `tenant_id`
    And `semantic_confidence_band` = [0.4, 0.85]
  When its `confidence` is read from the edge
  Then `confidence` ≥ 0.4 AND `confidence` ≤ 0.85.

## Out of Scope
- **Deterministic / heuristic linking** — Tier 0 ID links and Tier 1 URL/email/temporal
  heuristics are owned by
  [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md); this packet runs only on
  what survives them and adds **no** new deterministic/heuristic signals.
- **Auto-accepting Tier-2 links into the spine** — Tier-2 links are suggestions only;
  promoting a suggested edge to `accepted` / `in_spine = true` happens solely via human
  confirmation, never automatically.
- Owning the graph store, the negative-link store, or the spine/query surface — provided
  by [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) and
  [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md).
- Owning embedding/Claude infrastructure, token budgets, or injection isolation — owned
  by [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md).
- Building the Teams/Miro/Figma/M365 connectors that supply the unlinked artifacts
  ([`AWP-INT-004`](./AWP-INT-004-teams-connector.md)).
- Any write-back to a source tool.

## Dependencies / Linked Packets
- **depends_on** [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md) — supplies the
  edge model `{confidence, method, evidence, created_by}`, the threshold semantics, the
  `in_spine` flag, and the negative-link store that Tier 2 extends and reuses;
  [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) — the versioned-edge
  store + spine query this packet writes/reads;
  [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md) — the gateway that produces embeddings
  (with content-hash reuse) and runs the Claude adjudication call.
- **relates_to** [`AWP-INT-004`](./AWP-INT-004-teams-connector.md) — the Teams (and
  related Miro/Figma/M365) connector whose unlinked artifacts are Tier 2's primary input.

## Non-Functional Requirements
- **Performance:** runs over the **unlinked tail only**; per artifact = one blocking
  pass + one bounded adjudication over ≤ `candidate_block_size` candidates — **never
  all-pairs** ([`02`](../02-technical-foundation.md) §2). Incremental (delta-only) over
  newly-unlinked artifacts.
- **Security/Privacy:** tenant-scoped throughout — every vector and graph query is
  tenant-scoped ([`02`](../02-technical-foundation.md) §4); PII redaction before content
  reaches the model is handled by the gateway; read-scoped graph credentials; no model
  keys held here.
- **Idempotency/Reliability:** re-running Tier 2 on unchanged inputs produces no new
  edge versions and triggers no new embedding calls (content-hash reuse); the
  negative-link set is consulted **before** adjudication and **before** any emit; a
  re-derived link supersedes its prior version rather than duplicating.
- **Observability:** per-tenant suggested/dropped counts, embedding cache hit-rate, mean
  blocked candidate-set size, and adjudication-call count; emitted suggestions and
  subsequent human Yes/No decisions feed the eval/feedback loop and the per-tenant ER
  precision/recall metric.
- **Cost:** the dominant lever — **block before embedding/adjudication** and **reuse
  embeddings on unchanged content-hash** so token spend scales with the *changed unlinked
  tail*, not the graph ([`02`](../02-technical-foundation.md) §4); exactly one bounded
  adjudication call per candidate artifact.

## Verification / Test Notes
- **Fixtures:** `fixtures/unlinked_teams_thread.json` (a Teams thread with no ID/URL +
  a semantically-related Story), `fixtures/tier2_candidate_block.json` (one artifact
  with > `candidate_block_size` near-neighbours, to prove the cap), 
  `fixtures/unchanged_content_hash.json` (an artifact already embedded, hash unchanged),
  `fixtures/negative_pair_X_Y.json` (a pair pre-seeded in the negative-link set).
- **Suggested-link AC:** run on the Teams fixture with a stubbed gateway returning a
  label + confidence + evidence span; assert one `method` = "semantic" edge with
  non-empty `evidence`, `status` = "suggested", `in_spine` = false.
- **Blocking/no-all-pairs AC:** run on the over-sized candidate fixture; assert the
  adjudicated candidate set size ≤ `candidate_block_size`; assert the adjudication-call
  comparison count equals the blocked count and is strictly less than the tenant's total
  artifact count (proves no all-pairs).
- **Spine-exclusion AC:** with a suggested Tier-2 edge present, run an AWP-GRAPH-001
  spine query and assert the edge is NOT traversed; record a "Yes" and assert the edge
  becomes `in_spine` = true and is then traversed.
- **Embedding-reuse AC:** process the unchanged-hash fixture twice with a gateway spy;
  assert new-embedding-call count for that artifact == 0 on the second run.
- **Negative-link AC:** with {X, Y} pre-seeded in the negative-link set, run Tier 2 and
  assert no semantic edge X↔Y exists and the suggested-link count for {X, Y} == 0.
- **Confidence-band AC:** for each emitted Tier-2 edge, assert
  0.4 ≤ `confidence` ≤ 0.85.

## Open Questions
- *(none — packet is `ready`)*
