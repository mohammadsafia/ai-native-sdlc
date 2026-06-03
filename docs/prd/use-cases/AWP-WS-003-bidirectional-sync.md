---
id: AWP-WS-003
title: Bidirectional Sync & Per-Object Source-of-Record
pillar: P1 Integration
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
    ref: sync-arbitration engine (per-object source-of-record + conflict detection)
    content_hash: runtime
  - system: Jira
    object: project
    ref: <project_key>
    content_hash: runtime
  - system: Confluence
    object: page
    ref: <space_key>
    content_hash: runtime
external_apis:
  - name: Jira Cloud REST v3 (write, via guardrail engine)
    auth: OAuth2 3LO
    scopes: [write:jira-work]                       # write inert until approval
  - name: Confluence Cloud REST (write, via guardrail engine)
    auth: OAuth2 3LO
    scopes: [write:confluence-content]              # write inert until approval
dependencies:
  depends_on: [AWP-INT-001, AWP-INT-003, AWP-WB-001, AWP-NORM-001]
  relates_to: [AWP-WS-001, AWP-WS-002]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's sync layer, I want a bidirectional sync engine that lets each object
**declare** whether the platform or the legacy tool is its source of record, propagates
changes from the source-of-record side to the mirror, detects and surfaces conflicts
instead of silently overwriting, and never echoes its own writes into a loop — so that
Jira and Confluence can safely become **mirrors** of the graph without drift or data loss.

