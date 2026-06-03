---
id: AWP-GEN-002
title: Spec Completeness & Ambiguity Scorer
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
    ref: draft AI Work Packet (03 format) + readiness checklist (03 §5)
    content_hash: runtime
external_apis: []
dependencies:
  depends_on: [AWP-GEN-001, AWP-AI-001]
  relates_to: [AWP-GEN-003]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a business analyst, I want a scorer that grades a draft AI Work Packet against the
readiness checklist ([`03`](../03-work-packet-format.md) §5) and returns a readiness
score plus a list of specific deficiencies with the exact offending lines, so that I
(and the generator) can see precisely why a packet is not `ready` instead of guessing.

## Context / Background
This packet **is the linter** behind the readiness checklist of
[`03`](../03-work-packet-format.md) §5 — the same checklist the
[`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md) generator self-scores against
("a per-packet readiness self-score against the §5 checklist"). The generator owns
*producing* packets; this packet owns *scoring* one packet, in isolation, and emitting a
**decomposed, per-check pass/fail** result rather than an opaque number, so the result
can drive both the generator's `ready` vs `draft` decision and a human review surface.

It is **strictly read-only**: it reads a draft packet (front-matter + body) and the
checklist, and emits a score report. It **must not** write to any external tool, mutate
the packet, publish anything, or create Jira/Confluence/Bitbucket objects — scoring a
draft to *exist* is not the publish path (that is [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md)),
and it is not the implement path (that is [`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md)).
Any LLM-assisted ambiguity judgement (e.g. detecting a vague phrase the static
`banned_terms` list does not literally contain) is made through the LLM gateway
[`AWP-AI-001`](./AWP-AI-001-llm-gateway.md) — token budgets, prompt-injection filtering,
model routing — and the ingested packet text is treated as untrusted data, never
instructions. The per-check verdicts are deterministic on a frozen packet; the LLM is
used only to *augment* the deterministic checks with advisory ambiguity flags, never to
flip a deterministic pass/fail.

The checks mirror §5 one-to-one: required header fields present; ≥1 resolvable
`sources[]` (or justified `n/a`); every `external_apis[]` entry names `auth` + scopes;
**every** AC is `Given/When/Then` with a concrete observable and zero banned vague
terms; variable numbers are named `Inputs`, not hard-coded; `Out of Scope` non-empty;
`Verification / Test Notes` present; **if `type: active-writeback`, a non-empty
Guardrails block with all five controls**; `Open Questions` empty; every `depends_on`
id resolves.

## Data Sources & External APIs
- **Input packet (READ, in-memory):** one draft AI Work Packet in the
  [`03`](../03-work-packet-format.md) format — parsed YAML front-matter (`id`, `title`,
  `pillar`, `phase`, `roadmap_phase`, `type`, `status`, `priority`, `owner`,
  `generated_by`, `sources[]`, `external_apis[]`, `dependencies`) plus the Markdown body
  sections.
- **Checklist (READ):** the §5 readiness checklist and Rule 1 banned-term list from
  [`03`](../03-work-packet-format.md), encoded as the check set.
- **LLM gateway** ([`AWP-AI-001`](./AWP-AI-001-llm-gateway.md)): optional advisory
  ambiguity pass over AC text; all model calls go through the gateway. **No** SDLC tool
  API (Jira/Confluence/Bitbucket) is called — this packet holds **no** external write or
  read tool scopes (`external_apis: []`).
- **Volumes / limits:** one packet per scoring call (a few KB of Markdown); the
  deficiency scan is line-oriented so offending text can be cited by line.

