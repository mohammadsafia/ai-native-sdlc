---
id: AWP-PLAT-002
title: Immutable Audit Log Skeleton
pillar: P8 Governance
phase: Development
roadmap_phase: 0
owning_agent: none
type: read-only
status: ready
priority: P0
estimate: M
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: internal
    object: service
    ref: n/a
    content_hash: n/a
external_apis: []
dependencies:
  depends_on: [AWP-PLAT-001]
  relates_to: [AWP-WB-001]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's compliance and debugging backbone, I want an append-only,
tamper-evident audit log that records who did what, to what, when, and with what
outcome — scoped per tenant — so that every action is provably accountable from
day one and the write-back guardrails have a ledger to extend later.

## Context / Background
This is the **Phase 0 audit skeleton** — the append-only, tamper-evident record that
[`02`](../02-technical-foundation.md) §3 calls *"both a compliance artifact and the
debugging lifeline."* It comes online in Phase 0 so that *read and system* events are
accountable from the first commit, **before** any write-back exists.

**Scope boundary (read this carefully).** Phase 0 delivers the *skeleton plus the
recording of read/system events*. The base record is `{actor, action, target,
timestamp, input_hash, outcome, tenant_id}`. The **write-back-specific fields** — the
previewed `diff` and the `approver` — and the auditing of write-approval flows are
**deferred to the guardrail engine** ([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)).
The skeleton is designed to be *extended* by those fields, not to ship them now; they
are listed explicitly in **Out of Scope** below.

This packet is a **platform internal**: it is `read-only` because it does not write
back to any external SDLC tool — it persists records to its own store. It therefore
carries **no Guardrails block** ([`03`](../03-work-packet-format.md) §3, Rule 2).

Decisions an implementer must **not** re-derive:
- **Append-only is enforced, not conventional.** UPDATE and DELETE on an existing
  record must be physically rejected — no privileged path edits history.
- **Tamper-evidence is a hash chain.** Each record stores `prev_hash` and a
  `record_hash` = H(prev_hash ‖ canonical(record)); any mutation breaks the chain and
  is detectable by re-walking it.
