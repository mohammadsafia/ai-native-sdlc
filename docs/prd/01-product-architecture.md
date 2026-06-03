# Product Architecture

> Read [`00-overview.md`](./00-overview.md) first. This document defines **what** the platform is (capability pillars), **in what order** it gets built (phased roadmap), **how we know it's working** (success metrics), and **what could kill it** (product risks).

---

## 1. Positioning

At full maturity, the platform is the **AI-native control plane for the entire software delivery lifecycle**. It begins as an intelligence layer that reads an org's existing tools (Teams, Jira, Bitbucket, Confluence, Figma, Miro, M365) into a unified project knowledge graph, and progressively becomes the **primary workspace where teams define, plan, and build** — authoring AI-ready specs, dispatching them to AI coding agents, and orchestrating the requirement → AI-implementation → reviewed-PR loop, with the legacy tools demoted to governed, bidirectionally-synced targets.

In one line: **it understands your delivery, then helps run it.**

---

## 2. Capability pillars

The platform is organized into eight pillars. Every packet in [`use-cases/`](./use-cases/) declares the pillar it serves.

### P1 — Integration & Ingestion Fabric
*The connective tissue every other pillar depends on.*
- Inbound connectors: Jira, Bitbucket, Confluence, Teams, Figma, Miro, M365 — incremental sync, webhooks, backfill.
- Outbound write-back adapters (create/update issues, comments, pages, PRs) — **inert until Phase 3**, gated through P8.
- Sync engine: idempotency, conflict detection, per-field source-of-record arbitration.
- Connector health & rate-limit governance: observability over staleness, drift, and quota.

### P2 — Knowledge Graph & Traceability
*The normalized digital twin — one canonical model of every artifact and the links between them.*
- Entity normalization: Requirement, Epic, Story, Task, PR, Deployment, Release, Decision, Design, Person, Sprint.
- Traceability spine: `Requirement → Epic → Story → Task → PR → Deployment → Release`, with orphan/coverage detection.
- Cross-tool **entity resolution** (the crux — see [`02`](./02-technical-foundation.md)).
- Temporal/event log: point-in-time replay, "what did we know when."

### P3 — Intelligence, Forecasting & Risk
*Turns the graph into decisions — the read-only headline value that justifies adoption.*
- Project Health Score (scope / timeline / velocity / technical-risk composite).
- Timeline Forecast (velocity + sprint history + blockers + scope changes).
- Risk Engine (delivery, technical, dependency, scope-creep, resource-overload).
- Narrative generation: AI Weekly Status & Risk Report, decision/assumption extraction, contradiction detection.

### P4 — AI Artifact Authoring (incl. the AI-Ready Use-Case Generator)
*Generates structured, machine-consumable delivery artifacts — the first-class spec-generation feature.*
- **AI-Ready Use-Case / Spec Generator**: emit implementation-ready packets (acceptance criteria, interfaces, constraints, context) sized for downstream AI coding tools.
- Upstream authoring: BRD drafting from Miro/Confluence/Teams, epic & story generation, effort estimation.
- Context packaging: bundle relevant graph slices (designs, prior decisions, related code) into each spec.
- Quality gates: completeness/ambiguity scoring; human review before a spec is "dispatchable."

### P5 — AI Delivery Orchestration
*Closes the loop from approved spec to reviewed PR by dispatching and supervising AI coding agents.*
- Dispatch & routing: send packets to coding agents; track agent runs as first-class entities.
- Implementation loop: spec → branch → AI implementation → draft PR → review → iterate.
- Write-back with approval: open PRs / update tickets only after human sign-off; preview diffs before commit.
- Run telemetry: cost, latency, success rate, human-intervention rate per dispatch.

### P6 — Workspace & Collaboration Surface
*The "do the work here" layer that reverses "don't duplicate tools" — later, lower-fidelity.*
- Native planning surface: backlog, boards, sprint planning that author into the graph first, sync to Jira second.
- Native docs/spec editing with the graph as backing store.
- In-context collaboration: comments, mentions, approvals, decision capture.
- Bidirectional sync posture: legacy tools become secondary targets; explicit per-object source-of-record.

