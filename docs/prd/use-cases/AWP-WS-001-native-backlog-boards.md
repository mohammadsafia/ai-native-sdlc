---
id: AWP-WS-001
title: Native Backlog & Boards (author into graph first)
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
    ref: knowledge-graph (work-item nodes as source of record)
    content_hash: runtime
  - system: Jira
    object: project
    ref: <project_key>
    content_hash: runtime
external_apis:
  - name: Jira Cloud REST v3 (write, via guardrail engine)
    auth: OAuth2 3LO
    scopes: [write:jira-work, read:jira-work]      # write invoked only behind approval + preview
dependencies:
  depends_on: [AWP-GRAPH-001, AWP-NORM-001, AWP-WB-001, AWP-INT-001]
  relates_to: [AWP-WS-003]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a delivery team running primary planning in-platform, I want a native backlog and
boards surface where work items are authored into the knowledge graph **first** and Jira
becomes a synced mirror, so that the platform — not Jira — is the source of record for the
work we plan, while existing Jira consumers still see a faithful copy.

## Context / Background
This is a **Phase 6 (Primary Workspace)** packet and is therefore **directional /
lower-fidelity** — see [`01`](../01-product-architecture.md) §3, where Phase 6 "OWNS FLOW"
and the legacy tools are demoted to **mirrors** via a per-object source-of-record flip.
It is authored at a lower fidelity than the buildable Phase 0–5 packets: `status: draft`,
a **non-empty Open Questions** block, and a deliberately non-exhaustive set of acceptance
criteria. It firms up only after the read-only core (Phases 0–2) and the orchestration
loop (Phase 5) earn trust in production; several decisions below genuinely depend on how
that core performs.

The reversal this enables — "do the work here, sync to Jira second" — is the explicit
inversion of the early "don't duplicate tools" posture. Work items (epics/stories/tasks)
are persisted as nodes in the knowledge graph
([`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)) using the canonical
schema ([`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md)) **as their source of
record**. The board renders **graph state**, not Jira state. The actual Jira write +
backlink + conflict handling is **delegated** to the bidirectional sync engine
([`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md)); this packet owns the **authoring UI
and the graph-first persistence**, and it does **not** re-implement sync or write-back.
Every Jira mutation flows through the guardrail engine
([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)); this packet calls it, it does not
reinvent the five controls. Read ingestion of the existing Jira project remains
[`AWP-INT-001`](./AWP-INT-001-jira-connector.md).

The **source-of-record flip** — taking an item that today lives authoritatively in Jira
and making the platform authoritative for it — is the hard, unresolved part and is
captured in Open Questions, not pretended-resolved here.

## Data Sources & External APIs
- **Knowledge graph** (internal, source of record): work-item nodes — `epic` / `story` /
  `task` — with `source_of_record` = `platform`, plus a `mirror_ref` to the Jira issue key
  once synced. The canonical entity shapes come from
  [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md).
- **Jira Cloud REST v3** (`write:jira-work`, `read:jira-work` — write inert until approval):
  the mirror target in `<project_key>`. All writes are issued **through**
  [`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md) →
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md); this packet never calls the Jira write
  API directly. Read sync for the mirror baseline is via
  [`AWP-INT-001`](./AWP-INT-001-jira-connector.md).
- **Volumes / limits:** board edits are interactive and bursty (drag-reorder, inline
  field edits); each edit queues at most one sync job per affected item, and the guardrail
  engine's per-connector rate limit applies to the resulting Jira writes.

## Inputs
- `project_key` (required) — the Jira project that mirrors this backlog.
- `board_id` (required) — the in-platform board whose items render from the graph.
- `sync_target` (default `jira`) — the mirror tool for items on this board.
- `mirror_on_create` (default `true`) — whether a newly created item is queued for sync
  to the mirror immediately or stays platform-only until explicitly published.
- `approver` (required for any write to the mirror) — the named guardrail approver.
- Secrets by reference: scoped Jira write/read credentials resolved by the guardrail engine.
- Trigger: a user authoring/editing a work item in the native backlog or board UI.

## Outputs / Artifacts
1. A persisted work-item node in the knowledge graph with `source_of_record: platform`
   (id, type, fields, ordering, board placement).
