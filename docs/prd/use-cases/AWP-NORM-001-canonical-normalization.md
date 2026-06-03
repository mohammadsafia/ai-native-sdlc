---
id: AWP-NORM-001
title: Canonical Schema & Normalization (Artifact / Event / Relationship / Actor)
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
    ref: ingestion-bus (raw connector events topic)
    content_hash: runtime
external_apis: []
dependencies:
  depends_on: [AWP-INT-001, AWP-INT-002, AWP-INT-003]
  relates_to: [AWP-GRAPH-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's data-fabric, I want to map every heterogeneous raw connector
event into one canonical model (`Artifact` / `Event` / `Relationship` / `Actor`)
with stamped provenance and an immutably retained raw payload, so that all
downstream graph, entity-resolution, and intelligence consume one consistent,
re-derivable shape instead of per-tool quirks.

## Context / Background
This is **Layer 3 (Normalization)** of the reference architecture
([`02`](../02-technical-foundation.md) §1) and the first half of Phase 0's
deterministic spine — the platform's **core IP**. The connectors
([`AWP-INT-001`](./AWP-INT-001-jira-connector.md) Jira,
[`AWP-INT-002`](./AWP-INT-002-bitbucket-connector.md) Bitbucket,
[`AWP-INT-003`](./AWP-INT-003-confluence-connector.md) Confluence) already
authenticate, pull deltas, and publish **raw events** onto the durable,
replayable ingestion bus (Layer 2). This packet consumes those raw events and
produces canonical entities; it does **not** authenticate to or poll any external
tool, and it does **not** persist to the graph store — that is
[`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md), which consumes
this packet's output. Cross-tool linking / entity resolution is **not** done here
([`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md)); this packet only
produces single-source canonical entities plus any links *explicitly present in
the same payload* (e.g. an issue's own parent field).

Two hard design rules from [`02`](../02-technical-foundation.md) §1 govern this
packet: (1) **schema-on-write** to the canonical model — validate and shape at
ingest, not at read; (2) **keep the raw payload immutably** so normalization can
be re-run when mapping logic changes (the bus is replayable precisely so we can
re-derive). Because the bus is replayable, re-processing **must be idempotent** —
replaying the same raw event must never create a duplicate canonical entity.

## Data Sources & External APIs
- **Ingestion bus** (`system: internal`): the raw-events topic populated by the
  three connectors. Each bus message carries `{source, source_object_type,
  source_id, fetch_time, raw_payload, connector_version}`. No external API is
  called by this packet — `external_apis: []`. The connectors own all tool auth,
  pagination, and rate limits; this packet is a pure stream consumer.
- **Canonical entity types produced:**
  - `Artifact` — `type ∈ {Requirement, Epic, Story, Task, PR, Deployment,
    Release, Decision, Design}`.
  - `Event` — a state transition / activity (e.g. status change, commit pushed,
    PR opened) with `event_type`, `occurred_at`, `actor_ref`, `subject_ref`.
  - `Relationship` — an edge **explicitly present in the source payload**
    (e.g. Story→Epic via Jira parent field). Cross-tool inference is out of scope.
  - `Actor` — a person/agent reference carrying source-local identity
    (e.g. accountId, email, username) for later stitching by ER.
- **Volumes:** size for full re-derivation passes (a bus replay) — assume bursts
  of ≥ 100k raw events; the consumer must page/stream, not load all in memory.

## Inputs
- `raw_event` (required) — one bus message `{source, source_object_type,
  source_id, fetch_time, raw_payload, connector_version}`.
- `schema_version` (default = current canonical schema version string, e.g. `"1"`)
  — stamped on every entity this run emits.
- `mapping_profile` (default = built-in per-source mapping) — the source→canonical
  field map applied; selected by `raw_event.source`.
- `dedupe_key_strategy` (default `"<source>:<source_object_type>:<source_id>"`) —
  the deterministic natural key used to make re-processing idempotent.
- Trigger: a new message on the ingestion-bus raw-events topic (or a replay/backfill
  re-emission of past messages).

## Outputs / Artifacts
- One or more **canonical entities** emitted to the normalized-entities output
  (consumed by [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)),
  each containing:
  - `canonical_id` — deterministic, derived from `dedupe_key_strategy` (stable
    across re-processing of the same source object).
  - `entity_kind` ∈ `{Artifact, Event, Relationship, Actor}` and, for Artifacts,
    `artifact_type` (the 9 types above).
  - Mapped canonical fields (title, status, refs, timestamps, …).
  - `provenance` — `{source, source_id, fetch_time, schema_version}`.
  - `raw_ref` — pointer to the immutably retained raw payload.
  - `mapping_profile` + `connector_version` actually applied (for audit/drift).
- An **immutable raw-payload record** keyed by `{source, source_id, fetch_time}`,
  written once and never mutated (re-derivation reads from it).
- A normalization outcome record per event: `{canonical_id, action ∈
  {created, updated, noop}, unmapped_fields[]}`.

## Acceptance Criteria

Scenario: Jira issue raw event normalizes to a Story Artifact with provenance
  Given a raw bus event with `source` = "Jira" and a `raw_payload` whose issue type is "Story"
  When normalization processes the event
  Then exactly one canonical entity is emitted with `entity_kind` = "Artifact" and `artifact_type` = "Story"
    And its `provenance` has non-empty `source` = "Jira", `source_id` = the Jira issue key, a populated `fetch_time`, and `schema_version` = the run's `schema_version`
    And its `raw_ref` resolves to the retained raw payload for that event.

Scenario: Unknown/extra source field is preserved and does not break normalization
  Given a raw bus event whose `raw_payload` contains a field absent from the active `mapping_profile`
  When normalization processes the event
  Then the canonical entity is still emitted (no error, no dropped event)
    And the extra field remains present in the retained raw payload reachable via `raw_ref`
    And the extra field appears in the outcome record's `unmapped_fields[]`.

Scenario: Re-processing the same raw event is idempotent (no duplicate entity)
  Given a raw event that has already been normalized to `canonical_id` X
  When the identical raw event is replayed through normalization
  Then no second canonical entity is created for the same source object
    And the emitted entity's `canonical_id` equals X
    And the outcome record's `action` = "noop" (or "updated" if a field changed), never "created".

Scenario: schema_version is stamped on every emitted entity
  Given a batch of raw events of mixed `source` and `entity_kind`
  When normalization processes the batch with `schema_version` = S
  Then every emitted canonical entity has `provenance.schema_version` = S
    And the count of emitted entities missing `schema_version` equals 0.

Scenario: Normalization is deterministic on a frozen raw event
  Given one frozen raw event and a fixed `mapping_profile` and `schema_version`
  When normalization runs on it twice
  Then the two emitted canonical entities are byte-identical across all mapped fields, `canonical_id`, and `provenance`.

## Out of Scope
- Persisting entities into the graph store or building any traceability query —
  owned by [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md).
- Cross-tool entity resolution / link inference (Jira-key-in-commit, person
  stitching, URL extraction) — owned by
  [`AWP-ER-001`](./AWP-ER-001-entity-resolution-tier01.md).
- Authenticating to, polling, or paging any external tool — owned by the
  connectors ([`AWP-INT-001/002/003`](./AWP-INT-001-jira-connector.md)).
- Connectors for Teams / Figma / Miro / M365 and their entity types (Phase 2).
- Any write-back to a source tool.

## Dependencies / Linked Packets
- **depends_on** [`AWP-INT-001`](./AWP-INT-001-jira-connector.md),
  [`AWP-INT-002`](./AWP-INT-002-bitbucket-connector.md),
  [`AWP-INT-003`](./AWP-INT-003-confluence-connector.md) — they emit the raw
  events onto the bus that this packet consumes; without them there is nothing to
  normalize.
- **relates_to** [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)
  — the immediate downstream consumer that persists these canonical entities and
  exposes traceability over them.

## Non-Functional Requirements
- **Performance:** sustain steady-state connector throughput and complete a full
  bus replay of ≥ 100k raw events without unbounded memory growth (stream/batch,
  do not buffer the whole topic).
- **Security/Privacy:** never log raw secrets or tokens; raw payloads stored in a
  tenant-scoped store; `Actor` identity fields persisted for stitching but
  redactable to satisfy GDPR cascade (raw → normalized) per
  [`02`](../02-technical-foundation.md) §4.
- **Idempotency/Reliability:** re-processing is keyed on `dedupe_key_strategy`;
  replay/backfill is a no-op or in-place update, never a duplicate; a malformed
  single event is dead-lettered and does not halt the stream.
- **Observability:** emit per-source counts of `created` / `updated` / `noop`,
  dead-letter count, and a histogram of `unmapped_fields[]` sizes (a rising
  histogram signals connector schema drift).
- **Cost:** pure deterministic code — **zero LLM calls**; no embeddings.

## Verification / Test Notes
- **Fixtures:** `fixtures/raw_jira_story_event.json` (issue type Story, with one
  field intentionally outside the mapping profile), `fixtures/raw_bitbucket_pr_event.json`,
  `fixtures/raw_confluence_page_event.json`.
- **Story + provenance AC:** run the Jira fixture; assert one Artifact, `artifact_type`
  = "Story", and all four `provenance` fields populated; assert `raw_ref` dereferences.
- **Extra-field AC:** assert the entity is emitted, the unknown field is present in the
  stored raw payload, and listed in `unmapped_fields[]`.
- **Idempotency AC:** feed the same fixture twice; assert exactly one canonical entity
  exists for that source object and second-pass `action` ≠ "created".
- **schema_version AC:** run a mixed batch; assert `count(entities where
  provenance.schema_version != S) == 0`.
- **Determinism AC:** normalize the frozen fixture twice; diff mapped fields +
  `canonical_id` + `provenance` → must be byte-identical.

## Open Questions
- *(none — packet is `ready`)*
