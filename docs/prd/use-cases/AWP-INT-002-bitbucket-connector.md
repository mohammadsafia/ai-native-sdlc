---
id: AWP-INT-002
title: Bitbucket Connector (commits, PRs, pipelines, deployments)
pillar: P1 Integration
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
  - system: Bitbucket
    object: repo
    ref: <workspace>/<repo-slug>
    content_hash: runtime
external_apis:
  - name: Bitbucket Cloud REST 2.0
    auth: OAuth2 / app password
    scopes: [repository:read, pullrequest:read]
dependencies:
  depends_on: []
  relates_to: [AWP-NORM-001, AWP-ER-001, AWP-INTEL-002]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's ingestion layer, I want a Bitbucket connector that backfills and incrementally
syncs commits, pull requests, pipelines, and deployments for one or more repositories — capturing
commit messages, branch names, and PR titles **verbatim** — so that the Tier-0 entity-resolution
spine can recover the Jira keys embedded in them and trace PR → deploy → release.

## Context / Background
This is the second half of the **Phase 0** deterministic spine (see
[`02`](../02-technical-foundation.md) §1). Bitbucket is a *semantically rich* source that is
**built**, not bought, for one reason that dominates every design decision here: **Tier-0 entity
resolution depends on strings carried in Bitbucket's own free text** — Jira issue keys (`PROJ-123`)
appear in **commit messages, branch names, and PR titles/descriptions**, and `PR → deployment →
release` is recovered from Bitbucket pipeline/deployment metadata
([`02`](../02-technical-foundation.md) §2, Tier 0). If this connector lossily summarizes or strips
that text, the traceability spine breaks and downstream ER falls back to expensive, unreliable
Tier-2 matching — exactly the failure mode [`02`](../02-technical-foundation.md) §5 warns against.

The connector emits **raw events to the ingestion bus** with provenance and retains raw payloads
immutably for replay; it does **not** normalize (that is [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalizer.md))
and it does **not** parse the keys itself (that is ER, [`AWP-ER-001`](./AWP-ER-001-tier0-id-linker.md)) —
its sole obligation is to deliver the source text **byte-for-byte**. It is **strictly read-only**,
**tenant-scoped**, and never logs credentials.

## Data Sources & External APIs
- **Bitbucket Cloud REST 2.0** (`repository:read`, `pullrequest:read`), auth **OAuth2 / app password**:
  - **Commits:** `GET /2.0/repositories/{workspace}/{repo}/commits` (hash, **message verbatim**,
    author, date, parents, **branch refs**), `pagelen=100`, paged via `next`.
  - **Pull requests:** `GET /2.0/repositories/{workspace}/{repo}/pullrequests?state=ALL` (id, **title
    and description verbatim**, state, **source/destination branch names verbatim**, created/updated,
    reviewers, participants/approvals, merge commit).
  - **Pipelines:** `GET /2.0/repositories/{workspace}/{repo}/pipelines/` (uuid, state, target ref, result).
  - **Deployments:** `GET /2.0/repositories/{workspace}/{repo}/deployments/` (environment, state,
    release/version, the commit/PR deployed) — the `PR → deploy → release` metadata.
  - **Webhooks:** subscribed to `repo:push`, `pullrequest:created`, `pullrequest:updated`,
    `pullrequest:fulfilled` (merged); each delivery carries a request id used for idempotency.
- **Volumes / limits:** assume ≤ 100k commits and ≤ 20k PRs per repo on first backfill. Page at
  100/page. Honor **HTTP 429** with exponential backoff. Persist every raw payload immutably.

## Inputs
- `workspace` (required) and `repo_slugs[]` (required) — one or more repositories to sync.
- `sync_cursor` (optional) — per-stream watermark (commit date / PR `updated_on`); absent ⇒ first sync.
- `backfill` (bool, default `false`) — `true` fetches the full commit/PR/pipeline/deployment history.
- `poll_interval_minutes` (default `15`) — scheduled incremental-poll cadence and the freshness SLA bound.
- Secrets by reference: `BITBUCKET_TOKEN` (read scopes only), `BITBUCKET_WEBHOOK_SECRET`.
- Trigger: scheduled tick every `poll_interval_minutes`, **or** an inbound webhook delivery,
  **or** an explicit `backfill` run on first connect.

## Outputs / Artifacts
- **Raw events on the ingestion bus**, one per commit / PR / pipeline / deployment change, each with
  a provenance envelope: `{ source: "bitbucket", source_id: <commit hash | PR id | deployment id>,
  fetch_time, schema_version, tenant_id, event_type, payload: <verbatim Bitbucket JSON> }`.
- **Verbatim text preserved** inside each payload: commit `message`, branch names, PR `title` and
  `description` are stored exactly as returned — no truncation, normalization, or re-encoding.
- **Immutable raw-payload store**, append-only, keyed by `(tenant_id, source_id, fetch_time)`.
- **Advanced `sync_cursor`** persisted per `(tenant_id, repo_slug, stream)`.
- **Idempotency ledger** of processed webhook request ids per tenant.
- Observability counters: commits/PRs/pipelines/deployments fetched, pages fetched, webhooks
  received, 429s retried, duplicates suppressed, emit latency, plus the read-only request log.

## Acceptance Criteria

Scenario: Backfill fetches all commits and PRs for the repo
  Given a repository containing C commits and P pull requests
    And `backfill` = true
  When the connector runs to completion
  Then exactly C commit events and P pull-request events are emitted to the bus
    And every emitted event carries `source` = "bitbucket", a non-null `source_id`, `fetch_time`, and `schema_version`.

