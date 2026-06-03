---
id: AWP-ORCH-023
title: Branch-Scoped Agent Sandbox
pillar: P5 Orchestration
phase: Development
roadmap_phase: 5
owning_agent: none
type: active-writeback
status: ready
priority: P0
estimate: L
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: internal
    object: service
    ref: isolated git worktree/sandbox provisioner (enforces 03 §4.4 invariant #4)
    content_hash: runtime
external_apis:
  - name: Bitbucket Cloud REST 2.0
    auth: OAuth2 / app password
    scopes: [repository:write, pullrequest:write]   # repository:write branch-scoped to ai/<AWP-id>-*; gated by Gate-1 dispatch
dependencies:
  depends_on: [AWP-INT-002, AWP-WB-001]
  relates_to: [AWP-ORCH-022]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's orchestrator, I want to provision an isolated git worktree/sandbox for an
agent run that is scoped to branch `ai/<AWP-id>-*` in the target repo **only** — where the
agent can write inside that worktree/branch, cannot push to protected or default branches
(PR-only), and is torn down on completion — so that safety invariant #4 (the agent is
branch-scoped, only in the target repo) holds by construction.

## Context / Background
This packet **implements safety invariant #4** of [`03`](../03-work-packet-format.md) §4.4:
"the agent writes only inside `ai/<AWP-id>-*`, only in the target repo." Both the state
machine ([`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md)) and the dispatch
packet ([`AWP-ORCH-022`](./AWP-ORCH-022-agent-dispatch-telemetry.md)) **assert** this
property; this packet is the component that **makes it true** — it provisions the isolated
worktree, mints the **narrow, branch-scoped** repo token, enforces the write boundary, and
tears the sandbox down. [`AWP-ORCH-022`](./AWP-ORCH-022-agent-dispatch-telemetry.md)
dispatches the runner *into* the sandbox this packet provisions and consumes the token this
packet issues.

It is **`type: active-writeback`** because provisioning a sandbox creates a real branch and
real write capability against a real repository. Therefore it carries the five guardrail
controls — and **approval is inherited**: a sandbox is provisioned **only after the Gate-1
dispatch** has occurred for the packet ([`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md)
§4.3; safety invariant #1), never speculatively. Every Bitbucket write (branch create, push,
draft-PR open) is performed through the guardrail engine
[`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) (preview-then-write, default-deny, audited,
reversible, idempotent); this packet does not call Bitbucket write APIs directly. The
Bitbucket connector [`AWP-INT-002`](./AWP-INT-002-bitbucket-connector.md) supplies the repo
metadata (default/protected branches) the boundary check is built against.

The invariant is enforced **structurally**, not by convention: the worktree is physically
isolated, the token's `repository:write` is **branch-scoped to `ai/<AWP-id>-*`** and confined
to `target_repo`, and any attempt to write outside that branch, push to the default/protected
branch, or touch another repo **fails and is audited**. Changes reach the target branch only
via a **draft PR** (PR-only) — the platform never merges. The sandbox is **torn down on
completion** and the branch is reusable on re-dispatch (idempotent), never duplicated.

## Data Sources & External APIs
- **Bitbucket Cloud REST 2.0** (`repository:write` **branch-scoped to `ai/<AWP-id>-*`**,
  `pullrequest:write`), auth **OAuth2 / app password**: create the agent branch, accept
  pushes only on that branch, open a **draft** PR targeting the default branch. The write
  token is **narrow** — confined to `target_repo` and the `ai/<AWP-id>-*` branch prefix; it
  **cannot** read or write other repos and **cannot** push to the default/protected branch.
  All writes go **through** [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md).
- **Bitbucket connector** ([`AWP-INT-002`](./AWP-INT-002-bitbucket-connector.md)): supplies
  the repo's default-branch name and branch-protection metadata the boundary check uses to
  reject protected-branch writes.
- **Guardrail engine** ([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)): performs and audits
  every branch create/push/PR-open and the teardown; the sandbox-lifecycle and blocked-write
  audit records are written via the engine into [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md).
- **Volumes / limits:** one sandbox per dispatched packet run; one `ai/<AWP-id>-*` branch per
  packet; teardown on completion; re-dispatch reuses the existing branch.

## Inputs
- `packet_id` (required) — the `AWP-<AREA>-<NNN>`; determines the branch name `ai/<packet_id>-<slug>`.
- `target_repo` (required) — the **only** repo the sandbox token may touch (`<workspace>/<repo-slug>`).
- `branch_prefix` (default `"ai/"`) — the enforced prefix; the agent branch is
  `<branch_prefix><packet_id>-<slug>` and writes outside this prefix fail.
- `gate1_dispatch_ref` (required) — reference to the Gate-1 dispatch that authorizes
  provisioning; **absent ⇒ no sandbox is provisioned** (approval inherited).
- Secrets by reference: a **branch-scoped, narrow** Bitbucket write credential resolved by
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md), confined to `target_repo` + `branch_prefix`.
- Trigger: a Gate-1 dispatch from [`AWP-ORCH-022`](./AWP-ORCH-022-agent-dispatch-telemetry.md)
  / [`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md) for `packet_id`.

