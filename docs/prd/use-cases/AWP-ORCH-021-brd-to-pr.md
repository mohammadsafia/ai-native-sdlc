---
id: AWP-ORCH-021
title: BRD → Use Cases → AI Agent → draft Bitbucket PR (with approval)
pillar: P5 Orchestration
phase: Planning
roadmap_phase: 5
owning_agent: BA
type: active-writeback
status: ready
priority: P1
estimate: L
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: <sha256-of-sources-at-generation>
sources:
  - system: Confluence
    object: page
    ref: <brd-pageId>
    content_hash: <sha256>
  - system: Jira
    object: project
    ref: <PROJECT_KEY>
    content_hash: runtime
external_apis:
  - name: Confluence Cloud REST
    auth: OAuth2 3LO
    scopes: [read:confluence-content.summary, read:confluence-content.all]
  - name: Jira Cloud REST v3
    auth: OAuth2 3LO
    scopes: [read:jira-work, write:jira-work]      # write gated by Gate 1 approval
  - name: Bitbucket Cloud REST 2.0
    auth: OAuth2 / app password
    scopes: [repository:read, repository:write, pullrequest:write]
  - name: AI Coding Agent runner
    auth: service token
    scopes: [run:agent, repo:branch-scope]
dependencies:
  depends_on: [AWP-GEN-001, AWP-ORCH-019, AWP-WB-001]
  relates_to: [AWP-INT-003, AWP-INT-002]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a business analyst, I want to turn an approved Confluence BRD (cross-checked
against existing Jira scope) into AI work packets, dispatch one to an AI coding
agent, and get a draft Bitbucket PR for human review, so that requirement → code
moves in one traceable, approval-gated loop.

## Context / Background
This is the flagship **active** loop and a concrete traversal of the delivery state
machine ([`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md)). It chains:
(1) read BRD + Jira; (2) call the Use-Case Generator
([`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md)) to produce AI work packets;
(3) human approves which packet(s) to implement (**Gate 1**); (4) dispatch one packet
to the AI coding agent in a branch-scoped sandbox; (5) the agent implements and opens
a **draft** Bitbucket PR; (6) human reviews and merges the PR (**Gate 2**).

**Nothing** is written to Jira or Bitbucket without an explicit human approval at the
relevant gate. Confluence/Jira reads are unrestricted; all writes are previewed first.
All guardrail mechanics are provided by the guardrail engine
([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)) — this packet *uses* them, it does
not reinvent them.

## Data Sources & External APIs
- **Confluence** (`read:confluence-content.*`): BRD page body (storage/HTML), child pages, inline comments → requirement text.
- **Jira** (`read:jira-work`, `write:jira-work` — write inert until Gate 1): existing epics/stories in `<PROJECT_KEY>` for dedupe and linking; on approval, create linked stories.
- **Bitbucket** (`repository:read/write`, `pullrequest:write`): target repo for the branch + draft PR. Branch name pattern `ai/<AWP-id>-<slug>`; PR opened in **draft**, target = default branch.
- **AI Coding Agent runner** (`run:agent`, `repo:branch-scope`): receives the chosen packet as its full task spec; runs in an isolated worktree limited to the target repo and branch.

## Inputs
- `brd_page_id` (required)
- `project_key` (required)
- `repo_slug` (required)
- `target_branch` (default = repo default branch)
- `max_packets` (default `5`)
- `auto_implement` (default `false` — must be explicitly enabled per run)
- `approver` (required)
- Secrets by reference: scoped Confluence / Jira / Bitbucket tokens + agent service token.

## Outputs / Artifacts
1. `use_cases[]` — generated AI work packets (the [`03`](../03-work-packet-format.md) shape), each linked back to BRD section + related Jira issues.
2. On Gate-1 approval: Jira stories created/linked for selected use cases (preview-then-write).
3. On dispatch: an agent run record (logs, files changed, summary).
4. A **draft** Bitbucket PR per implemented packet, body containing the packet id, the acceptance-criteria checklist, and BRD/Jira backlinks.
5. A full audit-trail entry per external write (see Guardrails).

## Acceptance Criteria

Scenario: Generation is traceable
  Given a BRD with N requirement sections
  When generation runs
  Then each use case in `use_cases[]` has a `sources[]` entry referencing the BRD
       page id and the specific section anchor it derives from.

