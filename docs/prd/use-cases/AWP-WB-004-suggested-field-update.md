---
id: AWP-WB-004
title: Suggested Jira Field Update (approved, preview-diff)
pillar: P1 Integration
phase: Development
roadmap_phase: 3
owning_agent: PM
type: active-writeback
status: ready
priority: P1
estimate: M
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: <sha256-of-proposal-context-at-generation>
sources:
  - system: internal
    object: service
    ref: knowledge-graph traceability (AWP-GRAPH-001) — proposal context
    content_hash: runtime
  - system: Jira
    object: issue
    ref: <issue_key>
    content_hash: runtime
external_apis:
  - name: Jira Cloud REST v3
    auth: OAuth2 3LO
    scopes: [write:jira-work, read:jira-work]      # write invoked only behind approval + preview, via AWP-WB-001
dependencies:
  depends_on: [AWP-WB-001, AWP-PLAT-002, AWP-GRAPH-001]
  relates_to: [AWP-RISK-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a delivery manager, I want the platform to propose a single Jira field update (e.g.
set a label, a due date, or a flag) with a clear before→after diff behind an approval
gate, so that I can accept a small, evidence-backed correction in one click — knowing the
prior value is captured and the change can be undone.

## Context / Background
This is a **Phase 3 "first write-back"** packet — deliberately **low-risk, single-field,
and reversible**. It proposes **exactly one** field change on **one** Jira issue (a
label, a due date, a flag, a component — *not* a status transition), shows a
**before→after diff**, and writes only after approval. It is reversible by construction:
the **prior field value is captured before the write** and restored on rollback. The
*reason* for the proposal is grounded in the knowledge graph
([`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)) — e.g. a risk from
[`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md) suggesting a `flag` or a `due date`
adjustment.

This packet **does not reinvent guardrails**. The field write is delegated to the
guardrail engine ([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)): `preview(action)`
renders the before→after field diff, `execute(action, idempotency_key)` writes only after
a recorded approval, and `rollback(audit_id)` restores the captured prior value. The
append-only audit record is written to the audit log
([`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md)) with the previewed `diff` (before→after)
and `approver`.

Because a field edit **overwrites** rather than appends, it carries a risk a comment does
not: a **concurrent edit**. If the live field value changed between when the preview was
generated and when the write would execute, blindly writing would silently clobber
someone else's change. This packet therefore captures the field value (and its `version`/
edit token) **at preview time** and **rejects the write on a conflict**, re-previewing
against the new live value — implementing the preview-then-write invariant of
[`02`](../02-technical-foundation.md) §3 with explicit optimistic-concurrency control.

## Data Sources & External APIs
- **Proposal context (internal):** the graph
  ([`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md)) and, optionally, a
  risk from [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md) that motivates the suggested
  value. Supplied to this packet; no external call to produce it.
- **Jira Cloud REST v3** (via the guardrail engine + connector):
  - `read:jira-work` — read `field` on `issue_key` to capture the **prior value** and the
    current edit version/`updated` timestamp (the concurrency token) at preview time.
  - `write:jira-work` — `PUT /issue/{issue_key}` setting `field` to `proposed_value`.
    **Inert until Gate-1 approval.**
- **Audit store** ([`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md)): one append-only record
  per previewed / executed / rolled-back update, carrying the before→after `previewed_diff`,
  the captured `prior_value`, and `approver`.
- **Volumes / limits:** one field write per update (low volume). The guardrail engine's
  per-connector `jira` rate limit and kill switch apply.

## Inputs
- `issue_key` (required) — the Jira issue to update (e.g. `PROJ-123`).
- `field` (required) — the single field to set (e.g. `labels`, `duedate`,
  `customfield_flagged`); restricted to the per-tenant **editable-field allow-list**
  (status transitions are excluded by policy).
- `proposed_value` (required) — the new value to set `field` to.
- `approver` (required) — the named human who approves the update at Gate 1.
- `idempotency_key` (default =
  `"AWP-WB-004:field:<issue_key>:<field>:<hash(proposed_value)>"`) — supplied to the
  guardrail engine so a retried update writes the field at most once.
- `expected_prior_version` (captured at preview; carried into execute) — the field's
  edit version / `updated` timestamp observed at preview time, used to detect concurrent
  edits.
- Secrets by reference: scoped Jira OAuth token (`JIRA_OAUTH_TOKEN`); the **write**
  credential is resolved by the engine only at `execute`.
- Trigger: a manual "Apply suggested update" action, or an upstream orchestration step.

## Outputs / Artifacts
1. **Preview result** (no write): `{field, field_diff: {before, after}, target:
   issue_key, prior_value (captured), expected_prior_version, action: set_field,
   no_write: true}`.
2. **On approval — an updated Jira issue:** `field` on `issue_key` now equals
   `proposed_value`.
3. **An audit record** (per write) via [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md):
   `{actor, approver, timestamp, tenant_id, action: set_field, target: issue_key + field,
   input_hash, previewed_diff (before→after), prior_value, idempotency_key, outcome,
   object_id (issue_key)/url}`.
4. **A rollback result** on undo: `{restored_field_value (= prior_value),
   compensating_action, audit_id, reversal_of}`.
5. **A conflict result** when the live value drifted from the preview:
   `{outcome: CONFLICT, observed_value, expected_prior_version, requires_re_preview: true}`.
6. `links.jira` is set to `issue_key`.

## Acceptance Criteria

Scenario: No approval ⇒ no field is changed (default-deny, zero writes)
  Given an `issue_key`, a `field`, a `proposed_value`, and no recorded approval from `approver`
  When the update reaches the write step
  Then the guardrail-engine outcome is `BLOCKED_DEFAULT_DENY`
    And exactly 0 mutating calls (PUT/PATCH) are made to Jira (verified by the request log)
    And `field` on `issue_key` is byte-for-byte unchanged
    And an audit record is written with `outcome` = "blocked_default_deny" and no `object_id`.

Scenario: Approver sees a before→after field diff before approving (dry-run, no write)
  Given a proposed update of `field` to `proposed_value` on `issue_key`
  When the approver opens the Gate-1 approval view
  Then they see a `field_diff` with the current value as `before` and `proposed_value` as `after`
    And `no_write` = true
    And 0 mutating calls are made to Jira at preview time (request log shows none).

Scenario: On approval the field is updated and the prior value is captured in the audit
  Given a previewed update with a valid approval from `approver` = A
    And the field's `prior_value` = P was captured at preview time
  When `execute` succeeds
  Then `field` on `issue_key` now equals `proposed_value`
    And an append-only audit record exists whose `previewed_diff` shows `before` = P and
        `after` = `proposed_value`
    And whose `prior_value` = P and whose `approver` = A
    And whose `object_id` = `issue_key`.

Scenario: Rollback restores the prior field value and is audited
  Given an executed update that set `field` from `prior_value` = P to `proposed_value`
  When `rollback(audit_id)` is invoked
  Then `field` on `issue_key` is restored to P (re-reading the field returns P)
    And an audit record is written with `reversal_of` = the original `audit_id`.

Scenario: A concurrent edit since preview rejects the write and re-previews (named conflict observable)
  Given a preview captured `expected_prior_version` = V0 for `field` on `issue_key`
    And the live `field` value (or its version) changed to V1 ≠ V0 before `execute`
  When `execute` is attempted with `expected_prior_version` = V0
  Then the outcome is `CONFLICT`
    And exactly 0 mutating calls are made to Jira (the field is NOT overwritten;
        re-reading it returns the concurrently-edited value, not `proposed_value`)
    And the result carries `requires_re_preview` = true so a fresh before→after diff is
        produced against V1 before any retry.

Scenario: The update is idempotent via an idempotency key
  Given an approved update executed once with `idempotency_key` = K, setting `field` to `proposed_value`
  When the identical update is retried with the same `idempotency_key` = K
  Then `field` is written at most once (no second PUT is issued for K; the field stays at `proposed_value`)
    And the second call returns the original result and outcome "idempotent_replay", never a new "set_field".

Scenario: Field and target must be on the allow-list (scoped permissions)
  Given a `field` NOT on the per-tenant editable-field allow-list (e.g. a status transition)
        OR an `issue_key` in a project not on the per-tenant project allow-list
  When the update is attempted
  Then the write is rejected before any Jira call
    And 0 mutating calls are made to Jira (request log shows none).

## Out of Scope
- **Status transitions** and workflow changes — excluded by policy from this packet's
  editable-field allow-list (a higher-risk action class).
- **Multi-field** or bulk edits — this packet proposes exactly **one** field on **one**
  issue per run.
- Posting comments (that is [`AWP-WB-003`](./AWP-WB-003-post-risk-comment-jira.md)) and any
  Confluence / Bitbucket write.
- **Deciding** the `proposed_value` business logic — this packet executes a proposed
  single-field change under guardrails; the suggestion may originate from
  [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md) / the graph.
- Reinventing approval / preview / audit / rollback mechanics — owned by the guardrail
  engine ([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)).
- Auto-merging concurrent edits — a conflict is **rejected and re-previewed**, never
  silently reconciled.

## Dependencies / Linked Packets
- **depends_on** [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) — supplies
  approval / preview / audit / scoped-write / rollback for the field write; this packet
  delegates every write here.
- **depends_on** [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md) — the append-only ledger the
  engine writes the update + rollback records to (with the before→after `previewed_diff`,
  `prior_value`, and `approver`).
- **depends_on** [`AWP-GRAPH-001`](./AWP-GRAPH-001-knowledge-graph-traceability.md) — the
  graph that grounds *why* the field change is proposed (the traceability/evidence context).
- **relates_to** [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md) — a common source of the
  suggestion (e.g. a risk recommending a flag or due-date change).

## Non-Functional Requirements
- **Performance:** preview does not call Jira's write path; an update is one read (capture
  prior value + version) + one write, completing within 8s for a single field.
- **Security/Privacy:** least-privilege scopes only (`write:jira-work`, `read:jira-work`);
  the write scope is inert until approval; secrets never logged; the update is tenant-scoped
  and both the editable-field allow-list and the project allow-list are enforced before any
  call; redact assignee PII in any persisted artifact per org policy.
- **Idempotency/Reliability:** every `execute` carries an `idempotency_key`; a retried
  update reuses it and writes the field at most once; **optimistic concurrency** — a write
  whose `expected_prior_version` no longer matches the live value is rejected as `CONFLICT`,
  never an overwrite; an update whose audit cannot be persisted fails closed (no orphaned
  write).
- **Observability:** emit per-update state-transition events (previewed / approved /
  executed / conflict / rolled-back) with correlation id = `idempotency_key`, plus the
  request-log used by the default-deny AC.
- **Cost:** **zero LLM calls** in this packet — the proposal is produced upstream; this
  packet only previews and writes a single field.

## Verification / Test Notes
- **Default-deny AC:** invoke update with no approval token against a write-policy action;
  assert engine outcome `BLOCKED_DEFAULT_DENY` and a request-log capture showing 0 Jira
  mutating verbs; assert `field` unchanged.
- **Preview AC:** call `preview`; snapshot the returned `field_diff` (before = current,
  after = `proposed_value`); assert `no_write` = true and the request log shows no mutating
  verbs; assert `prior_value` and `expected_prior_version` are captured.
- **Audit-diff+prior-value+approver AC:** preview then execute with approver A; assert the
  stored audit `previewed_diff` shows before = P / after = `proposed_value`, `prior_value` = P,
  `approver` = A, and `object_id` = `issue_key`.
- **Rollback AC:** execute (capturing `prior_value` = P); `rollback`; assert the field reads
  back as P and a `reversal_of` audit record exists.
- **Conflict AC:** preview capturing version V0; mutate the field out-of-band to V1; attempt
  `execute` with `expected_prior_version` = V0; assert outcome `CONFLICT`, 0 mutating verbs in
  the request log, the field still equals V1's value (not `proposed_value`), and
  `requires_re_preview` = true.
- **Idempotency AC:** execute with key K; retry with K; assert at most one PUT for K, the
  field stays at `proposed_value`, and the second result is "idempotent_replay".
- **Allow-list AC:** attempt a status-transition field (off the editable-field allow-list)
  and an issue in a non-allow-listed project; assert each is rejected before any Jira call and
  0 mutating verbs in the request log.

## Guardrails
- **Approval:** the named `approver` must approve the update at the `awaiting_approval`
  gate; **default-deny** — with no valid approval the guardrail engine returns
  `BLOCKED_DEFAULT_DENY` and no field write reaches Jira. The approver sees the
  **before→after field diff** (dry-run, below) before approving.
- **Dry-run / Preview:** mandatory no-write `preview(action)` that renders the **exact**
  before→after the tool would receive — `field_diff = {before: <current live value>, after:
  <proposed_value>}` (`no_write: true`, zero mutating calls) — and captures
  `expected_prior_version` for conflict detection. Executing a payload that differs from the
  approved preview is rejected.
- **Audit:** one append-only record per previewed / executed / rolled-back update to
  [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md), carrying actor, `approver`, timestamp,
  tenant, action (set_field), target (`issue_key` + `field`), `input_hash`, the
  **before→after `previewed_diff`**, the captured `prior_value`, `idempotency_key`, outcome
  (incl. `CONFLICT`), and the resulting issue id/url.
- **Scoped permissions:** least-privilege Jira write credential resolved by the engine at
  execute time, **separate from the read credential**; named scope `write:jira-work`; the
  explicit per-tenant **project allow-list** *and* the **editable-field allow-list**
  (status transitions excluded) are enforced before any call.
- **Rollback / Undo:** the `prior_value` captured before the write is restored on undo —
  `rollback` sets `field` back to `prior_value`; every reversal is itself audited via
  `reversal_of`. A detected concurrent edit is rejected as `CONFLICT` and re-previewed
  rather than overwriting another user's change.

## Open Questions
- *(none — packet is `ready`)*
