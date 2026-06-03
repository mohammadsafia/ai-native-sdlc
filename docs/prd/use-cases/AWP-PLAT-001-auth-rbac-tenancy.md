---
id: AWP-PLAT-001
title: Auth/SSO + RBAC + Tenant Isolation Baseline
pillar: P8 Governance
phase: Development
roadmap_phase: 0
owning_agent: none
type: read-only
status: ready
priority: P0
estimate: L
owner: mohammadsafia17@gmail.com
generated_by: human
source_fingerprint: n/a
sources:
  - system: internal
    object: service
    ref: n/a
    content_hash: n/a
external_apis:
  - name: OIDC/SAML IdP (Microsoft Entra ID)
    auth: OIDC
    scopes: [openid, profile, email]
dependencies:
  depends_on: []
  relates_to: [AWP-PLAT-002, AWP-HUB-009]
links:
  jira: null
  confluence: null
  bitbucket_pr: null
---

## User Story
As the platform's security baseline, I want every user authenticated via the
customer IdP, authorized by role, and confined to their own tenant — with
visibility that never exceeds what they can already see in the source tools — so
that an org can trust the platform with its entire SDLC IP before any other
capability ships on top.

## Context / Background
This is the **Phase 0 security foundation** — the cross-cutting identity, RBAC, and
tenant-isolation spine that every other packet inherits (see
[`02`](../02-technical-foundation.md) §4). Nothing in the platform is built until
this exists: connectors, the graph, the hub, and the LLM gateway all assume a
resolved `actor` identity and a `tenant_id` boundary that this packet establishes.

This packet is a **platform internal**: it is `read-only` because it never writes
back to an external SDLC tool (Jira/Bitbucket/Confluence). It mediates *access* to
the platform; it does not mutate source systems, so it carries **no Guardrails
block** (those are mandatory only for `active-writeback` packets per
[`03`](../03-work-packet-format.md) §3, Rule 2).

Decisions an implementer must **not** re-derive:
- **Entra ID is the anchor IdP.** SSO is **OIDC/SAML** federated to the customer
  IdP; we do not own a password store. MFA is enforced upstream at the IdP.
- **RBAC has exactly four roles** — `viewer` / `contributor` / `approver` / `admin`
  — mapped to capabilities; app roles are necessary but **not sufficient**.
- **Visibility also honors source-tool permissions.** App role grants a *capability*;
  the source ACL grants *which artifacts*. If a user cannot see a Jira project at the
  source, they must not see its artifacts here — visibility ACLs propagate from the
  connectors, not just from app roles ([`02`](../02-technical-foundation.md) §4).
