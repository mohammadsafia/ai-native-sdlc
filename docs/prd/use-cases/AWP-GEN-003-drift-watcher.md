---
id: AWP-GEN-003
title: Source-Drift Watcher & Re-baseline
pillar: P4 Authoring
phase: Planning
roadmap_phase: 4
owning_agent: BA
type: read-only
status: ready
priority: P1
estimate: M
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: internal
    object: service
    ref: generated-packet source_fingerprint registry + connector change events
    content_hash: runtime
external_apis: []
dependencies:
  depends_on: [AWP-GEN-001, AWP-NORM-001]
  relates_to: [AWP-GEN-002]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a business analyst, I want a watcher that detects when the sources behind a generated
packet change, flips the dependent packet to `drifted` with a human-readable diff, and
notifies me with regenerate / accept-current / dismiss options, so that a generated spec
never silently goes stale against the requirement it was derived from.

## Context / Background
This packet **owns the drift half** of the generation lifecycle that
[`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md) describes: the generator stores a
`source_fingerprint` per packet and the contract is "on source change, the packet flips
to `status: drifted` with a human-readable change diff." This watcher *implements that
detection and re-baseline loop* as a standalone capability so the generator does not have
to poll, and so a drifted packet gets a first-class diff, a severity, an owner
notification, and three resolutions: **regenerate** (delegate to
[`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md)), **accept-current** (re-baseline the
`source_fingerprint` without touching packet content), or **dismiss**.

It consumes the **normalized canonical artifacts and change events** from
[`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) (which already turns raw
connector events into canonical objects with `content_hash`) — it does **not** ingest
from tool APIs itself and holds **no** external tool scopes (`external_apis: []`). It
re-hashes a packet's sources from the canonical layer; when the recomputed
`source_fingerprint` mismatches the stored one, the dependent packet flips.

It is **strictly read-only with respect to external tools**: it reads the canonical
change stream and the packet's stored fingerprint, and it writes only **platform-internal**
state — the packet's `status` (→ `drifted`), the attached diff, the severity, and the
owner notification. It performs **no** Jira/Confluence/Bitbucket mutation; flipping a
packet's internal `status` is not a tool write, and `regenerate` delegates the actual
re-authoring (and any publish path) to [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md).
Re-scoring a re-baselined packet against the §5 checklist is delegated to
[`AWP-GEN-002`](./AWP-GEN-002-spec-scorer.md). A packet that has already advanced to
`pr_open` (its implementation PR is open) and then drifts is **higher severity** — the
in-flight code may now target a stale requirement.

## Data Sources & External APIs
- **Canonical change events (READ)** from [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md):
  per-source `content_hash` and change notifications for each object a generated packet
  references in its `sources[]` (BRD page, Teams thread, Figma frame, etc.). The watcher
  re-derives the packet's `source_fingerprint` from these hashes.
- **Packet fingerprint registry (READ/internal-write):** the stored `source_fingerprint`
  and current `status` per generated packet; the watcher reads it to compare and updates
  the packet's internal `status`/diff/severity (platform-internal only).
- **No external tool API:** `external_apis: []`. The watcher never calls Jira / Confluence
  / Bitbucket / Figma / Teams write or read endpoints — it relies entirely on the
  normalization layer's already-ingested, hashed canonical artifacts.
- **Volumes / limits:** watches all generated packets with a stored `source_fingerprint`;
  re-hash is incremental, triggered by a canonical change event or a poll, and bounded by
  `watcher_sla_minutes`.

## Inputs
- `watcher_sla_minutes` (default `30`) — max time from a source byte changing to the
  dependent packet flipping `drifted` with an attached diff (the freshness SLA).
- `resolution` (per drifted packet, one of `regenerate | accept_current | dismiss`) —
  the owner's chosen action on a drifted packet.
- `high_severity_states` (default `["pr_open", "awaiting_pr_approval", "implementing"]`) —
  the post-generation states whose drift raises the higher-severity alert.
- Secrets by reference: none for external tools (read-only via the canonical layer);
  notification delivery uses the platform's internal notifier.
- Trigger: a [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) source-change
  event, **or** a scheduled re-hash poll within `watcher_sla_minutes`.

## Outputs / Artifacts
- **Drift status flip:** the dependent packet's `status` set to `drifted` (internal state)
  when its recomputed `source_fingerprint` mismatches the stored one.
- **Change diff:** a human-readable `change_diff` attached to the packet — old vs. new
  source content (which source object, which section, before/after text).
- **Severity:** a `severity` field on the drift record — `high` when the packet's
  pre-drift state is in `high_severity_states` (e.g. `pr_open`), else `normal`.
- **Owner notification:** a notification to the packet `owner` carrying the packet id, the
  diff summary, the severity, and the three resolution options.
- **Re-baseline result (accept-current):** the stored `source_fingerprint` updated to the
  new hash, packet content unchanged, status restored to its pre-drift value.
- **Regenerate hand-off:** a `regenerate` call to
  [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md) (which performs the edit-safe 3-way
  merge), and a re-score request to [`AWP-GEN-002`](./AWP-GEN-002-spec-scorer.md).

## Acceptance Criteria

Scenario: Changing one byte of a source flips the dependent packet to drifted within SLA
  Given a generated packet with stored `source_fingerprint` = F over canonical source object O
  When one byte of O changes (its canonical `content_hash` changes from F's component)
  Then within `watcher_sla_minutes` the dependent packet's `status` becomes `drifted`
    And the recomputed `source_fingerprint` differs from F.

Scenario: A drifted packet carries a human-readable diff of what changed in the source
  Given a packet that has flipped to `drifted` because source object O changed
  When the drift record is inspected
  Then the packet has a non-empty `change_diff` showing the old vs. new content of O
    And the diff names the source object O and the specific section/anchor that changed.

Scenario: Accept-current re-baselines the fingerprint without altering packet content
  Given a `drifted` packet whose owner chooses `resolution` = `accept_current`
  When the re-baseline runs
  Then the packet's stored `source_fingerprint` equals the new source hash
    And the packet body (every Markdown section) and front-matter (except `source_fingerprint` and the cleared `drifted` status) are byte-identical to before
    And the packet's `status` is restored to its pre-drift value.

Scenario: Drift of an already-PR-open packet raises a higher-severity alert
  Given a `drifted` packet whose pre-drift `status` was `pr_open` (its implementation PR is already open)
    And `high_severity_states` contains "pr_open"
  When the packet drifts
  Then the drift record's `severity` = "high"
    And the owner notification is marked high-severity (distinct from the `normal`-severity notification a pre-implementation drift produces).

Scenario: The watcher makes zero external tool writes (read-only)
  Given a full watch + flip + re-baseline cycle with write-capable credentials available
  When the watcher runs
  Then zero POST / PUT / PATCH / DELETE calls are made to any external tool (Jira / Confluence / Bitbucket / Figma / Teams), verified by the request log
    And the only state mutated is platform-internal packet state (`status`, `change_diff`, `severity`, `source_fingerprint`).

Scenario: Regenerate delegates to the generator and preserves human edits or surfaces a conflict
  Given a `drifted` packet whose Context section was human-edited after generation
    And the owner chooses `resolution` = `regenerate`
  When the watcher delegates regeneration to AWP-GEN-001
  Then the human-edited section is preserved if it does not conflict with the new generation
    And if it does conflict, a 3-way-merge conflict is surfaced for human resolution
    And in no case is the human-authored text silently discarded (no section overwritten without a recorded conflict).

## Out of Scope
- **Re-authoring packet content** and the **3-way merge** itself — owned by
  [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md); `regenerate` delegates to it.
- **Scoring** the re-baselined packet against §5 — owned by
  [`AWP-GEN-002`](./AWP-GEN-002-spec-scorer.md); this watcher requests a re-score, it does
  not compute it.
- **Ingesting from tool APIs** or computing canonical `content_hash` — owned by the
  connectors and [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md); this watcher
  consumes their change events.
- **Any external tool write** (publishing, creating Jira stories, opening/closing PRs) —
  read-only packet; `regenerate`'s publish path runs through
  [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md), not here.
- **Dispatching / implementing** a drifted packet or merging its PR —
  [`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md).