## Outputs / Artifacts
- An **isolated worktree/sandbox** for the run, physically separate from any other repo
  checkout, with the agent branch `ai/<packet_id>-<slug>` created.
- A **branch-scoped agent token** (issued to the runner): `repository:write` limited to
  `ai/<packet_id>-*` in `target_repo`, plus `pullrequest:write`; no read/write to other repos,
  no push to the default/protected branch.
- A **draft PR** (opened via [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)) targeting the
  default branch — the **only** path changes reach the target branch.
- **Boundary-rejection events**: a typed `BLOCKED_OUT_OF_BRANCH` / `BLOCKED_PROTECTED_BRANCH`
  / `BLOCKED_OUT_OF_REPO` for any attempted write outside the allow-list, each audited.
- A **teardown record** on completion: the sandbox is removed; the `ai/<packet_id>-*` branch is
  deleted on rollback/teardown (or retained-and-reused on re-dispatch per policy).
- **Sandbox-lifecycle audit** (provision → write-boundary events → teardown) via the engine to
  [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md).

## Acceptance Criteria

Scenario: The sandbox permits writes only on branch ai/<AWP-id>-*
  Given a provisioned sandbox for `packet_id` with `branch_prefix` = "ai/"
  When the agent writes/pushes to branch `ai/<packet_id>-login`
  Then the write succeeds on that branch
    And a write to any branch not matching `ai/<packet_id>-*` (e.g. `feature/x`) fails with `BLOCKED_OUT_OF_BRANCH` (verified by the request log showing no accepted push to that branch).

Scenario: The agent cannot push to the target/default branch directly (PR-only)
  Given a provisioned sandbox whose `target_repo` default branch is `main`
  When the agent attempts to push directly to `main`
  Then the push is rejected with `BLOCKED_PROTECTED_BRANCH`
    And 0 commits are written to `main` by the agent (request log shows no accepted push to `main`)
    And changes reach `main` only via the draft PR.

Scenario: The sandbox token cannot read repos outside target_repo
  Given the branch-scoped sandbox token for `target_repo` = `<workspace>/repo-A`
  When the token is used to read or write `<workspace>/repo-B`
  Then the request is denied with `BLOCKED_OUT_OF_REPO`
    And 0 calls to `<workspace>/repo-B` succeed (request log shows denial).

Scenario: On completion the sandbox is torn down
  Given a run whose agent has finished (PR opened or run terminated)
  When teardown runs
  Then the worktree/sandbox is removed (a `sandbox_state` observable = "torn_down")
    And a teardown audit record exists naming `packet_id` and the disposition of branch `ai/<packet_id>-*`.

Scenario: An attempt to write to a protected branch is blocked and audited
  Given a branch in `target_repo` marked protected (per AWP-INT-002 branch-protection metadata)
  When the agent attempts to write to that protected branch
  Then the write is blocked with `BLOCKED_PROTECTED_BRANCH`
    And an append-only audit record is written (via AWP-WB-001) naming the actor, `packet_id`, the target branch, and outcome "blocked_protected_branch".

Scenario: On re-dispatch the existing branch is reused, not duplicated (idempotent)
  Given a sandbox previously provisioned for `packet_id` whose branch `ai/<packet_id>-<slug>` already exists
  When the same `packet_id` is re-dispatched
  Then the existing `ai/<packet_id>-<slug>` branch is reused (the count of `ai/<packet_id>-*` branches stays at 1)
    And no duplicate branch or duplicate draft PR is created (idempotency via AWP-WB-001).

## Out of Scope
- **Deciding whether to dispatch** and tracking run telemetry/cost/iteration caps — owned by
  [`AWP-ORCH-022`](./AWP-ORCH-022-agent-dispatch-telemetry.md); this packet provisions the
  sandbox the dispatch runs in.
