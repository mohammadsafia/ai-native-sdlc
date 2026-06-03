---
id: AWP-WB-002
title: Publish AI Report to Confluence (approved)
pillar: P3 Intelligence
phase: Development
roadmap_phase: 3
owning_agent: PM
type: active-writeback
status: ready
priority: P1
estimate: M
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: <sha256-of-report-content-at-generation>
sources:
  - system: internal
    object: service
    ref: WeeklyReport artifact (AWP-INTEL-014 output)
    content_hash: runtime
  - system: Confluence
    object: page
    ref: <target_page_id | null>
    content_hash: runtime
external_apis:
  - name: Confluence Cloud REST
    auth: OAuth2 3LO
    scopes: [write:confluence-content, read:confluence-content.all]   # write invoked only behind approval + preview, via AWP-WB-001
dependencies:
  depends_on: [AWP-INTEL-014, AWP-WB-001, AWP-PLAT-002]
  relates_to: [AWP-INT-003]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a delivery manager, I want to publish the AI Weekly Status & Risk Report to a
Confluence page behind an approval gate, so that my stakeholders read it where they
already work — without me copy-pasting, and without any unapproved or accidental
edit to a Confluence space.

## Context / Background
This is a **Phase 3 "first write-back"** packet: deliberately **low-risk and
reversible**. It takes the read-only `WeeklyReport` produced by
[`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md) and publishes (or
updates) it as a single Confluence page. It is reversible **by construction**:
Confluence versions every page, so an update can be rolled back to the prior version,
and a newly-created page can be deleted.

This packet **does not reinvent guardrails**. Every external mutation is delegated to
the guardrail engine ([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)) — it calls
`preview(action)` to render the page diff and `execute(action, idempotency_key)` only
after a recorded approval, and `rollback(audit_id)` to undo. The append-only audit
record is written to the audit log ([`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md)),
extended by the engine with the previewed `diff` and `approver`. The Confluence read/
write transport quirks are owned by the Confluence connector
([`AWP-INT-003`](./AWP-INT-003-confluence-connector.md)); this packet composes them, it
does not own them.

Hard rules inherited from [`02`](../02-technical-foundation.md) §3: **default-deny**
(no approval ⇒ no write reaches Confluence), **preview-then-write** (the exact page
body is rendered as a diff first), **prefer inherently reversible operations** (page
versioning gives us free undo), and **idempotency** (re-publishing the same report
updates the existing page rather than creating a duplicate).

**Out of this packet's hands:** generating the report content (that is INTEL-014),
deciding *which* report to publish, and any Jira/Bitbucket write.

## Data Sources & External APIs
- **Input artifact (internal):** a `WeeklyReport` object from
  [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md) — its rendered
  Markdown view plus the `report_fingerprint` used for idempotency. No external call
  to produce it; it is supplied to this packet.
- **Confluence Cloud REST** (via the guardrail engine + connector):
  - `read:confluence-content.all` — read the current page body + version number of
    `target_page_id` (to build the diff and capture the prior version for rollback).
  - `write:confluence-content` — create a page in `target_space`, or update
    `target_page_id`. **Inert until Gate-1 approval.** Confluence's update API requires
    the current version number and returns a new version on success.
  - The Confluence page-version history is the rollback substrate: every update yields
    a new version; the prior version is restorable.
