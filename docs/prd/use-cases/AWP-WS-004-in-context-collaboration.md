---
id: AWP-WS-004
title: In-Context Collaboration (comments, mentions, approvals)
pillar: P6 Workspace
phase: Planning
roadmap_phase: 6
owning_agent: none
type: active-writeback
status: draft
priority: P2
estimate: M
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: internal
    object: service
    ref: knowledge-graph (comment / mention / approval nodes on graph objects)
    content_hash: runtime
  - system: Jira
    object: issue
    ref: <project_key>
    content_hash: runtime
external_apis:
  - name: Jira / Teams comment sync (optional, via guardrail engine)
    auth: OAuth2 3LO
    scopes: [write:jira-work]                       # optional, inert until approval
dependencies:
  depends_on: [AWP-PLAT-001, AWP-GRAPH-001, AWP-WB-001]
  relates_to: [AWP-WS-001, AWP-MEM-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a team collaborating in the platform, I want comments, @mentions, and approval flows
attached directly to graph objects — with decisions captured into Project Memory and an
**optional** sync of comments back to the source tool — so that discussion and sign-off
happen where the work lives, stay traceable, and (when needed) remain visible to people
still working in Jira/Teams.

## Context / Background
This is a **Phase 6 (Primary Workspace)** packet — **directional / lower-fidelity** per
[`01`](../01-product-architecture.md) §3 (P6: *in-context collaboration — comments, mentions,
approvals, decision capture*). It is authored below build-ready fidelity: `status: draft`, a
**non-empty Open Questions** block, and a non-exhaustive AC set, sized `M`. The unresolved
decisions — what syncs externally, notification routing, whether approvals reuse the
guardrail policy engine — depend on how the read-only core and the orchestration loop behave
in production.

Comments, @mentions, and approval actions are **graph nodes attached to graph objects**
(work items, documents, packets) in [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md).
Identity, attribution, and the notion of "approver" come from
[`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md) (auth/RBAC/tenancy) — this packet does
not own identity. **Decisions** captured here flow into Project Memory
([`AWP-MEM-001`](./AWP-MEM-001-project-memory.md)) with a citation back to the originating
comment/approval, so "why we decided this" is preserved. Any **optional** external write —
syncing a comment back to the source tool (Jira/Teams) — flows **through** the guardrail
engine ([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)); it is calling the five controls,
not reinventing them. Most collaboration is **internal-only**; external comment sync is an
opt-in path, which is why the external write surface is deliberately light.

An **approval** here can **gate a workflow** — e.g. an approval on a work item can be the
human sign-off that an associated write-back is allowed to proceed — tying collaboration to
the delivery loop rather than being a detached comment thread.

## Data Sources & External APIs
- **Knowledge graph** (internal, source of record): `comment`, `mention`, and `approval`
  nodes attached to a target graph object, each attributed to an author identity and stamped
  with a timestamp; approvals carry a `decision` and the workflow they gate.
- **Identity / RBAC** ([`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md)): resolves
  authors, mentionable users, and who is allowed to approve a given gate.
- **Project Memory** ([`AWP-MEM-001`](./AWP-MEM-001-project-memory.md)): the destination for
  captured decisions, written with a citation to the source comment/approval node.
- **Jira / Teams comment sync** (`write:jira-work`, optional, inert until approval): an
  **opt-in** mirror of a comment back to the source tool, issued **only through**
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md); never called directly here.
- **Volumes / limits:** collaboration traffic is interactive; optional external comment
  syncs are subject to the guardrail engine's per-connector rate limit.

## Inputs
- `target_object_id` (required) — the graph object the comment/mention/approval attaches to.
- `notification_channel` (default `in_app`) — where a mention notification is delivered
  (`in_app`, and optionally `teams` / `email`); named so it is not hard-coded in ACs.
- `external_comment_sync` (default `false`) — whether comments on this object are mirrored
  to the source tool (opt-in).
- `approver` (required for any approval gate and for any external comment write) — the
  identity authorized to approve.
- Secrets by reference: scoped Jira/Teams write credentials resolved by the guardrail engine
  (only when `external_comment_sync` is enabled).
- Trigger: a user posting a comment, an @mention, an approval action, or an enabled
  comment-sync event.

## Outputs / Artifacts
1. A persisted `comment` node attributed to its author and attached to `target_object_id`.
2. A `mention` notification delivered on `notification_channel` to the mentioned user.
3. An `approval` node recording the decision, the approver, and the workflow it gates
   (and which, when granted, unblocks the associated write-back).
4. A decision record written to Project Memory with a citation back to the source node.
5. An audit-trail entry (via the guardrail engine) for every optional external comment write.

## Acceptance Criteria

Scenario: A comment on a graph object is persisted and attributed to its author
  Given a user posts a comment on `target_object_id`
  When the comment is saved
  Then a `comment` node exists attached to that object
    And its author equals the posting user's identity (from AWP-PLAT-001)
    And it carries a creation timestamp.

Scenario: An @mention notifies the mentioned user
  Given a comment that @mentions user U
  When the comment is saved
  Then a notification is delivered to U on `notification_channel`
    And the notification references the originating comment and `target_object_id`.

Scenario: An approval action is recorded and gates the associated workflow
  Given a workflow (e.g. a pending write-back) gated by an approval on `target_object_id`
    And the gate is in the default-deny state with no approval
  When `approver` approves
  Then an `approval` node is recorded with the approver identity, decision, and timestamp
    And the gated workflow becomes permitted to proceed
    And without that approval the gated workflow does NOT proceed.