- **Tenant-scoped.** Every record carries `tenant_id` (from
  [`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md)); the chain is per-tenant and
  no tenant can read another's entries.
- **Actor identity is mandatory and typed** — every entry distinguishes a **human**
  from a **service/agent** actor (and, when an agent, captures which one).

## Data Sources & External APIs
- **None** (`external_apis: []`). This is a self-contained internal service. It
  consumes the authenticated `actor` and `tenant_id` from
  [`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md) and writes only to its own
  append-only audit store (schema/DB-per-tenant, per
  [`02`](../02-technical-foundation.md) §4). It makes zero external SDLC-tool calls.

## Inputs
- `tenant_id` (required) — the tenant whose chain the record joins.
- `actor` (required) — `{type: human|service, id, agent_name?, model_version?}`.
- `action` (required) — the verb being recorded (e.g. `read.report`, `auth.login`,
  `system.sync`).
- `target` (required) — the object acted on (id/ref/URL or `n/a`).
- `input_payload` (required) — the inputs to hash; stored only as `input_hash`,
  never raw if it may carry secrets/PII.
- `outcome` (required) — `success | denied | error` (+ optional detail).
- `hash_algorithm` (default `sha256`) — the chain digest.
- Trigger: any auditable event raised by another packet (a read served, a login, a
  scheduled system job, a denied authorization).

## Outputs / Artifacts
- **One append-only audit record** per event, with the required base fields:
  `{record_id, tenant_id, actor{type,id,…}, action, target, timestamp, input_hash,
  outcome, prev_hash, record_hash}`.
- **A per-tenant hash chain** — `record_hash` links to `prev_hash`, forming a
  verifiable sequence.
- **A verification routine** — re-walks a tenant's chain and returns
  `{intact: true|false, first_broken_record_id?}`.
- **A tenant-scoped query API** — read/filter records *within the caller's tenant
  only*.
- Observability: append count, verify-chain pass/fail, rejected-mutation count.

> The record shape reserves room for the deferred `diff` and `approver` fields
> ([`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)); in Phase 0 those keys are absent
> (or null), and are populated only by the guardrail engine for write-back events.

## Acceptance Criteria

Scenario: An action produces exactly one complete append-only record
  Given an auditable action by a known `actor` in `tenant_id`
  When the action is recorded
  Then exactly one new record is appended
    And it contains non-empty `actor`, `action`, `target`, `timestamp`, `input_hash`,
        `outcome`, and `tenant_id` (all required base fields present).

Scenario: Updating or deleting an existing record fails (immutability)
  Given an existing audit record R
  When an UPDATE or a DELETE is attempted against R (via any code path)
  Then the operation is rejected (error / no-op)
    And R is byte-for-byte unchanged afterward.

Scenario: Tampering is detectable via the hash chain (tamper-evidence)
  Given a tenant's audit chain that verifies as intact
  When any field of a mid-chain record is altered out-of-band
  Then the verification routine returns `intact = false`
    And names the first record whose `record_hash` no longer matches H(prev_hash ‖ record).

Scenario: Records are tenant-scoped (no cross-tenant read)
  Given audit records exist for tenant A and tenant B
  When a caller in tenant A queries the audit log
  Then only tenant-A records are returned (zero tenant-B records)
    And every returned record's `tenant_id` equals A.

Scenario: Actor identity (human vs service) is recorded for every entry
  Given a human-initiated action and a service/agent-initiated action
  When each is recorded
  Then each record's `actor.type` is exactly one of {human, service}
    And for a service actor the `agent_name` (and `model_version` when applicable) is populated.

## Out of Scope
- **The write-back `diff` and `approver` fields, and auditing of the write-approval
  flow** — delivered by the guardrail engine
  [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md). Phase 0 records read/system
  events with the base fields only; the skeleton is built to accept those fields
  later, but does not populate them now.
- Recording any *external write* to Jira/Bitbucket/Confluence (there are none in
  Phase 0; write-class events are added with [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md)).
- Authentication / RBAC / tenant-boundary establishment — owned by
  [`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md); this packet consumes its
  `actor` + `tenant_id`.
- Log shipping / SIEM export, retention/rotation policy, and the audit-viewer UI.
- Cryptographic anchoring to an external notary/blockchain (the in-system hash chain
  is the Phase 0 tamper-evidence mechanism).

## Dependencies / Linked Packets
- **depends_on** [`AWP-PLAT-001`](./AWP-PLAT-001-auth-rbac-tenancy.md) — supplies the
  authenticated `actor` (human vs service) and the `tenant_id` that every record and
  the per-tenant chain require.
- **relates_to** [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md) — the guardrail
  engine extends this skeleton with the `diff` + `approver` fields and uses it as the
  append-only ledger for every external write
  ([`02`](../02-technical-foundation.md) §3).

## Non-Functional Requirements
- **Performance:** an append adds < 20ms p95 and never blocks the audited action's
  critical path beyond that bound; chain verification of ≤ 1M records completes in a
  background pass.
- **Security/Privacy:** store `input_hash`, not raw inputs that may carry
  secrets/PII; secrets never logged; records are immutable and tenant-isolated
  (schema/DB-per-tenant, [`02`](../02-technical-foundation.md) §4).
- **Idempotency/Reliability:** appends are durable (an event recorded once is never
  lost); a retried append with the same event id does not double-write; writes fail
  *closed* — an action whose audit cannot be persisted is treated as failed where the
  caller requires guaranteed auditing.
- **Observability:** emit append count, verify-chain pass/fail with first-broken id,
  and rejected-mutation count.
- **Cost:** zero LLM calls (pure persistence + hashing).

## Verification / Test Notes
- **Fixtures:** a seeded chain of N intact records across two tenants A and B; a
  human-actor event and a service/agent-actor event.
- **Append AC:** record one action; assert exactly one new record and that all seven
  base fields are non-empty.
- **Immutability AC:** attempt UPDATE and DELETE on an existing record through every
  available path; assert each is rejected and the record bytes are unchanged.
- **Tamper-evidence AC:** mutate one field of a mid-chain record directly in the
  store; run verification; assert `intact = false` and the reported first-broken id
  matches the mutated record.
- **Tenant-scope AC:** query as tenant A; assert zero tenant-B records returned and
  all `tenant_id` = A.
- **Actor AC:** record one human and one service event; assert `actor.type` ∈
  {human, service} on each and that the service record carries `agent_name`
  (+ `model_version` when set).

## Open Questions
- *(none — packet is `ready`)*
