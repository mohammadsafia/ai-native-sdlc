---
id: AWP-INT-007
title: Microsoft 365 Connector (Word/Excel/PDF planning docs)
pillar: P1 Integration
phase: Development
roadmap_phase: 2
owning_agent: none
type: read-only
status: ready
priority: P1
estimate: L
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: M365
    object: file
    ref: <site_ids[] / drive_ids[]>
    content_hash: runtime
external_apis:
  - name: Microsoft Graph API / SharePoint
    auth: OAuth2
    scopes: [Files.Read.All, Sites.Read.All]
dependencies:
  depends_on: []
  relates_to: [AWP-NORM-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's ingestion layer, I want a Microsoft 365 connector that backfills files in
configured drives/sites, extracts text content from Word/Excel/PDF planning docs, incrementally
re-fetches on lastModified change, and stamps provenance, so that planning documents land on the
ingestion bus as raw, provenance-stamped events whose extracted text feeds downstream reasoning and
entity resolution.

## Context / Background
This is a **Phase 2** connector — M365/SharePoint planning docs (Word/Excel/PDF) are *unlinked
context* nobody manually links, the long-tail Tier-2 ER must reason over
([`02`](../02-technical-foundation.md) §2). Unlike Jira/Confluence which expose structured text via
API, these are **binary documents** — the connector's distinctive job is to **extract text content**
from each supported format so the body is reasoning-ready, while still persisting the raw payload for
replay. M365 / Entra ID is also the **person-identity join key** for Tier-1 ER
([`02`](../02-technical-foundation.md) §2) — file author/owner identity travels in provenance.

The connector's job ends at the ingestion bus: it **emits raw events**, it does **not** normalize
them (that is [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md)) and does **not** resolve
links itself (downstream ER). It stores raw payloads **immutably** so normalization can be
re-derived on logic change ([`02`](../02-technical-foundation.md) §1). Incremental sync keys on the
file **lastModifiedDateTime** — a file is re-fetched only when it changes. It is **strictly
read-only**, **tenant-scoped**, and never logs credentials.

## Data Sources & External APIs
- **Microsoft Graph API / SharePoint** (`Files.Read.All`, `Sites.Read.All`), auth **OAuth2**:
  - **Sites / drives in scope:** `GET /sites/{site-id}` and `GET /sites/{site-id}/drives`
    (`Sites.Read.All`) to resolve configured drives.
  - **File enumeration (backfill / incremental):** `GET /drives/{drive-id}/root/children` and
    `GET /drives/{drive-id}/items/{item-id}/children` (or `/delta` for change tracking) — returns
    `name`, `file.mimeType`, `lastModifiedDateTime`, and download metadata; cursor-paged via
    `@odata.nextLink`.
  - **File content (verbatim bytes):** `GET /drives/{drive-id}/items/{item-id}/content`
    (`Files.Read.All`) — the binary used for text extraction.
  - **Extraction:** Word (`.docx`) and PDF (`.pdf`) → extracted plain text; Excel (`.xlsx`) → cell
    text across sheets. Extraction runs on the downloaded bytes; the raw bytes are still persisted.
- **Supported types:** `.docx`, `.xlsx`, `.pdf` (configurable via `supported_mime_types`). Any other
  type is **skipped with a logged reason**, not a run failure.
- **Volumes / limits:** assume ≤ 100k files per site on first backfill. Graph throttles with
  **HTTP 429** and a `Retry-After` header — honor it with exponential backoff. Persist every raw
  payload immutably.

## Inputs
- `tenant_id` (required) — the Microsoft 365 tenant / org boundary; scopes every fetch and event.
- `site_ids[]` and/or `drive_ids[]` (required) — one or more SharePoint sites / drives to sync.
- `sync_cursor` (optional) — per-file watermark of last-seen `lastModifiedDateTime`; absent ⇒ first sync.
- `backfill` (bool, default `false`) — `true` fetches every file under the configured sites/drives regardless of cursor.
- `poll_interval_minutes` (default `30`) — scheduled change-scan cadence and freshness SLA bound.
- `supported_mime_types` (default `[".docx", ".xlsx", ".pdf"]`) — the named allow-list of extractable
  types; a file whose type is not in this list is the "unsupported file type" the skip AC asserts on.
- Secrets by reference: `M365_GRAPH_OAUTH_TOKEN` (read scopes only).
- Trigger: scheduled tick every `poll_interval_minutes`, **or** an explicit `backfill` run on first connect.

## Outputs / Artifacts
- **Raw events on the ingestion bus**, one per supported file create/update, each with a provenance
  envelope: `{ source: "m365", source_id: <driveItem id>, fetch_time, schema_version, tenant_id,
  event_type, last_modified: <lastModifiedDateTime>, mime_type, author: <created/modified by>,
  extracted_text: <plain text>, payload: <verbatim Graph driveItem metadata; raw bytes referenced
  in the immutable store> }`.
- **Extracted text content** — non-empty plain text extracted from each supported `.docx` / `.pdf` /
  `.xlsx` file and carried on the event.
- **Provenance stamped** — `source`, `source_id`, `fetch_time`, `schema_version`, plus `mime_type`
  and `author` for person-identity stitching.
- **Skip ledger** — for every file whose type is **not** in `supported_mime_types`, an entry
  `{ source_id, mime_type, reason: "unsupported_mime_type", skipped_at }` is **logged** and the run
  continues (no event emitted for it, no run failure).
- **Immutable raw-payload store:** every fetched payload/byte stream written append-only, keyed by
  `(tenant_id, item_id, last_modified)`, never mutated.
- **Advanced `sync_cursor`** persisted per `(tenant_id, drive_id, item_id)` = latest `lastModifiedDateTime` seen.
- Observability counters: files enumerated, files extracted, files skipped (by reason), bytes
  downloaded, 429s retried, emit latency, plus the read-only request log.

## Acceptance Criteria

Scenario: Backfill fetches all files under configured sites/drives
  Given `site_ids`/`drive_ids` whose drives together contain N supported files
    And `backfill` = true
  When the connector runs to completion
  Then exactly N raw file events are emitted to the ingestion bus (one per driveItem id)
    And every emitted event carries `source` = "m365", a non-null `source_id`, `fetch_time`, and `schema_version`.

Scenario: Text content is extracted from a Word doc and a PDF
  Given a `.docx` file W and a `.pdf` file P, each containing visible body text
  When the connector emits events for W and P
  Then the event for W carries a non-empty `extracted_text` containing W's body text
    And the event for P carries a non-empty `extracted_text` containing P's body text.

Scenario: A modified file triggers incremental re-fetch
  Given file Fl was last synced at `lastModifiedDateTime` = "2026-06-01T10:00:00Z"
    And Fl's current `lastModifiedDateTime` is now "2026-06-02T09:00:00Z" while all other files are unchanged
  When the incremental change-scan poll runs
  Then exactly one file event is emitted, for Fl, with `last_modified` = "2026-06-02T09:00:00Z"
    And no event is emitted for any file whose `lastModifiedDateTime` is unchanged
    And `sync_cursor` for Fl advances to "2026-06-02T09:00:00Z".

Scenario: An unsupported file type is skipped with a logged reason, not a failed run
  Given a drive containing one supported `.docx` file and one `.png` image whose mime type is not in `supported_mime_types`
  When the connector runs to completion
  Then the run completes successfully (no error/abort)
    And a skip-ledger entry is logged for the `.png` with `reason` = "unsupported_mime_type" and its `source_id`
    And no bus event is emitted for the `.png`
    And exactly one event (for the `.docx`) is emitted.

Scenario: Strictly read-only
  Given a full backfill + incremental cycle with write-capable credentials available
  When the connector runs
  Then zero POST / PUT / PATCH / DELETE calls are made to Microsoft Graph / SharePoint (verified by the request log — GET only).

Scenario: Tenant-scoped emission
  Given the connector is running for tenant A
  When it fetches files and emits events
  Then every emitted event carries `tenant_id` = A
    And no file from any site/drive outside tenant A's configured `site_ids`/`drive_ids` is fetched or emitted.

## Out of Scope
- Normalization to the canonical model — [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md).
- Resolving extracted content into graph edges, person-identity stitching itself, and Tier-2 semantic matching of docs to stories — downstream entity resolution.
- OCR of scanned/image-only PDFs and extraction of embedded images/charts (text-layer extraction only).
- Extraction of unsupported types (e.g. PowerPoint, Visio) — those are skipped, not extended here.
- Any write to M365/Graph/SharePoint (file edits, comments) — read-only packet, no write-back ever.
- Teams / Figma / Miro ingestion — [`AWP-INT-004`](./AWP-INT-004-teams-connector.md), [`AWP-INT-005`](./AWP-INT-005-figma-connector.md), [`AWP-INT-006`](./AWP-INT-006-miro-connector.md).
- Building/operating the bus or raw store themselves (bought infrastructure, [`02`](../02-technical-foundation.md) §1).

## Dependencies / Linked Packets
- **depends_on** — none; Phase 2 leaf feeding the bus.
- **relates_to** [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) — the normalizer is the
  immediate downstream consumer of every raw file event; the provenance envelope (`source`,
  `source_id`, `fetch_time`, `schema_version`) plus `author` is the contract between them, and the
  extracted text is what later lets ER reason over otherwise-unlinked planning docs.

## Non-Functional Requirements
- **Performance:** end-to-end freshness (file change → event on bus) < `poll_interval_minutes`;
  a 100k-file site backfill completes without exceeding Graph rate limits.
- **Security/Privacy:** read-only Graph scopes (`Files.Read.All`, `Sites.Read.All`) only; **never log
  `M365_GRAPH_OAUTH_TOKEN`**; **tenant-scoped** — every fetch and emitted event carries `tenant_id`,
  no cross-tenant read; honor source-tool permissions so restricted sites/files are not over-exposed.
- **Idempotency/Reliability:** re-fetch is gated on a `lastModifiedDateTime` change so unchanged files
  are not re-emitted; an unsupported type is skipped (logged) and never aborts the run; raw payloads
  are immutable to support replay; a re-run with no change is a no-op.
- **Observability:** emit per-run enumerated counts, extracted counts, skipped counts (by reason),
  bytes downloaded, 429 retry counts, emit latency, and the read-only request log.
- **Cost:** zero LLM calls (pure ingestion + deterministic text extraction); skip re-fetch of
  unchanged files and skip unsupported types to minimize API, extraction, and storage cost.

## Verification / Test Notes
- **Fixtures:** a mock Graph/SharePoint returning (1) a drive with N supported files for the backfill
  AC; (2) a `.docx` and a `.pdf` each with known body text for the extraction AC; (3) a file whose
  `lastModifiedDateTime` advances for the incremental AC; (4) a drive with one `.docx` plus one `.png`
  for the skip AC; (5) an endpoint returning 429+`Retry-After` then 200 for backoff.
- **Backfill AC:** run with `backfill=true` against fixture (1); assert file-event count = N, each
  envelope carrying all four provenance fields.
- **Extraction AC:** emit fixture (2); assert both events carry non-empty `extracted_text` that
  contains the known body text of the Word doc and the PDF respectively.
- **Incremental AC:** seed `sync_cursor` at the older `lastModifiedDateTime`; advance it; run the
  change-scan poll; assert only Fl emits with the new `last_modified` and the cursor advances.
- **Skip AC:** run against fixture (4); assert the run completes without error, a skip-ledger entry
  for the `.png` with `reason`="unsupported_mime_type" is logged, no event is emitted for the `.png`,
  and exactly one event (the `.docx`) is emitted.
- **Read-only AC:** assert the captured request log contains only GET verbs.
- **Tenant-scope AC:** run for tenant A; assert every emitted event has `tenant_id`=A and no
  out-of-scope site/drive file is fetched.

## Open Questions
- *(none — packet is `ready`)*