Scenario: A decision captured here flows to Project Memory with a citation
  Given a comment or approval marked as a decision on `target_object_id`
  When it is captured
  Then a decision record exists in Project Memory (AWP-MEM-001)
    And that record includes a citation resolving back to the originating comment/approval node.

Scenario: An optional comment-sync to a source tool goes through the guardrail engine
  Given `external_comment_sync` = true and a comment on `target_object_id`
  When the comment is mirrored to the source tool
  Then the write is executed via the guardrail engine with a recorded `approver`
    And an append-only audit record exists with actor, approver, timestamp, previewed diff,
        and the resulting external comment id/URL
    And with `external_comment_sync` = false, 0 external comment calls are made.

## Out of Scope
- Identity, RBAC, tenancy, and authentication — owned by
  [`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md).
- The write primitive (preview/approve/audit/rollback) — owned by
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md); this packet calls it only for the
  optional external comment sync.
- Storing the decision corpus / retrieval — owned by
  [`AWP-MEM-001`](./AWP-MEM-001-project-memory.md); this packet feeds it.
- Bidirectional sync of work-item fields — owned by
  [`AWP-WS-003`](./AWP-WS-003-bidirectional-sync.md); this packet covers collaboration
  artifacts (comments/mentions/approvals), not item-field mirroring.
- A full threaded-discussion / reactions / rich-formatting feature set beyond comments,
  mentions, and approvals.

## Dependencies / Linked Packets
- **depends_on** [`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md) (author/approver
  identity and who-may-approve), [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)
  (stores comment/mention/approval nodes on graph objects),
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) (the write primitive for the optional
  external comment sync).
- **relates_to** [`AWP-WS-001`](./AWP-WS-001-native-backlog-boards.md) (work items are a
  primary comment/approval target and an approval can gate their write-back),
  [`AWP-MEM-001`](./AWP-MEM-001-project-memory.md) (the destination for captured decisions).

## Non-Functional Requirements
- **Performance:** posting a comment / @mention and delivering an in-app notification is
  interactive; external comment sync is asynchronous and eventually consistent.
- **Security/Privacy:** attribution is bound to the authenticated identity from
  [`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md); only authorized identities can
  approve a gate; external comment writes use least-privilege scoped credentials, inert until
  approval; tenant-scoped throughout.
- **Idempotency/Reliability:** re-delivering the same mention does not duplicate the
  notification; an external comment sync carries an idempotency key (via
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)) so a retry does not double-post.
- **Observability:** emit events for comment-created / mention-notified / approval-recorded /
  decision-captured / external-sync-performed with the target object id as correlation key.
- **Cost:** internal collaboration makes zero LLM calls; cost is graph writes plus, only when
  enabled, guardrailed external comment API calls.

## Verification / Test Notes
- **Comment AC:** post a comment; assert a `comment` node attached to `target_object_id` with
  author = posting identity and a timestamp.
- **Mention AC:** @mention user U; assert a notification reaches U on `notification_channel`
  and references the comment + object.
- **Approval-gate AC:** with a gated workflow in default-deny, approve as `approver`; assert
  an `approval` node and that the workflow becomes permitted; assert it does NOT proceed
  without the approval.
- **Decision-to-memory AC:** mark a comment/approval as a decision; assert a Project Memory
  record exists with a citation that resolves back to the source node.
- **Optional-sync AC:** with `external_comment_sync` = false, assert 0 external comment calls;
  with it true, assert the write goes via the guardrail engine and an audit record carries
  approver + previewed diff + external comment id.

## Guardrails
*(Lighter — the only external write is the **optional** comment sync, delegated to
[`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md); internal comments/mentions/approvals are
graph-local. The five controls below govern that optional external path.)*
- **Approval:** an external comment sync requires a recorded approval from the named
  `approver` per the guardrail `approval_policy`; default-deny — with no approval the write is
  `BLOCKED_DEFAULT_DENY` and never reaches the tool. (Internal approval *nodes* are the
  collaboration feature itself and are governed by RBAC, not a tool write.)
- **Dry-run / Preview:** before any external comment write, the guardrail engine renders the
  exact comment payload the tool would receive (`no_write: true`, zero mutating calls).
- **Audit:** one append-only record per external comment write — actor, approver, timestamp,
  tenant, input hash, previewed diff, and resulting external comment id/URL — via
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md).
- **Scoped permissions:** least-privilege `write:jira-work` (and Teams equivalent) resolved at
  execute time, separate from read credentials, restricted to the per-tenant target
  allow-list; the external scope is provisioned only when `external_comment_sync` is enabled.
- **Rollback / Undo:** a wrongly synced external comment is reverted by the guardrail engine's
  compensating action (delete/redact the external comment); the internal `comment` node
  remains the source of record; every reversal is audited.

## Open Questions
- **What syncs externally vs internal-only:** which interactions (comments, mentions,
  approvals, decisions) should ever leave the platform for the source tool, and which stay
  strictly internal? Default is internal-only; the external surface is undecided and depends
  on how mirrored tools are used in production.
- **Notification routing:** how are notifications routed across in-app vs. Teams vs. email,
  who configures it, and how are duplicates avoided when a user watches the same object in
  both the platform and the source tool? Open.
- **Approval model reuse:** does the in-context approval model **reuse**
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)'s policy engine (one approval concept across
  write-back and collaboration), or is it a separate, lighter collaboration-approval concept?
  Unresolved — it depends on whether a single approval can satisfy both a guardrail write gate
  and a human sign-off.
