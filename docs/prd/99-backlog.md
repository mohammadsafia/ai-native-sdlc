# Packet Backlog

> The master index of every planned AI Work Packet. **Authored** packets are fully specified in [`use-cases/`](./use-cases/). **Stub** packets are named and scoped here; they get expanded into full packets in later passes (typically by the [AI-Ready Use-Case Generator](./use-cases/AWP-GEN-001-use-case-generator.md) once it exists, or by hand). This index is the dependency-resolution source of truth: a packet may `depends_on` any id listed here.

**Status legend:** `ready` = fully authored, passes the readiness checklist · `planned` = stub, not yet authored.

---

## Authored packets (17)

The first execution pass authored these in full — the high-fidelity buildable core (Phases 0–1) plus full-fidelity representatives of the active phases (3–5) to prove the format end to end.

### Phase 0 — Foundation & Connect *(read-only)*

| ID | Title | Pillar | Type | Pri | Status |
|----|-------|--------|------|-----|--------|
| [AWP-INT-001](./use-cases/AWP-INT-001-jira-connector.md) | Jira Connector (incremental sync + webhooks + backfill) | P1 Integration | read-only | P0 | ready |
| [AWP-INT-002](./use-cases/AWP-INT-002-bitbucket-connector.md) | Bitbucket Connector (commits, PRs, pipelines, deployments) | P1 Integration | read-only | P0 | ready |
| [AWP-INT-003](./use-cases/AWP-INT-003-confluence-connector.md) | Confluence Connector (pages, comments, BRDs) | P1 Integration | read-only | P0 | ready |
| [AWP-NORM-001](./use-cases/AWP-NORM-001-canonical-normalization.md) | Canonical Schema & Normalization (Artifact/Event/Relationship/Actor) | P2 Knowledge Graph | read-only | P0 | ready |
| [AWP-GRAPH-001](./use-cases/AWP-GRAPH-001-knowledge-graph-traceability.md) | Knowledge Graph Persistence & Traceability Spine | P2 Knowledge Graph | read-only | P0 | ready |
| [AWP-ER-001](./use-cases/AWP-ER-001-entity-resolution-tier01.md) | Entity Resolution — Tier 0 (deterministic) + Tier 1 (heuristic) | P2 Knowledge Graph | read-only | P0 | ready |
| [AWP-PLAT-001](./use-cases/AWP-PLAT-001-auth-rbac-tenancy.md) | Auth/SSO + RBAC + Tenant Isolation Baseline | P8 Governance | read-only | P0 | ready |
| [AWP-PLAT-002](./use-cases/AWP-PLAT-002-audit-log.md) | Immutable Audit Log Skeleton | P8 Governance | read-only | P0 | ready |

### Phase 1 — Status & Risk *(read-only · the anchor)*

| ID | Title | Pillar | Type | Pri | Status |
|----|-------|--------|------|-----|--------|
| [AWP-INTEL-002](./use-cases/AWP-INTEL-002-issue-commit-link-index.md) | Issue↔Commit Link Index | P2 Knowledge Graph | read-only | P0 | ready |
| [AWP-INTEL-014](./use-cases/AWP-INTEL-014-weekly-status-risk-report.md) | **AI Weekly Status & Risk Report** *(exemplar A)* | P3 Intelligence | read-only | P0 | ready |
| [AWP-RISK-001](./use-cases/AWP-RISK-001-risk-engine.md) | Risk Engine v1 (rule-based, cited evidence) | P3 Intelligence | read-only | P0 | ready |
| [AWP-HUB-009](./use-cases/AWP-HUB-009-project-hub.md) | Project Hub Dashboard | P3 Intelligence | read-only | P0 | ready |
| [AWP-AI-001](./use-cases/AWP-AI-001-llm-gateway.md) | LLM Gateway (Claude routing, token budgets, injection isolation) | P8 Governance | read-only | P0 | ready |

### Phases 3–5 — Active write-back & orchestration *(full-fidelity representatives)*

| ID | Title | Pillar | Phase | Type | Pri | Status |
|----|-------|--------|:---:|------|-----|--------|
| [AWP-WB-001](./use-cases/AWP-WB-001-guardrail-engine.md) | Guardrail Engine (approval · dry-run · audit · rollback · rate-limit) | P8 Governance | 3 | active-writeback | P0 | ready |
| [AWP-GEN-001](./use-cases/AWP-GEN-001-use-case-generator.md) | **AI-Ready Use-Case Generator** (the "Both" feature) | P4 Authoring | 4 | active-writeback | P1 | ready |
| [AWP-ORCH-019](./use-cases/AWP-ORCH-019-orchestration-state-machine.md) | Orchestration State Machine (Temporal) | P5 Orchestration | 5 | active-writeback | P1 | ready |
| [AWP-ORCH-021](./use-cases/AWP-ORCH-021-brd-to-pr.md) | **BRD → Use Cases → AI Agent → draft PR** *(exemplar B)* | P5 Orchestration | 5 | active-writeback | P1 | ready |

---

## Stub packets (planned)

Named and scoped, not yet authored. IDs are reserved so authored packets can declare dependencies on them today. Most are deliberately lower-fidelity until the phase that needs them.

