# The AI Work Packet Format

> This is the constitution. Every file in [`use-cases/`](./use-cases/) conforms to the template below, obeys the two authoring rules, and (if it writes to external tools) traverses the delivery state machine in §4. The format is identical whether a packet is hand-authored for this PRD or emitted by the platform's [AI-Ready Use-Case Generator](./use-cases/AWP-GEN-001-use-case-generator.md) — that is the point.

---

## 1. Physical form

**One packet = one file = one pull request.** A packet is **YAML front-matter + a Markdown body**:

- **YAML front-matter** holds *machine fields* — IDs, scopes, dependencies, state — parsed by the orchestrator and traceability engine.
- **Markdown body** holds *human-review prose* — context, acceptance criteria, verification.

Filename convention: `AWP-<AREA>-<NNN>-<kebab-title>.md` (e.g. `AWP-INTEL-014-weekly-status-risk-report.md`).

---

## 2. Field reference

### 2.1 Machine header (YAML front-matter)

| Field | Required | Purpose |
|-------|:---:|---------|
| `id` | ✅ | Stable unique key, `AWP-<AREA>-<NNN>`; the traceability anchor across all tools. |
| `title` | ✅ | One-line human-readable name of the deliverable. |
| `pillar` | ✅ | Which capability pillar it serves (P1–P8; see [`01`](./01-product-architecture.md)). |
| `phase` | ✅ | SDLC phase it operates in: Discovery / Planning / Design / Development / QA / Release. |
| `roadmap_phase` | ✅ | Delivery roadmap phase 0–6 (sequencing; see [`01`](./01-product-architecture.md) §3). |
| `owning_agent` | ⬜ | Platform agent persona that owns it (BA / PM / Tech Lead / Executive / none). |
| `type` | ✅ | `read-only` \| `active-writeback` — gates whether a Guardrails block is mandatory. |
| `status` | ✅ | Lifecycle state (§4); defaults `draft`. |
| `priority` | ✅ | `P0`–`P3` for backlog ordering. |
| `estimate` | ⬜ | Rough size (`S`/`M`/`L`) for planning. |
| `owner` | ✅ | Accountable human (email/handle) for review + approval. |
| `generated_by` | ✅ | `human` \| `use-case-generator@<version>` — provenance for audit. |
| `source_fingerprint` | cond. | Hash of all source content at generation time; drives drift detection. `n/a` if no external sources. |
| `sources[]` | ✅ | Typed source records: `system` / `object` / `ref` / `content_hash`. |
| `external_apis[]` | cond. | APIs the implementation calls, each with `auth` method + **least-privilege `scopes`**. |
| `dependencies` | ⬜ | `depends_on` (must land first) and `relates_to` (related) packet IDs. |
| `links` | ⬜ | Back-references to Jira / Confluence / Bitbucket objects once created. |

### 2.2 Human body (Markdown sections)

| Section | Required | Purpose |
|---------|:---:|---------|
| **User Story** | ✅ | `As a <role>, I want <capability>, so that <outcome>` — the intent in one sentence. |
| **Context / Background** | ✅ | Why this exists; the decisions/constraints an implementer would otherwise have to guess. |
| **Data Sources & External APIs** | ✅ | Concrete systems, objects, endpoints, **auth + scopes**, volumes/rate limits. |
| **Inputs** | ✅ | Exact runtime inputs: parameters (with defaults), config, secrets (by reference), triggering event. |
| **Outputs / Artifacts** | ✅ | Exact deliverables: files, endpoints, records written, schema, report shape. |
| **Acceptance Criteria** | ✅ | Checkable `Given/When/Then` scenarios — the definition of done (Rule 1). |
| **Out of Scope** | ✅ | Explicit non-goals, to stop the agent over-building. |
| **Dependencies / Linked Packets** | ⬜ | Narrative of upstream/downstream packets and why. |
| **Non-Functional Requirements** | ✅ | Performance, security/privacy, idempotency/reliability, observability, cost. |
| **Verification / Test Notes** | ✅ | How to prove each AC: fixtures, mocks, commands, manual checks. |
| **Guardrails** | cond. | **Mandatory iff `type: active-writeback`.** The five controls (Rule 2). |
| **Open Questions** | ⬜ | Unresolved decisions; a non-empty list blocks `ready` status. |

---

## 3. The two authoring rules

These are what make a packet *AI-consumable* rather than merely descriptive. A packet that breaks either rule is not `ready`.

### Rule 1 — Every acceptance criterion is falsifiable
Each AC is a Gherkin `Given/When/Then` scenario whose `Then` names a **concrete observable**: a count, a field value, an HTTP status, a row in a table, a flagged item, a request-log assertion.

- **Banned:** "works well", "is fast", "handles errors gracefully", "looks good".
- **Required:** a machine-checkable or 30-second-manual-checkable result.
- Numbers that vary become **named `Inputs`** (e.g. `staleness_threshold_days`) and are referenced by name in the AC — never hard-coded into prose.
- **Derived enums:** when an output has *more* categories than its source natively provides (e.g. a `blocked` bucket that Jira's three-value `statusCategory` doesn't expose), specify the **refinement predicate** as a named Input and assert the categories are mutually exclusive *and* exhaustive. A "counts sum correctly" AC alone is insufficient — it lets two implementers bucket the same item differently and both pass.

> *Why:* an AI implementer treats acceptance criteria as its test target. "Works well" gives it nothing to verify against; "every in-progress story with no commit in `staleness_threshold_days` appears exactly once in `stale_stories[]`" lets it self-check and stop guessing.