### P7 — Management & Portfolio Analytics
*Rolls the per-project twin up to org-level decision support.*
- Portfolio dashboard: cross-project health, risk heatmap, delivery throughput.
- Executive views & rollups; trend lines; forecast vs. actual.
- Resource & dependency analytics: cross-team load, shared-dependency risk, bottlenecks.
- Custom/scheduled reporting: subscribable leadership digests.

### P8 — Admin, Governance, Security & Guardrails
*Makes every active/write-back behavior safe, auditable, and scoped — a first-class pillar, not an afterthought.*
- Human-in-the-loop approval engine: required for every outbound write; configurable policies.
- Dry-run / preview: show the exact mutation before it executes, everywhere.
- Full audit trail: immutable log of every AI action, dispatch, write-back, and approval.
- Scoped permissions & tenancy: per-tool / per-project / per-action scopes, SSO, data residency, secrets.

---

## 3. Phased delivery roadmap (strangler fig)

Tool-ownership ladder: **READ-ONLY → WRITE-BACK (gated) → OWNS FLOW.**

Phases 0–2 are read-only and **high-fidelity** (the buildable core). Phase 3 is the deliberate read→write boundary. Phases 4–5 add generative/orchestration value. Phase 6 is **directional / lower-fidelity** — included for completeness, firmed up only after the loop earns trust.

| Phase | Theme | Ownership | What ships | Entry → Exit gate |
|-------|-------|-----------|------------|-------------------|
| **0** Foundation & Connect | Stand up fabric + twin | READ-ONLY | Jira + Bitbucket + Confluence connectors; canonical schema; graph store; **Tier 0/1 entity resolution only**; auth/RBAC/tenancy baseline; audit-log skeleton | **Entry:** sandbox tenants for the 3 tools. **Exit:** ≥3 real projects ingested; traceability resolves end-to-end where IDs exist (measured orphan rate); sync freshness < target (e.g. <15 min). |
| **1** Status & Risk *(anchor)* | Headline insight, zero writes | READ-ONLY | Project Health Score; Risk Engine v1; AI Weekly Status & Risk Report; Project Hub dashboard | **Entry:** Phase 0 exit met. **Exit:** weekly report adopted by ≥N pilot teams; health/risk validated against PM ground truth at target precision. **This is the hard gate before any write capability is enabled.** |
| **2** Deepen & Cover | Forecasting, memory, full read coverage | READ-ONLY | Timeline Forecast; Project Memory; Teams + Figma + Miro + M365 connectors; the 4 agents (BA/PM/Tech Lead/Exec) in **advisory** mode; portfolio analytics v1; **Tier-2 AI matching as *suggestions***; eval harness | **Entry:** Phase 1 adoption gate passed. **Exit:** forecast within target error band over ≥1 quarter; all 7 tools ingesting; portfolio view live for leadership. |
| **3** First Write-Back | Cross read→write safely | WRITE-BACK | Guardrail engine GA (approval + dry-run + audit for writes); **low-risk reversible writes only** — AI-drafted comments, report-publish to Confluence, suggested Jira field updates — each human-approved | **Entry:** Phase 1 gate + guardrail security review. **Exit:** 100% of writes previewed+approved+audited; zero unapproved mutations; rollback verified; approver-trust survey above threshold. |
| **4** Spec Generation | Ship the generator feature | WRITE-BACK | **AI-Ready Use-Case Generator**; completeness/ambiguity scoring; context packaging from the graph; drift detection; export/handoff to teams' own AI tools; packets persisted as linked graph entities | **Entry:** Phase 3 exit; authoring quality gates defined. **Exit:** generated specs accepted as-is or with minor edits at target rate; specs traceably linked Requirement→Spec; developer NPS above threshold. |
| **5** Delivery Orchestration | req → AI → PR | WRITE-BACK / owns loop | Dispatch to AI coding agents; run tracking; spec→branch→**draft PR** loop with human-approved write-back to Bitbucket/Jira; dispatch telemetry | **Entry:** Phase 4 spec bar met; guardrails proven on code-affecting writes. **Exit:** meaningful share of eligible stories delivered via the loop with human-approved PRs merged; intervention rate trending down. |
| **6** Primary Workspace *(directional)* | Teams build in-platform | OWNS FLOW | *(lower-fidelity)* native backlog/boards/sprint planning authoring into the graph first; native spec/doc editing; in-context collaboration & approvals; per-object source-of-record flip with bidirectional sync to Jira/Confluence as mirrors | **Entry:** orchestration loop trusted in production; sync conflict handling hardened. **Exit (directional):** pilot teams run primary planning in-platform ≥1 quarter with legacy tools as mirrors; sync conflict rate in tolerance. |

