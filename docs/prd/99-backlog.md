# Packet Backlog

> The master index of every AI Work Packet. All packets are now authored in [`use-cases/`](./use-cases/). **Status:** `ready` = build-ready, passes the readiness checklist · `draft` = authored but intentionally directional (Phase 6 — non-empty Open Questions pending earlier-phase validation).

**Coverage:** 42 packets · 265 Gherkin acceptance criteria · 29 read-only / 13 active-writeback · every dependency resolves · all cross-links verified.

---

## Phase 0 — Foundation & Connect *(read-only)*

| ID | Title | Pillar | Type | Pri | Status |
|----|-------|--------|------|-----|--------|
| [AWP-INT-001](./use-cases/AWP-INT-001-jira-connector.md) | Jira Connector (incremental sync + webhooks + backfill) | P1 Integration | read-only | P0 | ready |
| [AWP-INT-002](./use-cases/AWP-INT-002-bitbucket-connector.md) | Bitbucket Connector (commits, PRs, pipelines, deployments) | P1 Integration | read-only | P0 | ready |
| [AWP-INT-003](./use-cases/AWP-INT-003-confluence-connector.md) | Confluence Connector (pages, comments, BRDs) | P1 Integration | read-only | P0 | ready |
| [AWP-NORM-001](./use-cases/AWP-NORM-001-canonical-normalization.md) | Canonical Schema & Normalization | P2 Knowledge Graph | read-only | P0 | ready |
| [AWP-GRAPH-001](./use-cases/AWP-GRAPH-001-knowledge-graph-traceability.md) | Knowledge Graph Persistence & Traceability Spine | P2 Knowledge Graph | read-only | P0 | ready |
| [AWP-ER-001](./use-cases/AWP-ER-001-entity-resolution-tier01.md) | Entity Resolution — Tier 0 + Tier 1 | P2 Knowledge Graph | read-only | P0 | ready |
| [AWP-PLAT-001](./use-cases/AWP-PLAT-001-auth-rbac-tenancy.md) | Auth/SSO + RBAC + Tenant Isolation Baseline | P8 Governance | read-only | P0 | ready |
| [AWP-PLAT-002](./use-cases/AWP-PLAT-002-audit-log.md) | Immutable Audit Log Skeleton | P8 Governance | read-only | P0 | ready |

## Phase 1 — Status & Risk *(read-only · the anchor)*

| ID | Title | Pillar | Type | Pri | Status |
|----|-------|--------|------|-----|--------|
| [AWP-INTEL-002](./use-cases/AWP-INTEL-002-issue-commit-link-index.md) | Issue↔Commit Link Index | P2 Knowledge Graph | read-only | P0 | ready |
| [AWP-INTEL-014](./use-cases/AWP-INTEL-014-weekly-status-risk-report.md) | **AI Weekly Status & Risk Report** *(exemplar A)* | P3 Intelligence | read-only | P0 | ready |
| [AWP-RISK-001](./use-cases/AWP-RISK-001-risk-engine.md) | Risk Engine v1 (rule-based, cited evidence) | P3 Intelligence | read-only | P0 | ready |
| [AWP-HUB-009](./use-cases/AWP-HUB-009-project-hub.md) | Project Hub Dashboard | P3 Intelligence | read-only | P0 | ready |
| [AWP-AI-001](./use-cases/AWP-AI-001-llm-gateway.md) | LLM Gateway (Claude routing, budgets, injection isolation) | P8 Governance | read-only | P0 | ready |

## Phase 2 — Deepen & Cover *(read-only)*

| ID | Title | Pillar | Type | Pri | Status |
|----|-------|--------|------|-----|--------|
| [AWP-INT-004](./use-cases/AWP-INT-004-teams-connector.md) | Microsoft Teams Connector | P1 Integration | read-only | P1 | ready |
| [AWP-INT-005](./use-cases/AWP-INT-005-figma-connector.md) | Figma Connector | P1 Integration | read-only | P1 | ready |
| [AWP-INT-006](./use-cases/AWP-INT-006-miro-connector.md) | Miro Connector | P1 Integration | read-only | P1 | ready |
| [AWP-INT-007](./use-cases/AWP-INT-007-m365-connector.md) | Microsoft 365 Connector | P1 Integration | read-only | P1 | ready |
| [AWP-ER-002](./use-cases/AWP-ER-002-entity-resolution-tier2.md) | Entity Resolution — Tier 2 (semantic / AI) | P2 Knowledge Graph | read-only | P1 | ready |
| [AWP-MEM-001](./use-cases/AWP-MEM-001-project-memory.md) | Project Memory | P2 Knowledge Graph | read-only | P1 | ready |
| [AWP-FCST-001](./use-cases/AWP-FCST-001-timeline-forecast.md) | Timeline Forecast | P3 Intelligence | read-only | P1 | ready |
| [AWP-HEALTH-001](./use-cases/AWP-HEALTH-001-project-health-score.md) | Project Health Score | P3 Intelligence | read-only | P1 | ready |
| [AWP-AGENT-001](./use-cases/AWP-AGENT-001-business-analyst-agent.md) | Business Analyst Agent (advisory) | P4 Authoring | read-only | P1 | ready |
| [AWP-AGENT-002](./use-cases/AWP-AGENT-002-project-manager-agent.md) | Project Manager Agent (advisory) | P3 Intelligence | read-only | P1 | ready |
| [AWP-AGENT-003](./use-cases/AWP-AGENT-003-technical-lead-agent.md) | Technical Lead Agent (advisory) | P3 Intelligence | read-only | P1 | ready |
| [AWP-AGENT-004](./use-cases/AWP-AGENT-004-executive-agent.md) | Executive Agent (advisory) | P7 Portfolio | read-only | P1 | ready |
| [AWP-PORT-001](./use-cases/AWP-PORT-001-portfolio-analytics.md) | Portfolio Analytics v1 | P7 Portfolio | read-only | P1 | ready |
| [AWP-EVAL-001](./use-cases/AWP-EVAL-001-eval-harness.md) | AI Evaluation Harness | P8 Governance | read-only | P0 | ready |