- **Audit store** ([`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md)): one append-only
  record per previewed / executed / rolled-back publish, carrying `previewed_diff` and
  `approver`.
- **Volumes / limits:** one page write per publish (low volume). The guardrail engine's
  per-connector `confluence` rate limit and kill switch apply.

## Inputs
- `report` (required) — the `WeeklyReport` artifact to publish (rendered body +
  `report_fingerprint`).
- `target_space` (required) — the Confluence space key the page lives in; must be on
  the per-tenant space allow-list.
- `target_page_id` (optional, default `null`) — when `null`, **create** a new page;
  when set, **update** that existing page.
- `page_title` (default = `"<project_key> — Weekly Status & Risk — <report.window>"`).
- `approver` (required) — the named human who approves the publish at Gate 1.
- `idempotency_key` (default = `"AWP-WB-002:publish:<report_fingerprint>:<target_space>"`)
  — supplied to the guardrail engine so a retried publish never double-creates.
- Secrets by reference: scoped Confluence OAuth token (`CONFLUENCE_OAUTH_TOKEN`); the
  **write** credential is resolved by the engine only at `execute`.
- Trigger: a manual "Publish report" action, or an upstream orchestration step after a
  report is generated.

## Outputs / Artifacts
1. **Preview result** (no write): `{page_diff, rendered_body, target_space,
   target_page_id|null, action: create|update, no_write: true}` — the exact page
   content a reviewer sees before approving.
2. **On approval — a published Confluence page:** the created page (with its new
   `page_id` + `url`) or the updated page (with its new `version` number).
3. **An audit record** (per write) via [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md):
   `{actor, approver, timestamp, tenant_id, action: create|update, target (space +
   page_id), input_hash, previewed_diff (the page content diff), idempotency_key,
   outcome, object_id/url, prior_version?}`.
4. **A rollback result** on undo: `{restored_version | deleted_page_id,
   compensating_action, audit_id, reversal_of}`.
5. `links.confluence` is set to the published `page_id`.

## Acceptance Criteria

Scenario: No approval ⇒ no page is created or updated (default-deny, zero writes)
  Given a `report`, a `target_space`, and no recorded approval from `approver`
  When publish reaches the write step
  Then the guardrail-engine outcome is `BLOCKED_DEFAULT_DENY`
    And exactly 0 mutating calls (POST/PUT/DELETE) are made to Confluence
        (verified by the request log)
    And no new page exists and `target_page_id` (if set) is byte-for-byte unchanged
    And an audit record is written with `outcome` = "blocked_default_deny" and no `object_id`.

Scenario: Approver sees a dry-run page preview before approving (no write yet)
  Given a `report` to publish to `target_space`
  When the approver opens the Gate-1 approval view
  Then they see the exact rendered page body and a `page_diff` (create = full body;
       update = before→after vs. the current Confluence page)
    And `no_write` = true
    And 0 mutating calls are made to Confluence at preview time (request log shows none).

Scenario: On approval the page is created/updated and the content diff + approver are audited
  Given a previewed publish with a valid approval from `approver` = A
  When `execute` succeeds
  Then the Confluence page exists (created) or shows a new `version` (updated)
    And an append-only audit record exists whose `previewed_diff` equals the diff
        shown in the preceding preview
    And whose `approver` = A
    And whose `object_id`/`url` equal the published page.

Scenario: Re-publishing the same report updates the existing page, not a duplicate (idempotent)
  Given a report with `report_fingerprint` = F was already published to page P in `target_space`
  When the same report (same `report_fingerprint` = F, same `idempotency_key`) is published again with approval
  Then no second page is created (the page count for that fingerprint in `target_space` stays at 1)
    And page P is updated in place (its `page_id` is unchanged)
    And the outcome is recorded as "idempotent_update", never a new "created".

Scenario: Rollback restores the prior Confluence page version and is audited
  Given a publish that updated page P from version V_prior to version V_new
        (V_prior captured before the write)
  When `rollback(audit_id)` is invoked
  Then page P's current content is restored to version V_prior (re-reading P returns V_prior's body)
    And an audit record is written with `reversal_of` = the original `audit_id`.

Scenario: Rollback of a newly-created page deletes it and is audited
  Given a publish that created a new page P (no `target_page_id` was supplied)
  When `rollback(audit_id)` is invoked
  Then page P is deleted (re-reading P returns 404 / not-found)
    And an audit record is written with `reversal_of` = the original `audit_id`.

Scenario: Target space must be on the allow-list (scoped permissions)
  Given a `target_space` that is NOT on the per-tenant Confluence space allow-list
  When publish is attempted
  Then the write is rejected before any Confluence call
    And 0 mutating calls are made to Confluence (request log shows none).

## Out of Scope
- **Generating** the report content — owned by
  [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md); this packet publishes
  an already-produced `WeeklyReport`.
- Any **Jira or Bitbucket** write (this packet touches Confluence only).
- Posting to Teams / email / Slack (separate packets).
- Building Confluence page **permissions / restrictions** or moving the page in the
  space tree.
- Reinventing approval / preview / audit / rollback mechanics — those are the guardrail
  engine's ([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)).
- Confluence connector transport (pagination, auth refresh, storage-format quirks) —
  owned by [`AWP-INT-003`](./AWP-INT-003-confluence-connector.md).

## Dependencies / Linked Packets
- **depends_on** [`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md) —
  produces the `WeeklyReport` this packet publishes; without it there is nothing to
  publish.
- **depends_on** [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) — supplies
  approval / preview / audit / scoped-write / rollback for the Confluence mutation; this
  packet delegates every write here.
- **depends_on** [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md) — the append-only ledger
  the engine writes the publish + rollback records to (with `previewed_diff` + `approver`).
- **relates_to** [`AWP-INT-003`](./AWP-INT-003-confluence-connector.md) — the Confluence
  connector whose read/write transport this packet composes.

## Non-Functional Requirements
- **Performance:** preview generation does not call Confluence's write path; a publish
  is one read (current version) + one write, completing within 10s for a single page.
- **Security/Privacy:** least-privilege scopes only (`write:confluence-content`,
  `read:confluence-content.all`); the write scope is inert until approval; secrets never
  logged; the publish is tenant-scoped and the `target_space` allow-list is enforced
  before any call; redact assignee PII in the report body per org policy.
- **Idempotency/Reliability:** same `report_fingerprint` + same `idempotency_key`
  ⇒ no duplicate page (update-in-place); a retried `execute` reuses the key and never
  double-creates; a Confluence version-conflict on update is surfaced, not silently
  overwritten.
- **Observability:** emit per-publish state-transition events (previewed / approved /
  executed / rolled-back) with correlation id = `idempotency_key`, plus the request-log
  used by the default-deny AC.
- **Cost:** **zero LLM calls** in this packet — the report (and its single narrative LLM
  call) is produced upstream by INTEL-014; this packet only publishes.

## Verification / Test Notes
- **Default-deny AC:** invoke publish with no approval token against a write-policy
  action; assert engine outcome `BLOCKED_DEFAULT_DENY` and a request-log capture showing
  0 Confluence mutating verbs; assert no page created and any `target_page_id` unchanged.
- **Preview AC:** call `preview` for both create (null `target_page_id`) and update
  (set `target_page_id`); snapshot the returned `page_diff`; assert `no_write` = true and
  the request log shows no mutating verbs.
- **Audit-diff+approver AC:** preview then execute with approver A; assert the stored
  audit `previewed_diff` byte-equals the snapshot and `approver` = A and `object_id`/`url`
  match the page.
- **Idempotency AC:** publish report fingerprint F (create → page P); publish F again with
  approval; assert page count for F stays at 1, P's `page_id` unchanged, outcome
  "idempotent_update".
- **Rollback (update) AC:** publish-update P (capturing V_prior); `rollback`; assert P
  reads back as V_prior and a `reversal_of` audit record exists.
- **Rollback (create) AC:** publish-create P; `rollback`; assert P returns not-found and a
  `reversal_of` audit record exists.
- **Allow-list AC:** publish to a space not on the allow-list; assert rejection before any
  Confluence call and 0 mutating verbs in the request log.

## Guardrails
- **Approval:** the named `approver` must approve the publish at the `awaiting_approval`
  gate; **default-deny** — with no valid approval the guardrail engine returns
  `BLOCKED_DEFAULT_DENY` and no write reaches Confluence. The approver sees the **dry-run
  page preview** (below) before approving.
- **Dry-run / Preview:** mandatory no-write `preview(action)` that renders the **exact**
  page content the tool would receive — the full body on create, and a before→after
  `page_diff` vs. the current Confluence page on update (`no_write: true`, zero mutating
  calls). Executing a body that differs from the approved preview is rejected.
- **Audit:** one append-only record per previewed / executed / rolled-back publish to
  [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md), carrying actor, `approver`, timestamp,
  tenant, action (create|update), target (space + page id), `input_hash`, the
  **page content `previewed_diff`**, `idempotency_key`, outcome, and the resulting
  page id/url (plus `prior_version` for rollback).
- **Scoped permissions:** least-privilege Confluence write credential resolved by the
  engine at execute time, **separate from the read credential**; named scope
  `write:confluence-content`; the explicit per-tenant **`target_space` allow-list** is
  enforced before any call — a space not on the list cannot be written.
- **Rollback / Undo:** because Confluence versions every page, undo of an **update**
  restores the captured prior page **version**; undo of a **create** **deletes** the
  newly-created page; every reversal is itself audited via `reversal_of`.

## Open Questions
- *(none — packet is `ready`)*
