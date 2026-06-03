---
id: AWP-ORCH-022
title: AI Coding Agent Dispatch & Run Telemetry
pillar: P5 Orchestration
phase: Development
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
    ref: agent-dispatch + run-telemetry (consumes AWP-ORCH-019 dispatched state)
    content_hash: runtime
external_apis:
  - name: AI Coding Agent runner
    auth: service token
    scopes: [run:agent]                    # dispatch gated by Gate-1 approval
dependencies:
  depends_on: [AWP-ORCH-019, AWP-WB-001, AWP-AI-001]
  relates_to: [AWP-ORCH-023]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's orchestrator, I want to dispatch an **approved** work packet to an AI
coding agent runner, track that run as a first-class entity with cost/latency/token/outcome
telemetry, and enforce a per-dispatch cost cap, an iteration cap, and a kill switch, so that
consequential, costly agent runs are bounded, observable, default-denied without approval,
and recoverable on failure.

## Context / Background
This packet owns the **`approved → dispatched → implementing` segment** of the delivery
state machine ([`03`](../03-work-packet-format.md) §4) as a concrete, instrumented
capability that [`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md) calls. The
state machine owns the saga, the durable state, and the human gates; **this packet owns the
act of dispatch and the run as a tracked entity** — projecting/measuring cost, enforcing the
caps and kill switch, and emitting a per-run telemetry record. It does **not** redefine the
states or the gates, and it does **not** provision the sandbox the agent writes in — that is
[`AWP-ORCH-023`](./AWP-ORCH-023-branch-scoped-sandbox.md), which also issues the
branch-scoped agent token this packet hands to the runner.

It is **`type: active-writeback`** because **dispatch triggers a consequential, costly agent
run** — real compute, real LLM spend, real code written in a real repo. Therefore it carries
the five guardrail controls. The hard rule it enforces is **default-deny**: a dispatch with
**no recorded Gate-1 approval** for that packet is rejected and never reaches the runner
(safety invariant #1, [`03`](../03-work-packet-format.md) §4.4). All external writes the run
ultimately performs (branch push, draft PR) go through the guardrail engine
[`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) — this packet does not call tool write APIs
directly; it governs the **runner dispatch** itself. Token spend inside the run is metered by
the LLM gateway [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md); the **per-dispatch cost cap**
here is the dispatch-level ceiling above the gateway's per-call budgets. Every dispatch and
its outcome is audited via [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md) through the engine.

## Data Sources & External APIs
- **AI Coding Agent runner** (`run:agent`), auth **service token**: receives an **approved**
  packet as its full task spec and runs it. The runner executes inside the branch-scoped
  sandbox provisioned by [`AWP-ORCH-023`](./AWP-ORCH-023-branch-scoped-sandbox.md); the agent
  token is **branch-scoped** and issued by that packet, not minted here. The `run:agent` scope
  is the **only** scope this packet holds; it has **no** Jira/Bitbucket/Confluence write scope.
- **Guardrail engine** ([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)): every external tool
  write the run produces (branch push, draft-PR open) is performed through the engine
  (preview-then-write, default-deny, audited, reversible); the dispatch audit record is written
  via the engine into [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md).
- **LLM gateway** ([`AWP-AI-001`](./AWP-AI-001-llm-gateway.md)): meters the run's token spend
  and supplies the cost signal this packet sums against `max_cost_usd_per_dispatch`.
- **Volumes / limits:** one run record per dispatch; a run is long-lived (minutes–hours) and
  bounded by `dispatch_timeout_minutes`, `max_iterations`, and `max_cost_usd_per_dispatch`.

## Inputs
- `packet_id` (required) — the `AWP-<AREA>-<NNN>` to dispatch; used as the run correlation id.
- `gate1_approval_ref` (required) — reference to the recorded Gate-1 approval for `packet_id`;
  **absent ⇒ default-deny** (the dispatch is rejected).
- `max_cost_usd_per_dispatch` (default `5.00`) — the dispatch-level cost ceiling; a run whose
  projected or measured cost would exceed it is halted.
- `max_iterations` (default `20`) — the maximum agent iterations/turns before the run is halted.
- `dispatch_timeout_minutes` (default `120`) — max wall-clock for `implementing` before the run
  transitions to a failed/recoverable state.
- Secrets by reference: agent runner **service token** (`run:agent` only); the branch-scoped
  repo token is supplied by [`AWP-ORCH-023`](./AWP-ORCH-023-branch-scoped-sandbox.md).
