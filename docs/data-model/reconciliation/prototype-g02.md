# Prototype → G02 Reconciliation (Change-Request / Self-Service)

Reconciles the PrimeSoft prototype change-request / self-service screens against
`02-G02-personal-details-workflow.sql`. Scope: `sensitive-changes` (FR-M01-003),
`edit-profile` (FR-M01-008), plus the shared `approvals`, `notifications`, `tasks` surfaces.

**Status legend:** `Present` = already modelled · `Config` = a `field_sensitivity_catalog`
data row (no schema change) · `Added` = new column added by this recon · `→ G01` /
`→ P01/X.2` = owned by another module, out of G02 scope.

| Prototype field (screen) | maps to G02 table.column | Status | Decision |
|---|---|---|---|
| Field being changed (sensitive-changes / edit-profile) | `change_request_items.field_key` + `.m01_field_key` | Present | Keep |
| Old value (sensitive-changes) | `change_request_items.old_value` (encrypted) + `.old_value_hash` | Present | Keep |
| New value / requested value (edit-profile Save) | `change_request_items.new_value` (encrypted; `clear_intent` for removal) | Present | Keep |
| Proof / supporting document | `change_request_documents.document_id` (→ G13) + `.doc_type` | Present | Keep |
| Document verification | `change_request_documents.verification_status` / `.authority_verification_status` | Present | Keep |
| Approval status (Approve / Reject) | `change_request_approvals.decision`; item `change_request_items.item_status`; header `change_requests.status` | Present | Keep |
| Approver / assignee (HR Ops) | `change_request_approvals.assigned_to` / `.required_role` | Present | Keep |
| Reject reason / comment | `change_request_approvals.decision_comment` | Present | Keep |
| SLA (SLA breached — approvals) | `change_requests.sla_due_at`; `cr_sla_events.event_type` (`BREACHED`/`ESCALATED`) | Present | Keep |
| "HR approval required" flag (edit-profile) | `field_sensitivity_catalog.sensitivity` + `.self_service_editable` (routing) | Config | Catalog row per field |
| **PII Tier 1 / PII Tier 2 (sensitive-changes)** | `field_sensitivity_catalog.pii_tier_id` → `pii_tiers` | **Added** | New FK column (see below) |
| Full name / Display name / Salutation | `field_sensitivity_catalog` row `field_group=DEMOGRAPHIC` → `change_request_items` | Config | Catalog rows |
| Date of birth | catalog `dob` (STATUTORY) → items | Config/Present | Seeded sample |
| Email / Personal email | catalog `email` (`is_auth_bearing`, `notify_old_value`) → items | Config/Present | Seeded sample |
| Phone / Personal mobile | catalog contact field (auth-bearing, MEDIUM) → items | Config | Catalog row |
| Gender / Marital status / Blood group | catalog `field_group=DEMOGRAPHIC` → items | Config | Catalog rows |
| Current / Permanent address | catalog `field_group=CONTACT` (m01 `employee_addresses.*`) → items | Config | Catalog rows |
| Emergency contact / Nominee (name, relation, phone) | catalog composite field → `change_request_items` (+ `parent_item_id`) | Config | Catalog rows |
| Bank account | catalog `field_group=FINANCIAL` → items; `cr_risk_signals.DUPLICATE_BANK_ACCOUNT` | Present | Keep |
| Notification: "Regularisation pending / New task / Leave approved" (notifications) | core `notifications` (X.2) | → P01/X.2 | Platform-core, not G02 |
| Task: "M01 Profile / Document / Policy ack" open task (tasks) | P01 `workflow_instances` / `workflow_actions` surface CR tasks | → P01 | Rendered from `change_requests.workflow_instance_id` |
| **Mobile visibility (Everyone / HR only)** | `g01_field_visibility` / `employee_contacts.visibility` | → G01 | Directory privacy, NOT a change-request |
| **Share birthday with my team** | G01 employee directory preference (`is_self_visible` pattern) | → G01 | Directory privacy, NOT a change-request |

## Counts

- Prototype change-request/self-service data points examined: **22**
- Present (already modelled): **11**
- Config (existing `field_sensitivity_catalog` data rows, no schema change): **7**
- Added by this recon: **1** (`field_sensitivity_catalog.pii_tier_id`)
- Out of G02 scope (→ G01 directory: 2 · → P01/X.2 platform: 1): **3**

## Amendment made

`field_sensitivity_catalog.pii_tier_id uuid REFERENCES pii_tiers(id) ON DELETE RESTRICT`
(+ index `ix_fsc_pii_tier`). The `sensitive-changes` review screen renders and groups
requests by **PII Tier 1 / PII Tier 2** — a DPDPA PII-classification axis distinct from G02's
approval-routing `sensitivity` (LOW/MEDIUM/HIGH/STATUTORY). The catalog previously carried
only `sensitivity`, so the tier label the prototype shows had no data home. `pii_tiers` is the
platform-global reference (`TIER_1..NON_PII`) already defined in `00-platform-core.sql`.

## Explicitly NOT added (out of G02 scope)

The `edit-profile` visibility toggles — **Mobile visibility** (Everyone / HR only) and
**Share birthday with my team** — are self-service directory-privacy preferences, immediate
(no HR approval), owned by G01 (`g01_field_visibility`, `employee_contacts.visibility`). They
are not change requests and were deliberately not added to G02.
