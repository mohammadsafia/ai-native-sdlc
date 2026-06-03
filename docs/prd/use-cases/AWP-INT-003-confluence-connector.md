---
id: AWP-INT-003
title: Confluence Connector (pages, comments, BRDs)
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
  - system: Confluence
    object: page
    ref: <space_keys[]>
    content_hash: runtime
external_apis:
  - name: Confluence Cloud REST
    auth: OAuth2 3LO
    scopes: [read:confluence-content.summary, read:confluence-content.all]
dependencies:
  depends_on: []
  relates_to: [AWP-NORM-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's ingestion layer, I want a Confluence connector that backfills space pages,
incrementally re-fetches them on version change, and captures page bodies, inline comments,
version history, and embedded Jira macros/links, so that BRDs and design docs land on the
ingestion bus as raw, provenance-stamped events whose Jira links feed Tier-0 entity resolution.

## Context / Background
This completes the **Phase 0** read-only source set (Jira + Bitbucket + Confluence,
[`02`](../02-technical-foundation.md) §5). Confluence is the home of BRDs and design docs — the
human-authored context the platform reasons over — and it carries **Tier-0 entity-resolution
signal**: Confluence ↔ Jira macros/links and smart-link URLs are deterministic ID links
([`02`](../02-technical-foundation.md) §2, Tier 0). The connector must therefore capture the page
body in **storage format** (the form that preserves embedded Jira issue macros and links) rather
than rendered/flattened text, plus inline comments and version history.

The connector emits **raw events to the ingestion bus** with provenance and retains raw payloads
immutably for replay; it does **not** normalize (that is [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalizer.md))
and does **not** resolve the Jira links itself (downstream ER). Incremental sync keys on the page
**version number** — a page is re-fetched only when its version increments. It is **strictly
read-only**, **tenant-scoped**, and never logs credentials.

## Data Sources & External APIs
- **Confluence Cloud REST** (`read:confluence-content.summary`, `read:confluence-content.all`),
  auth **OAuth2 3LO**:
  - **Space pages (list / incremental):** `GET /wiki/api/v2/spaces/{id}/pages` (id, title, status,
    current `version.number`), cursor-paged via `next`; used to detect version changes.
  - **Page body (verbatim):** `GET /wiki/api/v2/pages/{id}?body-format=storage` — the **storage
    format** body that retains Jira issue macros / smart links.
  - **Inline comments:** `GET /wiki/api/v2/pages/{id}/inline-comments` (body + the text they anchor to).
  - **Version history:** `GET /wiki/api/v2/pages/{id}/versions` (number, author, when, message).
  - **Webhooks (optional acceleration):** `page_created`, `page_updated`, `page_removed`; each
    delivery carries an event id used for idempotency. Absent webhooks, the scheduled version-scan poll
    guarantees eventual completeness.
- **Volumes / limits:** assume ≤ 20k pages per space on first backfill. Page at 100/page. Honor
  **HTTP 429** with exponential backoff. Persist every raw payload immutably.

## Inputs
- `confluence_base_url` (required) — e.g. `https://<tenant>.atlassian.net/wiki`.
- `space_keys[]` (required) — one or more Confluence spaces to sync.
- `sync_cursor` (optional) — per-space watermark of last-seen page versions; absent ⇒ first sync.
- `backfill` (bool, default `false`) — `true` fetches every page in the configured spaces regardless of cursor.
- `poll_interval_minutes` (default `15`) — scheduled version-scan cadence and freshness SLA bound.
- Secrets by reference: `CONFLUENCE_OAUTH_TOKEN` (read scopes only), `CONFLUENCE_WEBHOOK_SECRET`.
- Trigger: scheduled tick every `poll_interval_minutes`, **or** an inbound webhook delivery,
  **or** an explicit `backfill` run on first connect.

## Outputs / Artifacts
- **Raw events on the ingestion bus**, one per page create/update/remove (and its comments), each
  with a provenance envelope: `{ source: "confluence", source_id: <pageId>, fetch_time,
  schema_version, tenant_id, event_type, version_number, payload: <verbatim Confluence JSON
  incl. storage-format body, inline comments, version history> }`.
- **Verbatim storage-format body preserved** in each payload — Jira issue macros and links intact,
  not flattened to plain text.
- **Immutable raw-payload store**, append-only, keyed by `(tenant_id, pageId, version_number)`.
- **Advanced `sync_cursor`** persisted per `(tenant_id, space_key)` = highest version per page seen.
- **Idempotency ledger** of processed webhook event ids per tenant.
- Observability counters: pages fetched, pages re-fetched on version change, comments fetched,
  pages fetched, 429s retried, duplicates suppressed, emit latency, plus the read-only request log.

## Acceptance Criteria

Scenario: Backfill fetches all pages in configured spaces
  Given `space_keys` whose spaces together contain N pages
    And `backfill` = true
  When the connector runs to completion
  Then exactly N raw page events are emitted to the bus (one per pageId)
    And every emitted event carries `source` = "confluence", a non-null `source_id`, `fetch_time`, and `schema_version`.

Scenario: An updated page (new version) is re-fetched incrementally
  Given page Pg was last synced at `version.number` = 4
    And Pg's current `version.number` is now 5 while all other pages are unchanged
  When the incremental version-scan poll runs
  Then exactly one page event is emitted, for Pg, with `version_number` = 5
    And no event is emitted for any page whose version is unchanged
    And `sync_cursor` for Pg advances to 5.

Scenario: Page body and inline comments are captured
  Given a page with a non-empty storage-format body and K inline comments
  When the connector emits that page's event
  Then the emitted payload contains the storage-format body verbatim (non-empty, byte-equal to source)
    And the payload contains exactly K inline comments, each with its body and the text it anchors to.

Scenario: Embedded Jira issue links are captured
  Given a page whose storage-format body embeds a Jira issue macro/link referencing "PROJ-123"
  When the connector emits that page's event
  Then the emitted payload retains the "PROJ-123" macro/link reference unaltered
    And the substring "PROJ-123" is present in the captured storage-format body.

Scenario: Strictly read-only
  Given a full backfill + incremental cycle with write-capable credentials available
  When the connector runs
  Then zero POST / PUT / PATCH / DELETE calls are made to Confluence (verified by the request log — GET only).

Scenario: Tenant-scoped emission
  Given the connector is running for tenant A
  When it fetches pages and emits events
  Then every emitted event carries `tenant_id` = A
    And no page from any space outside tenant A's configured `space_keys` is fetched or emitted.

## Out of Scope
- Normalization to the canonical model — [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalizer.md).
- Resolving the captured Jira macros/links into graph edges — downstream entity resolution.
- Any write to Confluence (pages, comments, edits) — read-only packet, no write-back ever.
- Jira and Bitbucket ingestion — [`AWP-INT-001`](./AWP-INT-001-jira-connector.md), [`AWP-INT-002`](./AWP-INT-002-bitbucket-connector.md).
- Attachments/binary file content and rendered-HTML export (storage format is the captured form).
- Building/operating the bus or raw store themselves (bought infrastructure, [`02`](../02-technical-foundation.md) §1).

## Dependencies / Linked Packets
- **depends_on** — none; Phase 0 leaf feeding the bus.
- **relates_to** [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalizer.md) — the normalizer is the
  immediate downstream consumer; the storage-format body it receives is what later lets ER recover
  Confluence ↔ Jira links, so the verbatim-capture contract is what this relationship rests on.

## Non-Functional Requirements
- **Performance:** end-to-end freshness (page change → event on bus) < `poll_interval_minutes`;
  a 20k-page backfill completes without exceeding rate limits.
- **Security/Privacy:** read-only OAuth scopes only; **never log `CONFLUENCE_OAUTH_TOKEN`** or the
  webhook secret; verify any webhook signature against `CONFLUENCE_WEBHOOK_SECRET` before processing;
  **tenant-scoped** — every fetch and emitted event carries `tenant_id`, no cross-tenant read; honor
  source-tool permissions so restricted pages are not over-exposed.
- **Idempotency/Reliability:** re-fetch is gated on a version increment so unchanged pages are not
  re-emitted; duplicate webhook deliveries de-duplicate via the event-id ledger; the version-scan
  poll backstops missed webhooks; raw payloads are immutable to support replay.
- **Observability:** emit per-run page counts, re-fetch counts, comment counts, page counts, 429
  retry counts, duplicate-suppression counts, emit latency, and the read-only request log.
- **Cost:** zero LLM calls (pure ingestion); skip re-fetch of unchanged pages to minimize API and storage cost.

## Verification / Test Notes
- **Fixtures:** a mock Confluence returning (1) a space with N pages for the backfill AC; (2) a page
  whose version moves 4→5 for the incremental AC; (3) a page with a storage-format body and K inline
  comments for the body/comments AC; (4) a page whose storage body embeds a "PROJ-123" Jira macro for
  the link-capture AC.
- **Backfill AC:** run with `backfill=true`; assert page-event count = N, each envelope carrying all
  four provenance fields.
- **Incremental AC:** seed `sync_cursor` at version 4 for Pg; bump it to 5; run the version-scan poll;
  assert only Pg emits with `version_number`=5 and the cursor advances to 5.
- **Body/comments AC:** emit the fixture page; assert the storage-format body is non-empty and
  byte-equal to source and exactly K inline comments are present with anchors.
- **Link AC:** assert the emitted storage body retains the "PROJ-123" macro/link unaltered.
- **Read-only AC:** assert the request log contains only GET verbs.
- **Tenant-scope AC:** run for tenant A; assert every emitted event has `tenant_id`=A and no
  out-of-scope space page is fetched.

## Open Questions
- *(none — packet is `ready`)*