### Rule 2 — Every active packet carries the five guardrail controls
If `type: active-writeback`, the **Guardrails** section must be non-empty and specify all five:

1. **Approval** — who approves, what they see, default-deny when no approver.
2. **Dry-run / Preview** — a no-write preview of the *exact* mutation (diff/payload) before any real write.
3. **Audit** — the append-only record written for every external write (who, what, when, inputs, diff, approval, outcome).
4. **Scoped permissions** — least-privilege token, named scopes, and the explicit target allow-list (repos/spaces/projects).
5. **Rollback / Undo** — how a bad write is reverted (close/decline PR, delete draft, restore prior field value).

> *Why:* a wrong read is a wrong dashboard; a wrong write is a corrupted ticket or a bad PR in a real repo. The guardrails make every active behavior previewable, approved, audited, scoped, and reversible — see [`02`](./02-technical-foundation.md) §3 and [`AWP-WB-001`](./use-cases/AWP-WB-001-guardrail-engine.md).

---

## 4. The delivery state machine (req → AI-implementation → PR)

Every `active-writeback` packet that goes through the orchestration loop traverses these states. One packet = one correlation id across all states. Specced in [`AWP-ORCH-019`](./use-cases/AWP-ORCH-019-orchestration-state-machine.md).

### 4.1 States
| State | Meaning |
|-------|---------|
| `draft` | Authored/generated, not yet validated. |
| `ready` | Passes the readiness checklist; no open questions; awaiting human go. |
| `awaiting_approval` | **Human Gate 1** — approve creation/publish + proceed. |
| `approved` | Approved; linked Jira issues created / packet published (preview-then-write done). |
| `dispatched` | Handed to the AI coding agent in a branch-scoped sandbox. |
| `implementing` | Agent is writing code in the isolated worktree/branch. |
| `pr_open` | Agent opened a **draft** PR; awaiting human review. |
| `awaiting_pr_approval` | **Human Gate 2** — review the PR (*the platform never merges*). |
| `merged` | Human merged the PR (terminal success; closes Requirement → PR → Release traceability). |
| `rejected` | Human declined at either gate; reversal performed + audited. |
| `drifted` | A source changed after generation; needs regenerate / re-baseline / dismiss. |
| `failed` | Agent or write error; recoverable, no orphaned external writes. |

### 4.2 Transitions
```
draft ──validate──▶ ready ──submit──▶ awaiting_approval
awaiting_approval ──approve(GATE 1)──▶ approved      [Jira create/publish: preview→write→audit]
awaiting_approval ──reject───────────▶ rejected      [no writes; audited]
approved ──dispatch──▶ dispatched ──start──▶ implementing
implementing ──agent_opens_draft_PR──▶ pr_open ──request_review──▶ awaiting_pr_approval
awaiting_pr_approval ──approve(GATE 2)+human_merge──▶ merged   [audited]
awaiting_pr_approval ──reject──▶ rejected            [close PR + delete branch; audited]
implementing ──error──▶ failed ──retry──▶ implementing | ──abort──▶ rejected
(any post-generation state) ──source_changed──▶ drifted
drifted ──regenerate──▶ draft | ──accept_current──▶ (prior state) | ──dismiss──▶ (prior state)
```

### 4.3 Exactly two human gates
- **Gate 1 — `awaiting_approval`:** approve creating linked Jira issues / publishing, and entry into implementation. Default-deny; approver sees the dry-run preview (Jira payloads, branch name, PR target).
- **Gate 2 — `awaiting_pr_approval`:** review the draft PR; **the human performs the merge** — the platform/agent never merges. Reject closes the PR and deletes the branch.
- *Optional* Gate 0 (org-configurable): approve which generated packets enter `ready` at all.

### 4.4 Safety invariants (hold across the whole loop)
1. **No external write without a recorded approval** for that write class.
2. **Preview-then-write** — every mutation has a no-write dry-run first.
3. **PR-only, never merge** — the loop opens draft PRs; humans merge.
4. **Branch-scoped agent** — the agent writes only inside `ai/<AWP-id>-*`, only in the target repo.
5. **Reversible** — every external write has a defined, audited undo.
6. **Idempotent** — same `source_fingerprint` + no approval ⇒ no-op; re-dispatch reuses the existing branch/PR.

---

## 5. Readiness checklist (the "packet linter")

A packet is `ready` only if **all** hold. This is the manual lint we apply to every authored packet (and the spec the generator self-scores against):

- [ ] Has `id`, `title`, `pillar`, `phase`, `roadmap_phase`, `type`, `status`, `priority`, `owner`, `generated_by`.
- [ ] Has ≥1 resolvable `sources[]` entry (or explicit `n/a` with justification in Context).
- [ ] Every `external_apis[]` entry names its `auth` and least-privilege `scopes`.
- [ ] **Every** acceptance criterion is `Given/When/Then` with a concrete observable; zero banned vague terms (Rule 1).
- [ ] Variable numbers appear as named `Inputs`, not hard-coded in ACs.
- [ ] `Out of Scope` is non-empty.
- [ ] `Verification / Test Notes` explains how to prove each AC.
- [ ] If `type: active-writeback`: a non-empty **Guardrails** block with all five controls (Rule 2).
- [ ] `Open Questions` is empty (any open question keeps it in `draft`).
- [ ] Every `depends_on` id exists as an authored packet or a backlog stub.