2. A queued sync job (handed to [`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md)) that,
   on success, creates/updates the Jira mirror and writes a `mirror_ref` (issue key) plus
   a backlink URL onto the graph node.
3. A board view rendered from graph state (not Jira state) as the authoritative display.
4. An audit-trail entry (via the guardrail engine) for every Jira write performed.

## Acceptance Criteria

Scenario: A work item created in-platform is the source of record in the graph
  Given a user creates a new story in the native backlog for `board_id`
  When the create is saved
  Then a work-item node exists in the knowledge graph with `source_of_record` = "platform"
    And the node carries the entered fields and its backlog ordering
    And no Jira issue key is required for the node to be valid (it can exist mirror-less).

Scenario: The item is synced to Jira as a mirror with a backlink (delegated)
  Given a platform-sourced work item with `mirror_on_create` = true
  When the queued sync job completes successfully via AWP-WS-003
  Then a Jira issue exists in `project_key` mirroring the item
    And the graph node's `mirror_ref` equals the created Jira issue key
    And the Jira issue body contains a backlink URL to the platform work item.

Scenario: Editing in-platform updates the graph and queues a sync
  Given an existing platform-sourced work item already mirrored to Jira
  When a user edits one of its fields in-platform and saves
  Then the change is persisted to the graph node first
    And exactly one sync job for that item is queued to AWP-WS-003
    And the graph value is what the board renders immediately, before the sync runs.

Scenario: The board renders graph state, not Jira state, as authoritative
  Given a work item whose graph value for a field differs from the current Jira mirror value
    And the platform is the declared source of record for that item
  When the board is loaded
  Then the cell displays the graph value (not the Jira value)
    And a divergence indicator is shown if the mirror has not yet caught up.

Scenario: Every Jira write goes through the guardrail engine (approved + audited)
  Given a sync job that will create or update a Jira issue
  When the write is performed
  Then it is executed via the guardrail engine with a recorded `approver`
    And an append-only audit record exists with actor, approver, timestamp, previewed diff,
        and the resulting Jira issue key/URL
    And a write attempted with no recorded approval is blocked default-deny (0 Jira calls).

## Out of Scope
- The sync/arbitration mechanics, conflict detection, and idempotency — owned by
  [`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md); this packet queues jobs, it does not
  run the sync loop.
- The write primitive (preview/approve/audit/rollback) — owned by
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md).
- Read ingestion of the Jira project — owned by
  [`AWP-INT-001`](./AWP-INT-001-jira-connector.md).
- Sprint planning ceremonies, capacity/velocity modelling, and report generation.
- Migrating an entire existing Jira project's history into platform ownership in one shot
  (the per-team rollout of the flip is an Open Question, not a built behavior here).

## Dependencies / Linked Packets
- **depends_on** [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) (stores
  the work-item nodes that are the source of record),
  [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) (the canonical work-item
  schema authored into), [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) (the write
  primitive every Jira mutation traverses),
  [`AWP-INT-001`](./AWP-INT-001-jira-connector.md) (read sync establishing the mirror
  baseline).
- **relates_to** [`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md) (the sync engine this
  surface delegates every write and conflict to).

## Non-Functional Requirements
- **Performance:** board interactions render from graph state with no blocking call to
  Jira; sync to the mirror is asynchronous and eventually consistent.
- **Security/Privacy:** Jira writes use least-privilege scoped credentials resolved by the
  guardrail engine; write scopes are inert until approval; tenant-scoped throughout.
- **Idempotency/Reliability:** re-queuing a sync for an unchanged item is a no-op
  (delegated to [`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md)'s idempotency); the
  graph write is the durable commit, the mirror is best-effort and self-heals.
- **Observability:** emit per-item events for create / edit / sync-queued / sync-completed
  / sync-failed with the work-item id as correlation key.
- **Cost:** authoring makes zero LLM calls; cost is graph writes plus guardrailed Jira API
  calls bounded by the per-connector rate limit.

## Verification / Test Notes
- **Graph-first AC:** create a story with no `sync_target` reachable; assert the graph node
  exists and is valid with `source_of_record` = "platform" and no `mirror_ref`.
- **Mirror AC:** with a stubbed AWP-WS-003, complete a sync; assert `mirror_ref` is set and
  the Jira issue body contains the platform backlink URL.
- **Edit-queues-sync AC:** edit a mirrored item; assert exactly one sync job is enqueued
  and the board reflects the graph value immediately (before sync drains).
- **Authoritative-render AC:** force graph and mirror values to diverge; assert the board
  shows the graph value and a divergence indicator.
- **Guardrail AC:** drive a write with no approval token → assert 0 Jira calls
  (request-log capture) and a `blocked_default_deny` audit; then with approval assert the
  audit carries approver + previewed diff + issue key.

## Guardrails
*(Lighter — all Jira writes are delegated to [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md);
this packet inherits the five controls by construction and configures them for the
backlog/board write class.)*
- **Approval:** every Jira create/update from the board requires a recorded approval from
  the named `approver`; default-deny — a write with no approval is `BLOCKED_DEFAULT_DENY`
  and never reaches Jira. The approver sees the preview (below) first.
- **Dry-run / Preview:** before any Jira write, the guardrail engine renders the exact issue
  payload/field diff (`no_write: true`, zero mutating calls) for review.
- **Audit:** one append-only record per Jira write — actor, approver, timestamp, tenant,
  input hash, previewed diff, and resulting issue key/URL — via
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md).
- **Scoped permissions:** least-privilege `write:jira-work` resolved at execute time,
  separate from the read credential, restricted to the `project_key` target allow-list.
- **Rollback / Undo:** a bad mirror write is reverted by the guardrail engine's compensating
  action (restore prior Jira field value / decline the create); the graph node remains the
  source of record and is corrected independently; every reversal is audited.

## Open Questions
- **Source-of-record flip rollout:** how is the per-team flip (Jira → platform authoritative
  for a set of items) staged without disrupting existing Jira automation, board rules, JQL
  filters, and integrations that assume Jira is authoritative? Big-bang vs. per-board vs.
  per-item opt-in is undecided and depends on how cleanly the read-only sync behaves in
  production.
- **Conflict policy:** when an item is edited both in-platform and directly in Jira between
  syncs, what is the default resolution (platform-wins / last-writer-wins / surface-and-block)?
  This is delegated to [`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md) but the board needs
  a defined UX for it.
- **Unmodelled Jira semantics:** what happens to Jira workflows, statuses, custom fields, and
  permission schemes the platform's canonical model does not represent — are they preserved
  pass-through on the mirror, frozen, or dropped? Unresolved.