> **Phasing rule of thumb:** never build a later phase's hard parts to ship an earlier phase. Phase 0 ships traceability *only where deterministic IDs exist* — it does **not** wait on Tier-2 AI matching (Phase 2). Phase 1 ships intelligence on top of whatever graph Phase 0 produced. Each phase is independently valuable.

---

## 4. Success metrics

The handful that matter, tied to phases:

| Metric | Definition | Phases |
|--------|------------|--------|
| **Time-to-Insight** | Manual status-reporting hours eliminated per team / week | 1–2 |
| **Risk Lead Time** | Days a risk is surfaced *before* it materializes (forecast vs. actual) | 1–3 |
| **Traceability Coverage** | % of artifacts with a complete Requirement→…→Release chain (inverse of orphan rate) | 0–2 |
| **Write Safety** | % of outbound writes previewed + approved + audited (target 100%); unapproved mutations (target 0) | 3+ |
| **Spec Acceptance Rate** | % of generated AI-ready specs developers use as-is or with minor edits | 4 |
| **Loop Throughput** | % of eligible stories delivered via the orchestrated loop with merged human-approved PRs; intervention rate | 5 |
| **Workspace Primacy** | % of planning activity originating in-platform vs. legacy tools | 6 |

---

## 5. Top product risks

| # | Risk | Mitigation |
|---|------|-----------|
| 1 | **Garbage-in graph** — messy source data corrupts every downstream output. | Confidence-scored entity resolution + visible data-quality/staleness indicators; degrade gracefully, never fabricate. ([`02`](./02-technical-foundation.md) §2) |
| 2 | **Trust collapse on first bad write** — one wrong autonomous mutation kills adoption. | Make Phase 1 the hard gate; every write dry-run + human-approved + audited + reversible before scope widens. |
| 3 | **Forecast/risk credibility** — inaccurate scores get ignored or breed false confidence. | Validate against PM ground truth; publish error bands; show inputs/evidence; gate Phase-2 exit on accuracy. |
| 4 | **Spec quality ceiling** — low-quality AI specs poison developers' AI coding tools. | Completeness/ambiguity scoring + mandatory human review before a spec is dispatchable. |
| 5 | **Orchestration runaway** — AI coding agents cost/loop/produce unreviewed code at scale. | Per-dispatch cost/iteration caps; human-approved PR creation; full run telemetry; kill switch. |
| 6 | **Bidirectional sync conflicts** — dual source-of-record causes drift/data loss. | Explicit per-object source-of-record; idempotent sync; conflict detection + surfaced resolution; flip ownership only per phase. |
| 7 | **Scope / big-bang failure** — "full platform" tempts a monolithic build. | Enforce strangler phasing; each phase ships standalone value with concrete entry/exit gates. |
| 8 | **Connector fragility & lock-in** — 7 external APIs, rate limits, breaking changes. | Adapter abstraction + connector health observability + rate-limit governance; isolate vendor changes behind the fabric. |
