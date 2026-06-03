---
id: AWP-WS-002
title: Native Spec/Doc Editing (graph-backed)
pillar: P6 Workspace
phase: Planning
roadmap_phase: 6
owning_agent: none
type: active-writeback
status: draft
priority: P2
estimate: L
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: internal
    object: service
    ref: knowledge-graph (document nodes as source of record)
    content_hash: runtime
  - system: Confluence
    object: page
    ref: <space_key>
    content_hash: runtime
external_apis:
  - name: Confluence Cloud REST (write, via guardrail engine)
    auth: OAuth2 3LO
    scopes: [write:confluence-content, read:confluence-content.all]   # write inert until approval
dependencies:
  depends_on: [AWP-GRAPH-001, AWP-WB-001, AWP-INT-003]
  relates_to: [AWP-WS-003, AWP-GEN-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a team member writing specs and docs in-platform, I want a Confluence-class editor whose
backing store is the knowledge graph **first** and Confluence becomes a synced mirror, so
that our documents are graph-native (queryable, linkable to work items, embeddable with AI
work packets) while existing Confluence readers still see a faithful copy.

## Context / Background
This is a **Phase 6 (Primary Workspace)** packet — **directional / lower-fidelity** per
[`01`](../01-product-architecture.md) §3, where Confluence is demoted to a **mirror** under
a per-object source-of-record flip. It is authored below build-ready fidelity: `status:
draft`, a **non-empty Open Questions** block, and a non-exhaustive AC set. It firms up only
after the read-only core proves out — notably rich-text fidelity and migration, both of
which depend on real-world Confluence content seen during Phases 0–2.

Documents/specs are persisted as **document nodes** in the knowledge graph
([`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)) **as their source of
record**, with version history kept in the graph. Confluence is written as a **mirror** with
a backlink; the actual write + conflict handling is delegated to the bidirectional sync
engine ([`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md)) and every Confluence mutation
flows through the guardrail engine ([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)) — this
packet calls them, it does not reinvent sync or write-back. Read ingestion of existing
Confluence pages remains [`AWP-INT-003`](./AWP-INT-003-confluence-connector.md).

A distinguishing capability: an **AI work packet** produced by the generator
([`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md)) — i.e. a file in the
[`03`](../03-work-packet-format.md) shape — can be **embedded or linked** inside a document
and resolves to the live packet entity, so specs and the implementation-ready packets they
spawn stay traceably connected. This packet owns the **editor and graph-backed persistence**;
it does not own packet generation.

## Data Sources & External APIs
- **Knowledge graph** (internal, source of record): document nodes with
  `source_of_record: platform`, a `mirror_ref` to the Confluence page id once synced, an
  ordered `version_history`, and resolvable references to embedded AI work packets.
- **Confluence Cloud REST** (`write:confluence-content`, `read:confluence-content.all` —
  write inert until approval): the mirror target in `<space_key>`. Writes are issued
  **through** [`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md) →
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md); this packet never calls the Confluence
  write API directly. Read sync for the mirror baseline is via
  [`AWP-INT-003`](./AWP-INT-003-confluence-connector.md).
- **AI work packets** ([`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md)): referenced by
  packet id; the editor resolves an embed to the packet's current title/status/link.
- **Volumes / limits:** doc edits are interactive; each save commits one graph version and
  queues at most one Confluence sync; the guardrail engine's per-connector rate limit applies.

## Inputs
- `space_key` (required) — the Confluence space that mirrors these documents.
- `document_id` (required) — the in-platform document node being edited.
- `sync_target` (default `confluence`) — the mirror tool for this document.
- `mirror_on_publish` (default `true`) — whether a saved doc is queued for sync to the
  mirror, or held platform-only until explicit publish.
- `approver` (required for any write to the mirror) — the named guardrail approver.
- Secrets by reference: scoped Confluence write/read credentials resolved by the guardrail engine.
- Trigger: a user authoring/editing a document in the native editor, or embedding a packet.

## Outputs / Artifacts
1. A persisted document node in the knowledge graph with `source_of_record: platform` and a
   new entry appended to its `version_history` on each save.
2. A queued sync job (handed to [`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md)) that, on
   success, creates/updates the Confluence mirror page and writes the page id + backlink URL
   back onto the graph node.
3. Resolvable embedded/linked AI work packets rendered inline with live packet metadata.
4. An audit-trail entry (via the guardrail engine) for every Confluence write performed.

## Acceptance Criteria

Scenario: A document authored in-platform is the source of record in the graph
  Given a user creates a new spec in the native editor
  When the document is saved
  Then a document node exists in the knowledge graph with `source_of_record` = "platform"
    And the node holds the document body and is valid without any Confluence page id.

Scenario: The document is synced to Confluence as a mirror with a backlink (delegated)
  Given a platform-sourced document with `mirror_on_publish` = true
  When the queued sync job completes successfully via AWP-WS-003
  Then a Confluence page exists in `space_key` mirroring the document
    And the graph node's `mirror_ref` equals the created Confluence page id
    And the Confluence page contains a backlink URL to the platform document.

Scenario: An AI work packet can be embedded in a document and resolves to the packet
  Given a document and an existing AI work packet id from AWP-GEN-001
  When the author embeds (or links) that packet into the document and saves
  Then the embed in the rendered document resolves to that packet entity
    And it displays the packet's current title and status (not a dead text reference).

Scenario: All Confluence writes go through the guardrail engine (approved + audited)
  Given a sync job that will create or update a Confluence page
  When the write is performed
  Then it is executed via the guardrail engine with a recorded `approver`
    And an append-only audit record exists with actor, approver, timestamp, previewed diff,
        and the resulting Confluence page id/URL
    And a write attempted with no recorded approval is blocked default-deny (0 Confluence calls).

Scenario: Version history is maintained in the graph
  Given a platform-sourced document edited and saved `N` times (Input: edit_count)
  When the document's history is read from the graph
  Then `version_history` contains `edit_count` ordered versions, each with author and timestamp
    And a prior version can be retrieved by its version index.

## Out of Scope
- The sync/arbitration mechanics, conflict detection, and idempotency — owned by
  [`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md).
- The write primitive (preview/approve/audit/rollback) — owned by
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md).
- Read ingestion of Confluence pages — owned by
  [`AWP-INT-003`](./AWP-INT-003-confluence-connector.md).
- Generating the AI work packets themselves — owned by
  [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md); this editor embeds them.
- Bulk migration of an existing Confluence space into graph ownership (an Open Question, not
  a built behavior here).

## Dependencies / Linked Packets
- **depends_on** [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) (stores
  the document nodes + version history that are the source of record),
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) (the write primitive every Confluence
  mutation traverses), [`AWP-INT-003`](./AWP-INT-003-confluence-connector.md) (read sync
  establishing the mirror baseline).
- **relates_to** [`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md) (the sync engine this
  editor delegates every write and conflict to),
  [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md) (produces the packets embeddable in docs).

## Non-Functional Requirements
- **Performance:** editing renders from graph state with no blocking call to Confluence; sync
  to the mirror is asynchronous and eventually consistent.
- **Security/Privacy:** Confluence writes use least-privilege scoped credentials resolved by
  the guardrail engine; write scopes inert until approval; tenant-scoped throughout.
- **Idempotency/Reliability:** re-queuing a sync for an unchanged document is a no-op
  (delegated to [`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md)); the graph version is the
  durable commit, the mirror is best-effort and self-heals.
- **Observability:** emit per-document events for save / version-committed / sync-queued /
  sync-completed / sync-failed with the document id as correlation key.
- **Cost:** authoring makes zero LLM calls; cost is graph writes plus guardrailed Confluence
  API calls bounded by the per-connector rate limit.

## Verification / Test Notes
- **Graph-first AC:** create a doc with no reachable mirror; assert the document node exists,
  is valid, and has `source_of_record` = "platform" with no `mirror_ref`.
- **Mirror AC:** with a stubbed AWP-WS-003, complete a sync; assert `mirror_ref` (page id) is
  set and the Confluence page contains the platform backlink URL.
- **Embed AC:** embed a known packet id; assert the rendered embed resolves to that packet and
  shows its current title/status (change the packet status and re-render to confirm liveness).
- **Guardrail AC:** drive a Confluence write with no approval token → assert 0 Confluence
  calls and a `blocked_default_deny` audit; then with approval assert audit carries approver +
  previewed diff + page id.
- **Version AC:** save `edit_count` times; assert `version_history` length = `edit_count`,
  ordered, with author+timestamp, and a prior version is retrievable by index.

## Guardrails
*(Lighter — all Confluence writes are delegated to
[`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md); this packet inherits the five controls and
configures them for the doc write class.)*
- **Approval:** every Confluence create/update from the editor requires a recorded approval
  from the named `approver`; default-deny — a write with no approval is `BLOCKED_DEFAULT_DENY`
  and never reaches Confluence. The approver sees the preview first.
- **Dry-run / Preview:** before any Confluence write, the guardrail engine renders the exact
  page payload/body diff (`no_write: true`, zero mutating calls) for review.
- **Audit:** one append-only record per Confluence write — actor, approver, timestamp, tenant,
  input hash, previewed diff, and resulting page id/URL — via
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md).
- **Scoped permissions:** least-privilege `write:confluence-content` resolved at execute time,
  separate from the read credential, restricted to the `space_key` target allow-list.
- **Rollback / Undo:** a bad mirror write is reverted by the guardrail engine's compensating
  action (restore the prior Confluence page version / delete the draft page); the graph
  document remains the source of record and is corrected independently; every reversal is audited.

## Open Questions
- **Rich-text fidelity:** how faithfully does the graph-native document model round-trip to
  Confluence storage format, and what is the policy for Confluence **macros**, embedded media,
  and layouts the platform model does not represent (preserve pass-through / degrade / block)?
  Unresolved until real content is profiled in production.
- **Migration of existing pages:** how are existing Confluence pages brought into graph
  ownership (one-time import, lazy-on-edit, or never) without losing history or breaking
  inbound links from other pages? Undecided and depends on read-sync coverage.
- **Concurrent editing / locking:** what is the concurrent-edit model — real-time
  co-editing, optimistic last-writer-wins on save, or document-level locking — and how does
  it interact with a simultaneous edit on the Confluence mirror side? Open.