- Trigger: a packet reaching `approved` in [`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md)
  and a dispatch call (with `gate1_approval_ref`).

## Outputs / Artifacts
- A **run record** (first-class entity) per dispatch:
  `{run_id, packet_id, started_at, ended_at, cost_usd, latency_ms, tokens_in, tokens_out,
  iterations, outcome, human_intervention_count, kill_switch_invoked}`.
- A **dispatch decision**: `dispatched` (approval present, caps not exceeded) or a typed
  rejection `REJECTED_NO_APPROVAL` / `HALTED_COST_CAP` / `HALTED_ITERATION_CAP` /
  `ABORTED_KILL_SWITCH` / `FAILED_TIMEOUT`.
- A **telemetry stream** of per-iteration cost/latency/token deltas keyed on `run_id`.
- An **audit record** per dispatch + outcome (via [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)
  → [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md)): actor, approval ref, packet id, caps in
  force, outcome.
- On failure: a **recoverable, re-dispatchable** run state with no orphaned external writes.

## Acceptance Criteria

Scenario: A dispatch projected or measured to exceed the cost cap is halted
  Given a dispatch of `packet_id` with `max_cost_usd_per_dispatch` = C
  When the run's projected or accumulated `cost_usd` would exceed C
  Then the run is halted before incurring further cost
    And its `outcome` = "HALTED_COST_CAP"
    And the run record's `cost_usd` does not exceed C by more than the in-flight iteration's delta.

Scenario: The kill switch aborts an in-flight dispatch
  Given a dispatch in `implementing`
  When the kill switch for that run (or its connector) is activated
  Then the run transitions to `outcome` = "ABORTED_KILL_SWITCH"
    And the run record has `kill_switch_invoked` = true
    And no further agent iterations execute after activation (the iteration count stops advancing).

Scenario: Every dispatch produces a run record with cost, latency, tokens, and outcome
  Given any dispatch of `packet_id` (success, halt, abort, or failure)
  When the run terminates
  Then a run record exists with non-null `cost_usd`, `latency_ms`, `tokens_in`, `tokens_out`, and a terminal `outcome`
    And the record's `packet_id` equals the dispatched `packet_id`.

Scenario: A dispatch with no recorded Gate-1 approval is rejected (default-deny)
  Given a dispatch request for `packet_id` whose `gate1_approval_ref` resolves to no recorded Gate-1 approval
  When the dispatch is attempted
  Then the `outcome` = "REJECTED_NO_APPROVAL"
    And exactly 0 calls are made to the agent runner (verified by the request log)
    And an audit record is written with outcome "rejected_no_approval" and no `run_id` started.

Scenario: Human-intervention count is tracked per run
  Given a dispatched run during which a human intervenes K times (pause/redirect/resume the agent)
  When the run terminates
  Then the run record's `human_intervention_count` equals K.

Scenario: A failed run is recoverable and re-dispatchable with no orphaned state
  Given a run that ended with `outcome` = "FAILED_TIMEOUT" (or another failure)
  When the same `packet_id` is re-dispatched with a valid `gate1_approval_ref`
  Then the re-dispatch resumes/replaces the run without duplicating any already-completed external write (idempotency via AWP-WB-001)
    And no orphaned external write remains from the failed run (any started write is completed-and-audited or compensated)
    And a new run record is linked to the prior failed `run_id` (re-dispatch lineage), not silently overwriting it.

## Out of Scope
- **Provisioning the branch-scoped sandbox** and minting the branch-scoped repo token —
  owned by [`AWP-ORCH-023`](./AWP-ORCH-023-branch-scoped-sandbox.md); this packet dispatches
  *into* that sandbox.
- **Redefining the states / transitions / gates** — authoritative in
  [`03`](../03-work-packet-format.md) §4 and implemented by
  [`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md); this packet owns the
  dispatch act and the run entity only.
- **Implementing guardrail mechanics** (approval enforcement, preview, audit storage,
  rollback, rate limit) — owned by [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md); this
  packet *calls* it for the run's external writes and the dispatch audit.
- **Per-LLM-call token metering / model routing** — owned by the LLM gateway
  [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md); this packet sums its cost signal against the
  dispatch cap.
