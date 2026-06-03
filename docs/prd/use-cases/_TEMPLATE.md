---
id: AWP-AREA-000
title: <one-line deliverable>
pillar: <P1 Integration | P2 Knowledge Graph | P3 Intelligence | P4 Authoring | P5 Orchestration | P6 Workspace | P7 Portfolio | P8 Governance>
phase: <Discovery | Planning | Design | Development | QA | Release>
roadmap_phase: <0 | 1 | 2 | 3 | 4 | 5 | 6>
owning_agent: <BA | PM | Tech Lead | Executive | none>
type: <read-only | active-writeback>
status: draft
priority: <P0 | P1 | P2 | P3>
estimate: <S | M | L>
owner: <email>
generated_by: <human | use-case-generator@x.y>
source_fingerprint: <sha256 | n/a>
sources:
  - system: <Jira | Bitbucket | Confluence | Teams | Figma | Miro | M365 | internal>
    object: <issue | repo | page | thread | frame | file | service>
    ref: <KEY-123 | URL | pageId | n/a>
    content_hash: <sha256 | runtime | n/a>
external_apis:
  - name: <api>
    auth: <OAuth2 3LO | API token | app password | service token>
    scopes: [<least-privilege scope>, ...]
dependencies:
  depends_on: [AWP-...]
  relates_to: [AWP-...]
links:
  jira: <KEY | null>
  confluence: <pageId | null>
  bitbucket_pr: <PR# | null>
---

## User Story
As a <role>, I want <capability>, so that <outcome>.

## Context / Background
<Decisions, constraints, and prior art an implementer must not re-derive. State
what already exists (which packets/services) and what this packet must NOT touch.>

## Data Sources & External APIs
<Concrete systems, objects, endpoints, auth + scopes, and volume/rate-limit notes.>

## Inputs
<Runtime parameters with defaults, config, secret references, and the trigger.>

## Outputs / Artifacts
<Exact deliverables: files/modules, endpoints, records written, schema, report shape.>

## Acceptance Criteria
<Every scenario is Given/When/Then with a concrete observable. No vague terms.
Reference variable numbers by their Input name.>

Scenario: <name>
  Given <state>
  When <action>
  Then <observable, checkable result>

## Out of Scope
- <non-goal>

## Dependencies / Linked Packets
<Narrative of upstream (depends_on) and downstream (relates_to) packets and why.>

## Non-Functional Requirements
- Performance: ...
- Security/Privacy: ...
- Idempotency/Reliability: ...
- Observability: ...
- Cost: ...

## Verification / Test Notes
<Fixtures, mocks, commands, and manual checks that prove each acceptance criterion.>

## Guardrails        <!-- REQUIRED only when type: active-writeback; delete otherwise -->
- Approval: <who approves, what they see, default-deny>
- Dry-run/Preview: <no-write preview of the exact mutation>
- Audit: <append-only record fields>
- Scoped permissions: <least-privilege token, named scopes, target allow-list>
- Rollback/Undo: <how a bad write is reverted>

## Open Questions
- <Any open question keeps this packet in `draft`. Empty when `ready`.>
