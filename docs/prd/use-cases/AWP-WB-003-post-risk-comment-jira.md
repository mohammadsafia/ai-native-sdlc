---
id: AWP-WB-003
title: Post AI Summary/Risk Comment to Jira (approved)
pillar: P3 Intelligence
phase: Development
roadmap_phase: 3
owning_agent: PM
type: active-writeback
status: ready
priority: P1
estimate: S
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: <sha256-of-summary-content-at-generation>
sources:
  - system: internal
    object: service
    ref: RiskReport / risks[] (AWP-RISK-001 output)
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
  depends_on: [AWP-RISK-001, AWP-WB-001, AWP-PLAT-002]
  relates_to: [AWP-INT-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a delivery manager, I want to post an AI-generated risk/status summary as a comment
on the relevant Jira issue behind an approval gate, so that the context lands where the
team already triages work — clearly attributed as AI-generated, and reversible if it is
wrong.

## Context / Background
This is a **Phase 3 "first write-back"** packet — deliberately **low-risk and
reversible**. A Jira comment is the gentlest possible mutation: it adds information
without changing issue state, and it is **deletable**, so rollback is trivial. The
summary content comes from the read-only risk engine
([`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md)) — e.g. a per-issue rollup of that
issue's `risks[]` items (`{kind, severity, evidence, recommendation}`).

This packet **does not reinvent guardrails**. The comment write is delegated to the
guardrail engine ([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)): `preview(action)`
renders the exact comment text, `execute(action, idempotency_key)` posts it only after a
recorded approval, and `rollback(audit_id)` deletes it. The append-only audit record is
written to the audit log ([`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md)) with the
previewed `diff` (the comment body) and `approver`. Jira read/write transport is owned by
the Jira connector ([`AWP-INT-001`](./AWP-INT-001-jira-connector.md)); this packet
composes it.

Hard rules from [`02`](../02-technical-foundation.md) §3: **default-deny** (no approval ⇒
no comment), **preview-then-write** (the approver sees the literal comment first),
**prefer inherently reversible operations** (a comment is deletable), and **idempotency**
(the same summary is not double-posted to the same issue). The posted comment is always
**prefixed with `ai_marker`** so it is unambiguously attributed as AI-generated — a direct
application of the grounding/attribution requirement in
[`02`](../02-technical-foundation.md) §4.

## Data Sources & External APIs
- **Input artifact (internal):** the risk/status summary text derived from
  [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md)'s `RiskReport` for `issue_key`
  (its `risks[]` items, already evidence-cited). Produced upstream and supplied to this
  packet; no external call to generate it.
- **Jira Cloud REST v3** (via the guardrail engine + connector):
  - `read:jira-work` — read `issue_key` to confirm it exists and to detect an
    already-posted identical AI comment (idempotency).
  - `write:jira-work` — `POST /issue/{issue_key}/comment` to add the comment, and
    `DELETE /issue/{issue_key}/comment/{id}` to roll it back. **Inert until Gate-1
    approval.**
- **Audit store** ([`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md)): one append-only record
  per previewed / executed / rolled-back comment, carrying `previewed_diff` (the comment
  body) and `approver`.
- **Volumes / limits:** one comment write per post (low volume). The guardrail engine's
  per-connector `jira` rate limit and kill switch apply.

## Inputs
- `issue_key` (required) — the Jira issue to comment on (e.g. `PROJ-123`).
- `summary` (required) — the AI-generated risk/status summary text to post.
- `summary_fingerprint` (required) — stable hash of `summary` for idempotency / dedupe.
- `ai_marker` (default `"🤖 AI-generated"`) — the attribution prefix prepended to the
  posted comment body.
- `approver` (required) — the named human who approves the post at Gate 1.
- `idempotency_key` (default = `"AWP-WB-003:comment:<issue_key>:<summary_fingerprint>"`)
  — supplied to the guardrail engine so a retried post never double-comments.
- Secrets by reference: scoped Jira OAuth token (`JIRA_OAUTH_TOKEN`); the **write**
  credential is resolved by the engine only at `execute`.
- Trigger: a manual "Post summary to Jira" action, or an upstream orchestration step.

## Outputs / Artifacts
1. **Preview result** (no write): `{comment_diff, rendered_comment (with `ai_marker`
   prefix), target: issue_key, action: add_comment, no_write: true}`.
2. **On approval — a Jira comment** on `issue_key` (with its `comment_id` + `url`),
   whose body is prefixed with `ai_marker`.
3. **An audit record** (per write) via [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md):
   `{actor (the comment author), approver, timestamp, tenant_id, action: add_comment,
   target: issue_key, input_hash, previewed_diff (the comment body), idempotency_key,
   outcome, object_id (comment_id)/url}`.
4. **A rollback result** on undo: `{deleted_comment_id, compensating_action, audit_id,
   reversal_of}`.
5. `links.jira` is set to `issue_key`.

## Acceptance Criteria

Scenario: No approval ⇒ no comment is posted (default-deny, zero writes)
  Given an `issue_key`, a `summary`, and no recorded approval from `approver`
  When the post reaches the write step
  Then the guardrail-engine outcome is `BLOCKED_DEFAULT_DENY`
    And exactly 0 mutating calls (POST/DELETE) are made to Jira (verified by the request log)
    And no comment is added to `issue_key`
    And an audit record is written with `outcome` = "blocked_default_deny" and no `object_id`.

Scenario: Approver sees the exact comment text before approving (dry-run, no write)
  Given a `summary` to post to `issue_key`
  When the approver opens the Gate-1 approval view
  Then they see the rendered comment body verbatim (including the `ai_marker` prefix)
    And `no_write` = true
    And 0 mutating calls are made to Jira at preview time (request log shows none).

Scenario: On approval the comment is posted and audited with author + approver
  Given a previewed post with a valid approval from `approver` = A
  When `execute` succeeds
  Then a comment exists on `issue_key` with the previewed body
    And an append-only audit record exists whose `previewed_diff` equals the previewed
        comment body
    And whose `approver` = A and whose `actor` is the posting author identity
    And whose `object_id` is the created comment id.

Scenario: The posted comment is prefixed with ai_marker (named attribution observable)
  Given `ai_marker` = "🤖 AI-generated"
  When the comment is posted to `issue_key`
  Then the posted comment body begins with the exact `ai_marker` string
    And re-reading the comment from Jira returns a body that starts with `ai_marker`.

Scenario: The same summary is not double-posted to the same issue (idempotent)
  Given a summary with `summary_fingerprint` = F was already posted to `issue_key`
  When the same summary (same `summary_fingerprint` = F, same `idempotency_key`) is posted again with approval
  Then no second comment is created (the AI-comment count for F on `issue_key` stays at 1)
    And the outcome is recorded as "idempotent_replay", returning the original `comment_id`,
        never a new "created".

Scenario: Rollback deletes the comment and is audited
  Given a posted comment with `comment_id` = C on `issue_key` (captured at execute time)
  When `rollback(audit_id)` is invoked
  Then comment C is deleted (re-reading `issue_key`'s comments does not include C)
    And an audit record is written with `reversal_of` = the original `audit_id`.

Scenario: Target issue must be on the allow-list (scoped permissions)
  Given an `issue_key` in a Jira project NOT on the per-tenant project allow-list
  When the post is attempted
  Then the write is rejected before any Jira call
    And 0 mutating calls are made to Jira (request log shows none).

## Out of Scope
- **Generating** the summary content — owned by
  [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md) (and report packets); this packet posts
  an already-produced `summary`.
- **Transitioning** the issue, **editing fields**, or any non-comment Jira write
  (field updates are [`AWP-WB-004`](./AWP-WB-004-suggested-field-update.md)).
- Any **Confluence or Bitbucket** write (this packet touches Jira comments only).
- Threading / replying to existing comments, mentions, or notifications beyond Jira's
  native behavior.
- Reinventing approval / preview / audit / rollback mechanics — owned by the guardrail
  engine ([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)).
- Jira connector transport (pagination, auth refresh, ADF rendering quirks) — owned by
  [`AWP-INT-001`](./AWP-INT-001-jira-connector.md).

## Dependencies / Linked Packets
- **depends_on** [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md) — produces the
  evidence-cited risk content this packet summarizes and posts; without it there is no
  summary to comment.
- **depends_on** [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) — supplies
  approval / preview / audit / scoped-write / rollback for the Jira comment write; this
  packet delegates every write here.
- **depends_on** [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md) — the append-only ledger
  the engine writes the comment + rollback records to (with `previewed_diff` + `approver`).
- **relates_to** [`AWP-INT-001`](./AWP-INT-001-jira-connector.md) — the Jira connector
  whose read/write transport this packet composes.

## Non-Functional Requirements
- **Performance:** preview does not call Jira's write path; a post is one read (dedupe
  check) + one comment write, completing within 8s for a single comment.
- **Security/Privacy:** least-privilege scopes only (`write:jira-work`, `read:jira-work`);
  the write scope is inert until approval; secrets never logged; the post is tenant-scoped
  and the per-tenant project allow-list is enforced before any call; redact assignee PII in
  the summary body per org policy.
- **Idempotency/Reliability:** same `summary_fingerprint` + same `idempotency_key`
  ⇒ no duplicate comment; a retried `execute` reuses the key and returns the original
  `comment_id`; a post whose audit cannot be persisted fails closed (no orphaned comment).
- **Observability:** emit per-post state-transition events (previewed / approved /
  executed / rolled-back) with correlation id = `idempotency_key`, plus the request-log
  used by the default-deny AC.
- **Cost:** **zero LLM calls** in this packet — the summary (and any LLM that produced it)
  is generated upstream; this packet only posts.

## Verification / Test Notes
- **Default-deny AC:** invoke post with no approval token against a write-policy action;
  assert engine outcome `BLOCKED_DEFAULT_DENY` and a request-log capture showing 0 Jira
  mutating verbs; assert no comment added to `issue_key`.
- **Preview AC:** call `preview`; snapshot the returned `comment_diff` / rendered comment;
  assert it begins with `ai_marker`, `no_write` = true, and the request log shows no
  mutating verbs.
- **Audit-diff+approver AC:** preview then execute with approver A; assert stored audit
  `previewed_diff` byte-equals the snapshot, `approver` = A, `actor` = posting author, and
  `object_id` = created comment id.
- **Attribution AC:** execute; read the comment back from Jira; assert its body starts with
  the exact `ai_marker` string.
- **Idempotency AC:** post fingerprint F to `issue_key`; post F again with approval; assert
  AI-comment count for F stays at 1 and the second call returns the original `comment_id`,
  outcome "idempotent_replay".
- **Rollback AC:** post a comment (capturing `comment_id` = C); `rollback`; assert C is
  gone from `issue_key`'s comments and a `reversal_of` audit record exists.
- **Allow-list AC:** post to an issue in a non-allow-listed project; assert rejection before
  any Jira call and 0 mutating verbs in the request log.

## Guardrails
- **Approval:** the named `approver` must approve the post at the `awaiting_approval` gate;
  **default-deny** — with no valid approval the guardrail engine returns
  `BLOCKED_DEFAULT_DENY` and no comment reaches Jira. The approver sees the **exact comment
  text** (dry-run, below) before approving.
- **Dry-run / Preview:** mandatory no-write `preview(action)` that renders the **exact**
  comment body the tool would receive — including the `ai_marker` prefix — as a
  `comment_diff` (`no_write: true`, zero mutating calls). Executing a body that differs from
  the approved preview is rejected.
- **Audit:** one append-only record per previewed / executed / rolled-back comment to
  [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md), carrying actor (the posting **author**),
  `approver`, timestamp, tenant, action (add_comment), target (`issue_key`), `input_hash`,
  the **comment-body `previewed_diff`**, `idempotency_key`, outcome, and the resulting
  comment id/url.
- **Scoped permissions:** least-privilege Jira write credential resolved by the engine at
  execute time, **separate from the read credential**; named scope `write:jira-work`; the
  explicit per-tenant **project allow-list** is enforced before any call — an issue in a
  non-allow-listed project cannot be commented on.
- **Rollback / Undo:** because a Jira comment is inherently deletable, undo simply
  **deletes the posted comment** (by captured `comment_id`); every reversal is itself
  audited via `reversal_of`.

## Open Questions
- *(none — packet is `ready`)*
