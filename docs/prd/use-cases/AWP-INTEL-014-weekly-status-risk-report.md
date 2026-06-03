---
id: AWP-INTEL-014
title: AI Weekly Status & Risk Report (Jira + Bitbucket)
pillar: P3 Intelligence
phase: Development
roadmap_phase: 1
owning_agent: PM
type: read-only
status: ready
priority: P0
estimate: L
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: Jira
    object: project
    ref: <PROJECT_KEY>
    content_hash: runtime
  - system: Bitbucket
    object: repo
    ref: <workspace>/<repo-slug>
    content_hash: runtime
external_apis:
  - name: Jira Cloud REST v3
    auth: OAuth2 3LO
    scopes: [read:jira-work, read:jira-user]
  - name: Bitbucket Cloud REST 2.0
    auth: OAuth2 / app password
    scopes: [repository:read, pullrequest:read]
dependencies:
  depends_on: [AWP-INTEL-002]
  relates_to: [AWP-HUB-009, AWP-RISK-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As a delivery manager, I want an automatically generated weekly status-and-risk
report per project, so that I can see progress, stalls, and risks without
manually reconciling Jira and Bitbucket.

## Context / Background
This is the **anchor read-only packet** for Phase 1 — the headline that justifies
adoption before any write-back exists. The platform already normalizes Jira issues
and Bitbucket commits/PRs into the knowledge graph, with an issue↔commit link index
([`AWP-INTEL-002`](./AWP-INTEL-002-issue-commit-link-index.md)) keyed on Jira issue
keys found in commit messages and branch names. This packet is the **read-only
analytics + narrative pass** over that data.

Hard constraints: it **must not** write to Jira or Bitbucket — publishing the report
(to Confluence/Teams) is a separate *active* packet and is out of scope here. The
report covers a rolling window (default 7 days) ending at run time. All AI narrative
must be **grounded** in the structured fields the deterministic analysis produces —
no invented facts (see [`02`](../02-technical-foundation.md) §4).

## Data Sources & External APIs
- **Jira** (`read:jira-work`, `read:jira-user`): issues in scope = all issues in
  `<PROJECT_KEY>` updated within the window OR in a sprint overlapping the window.
  Fields: key, type, status, statusCategory, assignee, story points, sprint,
  updated, changelog (status transitions).
- **Bitbucket** (`repository:read`, `pullrequest:read`): commits and PRs in
  `<workspace>/<repo-slug>` within the window. Fields: commit hash, message, author,
  date, branch; PR id, state, source/target branch, created/updated, reviewers,
  approvals, linked issue keys.
- **Volumes:** assume ≤ 5k issues and ≤ 20k commits per window. Page all endpoints
  (Jira `maxResults=100`, Bitbucket `pagelen=100`); respect rate limits.

## Inputs
- `project_key` (required)
- `repo_slug` (required)
- `window_days` (default `7`)
- `staleness_threshold_days` (default `3`)
- `pr_idle_threshold_days` (default `2`)
- `as_of` (default = now)
- `blocked_statuses` (default `["Blocked"]`) — Jira status names that classify an otherwise in-progress issue as `blocked` (the refinement predicate; see the classification AC)
- Secrets by reference: `JIRA_OAUTH_TOKEN`, `BITBUCKET_TOKEN` (read scopes only).

## Outputs / Artifacts
A single `WeeklyReport` JSON object (plus a rendered Markdown view) containing:
- `summary`: counts of done / in-progress / todo / blocked; points completed vs. committed. The four buckets derive from Jira `statusCategory` (Done→`done`, To Do→`todo`, In Progress→`in_progress`) with a refinement: an In-Progress issue whose status name is in `blocked_statuses` is reclassified to `blocked`. The buckets are mutually exclusive and exhaustive over in-scope issues.
- `completed[]`, `in_progress[]`: `{issue_key, title, assignee, last_activity}`.
- `risks[]`: each `{kind, severity, subject_ref, evidence, recommendation}`.
- `stale_stories[]`: in-progress issues with **no linked commit** within `staleness_threshold_days`.
- `idle_prs[]`: open PRs with no update within `pr_idle_threshold_days`; each includes `days_idle`.
- `unlinked_commits[]`: commits in window with no resolvable issue key.
- `narrative`: a 5–8 sentence LLM summary grounded **only** in the structured fields above.
- `generated_at`, `window`, `inputs_echo`, `data_completeness` (% of endpoints fully paged).

## Acceptance Criteria

Scenario: Flag every in-progress story with no recent commit
  Given an issue in statusCategory "In Progress" in `project_key`
    And no commit linked to that issue key dated within `staleness_threshold_days` of `as_of`
  When the report runs
  Then that issue key appears exactly once in `stale_stories[]`
    And its `evidence` names the last linked commit date or "no linked commit ever".

Scenario: Do not flag a story that has a recent commit
  Given an in-progress issue with a linked commit dated 1 day before `as_of`
    And `staleness_threshold_days` = 3
  When the report runs
  Then that issue key does NOT appear in `stale_stories[]`.

Scenario: Idle PR detection
  Given an open PR whose last `updated_on` is older than `pr_idle_threshold_days`
  When the report runs
  Then it appears in `idle_prs[]` with `days_idle` = floor(`as_of` − `updated_on`).

Scenario: Completeness counts reconcile
  Given the report ran
  Then `summary.done + summary.in_progress + summary.todo + summary.blocked`
       equals the total in-scope issue count
    And no issue key appears in more than one of `completed[]` / `in_progress[]`.

Scenario: Four-bucket classification is exclusive and exhaustive
  Given an in-progress issue whose Jira status name is in `blocked_statuses`
  When the report runs
  Then that issue is counted in `summary.blocked` and NOT in `summary.in_progress`
    And every in-scope issue is counted in exactly one bucket
       (Jira statusCategory Done→done, To Do→todo, In Progress→in_progress,
        with `blocked_statuses` taking precedence over in_progress).

Scenario: Narrative is grounded (no hallucinated facts)
  Given the generated `narrative`
  Then every issue key, PR id, and numeric count it mentions
       exists verbatim in the structured fields of the same report.

Scenario: Strictly read-only
  Given a full run with valid write-capable credentials available
  When the report runs
  Then zero POST / PUT / PATCH / DELETE calls are made to Jira or Bitbucket
       (verified by the request log).

Scenario: Deterministic on frozen data
  Given identical inputs and a frozen data snapshot
  When the report runs twice
  Then the structured fields are byte-identical (the narrative text may differ).

## Out of Scope
- Publishing or posting the report anywhere (separate active packet, Phase 3+).
- Cross-project / portfolio rollups ([`AWP-HUB-009`](./AWP-HUB-009-project-hub.md) and portfolio analytics).
- Timeline forecasting (Phase 2).
- Editing or transitioning any Jira issue, or any other write.

## Dependencies / Linked Packets
- **depends_on** [`AWP-INTEL-002`](./AWP-INTEL-002-issue-commit-link-index.md) — the issue↔commit link index; staleness detection is impossible without it.
- **relates_to** [`AWP-HUB-009`](./AWP-HUB-009-project-hub.md) — the hub widget that renders this report; [`AWP-RISK-001`](./AWP-RISK-001-risk-engine.md) — the risk engine consumes/overlaps the `risks[]` shape.

## Non-Functional Requirements
- **Performance:** complete within 60s for a project of ≤ 5k issues / 20k commits.
- **Security/Privacy:** read-only scopes only; never log secrets; redact assignee emails in any persisted artifact per org PII policy.
- **Idempotency/Reliability:** tolerate partial source outages — set `data_completeness` < 100% and annotate affected sections rather than failing the whole report.
- **Observability:** emit per-source fetch counts, page counts, latency, and the request log used by the read-only acceptance criterion.
- **Cost:** ≤ 1 LLM call (the narrative); all structured analysis is deterministic code, not LLM.

## Verification / Test Notes
- **Fixtures:** `fixtures/jira_project_sample.json`, `fixtures/bitbucket_commits_sample.json` containing (1) an in-progress issue with a 5-day-old commit → stale; (2) one with a 1-day-old commit → not stale; (3) an idle PR (4 days); (4) a commit with no issue key → unlinked; (5) an in-progress issue whose status is in `blocked_statuses` → counted in `summary.blocked`, not `summary.in_progress`.
- **Classification AC:** assert the blocked-fixture issue lands in `summary.blocked`; assert every fixture issue is counted in exactly one bucket (sum equals count AND no issue in two buckets).
- Run the analyzer against fixtures with a frozen `as_of`; assert membership of each AC list.
- Assert the request log contains only GET verbs (read-only AC).
- **Grounding AC:** parse narrative tokens; assert the set of issue keys / PR ids / counts it mentions ⊆ structured field values.
- **Determinism AC:** run twice on the frozen snapshot; diff structured fields → must be byte-identical.

## Open Questions
- *(none — packet is `ready`)*
