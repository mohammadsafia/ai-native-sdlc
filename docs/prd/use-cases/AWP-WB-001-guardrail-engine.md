---
id: AWP-WB-001
title: Guardrail Engine (approval · dry-run · audit · rollback · rate-limit)
pillar: P8 Governance
phase: Development
roadmap_phase: 3
owning_agent: none
type: active-writeback
status: ready
priority: P0
estimate: L
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: internal
    object: service
    ref: write-back-orchestration (Temporal write activities)
    content_hash: runtime
external_apis:
  - name: Jira Cloud REST v3 (write, via this engine)
    auth: OAuth2 3LO / service token (per tenant; varies)
    scopes: [write:jira-work]              # invoked only behind approval + preview
  - name: Bitbucket Cloud REST 2.0 (write, via this engine)
    auth: OAuth2 / app password (per tenant; varies)
    scopes: [repository:write, pullrequest:write]
  - name: Confluence Cloud REST (write, via this engine)
    auth: OAuth2 3LO / service token (per tenant; varies)
    scopes: [write:confluence-content]
dependencies:
  depends_on: [AWP-PLAT-001, AWP-PLAT-002]
  relates_to: [AWP-ORCH-019, AWP-ORCH-021, AWP-GEN-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's write-back layer, I want a single reusable guardrail engine that
every active packet calls to perform any external mutation — so that **no** write to
Jira, Bitbucket, or Confluence can occur without an approval, a previewed diff, an
audit record, a least-privilege token, a rate-limit/kill-switch check, an idempotency
key, and a defined rollback — and no packet has to re-implement those controls.

## Context / Background
This packet **is** the guardrail model of [`02`](../02-technical-foundation.md) §3 made
concrete. It is **Layer 6 (Orchestration & write-back)** of the reference architecture:
the *single chokepoint* through which all state-changing tool calls flow. Every
`active-writeback` packet (e.g.
[`AWP-ORCH-021`](./AWP-ORCH-021-brd-to-pr.md),
[`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md),
[`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md)) **delegates its writes here**; it
does not call the SDLC tool APIs directly. The five controls of Rule 2
([`03`](../03-work-packet-format.md) §3) and the six safety invariants
([`03`](../03-work-packet-format.md) §4.4) are *implemented* by this engine — callers
inherit them by construction.

What already exists and is **not** re-built here: the platform identity/RBAC/secrets
vault and tenant isolation ([`AWP-PLAT-001`](./AWP-PLAT-001-platform-core.md)), and the
immutable, append-only audit log ([`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md)). This
engine **extends** that audit log with two write-back-specific fields — the
**previewed diff** and the **approver** — but does not own the log storage itself. The
durable orchestration/state machine that *calls* this engine and owns the human gates is
[`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md); this packet provides the
write primitive, not the saga.

Hard design rules from [`02`](../02-technical-foundation.md) §3: **default-deny** (a write
with no recorded approval never reaches the tool); **preview-then-write** (the exact
mutation is rendered as a diff before any real call); **read and write are separate
credentials** (a read-only deployment physically cannot mutate); **every write is
idempotent** via a caller-supplied key so a retried Temporal activity never
double-creates; and **every write is reversible** with an audited compensating action.

## Data Sources & External APIs
- **The SDLC tool write APIs are invoked *through* this engine**, never by callers
  directly. The engine holds a per-connector adapter for each:
  - **Jira Cloud REST v3** — `write:jira-work` (create issue, transition, edit field, add
    comment). Each adapter exposes `preview(action) → diff` and `execute(action, idempotency_key) → result`.
  - **Bitbucket Cloud REST 2.0** — `repository:write`, `pullrequest:write` (push branch,
    open/decline draft PR).
  - **Confluence Cloud REST** — `write:confluence-content` (create/update page, comment).
  - Auth **varies by tenant/connector** (OAuth2 3LO, app password, or service principal);
    the engine resolves the correct **write credential** from the vault at execution time
    and never accepts a read credential for a write.
- **Audit store** ([`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md)): append-only; the engine
  writes one record per proposed/previewed/executed/rolled-back action, adding
  `previewed_diff` and `approver` to the base schema.
- **Volumes / limits:** writes are bursty (an agent run may queue dozens of Jira creates).
  Each connector publishes a documented rate ceiling; the engine enforces
  `per_connector_rate_limit` (token-bucket) and circuit-breaks on anomaly.

## Inputs
- `approval_policy` (required) — the policy table mapping **action type × tenant × risk
  tier** → `{auto_approve | named_approver_required | forbidden}`. Default for any entry
  not present is **deny** (named approver required); destructive actions default `forbidden`.
- `per_connector_rate_limit` (required) — map of `connector → {max_writes, window}` for the
  token-bucket; default conservative ceiling per connector when unspecified.
- `action` (required, per call) — `{connector, action_type, target, payload, tenant_id, risk_tier}`.
- `idempotency_key` (required, per call) — caller-supplied stable key (`<AWP-id>:<action_type>:<target_hash>`).
- `approval_token` (conditional) — reference to the recorded approval; absent ⇒ default-deny.
- Secrets by reference: per-connector **write** credentials and **read** credentials are
  separate vault entries; the engine requests the write credential only at `execute`.
- Trigger: a `preview` or `execute` call from a caller activity (typically
  [`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md)).

## Outputs / Artifacts
- **Preview result** — `{diff, rendered_payload, target, no_write: true}`: the exact
  before/after the tool would receive, produced with **zero** external mutation.
- **Execute result** — `{object_id, url, outcome, audit_id, idempotency_key}` on success;
  a typed `BLOCKED_DEFAULT_DENY` / `BLOCKED_KILL_SWITCH` / `THROTTLED` outcome otherwise.
- **Audit record** (per action) written to [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md):
  `{actor, agent+model_version, approver, timestamp, tenant_id, action_type, target,
  input_hash, previewed_diff, idempotency_key, outcome, tool_response, reversal_of?}`.
- **Rollback result** — `{restored_state, compensating_action, audit_id}` recording the
  prior captured state and the undo performed.
- **Rate-limit / breaker state** — per-connector token-bucket level, circuit state
  (`closed | open | half-open`), and kill-switch state (global + per-connector).

## Acceptance Criteria

Scenario: A write with no recorded approval is blocked default-deny (zero external call)
  Given an `action` whose `approval_policy` entry resolves to named-approver-required
    And no valid `approval_token` is supplied
  When `execute(action)` is called
  Then the outcome is `BLOCKED_DEFAULT_DENY`
    And exactly 0 calls are made to the connector's tool API (verified by the request log)
    And an audit record is written with `outcome` = "blocked_default_deny" and no `object_id`.

Scenario: Every write produces a dry-run diff before execution (preview, no write yet)
  Given an `action` to be executed
  When `preview(action)` is called
  Then a `diff` and `rendered_payload` are returned showing the exact before/after the tool would receive
    And `no_write` = true
    And 0 mutating calls (POST/PUT/PATCH/DELETE) are made to the connector (request log shows none).

Scenario: An executed write produces an audit record containing the previewed diff AND the approver
  Given a previewed `action` with a valid `approval_token` from `approver` = A
  When `execute(action, idempotency_key)` succeeds
  Then an append-only audit record exists whose `previewed_diff` equals the diff returned by the preceding `preview`
    And whose `approver` = A
    And whose `object_id`/`url` equal the created/updated tool object.

Scenario: A write exceeding per_connector_rate_limit is throttled, not dropped or flooded
  Given `per_connector_rate_limit` for connector C is `{max_writes: R, window: W}`
    And R approved writes to C have already executed within window W
  When the next approved write to C is submitted
  Then its outcome is `THROTTLED` and it is enqueued (not rejected, not dropped)
    And it executes on the next available token within W (it is not lost)
    And the count of tool calls to C within W never exceeds R.

Scenario: Activating the kill switch for a connector halts all writes to it
  Given the per-connector kill switch for connector C is activated
  When any approved write to C is submitted
  Then the outcome is `BLOCKED_KILL_SWITCH`
    And 0 mutating calls are made to C (request log shows none)
    And writes to other connectors are unaffected.

Scenario: A retried write carrying the same idempotency key does not double-execute
  Given an approved write executed once with `idempotency_key` = K, producing `object_id` = X
  When the identical write is retried with the same `idempotency_key` = K
  Then no second tool object is created (the create count for K stays at 1)
    And the second call returns the original `object_id` = X
    And the outcome is recorded as "idempotent_replay", never a new "created".

Scenario: A rollback restores the prior captured state and is itself audited
  Given a write that executed and captured prior state S before mutating `target` T
  When `rollback(audit_id)` is invoked
  Then the compensating action restores T to state S (field restored / PR declined / draft deleted)
    And an audit record is written with `reversal_of` = the original `audit_id`
    And re-reading T from the tool returns state S.

## Out of Scope
- Owning the human-approval **gates** or the delivery **state machine** — that is
  [`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md); this engine enforces a
  write *given* an approval token, it does not run the saga or render the gate UI.
- Owning the audit-log **storage** — that is
  [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md); this engine appends write-back records to it.
- Identity/RBAC, the secrets vault, and tenant isolation — owned by
  [`AWP-PLAT-001`](./AWP-PLAT-001-platform-core.md).
- Deciding *what* to write (generating issue content / packets) — owned by callers such as
  [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md).
- Read-only tool sync (connectors); this engine governs writes only.
- Merging PRs — forbidden by policy here and never offered as an action type.

## Dependencies / Linked Packets
- **depends_on** [`AWP-PLAT-001`](./AWP-PLAT-001-platform-core.md) (identity, RBAC,
  secrets vault, tenant isolation — supplies the separate read/write credentials and the
  actor identity stamped on audits), [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md) (the
  append-only audit store this engine extends with `previewed_diff` + `approver`).
- **relates_to** [`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md) (the
  primary caller — its activities delegate every external write here),
  [`AWP-ORCH-021`](./AWP-ORCH-021-brd-to-pr.md) (the flagship loop whose Jira/Bitbucket
  writes pass through this engine), [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md)
  (whose publish-to-Confluence / create-Jira writes pass through this engine).

## Non-Functional Requirements
- **Performance:** preview generation adds bounded overhead (it renders, it does not call
  the tool's write path); execution latency is dominated by the tool API. Throttled writes
  drain in FIFO order within their window.
- **Security/Privacy:** **read and write credentials are physically separate** vault
  entries — a read-only deployment cannot mutate; least-privilege scopes only; secrets
  never logged; every action is tenant-scoped and the kill switch is honored before any
  credential is even requested.
- **Idempotency/Reliability:** every `execute` requires an `idempotency_key`; a retried
  Temporal activity reuses it and never double-creates; circuit breakers open on anomaly
  (e.g. a caller attempting a burst far above its tier) and fail safe (deny), not open.
- **Observability:** emit per-connector counts of proposed / approved / executed /
  throttled / blocked / rolled-back, token-bucket levels, circuit and kill-switch state,
  and one audit record per action (the debugging lifeline).
- **Cost:** the engine itself makes **zero LLM calls**; it governs writes, it does not reason.

## Verification / Test Notes
- **Default-deny AC:** submit a write with no `approval_token` against a deny-policy action;
  assert outcome `BLOCKED_DEFAULT_DENY` and a request-log capture showing 0 tool calls.
- **Preview AC:** call `preview` on a Jira-create action; snapshot the returned diff; assert
  the request log shows no mutating verbs and `no_write` = true.
- **Audit-diff+approver AC:** preview then execute with approver A; assert the stored audit
  `previewed_diff` byte-equals the snapshot and `approver` = A.
- **Rate-limit AC:** set `per_connector_rate_limit` = `{R, W}`; fire R+1 approved writes;
  assert the (R+1)th is `THROTTLED` then executes within W, and tool-call count ≤ R per W.
- **Kill-switch AC:** activate connector C's kill switch; submit a write to C → assert
  `BLOCKED_KILL_SWITCH` and 0 tool calls; submit a write to a different connector → succeeds.
- **Idempotency AC:** execute with key K, then retry with K; assert create count for K stays
  at 1 and the second result returns the original `object_id`.
- **Rollback AC:** edit a Jira field via the engine (capturing prior value), then
  `rollback`; assert the field is restored and a `reversal_of` audit record exists; repeat
  for PR-open → decline+delete-branch and draft-page → delete.

## Guardrails
This engine **is** the guardrails; it provides each of the five controls to its callers as a
service, so that every `active-writeback` packet satisfies Rule 2 by delegating here.
- **Approval:** enforces **default-deny** per `approval_policy` (configurable per action
  type / per tenant / per risk tier). A write with no valid `approval_token` is
  `BLOCKED_DEFAULT_DENY` and never reaches the tool; destructive actions default
  `forbidden`. Callers present the approver the preview (below) before approval is recorded.
- **Dry-run / Preview:** every action must be `preview`-ed first — the engine renders the
  **exact** diff/payload the tool would receive (`no_write: true`, zero mutating calls).
  Execution of a payload that differs from the approved preview is rejected.
- **Audit:** writes one append-only record per proposed/previewed/executed/rolled-back
  action to [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md), **extended** with `previewed_diff`
  and `approver` alongside actor/agent+model/timestamp/tenant/input_hash/outcome/tool_response.
- **Scoped permissions:** resolves a least-privilege **write** credential from the vault at
  execute time, **separate from the read credential**; enforces named scopes
  (`write:jira-work`, `repository:write`/`pullrequest:write`, `write:confluence-content`) and
  the per-tenant target allow-list (repos/spaces/projects). A read-only deployment cannot write.
- **Rollback / Undo:** captures prior state before mutating and provides connector-specific
  compensating actions (restore field value, decline/close PR + delete branch, delete draft
  page/issue); every reversal is itself audited via `reversal_of`. Reinforced by per-connector
  token-bucket **rate limits**, **circuit breakers** on anomaly, and a **global + per-connector
  kill switch** that halts writes before any credential is requested.

## Open Questions
- *(none — packet is `ready`)*
