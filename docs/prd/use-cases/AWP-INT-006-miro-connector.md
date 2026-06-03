---
id: AWP-INT-006
title: Miro Connector (boards, flows, sticky clusters)
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
  - system: Miro
    object: file
    ref: <board_ids[]>
    content_hash: runtime
external_apis:
  - name: Miro REST API
    auth: OAuth2
    scopes: [boards:read]
dependencies:
  depends_on: []
  relates_to: [AWP-NORM-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's ingestion layer, I want a Miro connector that backfills configured boards,
incrementally re-fetches on board update, and captures sticky-note text, connectors/edges (the
flows), and spatial clusters, so that whiteboard artifacts land on the ingestion bus as raw,
provenance-stamped events whose flow and cluster structure feeds entity resolution.

## Context / Background
This is a **Phase 2** connector — Miro boards are *unlinked design/planning context* nobody
manually links, the long-tail Tier-2 ER must reason over ([`02`](../02-technical-foundation.md) §2).
The *meaning* of a board lives in its **structure**: sticky-note text is the content, the
**connectors/edges between items are the flows** (A→B sequencing, dependency arrows), and items
grouped tightly in 2-D space form **clusters** (a swimlane, a theme). The connector must capture all
three so a downstream consumer can reconstruct the flow and grouping rather than receiving an
unordered bag of stickies.

The connector's job ends at the ingestion bus: it **emits raw events**, it does **not** normalize
them (that is [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md)) and does **not** resolve
links itself (downstream ER). It stores raw payloads **immutably** so normalization can be
re-derived on logic change ([`02`](../02-technical-foundation.md) §1). Incremental sync keys on the
board **modified timestamp** — a board is re-fetched only when it is updated. It is **strictly
read-only**, **tenant-scoped**, and never logs credentials.

## Data Sources & External APIs
- **Miro REST API** (`boards:read`), auth **OAuth2**:
  - **Boards in scope (list / metadata):** `GET /v2/boards` (board id, name, `modifiedAt`) restricted
    to configured boards; `modifiedAt` is the cursor used to detect updates.
  - **Board items:** `GET /v2/boards/{board_id}/items` — all items incl. `type: "sticky_note"`
    (with `data.content` text) and their `position` (x, y) used to derive spatial clusters;
    cursor-paged via the returned `cursor` until exhausted.
  - **Connectors (flows):** `GET /v2/boards/{board_id}/connectors` — each connector carries
    `startItem.id` and `endItem.id`, i.e. a directed edge A→B between two items.
- **Volumes / limits:** assume ≤ 50k items per board on first backfill. Miro throttles with
  **HTTP 429** and a `Retry-After` header — honor it with exponential backoff. Persist every raw
  payload immutably.

## Inputs
- `tenant_id` (required) — the org boundary; scopes every fetch and event.
- `board_ids[]` (required) — one or more Miro board ids to sync.
- `sync_cursor` (optional) — per-board watermark of last-seen `modifiedAt`; absent ⇒ first sync.
- `backfill` (bool, default `false`) — `true` fetches every configured board regardless of cursor.
- `poll_interval_minutes` (default `30`) — scheduled update-scan cadence and freshness SLA bound.
- `cluster_proximity_px` (default `200`) — the maximum center-to-center distance (in board pixels)
  within which two items are assigned to the same spatial cluster; the named refinement predicate
  that makes cluster membership deterministic rather than implementation-defined.
- Secrets by reference: `MIRO_OAUTH_TOKEN` (read scope only).
- Trigger: scheduled tick every `poll_interval_minutes`, **or** an explicit `backfill` run on first connect.

## Outputs / Artifacts
- **Raw events on the ingestion bus**, one per board create/update, each with a provenance envelope:
  `{ source: "miro", source_id: <board_id>, fetch_time, schema_version, tenant_id, event_type,
  modified_at: <board modifiedAt>, stickies: [{ item_id, text, position }, ...],
  edges: [{ from: <item_id>, to: <item_id> }, ...], clusters: [{ cluster_id, member_item_ids: [...] }, ...],
  payload: <verbatim Miro board + items + connectors JSON> }`.
- **Sticky-note text captured** — every `sticky_note` item's `item_id` and `data.content` text retained.
- **Connector edges captured** — every connector emitted as a directed `{ from, to }` edge.
- **Spatial clusters captured** — items grouped into clusters by the `cluster_proximity_px` predicate;
  every item appears in **exactly one** cluster (membership is partitioned: mutually exclusive and exhaustive).
- **Immutable raw-payload store:** every fetched payload written append-only, keyed by
  `(tenant_id, board_id, fetch_time)`, never mutated.
- **Advanced `sync_cursor`** persisted per `(tenant_id, board_id)` = latest `modifiedAt` seen.
- Observability counters: boards fetched, boards re-fetched on update, stickies captured, edges
  captured, clusters formed, 429s retried, emit latency, plus the read-only request log.

## Acceptance Criteria

Scenario: Backfill fetches all configured boards
  Given `board_ids` listing N configured boards
    And `backfill` = true
  When the connector runs to completion
  Then exactly N raw board events are emitted to the ingestion bus (one per board_id)
    And every emitted event carries `source` = "miro", a non-null `source_id`, `fetch_time`, and `schema_version`.

Scenario: Sticky text and connector edges are captured (a flow A→B yields a captured edge)
  Given a board with sticky notes A and B and a connector whose `startItem` is A and `endItem` is B
  When the connector emits that board's event
  Then the event's `stickies[]` contains A and B with their `text` byte-equal to source content
    And the event's `edges[]` contains exactly one entry with `from` = A's item_id and `to` = B's item_id.

Scenario: Spatial cluster membership is exhaustive and mutually exclusive
  Given a board with G items where two groups sit within `cluster_proximity_px` internally and far apart from each other
  When the connector emits that board's event
  Then every one of the G item_ids appears in exactly one `clusters[].member_item_ids` entry (no item omitted, none duplicated across clusters)
    And the two near groups resolve to two distinct clusters under `cluster_proximity_px`.

Scenario: A board update triggers incremental re-fetch
  Given board Bd was last synced at `modifiedAt` = "2026-06-01T10:00:00Z"
    And Bd's current `modifiedAt` is now "2026-06-02T09:00:00Z" while all other boards are unchanged
  When the incremental update-scan poll runs
  Then exactly one board event is emitted, for Bd
    And no event is emitted for any board whose `modifiedAt` is unchanged
    And `sync_cursor` for Bd advances to "2026-06-02T09:00:00Z".

Scenario: Strictly read-only
  Given a full backfill + incremental cycle with write-capable credentials available
  When the connector runs
  Then zero POST / PUT / PATCH / DELETE calls are made to the Miro API (verified by the request log — GET only).

Scenario: Tenant-scoped emission
  Given the connector is running for tenant A
  When it fetches boards and emits events
  Then every emitted event carries `tenant_id` = A
    And no board outside tenant A's configured `board_ids` is fetched or emitted.

## Out of Scope
- Normalization to the canonical model — [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md).
- Resolving captured content/flows into graph edges, and Tier-2 semantic matching of boards to stories — downstream entity resolution.
- Semantic interpretation of what a flow or cluster *means* (e.g. labeling a cluster a "swimlane") — capture only.
- Rendering board images/thumbnails or non-sticky widget pixel content.
- Any write to Miro (items, comments, edits) — read-only packet, no write-back ever.
- Teams / Figma / M365 ingestion — [`AWP-INT-004`](./AWP-INT-004-teams-connector.md), [`AWP-INT-005`](./AWP-INT-005-figma-connector.md), [`AWP-INT-007`](./AWP-INT-007-m365-connector.md).
- Building/operating the bus or raw store themselves (bought infrastructure, [`02`](../02-technical-foundation.md) §1).

## Dependencies / Linked Packets
- **depends_on** — none; Phase 2 leaf feeding the bus.
- **relates_to** [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) — the normalizer is the
  immediate downstream consumer of every raw board event; the provenance envelope (`source`,
  `source_id`, `fetch_time`, `schema_version`) is the contract between them, and the captured
  edges + clusters are what later lets downstream consumers reconstruct board flows.

## Non-Functional Requirements
- **Performance:** end-to-end freshness (board update → event on bus) < `poll_interval_minutes`;
  a 50k-item board backfill completes without exceeding Miro rate limits.
- **Security/Privacy:** read-only `boards:read` scope only; **never log `MIRO_OAUTH_TOKEN`**;
  **tenant-scoped** — every fetch and emitted event carries `tenant_id`, no cross-tenant read; honor
  source-tool permissions so restricted boards are not over-exposed.
- **Idempotency/Reliability:** re-fetch is gated on a `modifiedAt` change so unchanged boards are not
  re-emitted; cluster assignment under a fixed `cluster_proximity_px` is deterministic for a given
  board state; raw payloads are immutable to support replay; a re-run with no update is a no-op.
- **Observability:** emit per-run board counts, re-fetch counts, sticky counts, edge counts, cluster
  counts, 429 retry counts, emit latency, and the read-only request log.
- **Cost:** zero LLM calls (pure ingestion); skip re-fetch of unchanged boards to minimize API and storage cost.

## Verification / Test Notes
- **Fixtures:** a mock Miro returning (1) N configured boards for the backfill AC; (2) a board with
  stickies A, B and a connector A→B for the edge AC; (3) a board with two spatially separated groups
  of items for the cluster AC; (4) a board whose `modifiedAt` advances for the incremental AC;
  (5) an endpoint returning 429+`Retry-After` then 200 for backoff.
- **Backfill AC:** run with `backfill=true` against fixture (1); assert board-event count = N, each
  envelope carrying all four provenance fields.
- **Edge AC:** emit fixture (2); assert A and B sticky text are byte-equal to source and `edges[]`
  holds exactly one `{from: A, to: B}` entry.
- **Cluster AC:** emit fixture (3) under the default `cluster_proximity_px`; assert every item id
  appears in exactly one cluster and the two groups form two distinct clusters.
- **Incremental AC:** seed `sync_cursor` at the older `modifiedAt`; advance it; run the update-scan
  poll; assert only Bd emits and the cursor advances.
- **Read-only AC:** assert the captured request log contains only GET verbs.
- **Tenant-scope AC:** run for tenant A; assert every emitted event has `tenant_id`=A and no
  out-of-scope board is fetched.

## Open Questions
- *(none — packet is `ready`)*