## Context / Background
This is the **engine that makes Phase 6 possible**: the per-object source-of-record flip and
bidirectional sync that demote legacy tools to mirrors ([`01`](../01-product-architecture.md)
§3; product risk #6 — *bidirectional sync conflicts / dual source-of-record causes drift*).
It is **directional / lower-fidelity** (Phase 6): `status: draft`, a **non-empty Open
Questions** block, and a non-exhaustive AC set. It is also the **hardest Phase-6 piece** —
its hard decisions (field-level vs object-level ownership, conflict-resolution defaults,
tool-side automation, consistency window) genuinely depend on how the read-only sync and
connectors behave in production, so they are left open here rather than guessed.

It is the write/arbitration counterpart to the read-only **sync engine posture** of P1
([`01`](../01-product-architecture.md) §P1: *idempotency, conflict detection, per-field
source-of-record arbitration*). The native surfaces — backlog/boards
([`AWP-WS-001`](./AWP-WS-001-native-backlog-boards.md)) and doc editing
([`AWP-WS-002`](./AWP-WS-002-native-doc-editing.md)) — **delegate every write and conflict to
this engine**. This packet performs writes **through** the guardrail engine
([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)) — it does not call tool write APIs
directly and does not reinvent the five controls. The inbound read side (detecting a change
on the tool/mirror) reuses the existing connectors
([`AWP-INT-001`](./AWP-INT-001-jira-connector.md),
[`AWP-INT-003`](./AWP-INT-003-confluence-connector.md)); field mapping between the graph and
each tool uses the canonical schema
([`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md)).

The core invariant: **per-object `source_of_record`** (`platform` or `tool`) decides which
side wins propagation; a change on the *non*-authoritative side is a **conflict**, surfaced
for resolution, never silently overwritten; and sync is **idempotent** so a propagated write
does not re-trigger as a fresh change (no echo loop).

## Data Sources & External APIs
- **Sync state (internal):** per synced object, a record of `source_of_record`, the
  `mirror_ref`, the last-synced revision/version on each side, and a content
  signature/`sync_origin` marker used to suppress echoes.
- **Jira Cloud REST v3** (`write:jira-work` — inert until approval) and **Confluence Cloud
  REST** (`write:confluence-content` — inert until approval): mirror write targets, invoked
  **only through** [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md).
- **Inbound change detection:** mirror-side edits arrive via the existing read connectors
  ([`AWP-INT-001`](./AWP-INT-001-jira-connector.md),
  [`AWP-INT-003`](./AWP-INT-003-confluence-connector.md)) (webhook/incremental sync); this
  engine compares them against last-synced state to classify propagate vs. conflict vs. echo.
- **Volumes / limits:** sync is periodic and event-driven; tool writes are subject to the
  guardrail engine's per-connector rate limit; conflict surfacing is bounded by edit rate.

## Inputs
- `sync_interval_seconds` (required) — the polling/reconciliation cadence for objects not
  covered by a real-time webhook (named so it is not hard-coded in ACs).
- `conflict_policy` (required) — the default policy applied when a conflict is detected:
  one of `surface_and_block` (default), `platform_wins`, `tool_wins`, `last_writer_wins`.
- `synced_object` (per call) — `{object_id, kind, source_of_record, mirror_ref}`.
- `approver` (required for any mirror write) — the named guardrail approver.
- Secrets by reference: scoped Jira/Confluence write + read credentials resolved by the
  guardrail engine.
- Trigger: a source-of-record-side change (from a native surface), a mirror-side change
  (from a connector), or the `sync_interval_seconds` reconciliation tick.

## Outputs / Artifacts
1. A per-object **sync state** record with a declared `source_of_record` and the last-synced
   revision on each side.
2. **Propagated writes** to the mirror (via the guardrail engine) when the source-of-record
   side changes, stamped with a `sync_origin` marker for echo suppression.
3. **Conflict records** when the mirror side changes while the platform is source of record:
   `{object_id, field(s), platform_value, tool_value, detected_at, status}` surfaced for
   resolution (never a silent overwrite).
4. An audit-trail entry (via the guardrail engine) for every mirror write performed.

## Acceptance Criteria

Scenario: Each synced object has a declared source of record
  Given an object tracked by the sync engine
  When its sync state is read
  Then it has a `source_of_record` value of exactly one of "platform" or "tool"
    And a `mirror_ref` identifying its counterpart object on the other side.

Scenario: A change on the source-of-record side propagates to the mirror
  Given an object whose `source_of_record` = "platform"
  When its platform value changes
  Then within `sync_interval_seconds` a write is issued to the mirror via the guardrail engine
    And re-reading the mirror returns the new value
    And no conflict record is created (the authoritative side changed).

Scenario: A mirror-side change under platform ownership is a surfaced conflict, not an overwrite
  Given an object whose `source_of_record` = "platform"
  When the value changes on the mirror (tool) side
  Then a conflict record is created with both `platform_value` and `tool_value`
    And the platform value is NOT silently overwritten by the tool value
    And resolution follows `conflict_policy` (default `surface_and_block`: it awaits a human choice).

Scenario: Sync is idempotent — a propagated change does not echo back as a new change (no loop)
  Given a change propagated from the source-of-record side to the mirror, stamped `sync_origin`
  When that propagated write is observed coming back through the inbound connector
  Then it is recognized as the engine's own write (by `sync_origin` / content signature)
    And it does NOT create a new change, a new conflict, or a reverse propagation
    And the total write count for that single logical change stays at 1 (no ping-pong).

Scenario: Every write goes through the guardrail engine and is audited
  Given any propagation or conflict-resolution write to Jira or Confluence
  When the write is performed
  Then it is executed via the guardrail engine with a recorded `approver`
    And an append-only audit record exists with actor, approver, timestamp, previewed diff,
        and the resulting object id/URL
    And a write attempted with no recorded approval is blocked default-deny (0 tool calls).

## Out of Scope
- The native authoring UIs — owned by
  [`AWP-WS-001`](./AWP-WS-001-native-backlog-boards.md) and
  [`AWP-WS-002`](./AWP-WS-002-native-doc-editing.md); this engine is the sync substrate they call.
- The write primitive (preview/approve/audit/rollback/rate-limit) — owned by
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md).
- Inbound read connectors and webhook plumbing — owned by
  [`AWP-INT-001`](./AWP-INT-001-jira-connector.md) and
  [`AWP-INT-003`](./AWP-INT-003-confluence-connector.md); this engine consumes their events.
- Canonical entity/field definitions — owned by
  [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md).
- The conflict-resolution **UX surface** itself (this engine emits the conflict record and
  applies the chosen resolution; the in-context surfacing UI lives with the workspace packets).

## Dependencies / Linked Packets
- **depends_on** [`AWP-INT-001`](./AWP-INT-001-jira-connector.md) and
  [`AWP-INT-003`](./AWP-INT-003-confluence-connector.md) (inbound change detection on the
  mirror side), [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) (the write primitive every
  mirror mutation traverses), [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md)
  (the canonical field model both sides map to).
- **relates_to** [`AWP-WS-001`](./AWP-WS-001-native-backlog-boards.md) and
  [`AWP-WS-002`](./AWP-WS-002-native-doc-editing.md) (the workspace surfaces that delegate
  every write and conflict to this engine).

## Non-Functional Requirements
- **Performance:** propagation completes within `sync_interval_seconds` for non-webhook
  objects; conflict detection is O(changed fields), not full re-scan.
- **Security/Privacy:** all mirror writes use least-privilege scoped credentials resolved by
  the guardrail engine; write scopes inert until approval; every object is tenant-scoped.
- **Idempotency/Reliability:** every mirror write carries an idempotency key and a
  `sync_origin` marker so the engine's own writes are never re-ingested as new changes; a
  retried reconciliation never double-writes; on failure the object is left in a recoverable
  state with no half-applied cross-tool write.
- **Observability:** emit per-object counts of propagated / conflicts-detected /
  conflicts-resolved / echoes-suppressed, plus the lag between source change and mirror catch-up.
- **Cost:** the engine makes zero LLM calls; cost is reconciliation compute plus guardrailed
  tool API calls bounded by the per-connector rate limit.

## Verification / Test Notes
- **SoR-declared AC:** read an object's sync state; assert `source_of_record` ∈ {platform,
  tool} and a non-null `mirror_ref`.
- **Propagate AC:** with `source_of_record` = platform, change the platform value; assert a
  mirror write occurs within `sync_interval_seconds`, the mirror reflects it, and 0 conflict
  records were created.
- **Conflict AC:** with `source_of_record` = platform, mutate the mirror side; assert a
  conflict record with both values exists, the platform value is unchanged, and behavior
  matches `conflict_policy` (`surface_and_block` ⇒ awaits human; `platform_wins` ⇒ mirror
  re-corrected; etc.).
- **Idempotency / no-echo AC:** propagate one change; feed the engine's own resulting write
  back through the connector; assert no new change/conflict/reverse-write and total write
  count for the logical change = 1.
- **Guardrail AC:** attempt a mirror write with no approval token → assert 0 tool calls
  (request-log capture) and a `blocked_default_deny` audit; with approval, assert audit
  carries approver + previewed diff + object id.

## Guardrails
*(Full five controls — this **is** the workspace write-back path; mechanics delegated to
[`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) and configured for the sync write class.)*
- **Approval:** every mirror write (propagation or conflict resolution) requires a recorded
  approval from the named `approver` per the guardrail `approval_policy`; default-deny — a
  write with no approval is `BLOCKED_DEFAULT_DENY` and never reaches the tool. The approver
  sees the preview first.
- **Dry-run / Preview:** before any propagation or resolution write, the guardrail engine
  renders the exact payload/field diff the tool would receive (`no_write: true`, zero
  mutating calls); a conflict resolution always previews which side's value will win.
- **Audit:** one append-only record per mirror write — actor, approver, timestamp, tenant,
  input hash, previewed diff, the source-of-record decision applied, and the resulting object
  id/URL — via [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md).
- **Scoped permissions:** least-privilege `write:jira-work` / `write:confluence-content`
  resolved at execute time, separate from read credentials, restricted to the per-tenant
  `project_key` / `space_key` target allow-list.
- **Rollback / Undo:** a bad propagation is reverted by the guardrail engine's compensating
  action (restore the prior tool field value / prior page version); a mis-resolved conflict
  can be re-opened and re-resolved; the authoritative graph state is the recovery anchor;
  every reversal is audited. Reinforced by the engine's per-connector rate limit and kill
  switch to halt a runaway sync.

## Open Questions
- **Field-level vs object-level source of record:** is `source_of_record` declared per whole
  object, or per field (e.g. platform owns description, Jira owns status)? Field-level is more
  powerful but multiplies conflict surface; the choice depends on observed real-world edit
  patterns and is unresolved.
- **Conflict-resolution UX and defaults:** what is the default `conflict_policy` per object
  kind, and how are conflicts surfaced/triaged at scale (inline, queue, digest)? Undecided.
- **Tool-side automation:** how are mirror mutations made by *Jira automation rules /
  Confluence templates* (not a human) distinguished from genuine human edits, so automation
  noise is not treated as a conflict every cycle? Open and depends on connector signal fidelity.
- **Acceptable eventual-consistency window:** what `sync_interval_seconds` / lag is tolerable
  before users perceive the mirror as "wrong," and which objects warrant real-time webhooks vs.
  polling? To be set from production behavior.