Scenario: Dedupe against existing Jira
  Given an existing Jira story whose summary semantically matches a generated use case
  When generation runs
  Then the use case is marked `duplicate_of: <ISSUE_KEY>` and is NOT created as a new
       story unless the approver overrides.

Scenario: No write without approval (hard gate)
  Given generated use cases and `auto_implement` = false
  When the loop reaches the implementation step with no recorded approval
  Then no Jira issue is created, no branch is pushed, and no PR is opened
    And the loop halts in state `awaiting_approval`.

Scenario: Dry-run preview before every external write
  Given the approver opens the Gate-1 approval view
  Then before approving they see: the exact Jira issues to be created (fields),
       the branch name, and the PR title/target — with zero writes performed yet.

Scenario: Agent sandbox is branch-scoped
  Given a dispatched packet
  When the agent runs
  Then it can write only within the worktree on branch `ai/<AWP-id>-<slug>`
    And it cannot push to `target_branch` directly (PR-only).

Scenario: PR opens as draft with traceability
  Given the agent completed implementation
  When the PR is opened
  Then PR state = draft
    And the PR body contains the packet id, the acceptance-criteria checklist,
        and links to the BRD page and related Jira issue(s).

Scenario: Every external write is audited
  Given any Jira create, branch push, or PR open occurred
  Then an append-only audit record exists with actor, approver, timestamp,
       input hash, the previewed diff, and the resulting object id/URL.

Scenario: Rollback path exists
  Given a PR was opened in error
  When the owner triggers undo
  Then the PR is closed/declined and its branch deleted
    And the audit records the reversal.

## Out of Scope
- Merging the PR (humans merge; the loop never merges).
- Direct commits to protected branches.
- Generating use cases from Figma/Miro/Teams (covered by [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md); this packet's path is Confluence + Jira only).
- Production deploy.

## Dependencies / Linked Packets
- **depends_on** [`AWP-GEN-001`](./AWP-GEN-001-use-case-generator.md) (produces the packets this loop dispatches), [`AWP-ORCH-019`](./AWP-ORCH-019-orchestration-state-machine.md) (the state machine this traverses), [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) (the guardrail mechanics).
- **relates_to** [`AWP-INT-003`](./AWP-INT-003-confluence-connector.md) (BRD source), [`AWP-INT-002`](./AWP-INT-002-bitbucket-connector.md) (PR target).

## Non-Functional Requirements
- **Security/Privacy:** least-privilege scoped tokens; write scopes inert until approval; the agent token cannot read repos outside `repo_slug`.
- **Idempotency/Reliability:** re-running with the same `source_fingerprint` and no approval is a no-op; re-dispatch reuses the existing branch/PR rather than duplicating; a failure after Jira-create but before PR-open leaves a recoverable state, not orphaned writes.
- **Observability:** emit a state-transition event per step with correlation id = packet id.
- **Cost:** generation + implementation bounded by `max_packets`; one agent run per packet; per-dispatch token cap enforced by the LLM gateway.

## Verification / Test Notes
- **Dry-run mode:** run end-to-end with writes stubbed; assert the preview equals what a real run would write (snapshot the planned payloads).
- **Gate test:** with no approval recorded, assert 0 write calls (request-log capture) and final state `awaiting_approval`.
- **Sandbox test:** attempt a write outside the branch/worktree in the agent run → must fail.
- **Draft-PR test:** assert PR created with `draft=true` and required backlinks present.
- **Audit test:** for each write, assert a matching append-only record with the required fields.
- **Rollback test:** open then undo; assert PR declined + branch gone + reversal audited.

## Guardrails
- **Approval:** the named `approver` must approve at the `awaiting_approval` gate; default-deny. The approver sees the dry-run preview (Jira fields, branch, PR title/target) before approving. A **second** approval (Gate 2) is required to merge the PR — separate from the generate/create approval.
- **Dry-run / Preview:** mandatory no-write preview of every external mutation (Jira issue payloads, branch name, PR metadata) before any real call.
- **Audit:** append-only trail — actor, approver, timestamp, input hash, previewed diff, resulting object id/URL — for every Jira create, branch push, and PR open.
- **Scoped permissions:** write scopes provisioned but inert until approval; the agent token is limited to `repo_slug` + branch `ai/<AWP-id>-*` and never touches protected branches.
- **Rollback / Undo:** the owner can close/decline the PR, delete the branch, and (optionally) delete generated draft Jira issues; every reversal is itself audited.

## Open Questions
- *(none — packet is `ready`)*