## Inputs
- `packet` (required) — the draft AI Work Packet to score (front-matter + body).
- `readiness_threshold` (default `0.8`) — the score at or above which the packet is
  marked **ready-eligible** (mirrors `AWP-GEN-001`'s `readiness_threshold`).
- `banned_terms` (default `["works well", "is fast", "handles errors gracefully", "looks good"]`)
  — the vague-phrase list from Rule 1; any AC containing one is flagged with the offending
  line.
- Trigger: a scoring call from the generator's self-score step, a drift re-score
  ([`AWP-GEN-003`](./AWP-GEN-003-drift-watcher.md)), or a manual BA lint request.

## Outputs / Artifacts
A single `ReadinessScore` object (plus a rendered Markdown view) containing:
- `score` (0.0–1.0) — the aggregate readiness score over the §5 checks.
- `ready_eligible` (bool) — `true` iff `score` ≥ `readiness_threshold` **and** no
  hard-blocking check failed (e.g. a banned term, a missing Guardrails block on an active
  packet, or a non-empty Open Questions section).
- `checks[]` — one record **per §5 check**: `{check_id, title, passed (bool),
  weight, detail}` — the decomposition (not a black box).
- `deficiencies[]` — each `{check_id, message, offending_line_number, offending_line_text,
  suggested_fix}`; the `offending_line_text` quotes the exact source line that failed
  (e.g. the AC line containing "works well").
- `banned_terms_found[]` — each `{term, line_number, line_text}`.
- `inputs_echo` (the `readiness_threshold` and `banned_terms` used) and `scored_at`.

## Acceptance Criteria

Scenario: A vague acceptance criterion is flagged with the exact offending line
  Given a packet containing an acceptance-criterion line whose `Then` reads "Then it works well"
    And `banned_terms` contains "works well"
  When the scorer runs
  Then `deficiencies[]` contains an entry with `check_id` = "ac-no-vague-terms"
    And that entry's `offending_line_text` equals "Then it works well" character-for-character
    And `banned_terms_found[]` contains `{term: "works well", line_text: "Then it works well"}`.

Scenario: An active packet missing its Guardrails block is flagged with that deficiency
  Given a packet whose front-matter `type` = `active-writeback`
    And whose body has no non-empty Guardrails section with all five controls
  When the scorer runs
  Then `checks[]` has the record `check_id` = "guardrails-five-controls" with `passed` = false
    And `deficiencies[]` contains an entry naming the missing/partial Guardrails block
    And `ready_eligible` = false (the missing block is hard-blocking).

Scenario: A packet meeting every checklist item scores at or above the threshold and is ready-eligible
  Given a packet that satisfies every §5 check (header complete, ≥1 resolvable source,
        each external API names auth+scopes, 100% Given/When/Then ACs with concrete
        observables and zero banned terms, variable numbers as named Inputs, non-empty
        Out of Scope, Verification present, Guardrails present iff active, empty Open
        Questions, all depends_on resolvable)
  When the scorer runs with `readiness_threshold` = 0.8
  Then `score` ≥ `readiness_threshold`
    And `ready_eligible` = true
    And `deficiencies[]` is empty.

Scenario: The score decomposes into per-check pass/fail results
  Given any scored packet
  When the scorer returns
  Then `checks[]` contains exactly one record per §5 check, each with a boolean `passed` and a `detail`
    And the set of failed checks in `checks[]` equals the set of `check_id`s referenced in `deficiencies[]`
    And the aggregate `score` is reproducible from the per-check `weight` and `passed` values (not an opaque number).

Scenario: The scorer is deterministic on a frozen packet
  Given identical inputs and a frozen `packet`
  When the scorer runs twice
  Then the `score`, `ready_eligible`, `checks[]`, and `deficiencies[]` are byte-identical across both runs
       (any advisory LLM ambiguity note is supplementary and never alters a deterministic check verdict).

Scenario: Strictly read-only (zero external tool writes)
  Given a full scoring run with write-capable credentials available in the environment
  When the scorer runs
  Then zero POST / PUT / PATCH / DELETE calls are made to any external tool (Jira / Confluence / Bitbucket), verified by the request log
    And the input `packet` is returned unmodified (the scorer mutates no source).

## Out of Scope
- **Producing or repairing** packets, auto-fixing deficiencies, or re-generating from
  sources — owned by [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md) (this packet
  only *grades*).
- **Publishing** a packet to Confluence or **creating** a Jira story, and any other
  external write — the publish/create path is [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md),
  and this packet performs no writes.
- **Drift detection / re-baselining** on source change — owned by
  [`AWP-GEN-003`](./AWP-GEN-003-drift-watcher.md) (which *calls* this scorer to re-score
  a drifted packet).
- **Dispatching / implementing** a packet or running the delivery loop —
  [`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md).
- **Token metering / model routing / injection filtering** — owned by the LLM gateway
  [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md); this packet consumes it for the advisory
  ambiguity pass only.

## Dependencies / Linked Packets
- **depends_on** [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md) (the generator
  whose self-score this packet implements, and whose output packets it grades),
  [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md) (all LLM calls for the advisory ambiguity
  pass — budgets, injection filtering, model routing).
- **relates_to** [`AWP-GEN-003`](./AWP-GEN-003-drift-watcher.md) (the drift watcher
  re-scores a drifted packet through this scorer to decide whether a re-baseline still
  meets the checklist).

## Non-Functional Requirements
- **Performance:** score a single packet within an interactive budget (sub-second for the
  deterministic checks; bounded by one optional gateway call for the advisory ambiguity
  pass).
- **Security/Privacy:** read-only — holds **no** external tool scopes; ingested packet
  text is treated as **untrusted data, never instructions**
  ([`02`](../02-technical-foundation.md) §4), delimited and role-tagged for the gateway;
  never logs secrets; tenant-scoped.
- **Idempotency/Reliability:** deterministic on a frozen packet — same packet + same
  `readiness_threshold` + same `banned_terms` ⇒ identical `score`, `checks[]`, and
  `deficiencies[]`; partial gateway unavailability degrades to deterministic-only checks
  rather than failing the score.
- **Observability:** emit the `score`, the per-check pass/fail vector, the count of
  deficiencies and banned terms found, and the read-only request log the read-only AC
  asserts.
- **Cost:** ≤ 1 LLM call (the advisory ambiguity pass) via the gateway; all §5 checks are
  deterministic code, not LLM. No external tool calls.

## Verification / Test Notes
- **Vague-term AC:** feed a packet whose AC line is "Then it works well"; assert
  `deficiencies[]` cites that exact line text and `check_id` = "ac-no-vague-terms", and
  `banned_terms_found[]` includes it.
- **Missing-Guardrails AC:** feed an `active-writeback` packet with the Guardrails block
  removed; assert `checks[]` "guardrails-five-controls" `passed` = false, a matching
  deficiency exists, and `ready_eligible` = false; feed a `read-only` packet without
  Guardrails → assert that check is exempt (passes).
- **Clean-packet AC:** feed a fully-compliant fixture packet; assert `score` ≥
  `readiness_threshold`, `ready_eligible` = true, and empty `deficiencies[]`.
- **Decomposition AC:** assert `checks[]` has one record per §5 check; assert the failed
  `check_id` set equals the `deficiencies[]` `check_id` set; recompute `score` from
  `weight`×`passed` and assert it equals the returned `score`.
- **Determinism AC:** run twice on the frozen packet; diff `score` / `checks[]` /
  `deficiencies[]` → must be byte-identical.
- **Read-only AC:** run with write-capable credentials present; assert the request log
  contains zero mutating verbs to any tool and the returned `packet` byte-equals the
  input.

## Open Questions
- *(none — packet is `ready`)*