- **Opening/merging the PR** — the run opens a draft PR via the engine; humans merge at Gate 2
  ([`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md)); the platform never merges.

## Dependencies / Linked Packets
- **depends_on** [`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md) (the state
  machine whose `approved → dispatched → implementing` segment this packet executes and whose
  Gate-1 approval it requires), [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) (performs the
  run's external writes and the dispatch audit; supplies the kill switch),
  [`AWP-AI-001`](./AWP-AI-001-llm-gateway.md) (meters the run's token cost feeding the cost cap).
- **relates_to** [`AWP-ORCH-023`](./AWP-ORCH-023-branch-scoped-sandbox.md) (provisions the
  isolated sandbox + branch-scoped token this packet dispatches the runner into).

## Non-Functional Requirements
- **Performance:** the dispatch decision (approval check + cap projection) is sub-second; total
  wall-clock is the agent run, bounded by `dispatch_timeout_minutes`; telemetry is emitted
  incrementally, not only at the end.
- **Security/Privacy:** holds only the `run:agent` scope and **no** tool write scope; the agent
  runs with the branch-scoped token from [`AWP-ORCH-023`](./AWP-ORCH-023-branch-scoped-sandbox.md);
  default-deny on missing Gate-1 approval; never logs secrets; tenant-scoped.
- **Idempotency/Reliability:** re-dispatching the same `packet_id` reuses the existing
  branch/PR via [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) idempotency keys and never
  double-creates; a failed run leaves **no orphaned external write** and is recoverable; the
  cost/iteration caps and kill switch are checked before each iteration (fail-safe to halt).
- **Observability:** one run record per dispatch with cost/latency/tokens/outcome/
  human-intervention count; per-iteration telemetry keyed on `run_id`; the dispatch
  request log the default-deny AC asserts; every dispatch + outcome audited.
- **Cost:** bounded by `max_cost_usd_per_dispatch` and `max_iterations` per dispatch; one run
  per dispatch; the cost cap is enforced **above** the gateway's per-call budgets.

## Verification / Test Notes
- **Cost-cap AC:** dispatch with a low `max_cost_usd_per_dispatch`; drive the run's metered cost
  past it; assert the run halts with `outcome` = "HALTED_COST_CAP" and `cost_usd` does not
  exceed C beyond the in-flight delta.
- **Kill-switch AC:** activate the kill switch mid-run; assert `outcome` = "ABORTED_KILL_SWITCH",
  `kill_switch_invoked` = true, and the iteration count stops advancing.
- **Run-record AC:** dispatch and let each terminal path occur (success/halt/abort/fail); assert
  every run record has non-null cost/latency/tokens and a terminal outcome with matching
  `packet_id`.
- **Default-deny AC:** dispatch with a `gate1_approval_ref` that resolves to no approval; assert
  `outcome` = "REJECTED_NO_APPROVAL", a request-log capture showing 0 runner calls, and an audit
  record with no `run_id`.
- **Intervention-count AC:** intervene K times during a run; assert `human_intervention_count` = K.
- **Recoverable-failure AC:** force a `FAILED_TIMEOUT`; re-dispatch with a valid approval; assert
  no duplicated external write (idempotency keys reused), no orphaned write, and a new run record
  linked to the prior failed `run_id`.

## Guardrails
This packet is `active-writeback` because **dispatch triggers consequential, costly agent
runs**; it carries all five controls, delegating write enforcement and the kill switch to
[`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) and the human gate to
[`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md).
- **Approval:** a dispatch is **default-deny** — it proceeds only with a valid
  `gate1_approval_ref` recording the **Gate-1** approval for `packet_id`; with no recorded
  approval the dispatch is `REJECTED_NO_APPROVAL` and the runner is never called. The approver
  approved entry into implementation at Gate 1 ([`03`](../03-work-packet-format.md) §4.3).
- **Dry-run / Preview:** before any run starts, the dispatch shows a no-run preview — **the
  exact packet to be dispatched and the target runner/sandbox** (packet id, branch, projected
  cost/iteration caps) — with **no agent run executed yet**; nothing dispatches that the
  approver did not first see.
- **Audit:** every dispatch **and** its outcome writes an append-only record via
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) to [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md):
  actor, Gate-1 approval ref, packet id, caps in force (`max_cost_usd_per_dispatch`,
  `max_iterations`, `dispatch_timeout_minutes`), run id (or none), and terminal outcome.
- **Scoped permissions:** the runner token is least-privilege — **`run:agent` only**; the
  branch-scoped repo token is issued separately by
  [`AWP-ORCH-023`](./AWP-ORCH-023-branch-scoped-sandbox.md) and confined to `ai/<packet_id>-*`
  in the target repo; this packet holds **no** Jira/Bitbucket/Confluence write scope.
- **Rollback / Undo:** the **kill switch** aborts an in-flight run (`ABORTED_KILL_SWITCH`) and
  the sandbox is torn down by [`AWP-ORCH-023`](./AWP-ORCH-023-branch-scoped-sandbox.md); any
  external write the run had performed is reversed via the engine's compensating actions
  (decline/close draft PR + delete branch); a failed run leaves no orphaned write and is
  re-dispatchable; every abort/reversal is itself audited.

## Open Questions
- *(none — packet is `ready`)*
