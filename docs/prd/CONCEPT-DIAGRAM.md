# The Idea, in Two Diagrams

> Visual companions to the [Executive Summary](./EXECUTIVE-SUMMARY.md) and [Overview](./00-overview.md). Both render natively on GitHub and in most IDE markdown previews.

---

## 1. How it works — tools → digital twin → value

The platform ingests your existing tools (read-only), normalizes them into a **knowledge graph / digital twin**, and reasons over it with AI to produce **intelligence** (read-only) and, when trusted, **action** (gated). Every write back to a tool passes through human approval, preview, audit, and rollback — that is the dotted return arrow.

```mermaid
flowchart TB
  subgraph SRC["Your existing tools — source of truth"]
    direction LR
    J(Jira)
    B(Bitbucket)
    C(Confluence)
    T(Teams)
    F(Figma)
    M(Miro)
    O(M365)
  end

  SRC -->|"① ingest · read-only"| NORM["Integration and Normalization"]
  NORM --> KG[("Knowledge Graph<br/>DIGITAL TWIN<br/>+ entity resolution")]
  KG --> AI["AI Reasoning Layer<br/>Claude · BA / PM / Tech-Lead / Exec agents"]

  AI --> OUT["📊 INTELLIGENCE — read-only<br/>health · risk · forecast<br/>weekly report · traceability"]
  AI --> ACT["⚙️ ACTION — gated<br/>generate AI-ready specs<br/>orchestrate AI delivery"]

  OUT --> HUB(["Project Hub and Portfolio<br/>teams + management"])
  ACT -.->|"human approval ·<br/>preview · audit · rollback"| SRC

  classDef src fill:#e8f0fe,stroke:#4285f4,color:#111
  classDef twin fill:#fff4e5,stroke:#f59e0b,color:#111
  classDef intel fill:#e6f4ea,stroke:#34a853,color:#111
  classDef act fill:#fce8e6,stroke:#ea4335,color:#111
  class J,B,C,T,F,M,O src
  class KG twin
  class OUT,HUB intel
  class ACT act
```

---

## 2. How it rolls out — the strangler-fig adoption journey

We never big-bang. The platform starts as a low-risk read-only layer *over* the tools, and only takes on more of the workflow after each step earns trust. The first **trust gate** — after the read-only MVP — is the formal go/no-go before any write-back is enabled.

```mermaid
flowchart LR
  P012["Phases 0–2 · READ-ONLY<br/>connect 7 tools · build the twin<br/>health · risk · forecast · reports<br/>the 6–9 month MVP"]
  GATE1{{"TRUST GATE<br/>insights proven<br/>by real teams"}}
  P345["Phases 3–5 · WRITE-BACK<br/>approved writes · AI-ready specs<br/>AI agents → reviewed PRs"]
  GATE2{{"loop earns<br/>trust"}}
  P6["Phase 6 · OWNS WORKFLOW<br/>primary workspace<br/>legacy tools become mirrors<br/>directional"]

  P012 --> GATE1 --> P345 --> GATE2 --> P6

  classDef ro fill:#e6f4ea,stroke:#34a853,color:#111
  classDef wb fill:#fef7e0,stroke:#f9ab00,color:#111
  classDef own fill:#fce8e6,stroke:#ea4335,color:#111
  classDef gate fill:#ffffff,stroke:#5f6368,color:#111,stroke-dasharray:4 3
  class P012 ro
  class P345 wb
  class P6 own
  class GATE1,GATE2 gate
```

---

*Colour key: blue = your tools · amber = the digital twin · green = read-only value · yellow = gated write-back · red = workflow ownership.*
