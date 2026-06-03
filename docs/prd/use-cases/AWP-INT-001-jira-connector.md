---
id: AWP-INT-001
title: Jira Connector (incremental sync + webhooks + backfill)
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
  - system: Jira
    object: project
    ref: <project_keys[]>
    content_hash: runtime
external_apis:
  - name: Jira Cloud REST v3
    auth: OAuth2 3LO
    scopes: [read:jira-work, read:jira-user]
dependencies:
  depends_on: []
  relates_to: [AWP-NORM-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's ingestion layer, I want a Jira connector that backfills, incrementally
syncs, and receives webhooks for one or more Jira projects, so that every issue change
lands on the ingestion bus as a raw, provenance-stamped event the normalizer can replay.

## Context / Background
This is a **Phase 0** connector — the first half of the deterministic traceability spine
(see [`02`](../02-technical-foundation.md) §1). Jira is one of the *semantically rich*
sources that is **built**, not bought, because issue keys are the join key for Tier-0
entity resolution ([`02`](../02-technical-foundation.md) §2). The connector's job ends at
the ingestion bus: it **emits raw events**, it does **not** normalize them — that is
[`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md). It stores raw payloads
**immutably** so normalization can be re-derived when logic changes (replayability is
non-negotiable, [`02`](../02-technical-foundation.md) §1).

Hard constraints: this packet is **strictly read-only** — it must never POST/PUT/PATCH/DELETE
to Jira. It must be **tenant-scoped** (every fetch and every emitted event carries the
tenant boundary, [`02`](../02-technical-foundation.md) §4). Tokens are secrets and must
never appear in logs. The connector pulls deltas via **both** a scheduled poll (cursor on
`updated`) **and** webhooks; webhooks give freshness, the poll guarantees eventual
completeness when a webhook is missed.

## Data Sources & External APIs
- **Jira Cloud REST v3** (`read:jira-work`, `read:jira-user`), auth **OAuth2 3LO**:
  - **Backfill / incremental search:** `GET /rest/api/3/search/jql` with JQL
    `project IN (project_keys) [AND updated >= "<sync_cursor>"] ORDER BY updated ASC`,
    `maxResults=100`, paging via the returned `nextPageToken` until exhausted.
  - **Issue detail:** `GET /rest/api/3/issue/{key}?expand=changelog` (status transitions,
    fields, comments).
  - **User detail (when referenced):** `GET /rest/api/3/user` (display name / accountId only;
    `read:jira-user`).
  - **Webhooks:** registered for `jira:issue_created`, `jira:issue_updated`,
    `jira:issue_deleted`, and sprint events (`sprint_started`, `sprint_closed`,
    `sprint_updated`); each delivery carries a Jira-supplied event id used for idempotency.
- **Volumes / limits:** assume ≤ 50k issues per project on first backfill. Page every
  endpoint at 100/page. Jira returns **HTTP 429** with `Retry-After` under load — honor it
  with exponential backoff. All issue payloads (search pages + detail) are persisted raw.

## Inputs
- `jira_site_url` (required) — e.g. `https://<tenant>.atlassian.net`.
- `project_keys[]` (required) — one or more Jira project keys to sync.
- `sync_cursor` (optional) — the `updated` watermark; absent ⇒ behaves as first sync.
- `backfill` (bool, default `false`) — `true` ignores `sync_cursor` and fetches the full history.
- `poll_interval_minutes` (default `15`) — scheduled incremental-poll cadence.
- Secrets by reference: `JIRA_OAUTH_TOKEN` (read scopes only), `JIRA_WEBHOOK_SECRET`.
- Trigger: scheduled tick every `poll_interval_minutes`, **or** an inbound webhook delivery,
  **or** an explicit `backfill` run on first connect.

## Outputs / Artifacts
- **Raw events on the ingestion bus**, one per observed issue/sprint change, each with a
  provenance envelope: `{ source: "jira", source_id: <issue key or sprint id>, fetch_time,
  schema_version, tenant_id, event_type, payload: <verbatim Jira JSON> }`.
- **Immutable raw-payload store:** every fetched/received payload written append-only,
  keyed by `(tenant_id, source_id, fetch_time)`, never mutated.
- **Advanced `sync_cursor`** persisted per `(tenant_id, project_key)` = max `updated` seen.
- **Idempotency ledger** of processed webhook event ids per tenant.
- Observability counters: issues fetched, pages fetched, webhooks received, 429s retried,
  duplicates suppressed, emit latency — plus the request log used by the read-only AC.

## Acceptance Criteria

Scenario: Full backfill fetches every issue in scope
  Given `project_keys` whose projects together contain N issues
    And `backfill` = true
  When the connector runs to completion
  Then exactly N raw issue events are emitted to the ingestion bus (one per issue key)
    And every emitted event carries `source` = "jira", a non-null `source_id`, `fetch_time`, and `schema_version`.

Scenario: Incremental sync returns only changed issues
  Given a stored `sync_cursor` watermark
    And M issues have `updated` strictly after `sync_cursor` and the rest are unchanged
  When the incremental poll runs
  Then exactly M issue events are emitted
    And zero events are emitted for issues whose `updated` is ≤ `sync_cursor`
    And `sync_cursor` is advanced to the maximum `updated` among the M issues.

Scenario: A webhook issue-update produces a bus event within the poll interval
  Given the connector is subscribed to `jira:issue_updated`
  When Jira delivers an `issue_updated` webhook for issue key K at time T
  Then a raw event with `source_id` = K is emitted to the ingestion bus at a time ≤ T + `poll_interval_minutes`.

Scenario: Pagination fetches all pages for a project with more than 100 issues
  Given a project containing 250 issues
    And page size = 100
  When backfill runs
  Then the connector issues exactly 3 paged search requests (100 + 100 + 50)
    And 250 distinct issue events are emitted with no key emitted twice.

Scenario: A 429 triggers exponential backoff and eventual success
  Given a Jira endpoint that returns HTTP 429 with `Retry-After` on the first 2 calls then 200
  When the connector calls that endpoint
  Then it retries with strictly increasing back-off delays (each ≥ the prior, ≥ `Retry-After`)
    And the 3rd attempt succeeds
    And the request log shows exactly 3 attempts for that call with no data loss.

Scenario: Strictly read-only
  Given a full backfill + incremental + webhook cycle with write-capable credentials available
  When the connector runs
  Then zero POST / PUT / PATCH / DELETE calls are made to Jira (verified by the request log — GET only).

Scenario: Duplicate webhook delivery is idempotent
  Given a webhook with event id E that has already been processed and emitted
  When Jira re-delivers the identical event id E
  Then no second bus event is emitted for E (the emit count for E stays at 1)
    And the duplicate is recorded once in the idempotency ledger.

## Out of Scope
- Normalization / mapping to the canonical `Artifact`/`Event` model — [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md).
- Entity resolution (parsing Jira keys into links) — that consumes normalized data downstream.
- Any write to Jira (comments, transitions, field edits) — read-only packet, no write-back ever.
- Bitbucket and Confluence ingestion — [`AWP-INT-002`](./AWP-INT-002-bitbucket-connector.md), [`AWP-INT-003`](./AWP-INT-003-confluence-connector.md).
- Building/operating the bus or raw store themselves (bought infrastructure, [`02`](../02-technical-foundation.md) §1).

## Dependencies / Linked Packets
- **depends_on** — none; this is a Phase 0 leaf that feeds the bus.
- **relates_to** [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) — the normalizer is the
  immediate downstream consumer of every raw event this connector emits; the provenance envelope
  (`source`, `source_id`, `fetch_time`, `schema_version`) is the contract between them.

## Non-Functional Requirements
- **Performance:** end-to-end freshness (Jira change → event on bus) < `poll_interval_minutes`
  for webhook-delivered changes; a 50k-issue backfill completes without exceeding rate limits.
- **Security/Privacy:** read-only OAuth scopes only; **never log tokens** or `JIRA_WEBHOOK_SECRET`;
  verify the webhook signature against `JIRA_WEBHOOK_SECRET` before processing; **tenant-scoped** —
  every fetch and emitted event carries `tenant_id` and no cross-tenant read is possible.
- **Idempotency/Reliability:** duplicate webhook deliveries de-duplicate via the event-id ledger;
  the scheduled poll backstops missed webhooks so the graph is eventually complete; raw payloads
  are immutable to support replay.
- **Observability:** emit per-run fetch counts, page counts, webhook counts, 429 retry counts,
  duplicate-suppression counts, emit latency, and the request log the read-only AC asserts against.
- **Cost:** zero LLM calls (pure ingestion); respect Jira rate limits to avoid throttling churn.

## Verification / Test Notes
- **Fixtures:** a mock Jira returning (1) a project with 250 issues for the pagination AC;
  (2) a search response honoring an `updated >=` cursor for the incremental AC; (3) an endpoint
  that returns 429+`Retry-After` twice then 200 for the backoff AC.
- **Backfill AC:** point the connector at the 250-issue fixture with `backfill=true`; assert the
  emitted-event count = 250 and each envelope has all four provenance fields populated.
- **Incremental AC:** seed `sync_cursor`; mutate M fixture issues' `updated`; run the poll; assert
  only those M emit and the cursor advances to their max `updated`.
- **Webhook AC:** post a signed `issue_updated` payload; assert a matching `source_id` event lands
  on the bus within `poll_interval_minutes`.
- **Backoff AC:** drive the 429 fixture; assert exactly 3 attempts with monotonically increasing delays.
- **Read-only AC:** assert the captured request log contains only GET verbs.
- **Idempotency AC:** replay the same webhook event id twice; assert emit count for that id stays at 1.

## Open Questions
- *(none — packet is `ready`)*