- **Tenant isolation is schema/DB-per-tenant**, not a shared-pool gamble —
  cross-tenant leakage is treated as existential and tested adversarially
  ([`02`](../02-technical-foundation.md) §4, §5 risk #6).
- **SCIM** drives provisioning *and* deprovisioning; a deprovision must revoke access
  promptly, not at next token refresh.

What this packet must **not** touch: the audit log persistence/format itself
([`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md)), and the per-project hub rendering
([`AWP-HUB-009`](./AWP-HUB-009-project-hub.md)) that *consumes* these ACLs.

## Data Sources & External APIs
- **OIDC/SAML IdP (Microsoft Entra ID)** — auth **OIDC**, scopes
  `[openid, profile, email]` (least privilege: identity claims only; no Graph/mail
  access). Authorization-code flow with PKCE; `id_token` validated against the IdP's
  JWKS; `sub`/`oid` is the stable user key, UPN/`email` is the cross-tool join key
  for person-identity stitching ([`02`](../02-technical-foundation.md) §2, Tier 1).
- **SCIM 2.0 provisioning endpoint** (platform-hosted, called *by* the IdP): `Users`
  and `Groups` create/update/**deactivate**. Group → platform-role mapping is config.
- **Source-tool ACLs** — read from the connectors' normalized visibility records
  (e.g. which Jira projects a UPN can see); this packet consumes them to gate
  artifact visibility. It does **not** call Jira/Bitbucket directly.
- **Volumes / limits:** assume ≤ 50k users per tenant; SCIM bursts on bulk
  onboarding/offboarding — process idempotently by `externalId`.

## Inputs
- `tenant_id` (required) — the tenant boundary for every request.
- `idp_metadata_url` (required) — OIDC discovery / SAML metadata for the tenant's IdP.
- `oidc_scopes` (default `[openid, profile, email]`).
- `role_group_map` (required) — IdP group → `{viewer|contributor|approver|admin}`.
- `session_ttl_minutes` (default `60`).
- `deprovision_propagation_seconds` (default `60`) — max delay from a SCIM deactivate
  to access revocation.
- Secrets by reference: `OIDC_CLIENT_SECRET`, `SCIM_BEARER_TOKEN` (vault-stored,
  never in config/logs — [`02`](../02-technical-foundation.md) §4).
- Trigger: an inbound OIDC/SAML authentication, an authenticated API request, or a
  SCIM provisioning/deprovisioning event.

## Outputs / Artifacts
- A **scoped session** (signed token / cookie) carrying `{actor_id, tenant_id,
  role, granted_capabilities[], source_acl_ref, exp}` — the `actor` + `tenant_id`
  every downstream packet reads.
- An **authorization decision** per request: `allow` (200/2xx) or `deny`
  (`401` unauthenticated / `403` unauthorized).
- A **per-tenant data binding** that pins every graph **and** vector query to
  `tenant_id` via the schema/DB-per-tenant boundary.
- A **visibility filter** applied to artifact reads = intersection(app-role
  capability, source-tool ACL).
- A **user lifecycle record** per SCIM event `{externalId, status:
  active|deactivated, roles[], updated_at}`.
- Observability: auth success/failure counts, 401/403 counts, deprovision
  propagation latency, and the request log the read-only AC asserts against.

## Acceptance Criteria

Scenario: OIDC authentication yields a scoped session
  Given a user registered in the tenant's Entra ID with `oidc_scopes` = [openid, profile, email]
  When the user completes the OIDC authorization-code flow
  Then a session is issued whose claims include a non-null `actor_id`, the caller's `tenant_id`,
       and exactly one `role` from {viewer, contributor, approver, admin}
    And the session `exp` is ≤ now + `session_ttl_minutes`.

Scenario: A viewer is denied an admin-only endpoint
  Given an authenticated user whose mapped `role` = viewer
  When the user calls an endpoint whose required capability is admin-only
  Then the response status is 403
    And no admin action is performed.

Scenario: Cross-tenant read returns zero foreign records (adversarial isolation)
  Given an authenticated user in tenant A
    And tenant B contains records that match the same query predicate
  When the user issues a graph query and a vector query that would match tenant B's records
  Then the result set contains exactly zero tenant-B records (count = 0)
    And every returned record's `tenant_id` equals A.

Scenario: Source-tool permission is honored for artifact visibility
  Given an authenticated user whose source ACL does NOT grant access to Jira project `P`
  When the user requests artifacts belonging to project `P`
  Then the response is empty (zero `P` artifacts) or 403
    And the same user with `P` in their source ACL receives those artifacts.

Scenario: SCIM deprovision revokes access
  Given an active user with a valid session
  When the IdP sends a SCIM deactivate event for that user
  Then within `deprovision_propagation_seconds` the user's next request returns 401 or 403
    And no further session can be minted for that user until re-provisioned.

Scenario: Unauthenticated request is rejected
  Given a request bearing no valid session and no valid `id_token`
  When it hits any protected endpoint
  Then the response status is 401
    And no tenant data is returned.

Scenario: Strictly read-only to external SDLC tools
  Given a full authenticate + authorize + provision cycle with write-capable source credentials available
  When the flows run
  Then zero POST / PUT / PATCH / DELETE calls are made to Jira / Bitbucket / Confluence
       (verified by the request log).

## Out of Scope
- The audit-log persistence, immutability, and tamper-evidence — owned by
  [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md) (this packet *emits* auth events to it).
- Any write-back / approval gate to external tools (no `active-writeback` here →
  no Guardrails block); write-class approvals are [`AWP-WB-001`](./AWP-WB-001-guardrail-engine.md).
- Owning the IdP, password storage, or MFA — those live upstream in Entra ID.
- Rendering the hub or dashboards that consume these ACLs — [`AWP-HUB-009`](./AWP-HUB-009-project-hub.md).
- Fine-grained per-field PII redaction policy (data-inventory / GDPR erasure is separate).

## Dependencies / Linked Packets
- **depends_on** — none; this is the Phase 0 root every other packet sits on.
- **relates_to** [`AWP-PLAT-002`](./AWP-PLAT-002-audit-log.md) — receives the
  authenticated `actor`/`tenant_id` and auth events this packet produces; and
  [`AWP-HUB-009`](./AWP-HUB-009-project-hub.md) — the first major consumer of the
  RBAC + source-ACL visibility filter defined here.

## Non-Functional Requirements
- **Performance:** an authorization decision adds < 50ms p95 to a request; session
  validation is local (no IdP round-trip per request).
- **Security/Privacy:** least-privilege OIDC scopes only (`openid, profile, email`);
  secrets in the vault, never in config/logs; **tenant-scope every graph and vector
  query** ([`02`](../02-technical-foundation.md) §4); deny-by-default on any
  unmapped capability or absent tenant binding.
- **Idempotency/Reliability:** SCIM events de-duplicate by `externalId`; replaying a
  deactivate is a no-op; loss of IdP reachability fails *closed* (deny), never open.
- **Observability:** emit auth success/failure, 401/403 counts, deprovision
  propagation latency, and the request log the read-only AC asserts against —
  correlation by `actor_id` + `tenant_id`.
- **Cost:** zero LLM calls (pure access control).

## Verification / Test Notes
- **Fixtures:** a mock Entra ID issuing signed `id_token`s for users mapped to each of
  the four roles; a SCIM client able to create/deactivate users; two seeded tenants A
  and B with overlapping-predicate records; a user whose source ACL excludes Jira
  project `P`.
- **Auth AC:** drive the OIDC code flow against the mock IdP; assert the issued
  session has non-null `actor_id`, correct `tenant_id`, one valid `role`, and `exp` ≤
  `session_ttl_minutes`.
- **RBAC AC:** call an admin-only endpoint as the viewer fixture; assert 403 and no
  side effect.
- **Isolation AC (adversarial):** as tenant A, run a graph query and a vector query
  whose predicate matches tenant B rows; assert result count of B-records = 0 and all
  returned `tenant_id` = A.
- **Source-ACL AC:** request project `P` artifacts as the excluded user → empty/403;
  grant `P`, re-request → artifacts returned.
- **Deprovision AC:** authenticate, then send SCIM deactivate; poll the next request;
  assert 401/403 within `deprovision_propagation_seconds` and that no new session mints.
- **Read-only AC:** assert the captured request log to Jira/Bitbucket/Confluence
  contains zero write verbs.

## Open Questions
- *(none — packet is `ready`)*