### Phase 2 — Deepen & Cover *(read-only)*

| ID | Title | Pillar | Notes |
|----|-------|--------|-------|
| `AWP-INT-004` | Microsoft Teams Connector (channels, threads, decisions) | P1 Integration | High prompt-injection-risk source; read-only is the safe place to onboard it ([`02`](./02-technical-foundation.md) §4). |
| `AWP-INT-005` | Figma Connector (files, frames, design links) | P1 Integration | Feeds Design-phase intelligence and the generator. |
| `AWP-INT-006` | Miro Connector (boards, flows, sticky clusters) | P1 Integration | Discovery-phase artifacts. |
| `AWP-INT-007` | Microsoft 365 Connector (Word/Excel/PDF planning docs) | P1 Integration | Optional context for the generator. |
| `AWP-ER-002` | Entity Resolution — Tier 2 (semantic/AI matching) | P2 Knowledge Graph | Embed → block → Claude adjudicates a small candidate set with cited evidence; links surfaced as **suggestions**, human-confirmed. |
| `AWP-FCST-001` | Timeline Forecast (velocity + sprint history + blockers + scope) | P3 Intelligence | Present as decision-support with error bands; gate exit on accuracy vs. actuals. |
| `AWP-MEM-001` | Project Memory (decisions, assumptions, risks, constraints, lessons) | P2 Knowledge Graph | Persistent context store feeding agents and the hub. |
| `AWP-HEALTH-001` | Project Health Score (scope/timeline/velocity/tech-risk composite) | P3 Intelligence | Composite of existing signals; always show inputs/evidence. |
| `AWP-AGENT-001` | Business Analyst Agent (advisory) | P4 Authoring | Confluence/Miro/Teams; extract requirements, find gaps/contradictions. |
| `AWP-AGENT-002` | Project Manager Agent (advisory) | P3 Intelligence | Jira/Teams; progress, delay prediction. |
| `AWP-AGENT-003` | Technical Lead Agent (advisory) | P3 Intelligence | Bitbucket/Jira; architecture/PR risk. |
| `AWP-AGENT-004` | Executive Agent (advisory) | P7 Portfolio | Cross-system portfolio insight. |
| `AWP-EVAL-001` | AI Evaluation Harness (golden sets per capability) | P8 Governance | Extraction accuracy, ER precision/recall, summary faithfulness, forecast error; regression-test on every model/prompt change. |
| `AWP-PORT-001` | Portfolio Analytics v1 (cross-project health & risk heatmap) | P7 Portfolio | Roll the per-project twin up to leadership. |

### Phase 3 — First Write-Back *(active, low-risk reversible)*

| ID | Title | Pillar | Notes |
|----|-------|--------|-------|
| `AWP-WB-002` | Publish AI Report to Confluence (approved) | P3 Intelligence | First reversible write; rides the full guardrail stack. |
| `AWP-WB-003` | Post AI Summary/Risk Comment to Jira (approved) | P3 Intelligence | Reversible (deletable comment); human-approved. |
| `AWP-WB-004` | Suggested Jira Field Update (approved, preview-diff) | P1 Integration | Field before/after preview; rollback restores prior value. |

### Phase 4–5 — Generation & Delivery loop *(active)*

| ID | Title | Pillar | Notes |
|----|-------|--------|-------|
| `AWP-GEN-002` | Spec Completeness & Ambiguity Scorer | P4 Authoring | The self-score the generator runs; also a standalone gate. |
| `AWP-GEN-003` | Source-Drift Watcher & Re-baseline | P4 Authoring | Re-hash sources on webhook/poll; flip dependent packets to `drifted` with a change diff. |
| `AWP-ORCH-022` | AI Coding Agent Dispatch & Run Telemetry | P5 Orchestration | Cost/latency/success/intervention per dispatch; per-dispatch caps + kill switch. |
| `AWP-ORCH-023` | Branch-Scoped Agent Sandbox | P5 Orchestration | Worktree limited to `ai/<AWP-id>-*` in the target repo; PR-only. |

### Phase 6 — Primary Workspace *(directional / lower-fidelity)*

| ID | Title | Pillar | Notes |
|----|-------|--------|-------|
| `AWP-WS-001` | Native Backlog & Boards (author into graph first) | P6 Workspace | Sync to Jira as a secondary target. |
| `AWP-WS-002` | Native Spec/Doc Editing (graph-backed) | P6 Workspace | Confluence-class authoring; graph is source of record. |
| `AWP-WS-003` | Bidirectional Sync & Per-Object Source-of-Record | P1 Integration | The conflict/arbitration engine that makes legacy tools mirrors. |
| `AWP-WS-004` | In-Context Collaboration (comments, mentions, approvals) | P6 Workspace | Not a full Teams replacement; decision capture into the graph. |

---

## Coverage note (no silent caps)

This first pass authored **17 of ~41** identified packets in full. The remaining **~24 are stubs** above, deliberately deferred — Phase-2+ packets firm up as the read-only core proves out, and the Phase-6 workspace packets stay directional until the orchestration loop earns trust ([`01`](./01-product-architecture.md) §3). Nothing from the v1.1 vision was dropped; everything is either authored or stubbed with a reserved ID.