## Dependencies / Linked Packets
- **depends_on** [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md) (defines the
  `source_fingerprint`/`drifted` model, owns regeneration + the edit-safe 3-way merge this
  watcher invokes), [`AWP-NORM-001`](./AWP-NORM-001-canonical-normalization.md) (supplies
  the canonical artifacts + `content_hash` change events the watcher re-hashes against).
- **relates_to** [`AWP-GEN-002`](./AWP-GEN-002-spec-scorer.md) (re-scores a re-baselined or
  regenerated packet against the §5 checklist).

## Non-Functional Requirements
- **Performance:** flip a dependent packet to `drifted` with an attached diff within
  `watcher_sla_minutes` of the source change event; re-hash is incremental (only sources
  whose `content_hash` changed), never a brute-force full re-scan.
- **Security/Privacy:** read-only with respect to external tools — holds **no** tool
  scopes; honors source-tool ACLs surfaced by the canonical layer (never reveals changed
  content a user cannot see at source); never logs secrets; tenant-scoped.
- **Idempotency/Reliability:** re-evaluating an unchanged `source_fingerprint` is a no-op
  (no spurious re-flip); a packet already `drifted` for object O is not re-notified for the
  same change; `accept_current` is idempotent (re-baselining twice yields the same stored
  fingerprint).
- **Observability:** emit counts of packets watched / flipped `drifted` / re-baselined /
  dismissed / regenerated, drift detection latency vs. `watcher_sla_minutes`, the
  per-drift severity, and the read-only request log the read-only AC asserts.
- **Cost:** zero external tool calls; re-hash reuses canonical `content_hash` (no
  re-fetch); any LLM use for diff summarization is delegated and bounded, not performed
  here.

## Verification / Test Notes
- **Drift-SLA AC:** generate a packet (store `source_fingerprint`), mutate one byte of its
  canonical source object; assert within `watcher_sla_minutes` the packet flips to
  `drifted` and the recomputed fingerprint differs.
- **Diff AC:** after the flip, assert the packet has a non-empty `change_diff` naming the
  changed source object and section with old-vs-new text.
- **Accept-current AC:** choose `accept_current`; assert the stored `source_fingerprint`
  equals the new hash and the packet body + front-matter (minus fingerprint/status) is
  byte-identical to the pre-drift snapshot, and status restored.
- **High-severity AC:** set a packet's pre-drift state to `pr_open`; drift it; assert the
  drift record `severity` = "high" and the notification is high-severity; repeat for a
  pre-implementation packet → assert `severity` = "normal".
- **Read-only AC:** run with write-capable credentials present; assert the request log
  shows zero mutating verbs to any tool and only internal packet state changed.
- **Regenerate AC:** human-edit the Context of a drifted packet, choose `regenerate`, then
  (a) a non-conflicting source change → assert the edit is preserved via AWP-GEN-001;
  (b) a conflicting change → assert a 3-way-merge conflict is surfaced and the human text
  is never silently discarded.

## Open Questions
- *(none — packet is `ready`)*
