---
id: AWP-ORCH-019
title: Orchestration State Machine (Temporal)
pillar: P5 Orchestration
phase: Planning
roadmap_phase: 5
owning_agent: none
type: active-writeback
status: ready
priority: P1
estimate: L
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: internal
    object: service
    ref: delivery-state-machine (03 §4) on Temporal
    content_hash: runtime
external_apis:
  - name: AI Coding Agent runner
    auth: service token
    scopes: [run:agent, repo:branch-scope]
  - name: Jira / Bitbucket writes (via AWP-WB-001)
    auth: delegated to AWP-WB-001 (engine resolves per-tenant write credential)
    scopes: [delegated]                    # this packet performs no direct tool write
dependencies:
  depends_on: [AWP-WB-001, AWP-PLAT-002]
  relates_to: [AWP-ORCH-021, AWP-GEN-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's orchestrator, I want a durable, resumable, idempotent Temporal
workflow that implements the delivery state machine from
[`03`](../03-work-packet-format.md) §4 — enforcing the two human gates and the six
safety invariants and delegating every external write to the guardrail engine — so that
a work packet moves req → AI-implementation → draft PR through one auditable, gated,
crash-proof saga, and never performs an unapproved or orphaned mutation.

## Context / Background
This packet **implements** the delivery state machine specified in
[`03`](../03-work-packet-format.md) §4 — it does **not** redefine it. The states
(`draft → ready → awaiting_approval → approved → dispatched → implementing → pr_open →
awaiting_pr_approval → merged`, plus `rejected | drifted | failed`), the transitions
(§4.2), the **exactly two human gates** (§4.3), and the **six safety invariants** (§4.4)
are authoritative there; this packet is their executable form on **Temporal**, chosen
because the loop is a long-lived, human-in-the-loop, retryable saga
([`02`](../02-technical-foundation.md) §1, Layer 6).

It runs as **Layer 6 (Orchestration)** and is the engine that
[`AWP-ORCH-021`](./AWP-ORCH-021-brd-to-pr.md) traverses concretely. Two delegations are
load-bearing and must **not** be re-implemented here: **all external writes go through the
guardrail engine** [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) (preview-then-write,
default-deny, audited, rate-limited, reversible) — this workflow never calls a tool write
API directly; and the **append-only audit log** is owned by
[`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md). What lives **here** specifically: the two
human **gates** (the workflow blocks on a Temporal signal at `awaiting_approval` and
`awaiting_pr_approval`), the durable state, and a **state-transition event per step** with
**correlation id = packet id**.

Hard rules inherited from [`03`](../03-work-packet-format.md) §4.4: no external write
without a recorded approval for that write class; preview-then-write on every mutation;
**PR-only, never merge** (humans merge); the agent is **branch-scoped** to `ai/<AWP-id>-*`
in the target repo only; every write is reversible; and the workflow is **idempotent** —
same `source_fingerprint` + no new approval ⇒ no-op, and re-dispatch reuses the existing
branch/PR. Durability is Temporal's: a crash mid-`implementing` resumes from the last
recorded transition, never re-firing an already-executed write (idempotency keys via
[`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)).

## Data Sources & External APIs
- **AI Coding Agent runner** (`run:agent`, `repo:branch-scope`), auth **service token**:
  receives the dispatched packet as its full task spec; runs in an isolated worktree
  limited to the target repo and branch `ai/<AWP-id>-<slug>`; opens a **draft** PR. The
  runner token is branch-scoped and **cannot push to `target_branch`**.
- **Jira / Bitbucket writes — delegated to
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)**: issue create/link on Gate-1 approval,
  branch push, draft-PR open. This workflow calls the engine's `preview` then `execute`
  (with an idempotency key); it holds **no** direct tool write scopes.
