---
id: AWP-INT-005
title: Figma Connector (files, frames, components, design links)
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
  - system: Figma
    object: file
    ref: <project_ids[]>
    content_hash: runtime
external_apis:
  - name: Figma REST API
    auth: Personal Access Token / OAuth2
    scopes: [file_read]
dependencies:
  depends_on: []
  relates_to: [AWP-NORM-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's ingestion layer, I want a Figma connector that backfills files in configured
projects/teams, incrementally re-fetches on file version change, and captures frame names, node
ids, the component inventory, and any links/URLs in text layers, so that design artifacts land on
the ingestion bus as raw, provenance-stamped events whose embedded links feed entity resolution.

## Context / Background
This is a **Phase 2** connector — Figma artifacts are *unlinked design context* nobody manually
links, exactly the long-tail Tier-2 ER must reason over, and **URLs embedded in Figma text layers
(a Jira/Confluence link in a design note) are Tier-0/Tier-1 ER signal**
([`02`](../02-technical-foundation.md) §2). Frame names and node ids are the stable handles that let
a design frame be referenced and deep-linked deterministically.

The connector's job ends at the ingestion bus: it **emits raw events**, it does **not** normalize
them (that is [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md)) and does **not** resolve
the embedded links itself (downstream ER). It stores raw payloads **immutably** so normalization can
be re-derived on logic change ([`02`](../02-technical-foundation.md) §1). Incremental sync keys on
the file **version** — a file is re-fetched only when its version changes. It is **strictly
read-only**, **tenant-scoped**, and never logs credentials.

## Data Sources & External APIs
- **Figma REST API** (`file_read`), auth **Personal Access Token / OAuth2**:
  - **Files in scope (list):** `GET /v1/projects/{project_id}/files` (file key, name, current
    `last_modified` / version) for each configured project; team→project resolution via
    `GET /v1/teams/{team_id}/projects` when teams are configured.
  - **File document (verbatim):** `GET /v1/files/{file_key}` — the full node tree including frames
    (`type: "FRAME"`), node ids, and `TEXT` nodes (whose `characters` may contain URLs).
  - **Components / inventory:** `GET /v1/files/{file_key}/components` — published component inventory
    (component key, name, node id) for the file.
  - **Version detection:** the `version` / `last_modified` field on the file metadata is the cursor
    used to decide whether a re-fetch is needed.
- **Volumes / limits:** assume ≤ 5k files per project on first backfill. Figma throttles with
  **HTTP 429** and a `Retry-After` header — honor it with exponential backoff. Persist every raw
  payload immutably.

## Inputs
- `tenant_id` (required) — the org boundary; scopes every fetch and event.
- `project_ids[]` (required) — one or more Figma project ids to sync (optionally `team_ids[]` resolved to projects).
- `sync_cursor` (optional) — per-file watermark of last-seen file `version`; absent ⇒ first sync.
- `backfill` (bool, default `false`) — `true` fetches every file in the configured projects regardless of cursor.
- `poll_interval_minutes` (default `30`) — scheduled version-scan cadence and freshness SLA bound.
- Secrets by reference: `FIGMA_TOKEN` (read scope only).
- Trigger: scheduled tick every `poll_interval_minutes`, **or** an explicit `backfill` run on first connect.

## Outputs / Artifacts
- **Raw events on the ingestion bus**, one per file create/update, each with a provenance envelope:
  `{ source: "figma", source_id: <file_key>, fetch_time, schema_version, tenant_id, event_type,
  version: <file version>, frames: [{ node_id, name }, ...], components: [{ node_id, key, name }, ...],
  text_links: [...], payload: <verbatim Figma file + components JSON> }`.
- **Frame names + node ids captured** — every `FRAME` node's `node_id` and `name` retained.
- **Component inventory captured** — the published components (key, name, node id) for the file.
- **Links in text layers captured** — any URL found in a `TEXT` node's `characters` preserved verbatim.
- **Immutable raw-payload store:** every fetched payload written append-only, keyed by
  `(tenant_id, file_key, version)`, never mutated.
- **Advanced `sync_cursor`** persisted per `(tenant_id, file_key)` = latest file `version` seen.
- Observability counters: files fetched, files re-fetched on version change, frames captured,
  components captured, text-links captured, 429s retried, emit latency, plus the read-only request log.

## Acceptance Criteria

Scenario: Backfill fetches all files in configured projects
  Given `project_ids` whose projects together contain N files
    And `backfill` = true
  When the connector runs to completion
  Then exactly N raw file events are emitted to the ingestion bus (one per file_key)
    And every emitted event carries `source` = "figma", a non-null `source_id`, `fetch_time`, and `schema_version`.

Scenario: Frame names and node ids are captured
  Given a file containing F frames, each with a distinct node id and name
  When the connector emits that file's event
  Then the emitted event's `frames[]` contains exactly F entries
    And every entry has a non-null `node_id` and the `name` byte-equal to the source frame name.

Scenario: A file version bump triggers incremental re-fetch
  Given file Fk was last synced at `version` = "v10"
    And Fk's current `version` is now "v11" while all other files are unchanged
  When the incremental version-scan poll runs
  Then exactly one file event is emitted, for Fk, with `version` = "v11"
    And no event is emitted for any file whose `version` is unchanged
    And `sync_cursor` for Fk advances to "v11".

Scenario: Links embedded in text layers are captured
  Given a file with a TEXT node whose characters contain "https://acme.atlassian.net/browse/PROJ-123"
  When the connector emits that file's event
  Then the emitted event's `text_links[]` contains "https://acme.atlassian.net/browse/PROJ-123" unaltered
    And the substring "PROJ-123" is present in the captured text-node content.

Scenario: Strictly read-only
  Given a full backfill + incremental cycle with write-capable credentials available
  When the connector runs
  Then zero POST / PUT / PATCH / DELETE calls are made to the Figma API (verified by the request log — GET only).

Scenario: Tenant-scoped emission
  Given the connector is running for tenant A
  When it fetches files and emits events
  Then every emitted event carries `tenant_id` = A
    And no file from any project outside tenant A's configured `project_ids` is fetched or emitted.

## Out of Scope
- Normalization to the canonical model — [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md).
- Resolving the captured text-layer links into graph edges, and Tier-2 semantic matching of designs to stories — downstream entity resolution.
- Rendering/exporting frame images, PNG/SVG thumbnails, or pixel content (structure + text only).
- Any write to Figma (comments, file edits) — read-only packet, no write-back ever.
- Teams / M365 / Miro ingestion — [`AWP-INT-004`](./AWP-INT-004-teams-connector.md), [`AWP-INT-006`](./AWP-INT-006-miro-connector.md), [`AWP-INT-007`](./AWP-INT-007-m365-connector.md).
- Building/operating the bus or raw store themselves (bought infrastructure, [`02`](../02-technical-foundation.md) §1).

## Dependencies / Linked Packets
- **depends_on** — none; Phase 2 leaf feeding the bus.
- **relates_to** [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) — the normalizer is the
  immediate downstream consumer of every raw file event; the provenance envelope (`source`,
  `source_id`, `fetch_time`, `schema_version`) is the contract between them, and the captured
  text-layer links are what later lets ER recover Figma ↔ Jira/Confluence links.

## Non-Functional Requirements
- **Performance:** end-to-end freshness (file change → event on bus) < `poll_interval_minutes`;
  a 5k-file project backfill completes without exceeding Figma rate limits.
- **Security/Privacy:** read-only `file_read` scope only; **never log `FIGMA_TOKEN`**;
  **tenant-scoped** — every fetch and emitted event carries `tenant_id`, no cross-tenant read; honor
  source-tool permissions so restricted files are not over-exposed.
- **Idempotency/Reliability:** re-fetch is gated on a version change so unchanged files are not
  re-emitted; raw payloads are immutable to support replay; a re-run with no version change is a no-op.
- **Observability:** emit per-run file counts, re-fetch counts, frame counts, component counts,
  text-link counts, 429 retry counts, emit latency, and the read-only request log.
- **Cost:** zero LLM calls (pure ingestion); skip re-fetch of unchanged files to minimize API and storage cost.

## Verification / Test Notes
- **Fixtures:** a mock Figma returning (1) a project with N files for the backfill AC; (2) a file
  with F frames each with distinct node id + name for the frame AC; (3) a file whose `version` moves
  "v10"→"v11" for the incremental AC; (4) a file with a TEXT node containing a Jira URL for the
  text-link AC; (5) an endpoint returning 429+`Retry-After` then 200 for backoff.
- **Backfill AC:** run with `backfill=true` against fixture (1); assert file-event count = N, each
  envelope carrying all four provenance fields.
- **Frame AC:** emit fixture (2); assert `frames[]` length = F and each entry has a non-null node id
  and byte-equal name.
- **Incremental AC:** seed `sync_cursor` at "v10" for Fk; bump to "v11"; run the version-scan poll;
  assert only Fk emits with `version`="v11" and the cursor advances to "v11".
- **Text-link AC:** emit fixture (4); assert the Jira URL appears unaltered in `text_links[]` and the
  "PROJ-123" substring is present.
- **Read-only AC:** assert the captured request log contains only GET verbs.
- **Tenant-scope AC:** run for tenant A; assert every emitted event has `tenant_id`=A and no
  out-of-scope project file is fetched.

## Open Questions
- *(none — packet is `ready`)*
