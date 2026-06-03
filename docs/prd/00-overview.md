# AI-Native SDLC Platform — Product Requirements Document

**Version:** 2.0 (supersedes `AI-Native-SDLC-Platform-Vision-v1.1.md`)
**Status:** Draft for review
**Owner:** mohammadsafia17@gmail.com

---

## 1. What this document is

This is a **use-case-driven PRD**. Its unit of work is the **AI Work Packet** — a self-contained specification (one file = one packet = one pull request) written so that a developer *and their AI coding assistant* can implement it with minimal external context.

It is two things at once:

1. **The build spec for the platform.** Each packet in [`use-cases/`](./use-cases/) describes one buildable slice of the platform.
2. **A live test fixture for one of the platform's own features.** The platform ships an *AI-Ready Use-Case Generator* ([`AWP-GEN-001`](./use-cases/AWP-GEN-001-use-case-generator.md)) that emits packets in this exact format for the org's own developers. Every packet we hand-author here is therefore a worked example of what that feature must produce. The bar is the same for both: *could a fresh AI coding agent implement this packet without asking a blocking question?*

> **How to read this PRD:** Start here, then [`01-product-architecture.md`](./01-product-architecture.md) for the capability map and phased roadmap, [`02-technical-foundation.md`](./02-technical-foundation.md) for the architecture and the hard risks, and [`03-work-packet-format.md`](./03-work-packet-format.md) for the packet format and the delivery state machine. Then read [`use-cases/AWP-INTEL-014`](./use-cases/AWP-INTEL-014-weekly-status-risk-report.md) (a read-only exemplar) and [`use-cases/AWP-ORCH-021`](./use-cases/AWP-ORCH-021-brd-to-pr.md) (an active write-back exemplar) to see the format fully worked. [`99-backlog.md`](./99-backlog.md) indexes every planned packet.

---

## 2. Scope reality (read this before estimating anything)

The full vision is a **multi-year, multi-team program** — order of magnitude **2–3+ years**, scaling toward **20–40 engineers** across connector, data-platform, entity-resolution, AI/agents, workspace, and security pods.

The **credible near-term deliverable** is much smaller: a **read-only intelligence MVP** (Jira + Bitbucket + Confluence → knowledge graph → Project Hub + AI Weekly Status & Risk Report), order of magnitude **6–9 months** with a focused team of **6–10**.

This PRD documents the **whole** vision so the architecture is coherent end to end — but it deliberately authors the **read-only phases in high fidelity** (build-ready packets) and keeps the **write-back and workspace-ownership phases lower fidelity** (directional packets, expanded only as earlier phases earn trust). The phrase "becomes the primary workspace" is a **north star, not a date**.

The single most important sequencing decision in this document: **the platform stays strictly read-only until the Phase 1 intelligence outputs are trusted by real teams.** Crossing from reading tools to *writing back* to them changes the risk profile entirely, and we do not cross it until we have earned the right.

---

## 3. The problem

Project intelligence today is fragmented across the tools where work actually happens:

| Information | Lives in |
|-------------|----------|
| Requirements | Confluence, Miro |
| Tasks & delivery status | Jira |
| Code, reviews, deploys | Bitbucket |
| Decisions & blockers | Microsoft Teams |
| Designs | Figma |
| Contracts & planning docs | Microsoft 365 |

The consequences are familiar: no single source of truth, manual status reporting, hidden risks surfaced too late, poor traceability from idea to delivery, slow decisions, and knowledge that evaporates between tools. No human can hold the whole picture, and the picture changes hourly.

---

## 4. The solution in one paragraph

A platform that **ingests** the org's existing tools into a normalized **knowledge graph** (a continuously-updated "digital twin" of every project), **reasons** over that graph with AI to surface health, risk, forecasts, traceability, and narrative reports, then — only after that intelligence is trusted — **acts**: authoring AI-ready specs, dispatching them to AI coding agents, and managing a requirement → implementation → reviewed-PR loop with human approval at every external write. Over time it absorbs more of the workflow until the legacy tools become governed, secondary sync targets. It begins by *understanding* your delivery; at maturity it helps *run* it.

---

## 5. Relationship to the v1.1 vision

The v1.1 vision doc established a **read-only "Project Intelligence Layer"** under a strict principle: *"Do not duplicate tools. Understand them."*

This PRD **preserves that principle for the early phases** — Phases 0–2 are purely read-only and add no workflow ownership — but **deliberately supersedes it in later phases**, where the platform authors artifacts, writes back to tools, and eventually owns parts of the workflow. This is not a contradiction; it is the **strangler-fig** adoption pattern (§ [`01`](./01-product-architecture.md)): start as a layer *over* the tools, prove value, then progressively absorb workflow only where each step ships standalone value behind first-class guardrails. Every place this PRD reverses "don't duplicate tools," it is doing so consciously and phased.

---

## 6. Glossary

| Term | Meaning |
|------|---------|
| **AI Work Packet (AWP)** | The unit of this PRD and of the platform's generator: a self-contained, AI-implementable spec. One file = one packet = one PR. See [`03`](./03-work-packet-format.md). |
| **Digital twin** | The continuously-updated knowledge-graph model of a project: artifacts, events, relationships, and their history. |
| **Entity resolution (ER)** | Deciding that an artifact in one tool (Jira story `PROJ-123`) is the *same unit of work* as artifacts in others (the PR that closes it, the BRD section, the Teams thread). The make-or-break data problem. See [`02`](./02-technical-foundation.md). |
| **Traceability spine** | The deterministic link chain `Requirement → Epic → Story → Task → PR → Deployment → Release`. |
| **Read-only vs. active-writeback** | A packet's `type`. Read-only packets never mutate external tools. Active packets do, and must carry the five guardrail controls. |
| **The two gates** | The two human approval points in the delivery loop: **Gate 1** (approve creation/dispatch) and **Gate 2** (review the draft PR; *the human merges* — the platform never auto-merges). |
| **Strangler fig** | The adoption model: read-only over existing tools → gated write-back → owns whole flows; each step ships value alone. |
| **Pillar** | One of the eight capability areas the platform is organized into. See [`01`](./01-product-architecture.md). |
| **Roadmap phase** | Phase 0–6 on the delivery roadmap. A packet declares the phase it belongs to. |

---

## 7. Document map

```
docs/prd/
  EXECUTIVE-SUMMARY.md          one-page stakeholder summary (value · phasing · the ask)
  CONCEPT-DIAGRAM.md            the idea in two diagrams (how it works · how it rolls out)
  00-overview.md                ← you are here
  01-product-architecture.md    capability pillars · phased roadmap · success metrics · product risks
  02-technical-foundation.md    reference architecture · entity resolution · guardrails · security · build realism
  03-work-packet-format.md      the AWP template · authoring rules · the req→impl→PR state machine
  use-cases/
    _TEMPLATE.md                blank packet skeleton (copy to start a new packet)
    AWP-INTEL-014-…             exemplar A — read-only (Weekly Status & Risk Report)
    AWP-ORCH-021-…              exemplar B — active write-back (BRD → draft PR)
    AWP-*                       all 42 packets, authored in full (Phases 0–6)
  99-backlog.md                 index of every packet by phase, with suggested build order
```