- **Audit log** ([`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md)): every write's audit is
  written by [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md); this workflow additionally
  records each state transition as an event.
- **Volumes / limits:** one workflow execution per packet run; long-lived (hours–days
  while awaiting human gates). Temporal persists state across worker restarts.

## Inputs
- `packet_id` (required) — the `AWP-<AREA>-<NNN>`; used as the **correlation id** and the
  Temporal workflow id (one run per packet).
- `source_fingerprint` (required) — the packet's source hash at generation; drives the
  idempotency no-op check.
- `target_repo` (required) and `target_branch` (default = repo default branch) — the agent
  may open a PR *into* `target_branch` but may never push to it directly.
- `gate1_approver` (required) and `gate2_approver` (required) — the humans who must signal
  at `awaiting_approval` and `awaiting_pr_approval` respectively; default-deny if absent.
- `agent_run_timeout` (default `2h`) — max `implementing` duration before transition to `failed`.
- `approval_policy` (passed to [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)).
- Secrets by reference: agent runner **service token**; tool write credentials are resolved
  by [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md), not by this workflow.
- Trigger: a packet reaching `ready` and being submitted (a `submit` signal / start call).

## Outputs / Artifacts
- A **durable Temporal workflow execution** whose current state is exactly one of the
  §4.1 states, resumable after worker crash.
- A **state-transition event** per step: `{packet_id (= correlation_id), from_state,
  to_state, transition, actor, timestamp}` emitted to the platform event stream.
- On Gate-1 approval: **linked Jira issues created** via
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) (preview → write → audit).
- On dispatch: an **agent run record** (logs, files changed, summary) and a branch
  `ai/<packet_id>-<slug>`.
- A **draft Bitbucket PR** (opened via [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)),
  targeting `target_branch`, never merged by the platform.
- The audit trail for every write (owned by [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)).

## Acceptance Criteria

Scenario: Packet halts at Gate 1 with no approval (zero external writes)
  Given a packet that has transitioned `draft → ready → awaiting_approval`
    And no Gate-1 approval signal has been received
  When the workflow is inspected
  Then its state is `awaiting_approval` and it is blocked awaiting the signal
    And 0 external writes have occurred (no Jira issue created, no branch pushed, no PR opened — request log shows none).

Scenario: On Gate-1 approval it transitions to approved and its writes are audited
  Given a workflow in `awaiting_approval`
  When `gate1_approver` sends the approve signal
  Then the workflow transitions to `approved`
    And the linked Jira issues are created via AWP-WB-001 (preview → write)
    And an append-only audit record exists for each created issue containing the previewed diff and the approver.

Scenario: A failure during implementing transitions to failed with no orphaned writes
  Given a workflow in `implementing`
  When the agent step errors (or exceeds `agent_run_timeout`)
  Then the workflow transitions to `failed`
    And no partial external write is left orphaned (any started write is completed-and-audited or compensated/rolled back)
    And the workflow is re-runnable: a retry resumes without duplicating any prior write (idempotency keys reused).

Scenario: Same source_fingerprint with no new approval is a no-op (idempotency)
  Given a packet already processed at `source_fingerprint` = F with no new approval recorded
  When the workflow is (re-)started for the same `packet_id` and `source_fingerprint` = F
  Then no new external write occurs (Jira create count and PR count are unchanged)
    And any re-dispatch reuses the existing branch `ai/<packet_id>-*` and existing PR rather than creating duplicates.

Scenario: The agent step is branch-scoped and cannot push to target_branch (PR-only)
  Given a dispatched packet whose agent runs against `target_repo`
  When the agent writes code
  Then it can write only within the worktree on branch `ai/<packet_id>-<slug>`
    And any attempt to push directly to `target_branch` fails (request log shows no push to `target_branch`)
    And changes reach `target_branch` only via a draft PR.

Scenario: No transition merges a PR without a human (never-auto-merge)
  Given a workflow that has reached `awaiting_pr_approval` with an open draft PR
  When the full transition table is exercised
  Then there exists no transition from any state to `merged` that the platform/agent can take autonomously
    And `merged` is reachable only via the `gate2_approver` human-merge action (the platform never calls merge).

Scenario: Every state transition emits an event with correlation id = packet id
  Given a packet that traverses `draft → ready → awaiting_approval → approved → dispatched → implementing → pr_open → awaiting_pr_approval`
  When the workflow runs
  Then exactly one state-transition event is emitted per transition
    And every emitted event's `correlation_id` equals the `packet_id`.

## Out of Scope
- **Implementing the guardrail mechanics** (approval enforcement, preview rendering, audit
  fields, rate limit, kill switch, idempotency-key dedupe, rollback) — those are owned by
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md); this workflow *calls* them.
- **Redefining the states/transitions/gates/invariants** — authoritative in
  [`03`](../03-work-packet-format.md) §4; this packet must match them, not diverge.
- **Generating the packet content** — owned by
  [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md).
- **Merging the PR** — humans merge at Gate 2; the platform never merges.
- **Owning audit-log storage** — [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md).
- The specific BRD→PR business flow — that is the caller
  [`AWP-ORCH-021`](./AWP-ORCH-021-brd-to-pr.md); this packet is the reusable engine beneath it.

## Dependencies / Linked Packets
- **depends_on** [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) (every external write in
  every transition is delegated here — without it the workflow cannot safely mutate),
  [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md) (the audit store the writes record into).
- **relates_to** [`AWP-ORCH-021`](./AWP-ORCH-021-brd-to-pr.md) (the flagship loop that
  *traverses* this state machine end-to-end),
  [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md) (produces the packets this workflow
  dispatches and shares the `source_fingerprint`/`drifted` model).

## Non-Functional Requirements
- **Performance:** state transitions are sub-second; total wall-clock is dominated by human
  gate latency and the agent run (`agent_run_timeout`). Workers scale horizontally.
- **Security/Privacy:** the workflow holds **no** direct tool write scopes (all writes via
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)); the agent runner token is branch-scoped
  to `ai/<packet_id>-*` in `target_repo` and cannot read other repos or push to `target_branch`.
- **Idempotency/Reliability:** Temporal makes the saga durable and resumable; same
  `source_fingerprint` + no new approval ⇒ no-op; re-dispatch reuses the branch/PR; a crash
  mid-write does not double-execute (idempotency keys via the engine); `failed` is
  recoverable with no orphaned writes.
- **Observability:** one state-transition event per step with `correlation_id = packet_id`;
  the full state history is queryable from Temporal; every write is audited by the engine.
- **Cost:** orchestration itself makes **zero LLM calls** (the agent run's tokens are
  metered by the LLM gateway, [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md), not here);
  one agent run per dispatched packet.

## Verification / Test Notes
- **Gate-1 halt AC:** start a workflow, advance to `awaiting_approval`, send no signal;
  assert state = `awaiting_approval` and a request-log capture shows 0 tool writes.
- **Gate-1 approve AC:** send the approve signal; assert transition to `approved` and a
  matching audit record (previewed diff + approver) per created Jira issue.
- **Failure AC:** inject an agent error in `implementing`; assert transition to `failed`,
  zero orphaned writes (engine shows each started write completed-and-audited or
  rolled-back), and a clean re-run that reuses idempotency keys.
- **Idempotency AC:** re-start the workflow for the same `packet_id` + `source_fingerprint`
  with no new approval; assert Jira-create and PR counts unchanged and the existing
  branch/PR reused.
- **Branch-scope AC:** in the agent run, attempt a push to `target_branch`; assert it fails
  and the request log shows no such push; assert the PR is the only path onto `target_branch`.
- **Never-merge AC:** statically and dynamically exercise the transition table; assert no
  autonomous path to `merged`; assert `merged` is reached only by the human-merge action.
- **Event AC:** traverse the happy path; assert one transition event per step and every
  `correlation_id` == `packet_id`.

## Guardrails
This packet is `active-writeback`; **enforcement of the five controls is delegated to
[`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)** (every external write in every transition
calls the engine), while the **two human gates** of [`03`](../03-work-packet-format.md) §4.3
**live here** as Temporal signal blocks.
- **Approval:** the workflow **blocks** at **Gate 1 (`awaiting_approval`)** until
  `gate1_approver` signals, and at **Gate 2 (`awaiting_pr_approval`)** until `gate2_approver`
  signals; default-deny — with no signal the saga halts and no write occurs. The engine
  additionally re-checks approval per write.
- **Dry-run / Preview:** before any write the workflow calls
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)`.preview` and surfaces the exact diff
  (Jira payloads, branch name, PR title/target) at Gate 1; nothing executes that the approver
  did not first see.
- **Audit:** every write is recorded by the engine (actor, approver, timestamp, input hash,
  previewed diff, outcome) in [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md); additionally,
  every **state transition** emits an event with `correlation_id = packet_id`.
- **Scoped permissions:** the workflow holds **no** direct tool write scopes; the agent runner
  token is least-privilege and **branch-scoped** to `ai/<packet_id>-*` in `target_repo` only
  (cannot push to `target_branch`); write credentials are resolved by the engine, separate
  from read credentials.
- **Rollback / Undo:** on reject or `failed`, the workflow invokes the engine's compensating
  actions (decline/close the draft PR + delete the branch; delete generated draft Jira issues;
  restore any changed field) — every reversal audited; **never-merge** is structural (no
  autonomous transition to `merged`).

## Open Questions
- *(none — packet is `ready`)*