## Phase 3 — First Write-Back *(active · low-risk, reversible)*

| ID | Title | Pillar | Type | Pri | Status |
|----|-------|--------|------|-----|--------|
| [AWP-WB-001](./use-cases/AWP-WB-001-guardrail-engine.md) | **Guardrail Engine** (approval · dry-run · audit · rollback · rate-limit) | P8 Governance | active-writeback | P0 | ready |
| [AWP-WB-002](./use-cases/AWP-WB-002-publish-report-confluence.md) | Publish AI Report to Confluence (approved) | P3 Intelligence | active-writeback | P1 | ready |
| [AWP-WB-003](./use-cases/AWP-WB-003-post-risk-comment-jira.md) | Post AI Summary/Risk Comment to Jira (approved) | P3 Intelligence | active-writeback | P1 | ready |
| [AWP-WB-004](./use-cases/AWP-WB-004-suggested-field-update.md) | Suggested Jira Field Update (approved, preview-diff) | P1 Integration | active-writeback | P1 | ready |

## Phase 4 — Spec Generation *(active + read-only analysis)*

| ID | Title | Pillar | Type | Pri | Status |
|----|-------|--------|------|-----|--------|
| [AWP-GEN-001](./use-cases/AWP-GEN-001-use-case-generator.md) | **AI-Ready Use-Case Generator** (the "Both" feature) | P4 Authoring | active-writeback | P1 | ready |
| [AWP-GEN-002](./use-cases/AWP-GEN-002-spec-scorer.md) | Spec Completeness & Ambiguity Scorer | P4 Authoring | read-only | P1 | ready |
| [AWP-GEN-003](./use-cases/AWP-GEN-003-drift-watcher.md) | Source-Drift Watcher & Re-baseline | P4 Authoring | read-only | P1 | ready |

## Phase 5 — Delivery Orchestration *(active · req → AI → draft PR)*

| ID | Title | Pillar | Type | Pri | Status |
|----|-------|--------|------|-----|--------|
| [AWP-ORCH-019](./use-cases/AWP-ORCH-019-orchestration-state-machine.md) | Orchestration State Machine (Temporal) | P5 Orchestration | active-writeback | P1 | ready |
| [AWP-ORCH-021](./use-cases/AWP-ORCH-021-brd-to-pr.md) | **BRD → Use Cases → AI Agent → draft PR** *(exemplar B)* | P5 Orchestration | active-writeback | P1 | ready |
| [AWP-ORCH-022](./use-cases/AWP-ORCH-022-agent-dispatch-telemetry.md) | AI Coding Agent Dispatch & Run Telemetry | P5 Orchestration | active-writeback | P1 | ready |
| [AWP-ORCH-023](./use-cases/AWP-ORCH-023-branch-scoped-sandbox.md) | Branch-Scoped Agent Sandbox | P5 Orchestration | active-writeback | P0 | ready |

## Phase 6 — Primary Workspace *(directional · `draft`, pending earlier-phase validation)*

| ID | Title | Pillar | Type | Pri | Status |
|----|-------|--------|------|-----|--------|
| [AWP-WS-001](./use-cases/AWP-WS-001-native-backlog-boards.md) | Native Backlog & Boards (author into graph first) | P6 Workspace | active-writeback | P2 | draft |
| [AWP-WS-002](./use-cases/AWP-WS-002-native-doc-editing.md) | Native Spec/Doc Editing (graph-backed) | P6 Workspace | active-writeback | P2 | draft |
| [AWP-WS-003](./use-cases/AWP-WS-003-bidirectional-sync.md) | Bidirectional Sync & Per-Object Source-of-Record | P1 Integration | active-writeback | P2 | draft |
| [AWP-WS-004](./use-cases/AWP-WS-004-in-context-collaboration.md) | In-Context Collaboration (comments, mentions, approvals) | P6 Workspace | active-writeback | P2 | draft |

---

## Status note

Every packet from the v1.1 vision is now authored. The **38 `ready` packets** (Phases 0–5) are build-ready and pass the readiness checklist. The **4 `draft` packets** (Phase 6) are intentionally directional: they carry non-empty **Open Questions** about the source-of-record flip, conflict policy, and tool-side automation — decisions that should be resolved by how the read-only core and the orchestration loop actually perform in production, not pre-committed on paper ([`01`](./01-product-architecture.md) §3, [`00`](./00-overview.md) §2). Promoting a Phase-6 packet from `draft` to `ready` means resolving its Open Questions and adding the acceptance criteria they imply.

**Suggested build order:** Phase 0 → 1 (the read-only MVP, the hard gate) → 2 → 3 (first write-back) → 4 → 5 → 6. Within a phase, follow each packet's `depends_on`.