- **Redefining the state machine / human gates** — authoritative in
  [`03`](../03-work-packet-format.md) §4 and implemented by
  [`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md).
- **Implementing guardrail mechanics** (approval enforcement, preview, audit storage,
  rollback, rate limit, idempotency keys) — owned by
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md); every Bitbucket write here *calls* it.
- **Ingesting Bitbucket data** (commits/PRs/branch metadata) — owned by the read-only connector
  [`AWP-INT-002`](./AWP-INT-002-bitbucket-connector.md); this packet consumes its
  branch-protection metadata.
- **Merging the PR** — humans merge at Gate 2; the sandbox is PR-only and the platform never
  merges; protected/default-branch writes are structurally rejected.

## Dependencies / Linked Packets
- **depends_on** [`AWP-INT-002`](./AWP-INT-002-bitbucket-connector.md) (supplies the repo's
  default-branch + protection metadata the boundary check enforces against),
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) (performs and audits every branch
  create/push/PR-open + teardown; supplies idempotency keys so re-dispatch reuses the branch).
- **relates_to** [`AWP-ORCH-022`](./AWP-ORCH-022-agent-dispatch-telemetry.md) (dispatches the
  agent runner into the sandbox this packet provisions and consumes its branch-scoped token).

## Non-Functional Requirements
- **Performance:** provisioning (worktree + branch + token) completes within seconds before the
  agent run starts; teardown completes promptly on run completion.
- **Security/Privacy:** the write token is **least-privilege and branch-scoped** — `repository:write`
  confined to `ai/<packet_id>-*` in `target_repo` plus `pullrequest:write`, separate from any read
  credential; it **cannot** read/write other repos or push to default/protected branches; provisioned
  only after Gate-1 dispatch; secrets never logged; tenant-scoped.
- **Idempotency/Reliability:** re-dispatch reuses the existing `ai/<packet_id>-*` branch and draft
  PR (no duplicates) via [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) idempotency keys; teardown
  is idempotent; a failed run leaves no orphaned writable sandbox or dangling write capability.
- **Observability:** emit sandbox lifecycle events (provisioned / write-accepted / write-blocked
  with reason / torn-down) keyed on `packet_id`, the count of boundary rejections by type, and the
  request log the branch-scope ACs assert; every blocked write and teardown is audited.
- **Cost:** zero LLM calls (pure provisioning/enforcement); one sandbox + one branch per packet run.

## Verification / Test Notes
- **Branch-scope AC:** provision a sandbox; push to `ai/<packet_id>-login` → assert success; push
  to `feature/x` → assert `BLOCKED_OUT_OF_BRANCH` and the request log shows no accepted push there.
- **PR-only AC:** attempt a direct push to the default branch `main`; assert
  `BLOCKED_PROTECTED_BRANCH`, 0 accepted commits on `main`, and that the draft PR is the only path
  onto `main`.
- **Repo-isolation AC:** use the sandbox token against a second repo `repo-B`; assert
  `BLOCKED_OUT_OF_REPO` and 0 successful calls to `repo-B`.
- **Teardown AC:** finish the run; assert `sandbox_state` = "torn_down" and a teardown audit record
  naming `packet_id` and the branch disposition.
- **Protected-branch audit AC:** mark a branch protected (via AWP-INT-002 metadata); attempt a
  write; assert `BLOCKED_PROTECTED_BRANCH` and a matching append-only audit record with actor,
  packet id, target branch, and outcome.
- **Idempotent re-dispatch AC:** re-dispatch the same `packet_id`; assert the `ai/<packet_id>-*`
  branch count stays at 1 and no duplicate draft PR is created.

## Guardrails
This packet is `active-writeback` because provisioning a sandbox creates a real branch and write
capability against a real repo; it carries all five controls, delegating write enforcement,
idempotency, and audit to [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md).
- **Approval:** **inherited** — a sandbox is provisioned **only after the Gate-1 dispatch** for
  `packet_id` ([`03`](../03-work-packet-format.md) §4.3; safety invariant #1). With no
  `gate1_dispatch_ref` no sandbox is provisioned and no branch/token is created (default-deny).
- **Dry-run / Preview:** before provisioning, a no-write preview shows **the exact branch name to
  be created** (`ai/<packet_id>-<slug>`) and the target repo/default-branch — with **zero** writes
  performed yet (no branch created, no token minted until confirmed).
- **Audit:** the full **sandbox lifecycle** (provision → each write-boundary event → teardown) and
  **any blocked write** is recorded append-only via
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) to [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md):
  actor, `packet_id`, target repo/branch, attempted action, and outcome (created / blocked-with-reason
  / torn-down).
- **Scoped permissions:** the agent token is least-privilege — `repository:write` **branch-scoped to
  `ai/<packet_id>-*`** and `pullrequest:write`, confined to the **`target_repo` allow-list** only,
  separate from any read credential; it cannot touch other repos or the default/protected branch
  (structural, not by convention).
- **Rollback / Undo:** on completion or abort the sandbox is **torn down** and (on rollback) the
  `ai/<packet_id>-*` branch is **deleted** and any draft PR declined/closed via the engine's
  compensating actions; teardown leaves no orphaned write capability; every teardown/reversal is
  itself audited.

## Open Questions
- *(none — packet is `ready`)*