Scenario: Commit messages and branch names are captured verbatim
  Given a commit whose message is the exact string "PROJ-123 fix null deref" on branch "feature/PROJ-123-login"
  When the connector emits that commit's event
  Then the emitted payload's commit `message` equals "PROJ-123 fix null deref" character-for-character
    And the payload's branch name equals "feature/PROJ-123-login" character-for-character
    And the substring "PROJ-123" is present unaltered in both fields.

Scenario: A push webhook produces a bus event within SLA
  Given the connector is subscribed to `repo:push`
  When Bitbucket delivers a `repo:push` webhook for commit hash H at time T
  Then a raw event with `source_id` = H is emitted to the ingestion bus at a time ≤ T + `poll_interval_minutes`.

Scenario: Deployment metadata is captured for a deployed PR
  Given a pull request P that was merged and deployed to environment "production" as release "v1.4.0"
  When the connector syncs deployments
  Then a deployment event is emitted whose payload links the deployed commit/PR to environment "production" and release "v1.4.0"
    And that linkage (PR → deploy → release) is recoverable from the emitted payload fields without any additional fetch.

Scenario: Strictly read-only
  Given a full backfill + incremental + webhook cycle with write-capable credentials available
  When the connector runs
  Then zero POST / PUT / PATCH / DELETE calls are made to Bitbucket (verified by the request log — GET only).

Scenario: Duplicate webhook delivery is idempotent
  Given a webhook with request id R that has already been processed and emitted
  When Bitbucket re-delivers the identical request id R
  Then no second bus event is emitted for R (the emit count for R stays at 1)
    And the duplicate is recorded once in the idempotency ledger.

## Out of Scope
- Normalization to the canonical model — [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalizer.md).
- Parsing/extracting the Jira keys from the captured text into graph links — [`AWP-ER-001`](./AWP-ER-001-tier0-id-linker.md) and [`AWP-INTEL-002`](./AWP-INTEL-002-issue-commit-link-index.md).
- Any write to Bitbucket (comments, approvals, branches, PRs) — read-only packet, no write-back ever.
- Jira and Confluence ingestion — [`AWP-INT-001`](./AWP-INT-001-jira-connector.md), [`AWP-INT-003`](./AWP-INT-003-confluence-connector.md).
- Building/operating the bus or raw store themselves (bought infrastructure, [`02`](../02-technical-foundation.md) §1).

## Dependencies / Linked Packets
- **depends_on** — none; Phase 0 leaf feeding the bus.
- **relates_to** [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalizer.md) — downstream normalizer consumer;
  [`AWP-ER-001`](./AWP-ER-001-tier0-id-linker.md) — the Tier-0 ID linker that depends on the verbatim
  text this connector preserves; [`AWP-INTEL-002`](./AWP-INTEL-002-issue-commit-link-index.md) — the
  issue↔commit link index built from those keys, which the weekly report
  ([`AWP-INTEL-014`](./AWP-INTEL-014-weekly-status-risk-report.md)) consumes.

## Non-Functional Requirements
- **Performance:** end-to-end freshness (Bitbucket change → event on bus) < `poll_interval_minutes`
  for webhook-delivered changes; a 100k-commit backfill completes without exceeding rate limits.
- **Security/Privacy:** read-only OAuth scopes only; **never log `BITBUCKET_TOKEN`** or the webhook
  secret; verify the webhook signature against `BITBUCKET_WEBHOOK_SECRET` before processing;
  **tenant-scoped** — every fetch and emitted event carries `tenant_id`, no cross-tenant read.
- **Idempotency/Reliability:** duplicate webhook deliveries de-duplicate via the request-id ledger;
  the scheduled poll backstops missed webhooks; raw payloads are immutable to support replay; the
  **verbatim-capture invariant** holds on every path (backfill, poll, webhook).
- **Observability:** emit per-run fetch counts per stream, page counts, webhook counts, 429 retry
  counts, duplicate-suppression counts, emit latency, and the request log the read-only AC asserts.
- **Cost:** zero LLM calls (pure ingestion); respect Bitbucket rate limits to avoid throttling churn.

## Verification / Test Notes
- **Fixtures:** a mock Bitbucket returning (1) a repo with C commits + P PRs for the backfill AC;
  (2) a commit with message "PROJ-123 fix null deref" on branch "feature/PROJ-123-login" for the
  verbatim AC; (3) a merged PR with a deployment to "production" / release "v1.4.0" for the
  deployment AC; (4) a `repo:push` webhook payload for the SLA AC.
- **Backfill AC:** run with `backfill=true`; assert commit-event count = C and PR-event count = P,
  each envelope carrying all four provenance fields.
- **Verbatim AC:** emit the fixture commit; byte-compare the emitted `message` and branch name to the
  source strings; assert "PROJ-123" survives unaltered in both.
- **SLA AC:** post a signed `repo:push`; assert a matching `source_id` event lands within `poll_interval_minutes`.
- **Deployment AC:** sync deployments; assert the emitted payload exposes the PR → "production" →
  "v1.4.0" linkage without a follow-up fetch.
- **Read-only AC:** assert the request log contains only GET verbs.
- **Idempotency AC:** replay the same webhook request id twice; assert emit count for that id stays at 1.

## Open Questions
- *(none — packet is `ready`)*
