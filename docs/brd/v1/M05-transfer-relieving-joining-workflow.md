# Employee Transfer, Relieving and Joining Workflow — HRMS Module BRD

**Module code:** M05-TRJ
**Program:** Enterprise HRMS — "PeopleGov / HRMS Suite"
**Document version:** v1.0
**Status:** Baseline for build (parallel-agent ready)
**Owns:** Transfer lifecycle entities (requests, orders, clearances, charge handovers, joining reports, deputations, drives, preferences, transfer policy rules).
**Reuses (does not redefine):** `employees`, `users`, `org_units`, `designations`, `roles`, `permissions`, `service_register_events`, `documents`, `notifications`, `audit_log`, `workflow_instances`, `workflow_tasks` — all per `SHARED_FOUNDATION.md`.

---

## 1. Executive Summary

### 1.1 Purpose
The Employee Transfer, Relieving and Joining Workflow module (M05-TRJ) digitises the **end-to-end employee mobility lifecycle** of a government/public-sector organisation: from the **initiation of a transfer** (by request, administrative decision, mutual exchange, deputation, or promotion-linkage), through **transfer-order generation and the statutory approval chain**, **relieving at the source office** (departmental no-dues/clearance, handover of charge, last-working-day, relieving order), the **transfer-in-transit / joining-time period**, and finally **joining at the destination office** (joining report, charge assumption, confirmation of joining date). Every materially significant event is posted as a statutory **Service Register (SR) event** to the Digital SR (M12).

The module replaces a paper-driven, multi-office, hand-carried "Last Pay Certificate + relieving letter + joining report" process that today causes pay gaps, disputed seniority dates, lost no-dues forms, and unauditable transit periods. It establishes a **single auditable system of record** for who is posted where, from when, under what order, and with what dues outstanding.

### 1.2 Business context (public-sector statutory)
Transfers in government are **regulated administrative actions**. They are constrained by transfer policy (minimum tenure at a post, transfer ban/freeze periods such as election model-code-of-conduct windows, protected categories such as spouse-posting, medical grounds, single-parent, differently-abled, near-retirement protection), by **vacancy and sanctioned-strength** discipline, and by **due process** (competent/appointing authority sanction, transfer counselling for cadre drives). Relieving and joining have **pay and seniority consequences**: the date of relieving and date of joining define the **transit period**, joining time admissibility, pay continuity, and the **seniority/service continuity** recorded in the Digital SR. Errors are statutorily and financially material.

### 1.3 Scope summary
In scope: transfer request/initiation across all transfer types; eligibility & policy enforcement; counselling/preference capture; vacancy-driven and bulk transfer drives; transfer-order generation, approval, amendment, cancellation and revocation; relieving (no-dues clearance, charge handover, relieving order, last working day); transit-period management; joining (joining report, charge assumption); deputation & repatriation; SR-event posting; module notifications, reporting and analytics.

Out of scope (owned elsewhere, integrated): the canonical employee master (M01), promotion decisioning and seniority computation (M06 — M05 consumes promotion-linked transfer triggers and writes posting changes), payroll Last Pay Certificate generation and pay disbursement (M10 — M05 raises the LPC trigger and pay-stop/pay-start signals), pension/retirement (M11), the Digital SR ledger itself (M12 — M05 is a writer), and the document object store (M13 — M05 stores order/clearance PDFs there).

### 1.4 Primary outcomes & KPIs
| Outcome | KPI | Target |
|---|---|---|
| Faster relieving | Median time order-issued → relieved | ≤ 5 working days |
| No pay gaps | % transfers with continuous pay (no break) | ≥ 99% |
| Auditable transit | % transfers with recorded relieving + joining dates | 100% |
| Policy compliance | % orders violating ban/tenure rules at issue | 0% (hard-blocked) |
| Clearance discipline | % relievings with all mandatory no-dues closed | 100% |
| SR integrity | % transfer/relieving/joining events posted to M12 | 100% |
| Self-service adoption | % transfer requests raised via self-service portal | ≥ 70% |

### 1.5 Key stakeholders
Employees (transferees), Reporting Managers, HR Officers/Admins at source and destination offices, Department Heads / Appointing & Transfer Authorities, Clearance Officers (IT, Library, Accounts, Stores, Advances, Quarters/Estate), SR Custodian/Registrar (M12), Payroll Officer (M10), Auditors, and System Administrators.

---

## 2. Scope & Boundaries

### 2.1 Feature Module Map
| Sub-area | Description | Representative FRs |
|---|---|---|
| **Transfer Initiation** | Request capture across all types (request/admin/mutual/deputation/promotion-linked), draft validation | FR-TRJ-001 |
| **Policy & Eligibility** | Minimum tenure, ban/freeze windows, protected grounds, sanctioned-strength checks | FR-TRJ-002 |
| **Counselling & Preferences** | Vacancy publication, preference/option capture, counselling allotment | FR-TRJ-003 |
| **Approval & Order** | Approval chain, transfer-order generation, numbering, publication | FR-TRJ-004 |
| **Bulk Drives** | Annual/seasonal transfer drives, batch initiation, allotment, bulk orders | FR-TRJ-005 |
| **Relieving — Clearance** | Departmental no-dues / clearance checklist lifecycle | FR-TRJ-006 |
| **Relieving — Charge Handover** | Handover of charge, records, assets, cash/imprest | FR-TRJ-007 |
| **Relieving — Order & LWD** | Relieving order issue, last-working-day, pay-stop signal | FR-TRJ-008 |
| **Transit Management** | In-transit status, joining-time, transit/gap-period handling | FR-TRJ-009 |
| **Joining** | Joining report, charge assumption, joining-date confirmation, pay-start | FR-TRJ-010 |
| **Deputation & Repatriation** | Deputation terms, tenure, extension, repatriation | FR-TRJ-011 |
| **SR Posting** | Posting transfer/relieving/joining as SR events (M12) | FR-TRJ-012 |
| **Amendment / Cancellation** | Order modification, cancellation, post-relieving revocation | FR-TRJ-013 |
| **Mapping & Analytics** | Geographic mapping, pendency, transit/clearance dashboards | FR-TRJ-014 |

### 2.2 Common Capabilities (inherited platform behaviours, applied in this module)
- **Maker-checker workflow** via the shared workflow engine for every order, relieving, and joining action.
- **Segregation of duties:** initiator ≠ approver; transferee may never approve own transfer or self-clear a no-dues item; clearance officer ≠ transferee.
- **Row-level scoping** by `org_unit_id`: source-office HR sees relieving; destination-office HR sees joining; a transferee in transit is visible to both.
- **Immutable audit** (`audit_log`) on every state transition, with before/after snapshots.
- **Soft delete** (`is_deleted`) on transactional entities except append-only ledgers/SR.
- **Document binding:** every generated order and signed clearance/handover/joining artefact is stored in M13 `documents` and referenced by ID.
- **i18n / locale:** dates `DD-MMM-YYYY`; UTC storage; INR money; bilingual order templates.
- **Pagination:** all list endpoints cursor/page-limit, hard max page size 100.

### 2.3 In-scope / Out-of-scope boundary table
| Concern | In M05 | Owned by |
|---|---|---|
| Transfer order data & lifecycle | ✅ | M05 |
| No-dues / clearance | ✅ | M05 |
| Charge handover/assumption | ✅ | M05 |
| Joining report | ✅ | M05 |
| Deputation/repatriation records | ✅ | M05 |
| Employee master fields (designation, current org_unit) | Updated by M05 on join | M01 (owner) |
| Promotion decision & seniority math | Consumes trigger | M06 |
| Last Pay Certificate, pay-stop/pay-start, pay recovery | Raises signals | M10 |
| SR ledger entries | Writes events | M12 |
| Order/clearance PDFs storage | References | M13 |

### 2.4 Assumptions & constraints
- Sanctioned strength / vacancy data for posts is available from M06/M01 reference services; if unavailable, vacancy-driven flows degrade to manual destination entry with a warning (no hard block).
- Transfer policy parameters (tenure thresholds, ban calendars, protected categories) are configurable master data maintained by System Administrators and Transfer Authorities; the module ships seeded defaults.
- A transfer always has exactly one source `org_unit` and one destination `org_unit` (deputation destination may be an external organisation modelled as an `org_unit` of type `EXTERNAL`).
- "Office" = an `org_unit` of a transferable type; clearance departments are configured per office.

---

## 3. Roles & Permissions

### 3.1 Module roles (extending shared RBAC baseline)
| Role | Module responsibility |
|---|---|
| **Employee (Transferee)** | Raise transfer-on-request / mutual request; submit preferences; submit joining report; view own transfer status & orders. |
| **Reporting Manager** | Recommend/endorse request; confirm charge handover acceptance where receiving charge. |
| **HR Officer (Source)** | Process relieving: drive clearance, issue relieving order, record LWD, raise LPC/pay-stop. |
| **HR Officer (Destination)** | Receive transferee, validate joining report, confirm joining date, raise pay-start. |
| **HR Admin** | Initiate admin/bulk transfers, configure office clearance departments, manage drives. |
| **Transfer Authority / Appointing Authority** | Approve/sanction transfer orders; approve amendments, cancellations, revocations; approve deputation & repatriation. |
| **Clearance Officer (per department: IT, Library, Accounts, Stores, Advances, Estate/Quarters)** | Grant/deny no-dues for their department; record outstanding dues. |
| **Charge Receiving Officer** | Accept handover of charge/assets at source; certify assumption at destination. |
| **SR Custodian / Registrar** | Confirm SR event postings; reconcile SR discrepancies (M12 role acting here). |
| **Payroll Officer** | Acknowledge pay-stop/pay-start & LPC signals (M10 role acting here). |
| **Auditor** | Read-only access to all transfer records and audit log. |
| **System Administrator** | Configure policy rules, ban calendars, order templates, clearance department catalog; no transactional self-approval. |

### 3.2 Permission matrix (C=Create, R=Read, U=Update, A=Approve, X=Execute action, — =none)
| Capability | Employee | Rep. Mgr | HR Src | HR Dest | HR Admin | Transfer Auth | Clearance Off | Charge Recv | SR Custodian | Payroll Off | Auditor | Sys Admin |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Raise transfer request | C (own) | C (team) | C | C | C | — | — | — | — | — | R | — |
| Submit preferences | C (own) | — | C | — | C | — | — | — | — | — | R | — |
| Approve transfer order | — | A (recommend) | — | — | — | A | — | — | — | — | R | — |
| Generate/publish order | — | — | X | — | X | A | — | — | — | — | R | — |
| Run bulk drive | — | — | — | — | C/X | A | — | — | — | — | R | — |
| Grant/deny no-dues | — | — | R | R | R | — | X (own dept) | — | — | — | R | — |
| Record charge handover | R (own) | A (recv) | X | — | X | — | — | A | — | — | R | — |
| Issue relieving order | — | — | X | — | X | A | — | — | — | — | R | — |
| Submit joining report | C (own) | — | — | R | C | — | — | — | — | — | R | — |
| Confirm joining / charge assumption | R (own) | — | — | X | X | — | — | A | — | — | R | — |
| Post SR event | — | — | (auto) | (auto) | — | — | — | — | A/R | — | R | — |
| Pay-stop / pay-start signal | — | — | X | X | — | — | — | — | — | A | R | — |
| Amend / cancel / revoke order | — | — | C | C | C | A | — | — | — | — | R | — |
| Approve deputation / repatriation | — | — | C | C | C | A | — | — | — | — | R | — |
| Configure policy / templates / clearance catalog | — | — | — | — | R | R | — | — | — | — | R | X |
| View analytics dashboard | R (own) | R (team) | R | R | R | R | R (own dept) | — | R | R | R | R |

All approvals enforce **maker ≠ checker** and **transferee-exclusion** invariants.

---

## 4. Shared Application Foundation
This module inherits the entire `SHARED_FOUNDATION.md` technical and governance baseline and does not restate it. Concretely:
- **Architecture:** React + TypeScript (Tailwind + shadcn/ui) SPA; REST API under `/api/v1`; PostgreSQL; object storage (M13) for PDFs; deployed at CGG Data Centre.
- **Auth:** OIDC/SSO + MFA; JWT; RBAC + row-level org-unit scoping (§3).
- **Canonical error envelope:** `{ "error": { "code", "message", "field" }, "requestId" }`.
- **Standard error codes:** VALIDATION_ERROR(400), AUTH_REQUIRED(401), FORBIDDEN(403), NOT_FOUND(404), CONFLICT(409), RATE_LIMITED(429), INTERNAL_ERROR(500), UPSTREAM_UNAVAILABLE(503) + module-specific (§9.2).
- **Conventions:** UUIDv4 PKs + human business keys; audit fields on every table; UPPER_SNAKE_CASE enums; UTC storage / `DD-MMM-YYYY` display; cursor/page pagination max 100; maker-checker via shared workflow engine.
- **Security/compliance:** OWASP ASVS, TLS 1.2+, encryption at rest, full audit trail, DPDP Act 2023 alignment, statutory retention.
- **NFR baseline:** P95 API < 500ms; 99.9% uptime; WCAG 2.1 AA; RPO ≤ 15min, RTO ≤ 4h.

Integration touchpoints owned elsewhere: **M01** (employee master read/update), **M06** (promotion-linked trigger, sanctioned strength), **M10** (LPC, pay-stop/start), **M12** (SR events), **M13** (documents), shared **workflow engine**, **notifications**, **audit_log**.

---

## 5. Holistic Data Model

### 5.1 Entity inventory
| # | Entity | Type | Owner | Purpose |
|---|---|---|---|---|
| 1 | `transfer_requests` | Module (new) | M05 | Initiated transfer intent of any type, pre-order. |
| 2 | `transfer_orders` | Module (new) | M05 | The sanctioned, numbered transfer order; master of the mobility instance. |
| 3 | `transfer_policy_rules` | Module (new) | M05 | Configurable eligibility/policy constraints. |
| 4 | `transfer_ban_periods` | Module (new) | M05 | Freeze/ban calendar windows. |
| 5 | `transfer_drives` | Module (new) | M05 | Bulk transfer drive header (annual/seasonal). |
| 6 | `transfer_preferences` | Module (new) | M05 | Counselling preference/option list per transferee. |
| 7 | `vacancy_positions` | Module (new) | M05 | Publishable vacant posts driving allotment (read-augments M06/M01). |
| 8 | `clearance_checklists` | Module (new) | M05 | No-dues checklist header per relieving instance. |
| 9 | `clearance_items` | Module (new) | M05 | Per-department clearance line item. |
| 10 | `charge_handovers` | Module (new) | M05 | Handover (source) and assumption (destination) of charge records. |
| 11 | `relieving_orders` | Module (new) | M05 | Issued relieving order + last working day. |
| 12 | `joining_reports` | Module (new) | M05 | Joining report and charge-assumption certification at destination. |
| 13 | `deputation_records` | Module (new) | M05 | Deputation terms, tenure, repatriation. |
| 14 | `employees` | Shared | M01 | Person/job master — read; updated on join. |
| 15 | `org_units` | Shared | platform | Source/destination offices, clearance departments. |
| 16 | `designations` | Shared | platform | Post/designation reference. |
| 17 | `users` / `roles` / `permissions` | Shared | platform | Principals & RBAC. |
| 18 | `service_register_events` | Shared | M12 | SR ledger (written by M05). |
| 19 | `documents` | Shared | M13 | Order/clearance/handover/joining PDFs. |
| 20 | `notifications` | Shared | platform | Outbound notifications. |
| 21 | `audit_log` | Shared | platform | Immutable audit. |
| 22 | `workflow_instances` / `workflow_tasks` | Shared | platform | Approval engine. |

### 5.2 Field tables (module-owned entities)

#### 5.2.1 `transfer_requests`
| Field | Type | Null | Notes |
|---|---|---|---|
| `transfer_request_id` | UUID PK | N | |
| `request_no` | VARCHAR(30) UNIQUE | N | Human key, e.g. `TRQ-2026-000123`. |
| `employee_id` | UUID FK→employees | N | Transferee. |
| `transfer_type` | ENUM | N | See enum catalog. |
| `request_origin` | ENUM | N | `SELF`, `MANAGER`, `ADMIN`, `SYSTEM` (promotion-linked). |
| `source_org_unit_id` | UUID FK→org_units | N | Current office. |
| `requested_dest_org_unit_id` | UUID FK→org_units | Y | Preferred/destination (may be null until counselling). |
| `mutual_counterpart_employee_id` | UUID FK→employees | Y | For `MUTUAL`. |
| `ground` | ENUM | Y | `SPOUSE`, `MEDICAL`, `ADMINISTRATIVE`, `REQUEST`, `PROMOTION`, `DEPUTATION`, `COMPASSIONATE`, `OTHER`. |
| `ground_details` | TEXT | Y | |
| `supporting_document_ids` | UUID[] | Y | M13 references (medical cert, spouse posting proof). |
| `linked_promotion_id` | UUID | Y | M06 reference when promotion-linked. |
| `linked_drive_id` | UUID FK→transfer_drives | Y | If part of a drive. |
| `priority_category` | ENUM | Y | `PROTECTED_SPOUSE`, `MEDICAL`, `DIFFERENTLY_ABLED`, `NEAR_RETIREMENT`, `SINGLE_PARENT`, `NONE`. |
| `status` | ENUM | N | See state table §11. |
| `eligibility_result` | JSONB | Y | Cached policy-check outcome. |
| `workflow_instance_id` | UUID | Y | Shared engine. |
| `requested_effective_date` | DATE | Y | |
| `created_at`/`updated_at`/`created_by`/`updated_by`/`is_deleted` | audit | N | |

#### 5.2.2 `transfer_orders`
| Field | Type | Null | Notes |
|---|---|---|---|
| `transfer_order_id` | UUID PK | N | |
| `order_no` | VARCHAR(30) UNIQUE | N | Statutory order number, e.g. `TO/2026/04/0456`. |
| `transfer_request_id` | UUID FK→transfer_requests | Y | Null for direct admin orders. |
| `employee_id` | UUID FK→employees | N | |
| `transfer_type` | ENUM | N | |
| `source_org_unit_id` | UUID FK→org_units | N | |
| `dest_org_unit_id` | UUID FK→org_units | N | |
| `source_designation_id` | UUID FK→designations | N | |
| `dest_designation_id` | UUID FK→designations | N | Same unless promotion-linked. |
| `order_date` | DATE | N | |
| `relieve_by_date` | DATE | N | Statutory deadline to relieve. |
| `expected_joining_date` | DATE | Y | |
| `joining_time_days` | INT | Y | Admissible joining time. |
| `is_deputation` | BOOLEAN | N | |
| `drive_id` | UUID FK→transfer_drives | Y | |
| `status` | ENUM | N | §11. |
| `order_document_id` | UUID FK→documents | Y | Generated PDF. |
| `approved_by` | UUID FK→users | Y | Transfer Authority. |
| `approved_at` | TIMESTAMPTZ | Y | |
| `workflow_instance_id` | UUID | Y | |
| `revision_no` | INT | N | Default 0; increments on amendment. |
| `superseded_by_order_id` | UUID | Y | On amendment. |
| audit fields | | N | |

#### 5.2.3 `transfer_policy_rules`
| Field | Type | Null | Notes |
|---|---|---|---|
| `policy_rule_id` | UUID PK | N | |
| `rule_code` | VARCHAR(40) UNIQUE | N | e.g. `MIN_TENURE_MONTHS`. |
| `rule_type` | ENUM | N | `MIN_TENURE`, `MAX_TENURE`, `BAN_WINDOW`, `PROTECTED_CATEGORY`, `SANCTIONED_STRENGTH`, `COOLING_PERIOD`, `STATION_RETENTION`. |
| `scope_cadre` | VARCHAR(40) | Y | Null = all cadres. |
| `scope_org_unit_id` | UUID | Y | Null = global. |
| `param_value` | JSONB | N | e.g. `{ "months": 36 }`. |
| `enforcement` | ENUM | N | `HARD_BLOCK`, `SOFT_WARN`, `REQUIRE_OVERRIDE`. |
| `effective_from`/`effective_to` | DATE | Y | |
| `is_active` | BOOLEAN | N | |
| audit fields | | N | |

#### 5.2.4 `transfer_ban_periods`
| Field | Type | Null | Notes |
|---|---|---|---|
| `ban_period_id` | UUID PK | N | |
| `title` | VARCHAR(120) | N | e.g. "Model Code of Conduct — General Election 2026". |
| `ban_type` | ENUM | N | `ELECTION_MCC`, `BUDGET`, `EXAM`, `DISASTER`, `OTHER`. |
| `start_date`/`end_date` | DATE | N | |
| `scope_org_unit_id` | UUID | Y | Null = org-wide. |
| `exception_grounds` | ENUM[] | Y | Grounds allowed despite ban (e.g. `MEDICAL`). |
| `is_active` | BOOLEAN | N | |
| audit fields | | N | |

#### 5.2.5 `transfer_drives`
| Field | Type | Null | Notes |
|---|---|---|---|
| `drive_id` | UUID PK | N | |
| `drive_code` | VARCHAR(30) UNIQUE | N | e.g. `DRIVE-2026-ANNUAL`. |
| `title` | VARCHAR(160) | N | |
| `cadre` | VARCHAR(40) | Y | |
| `drive_type` | ENUM | N | `ANNUAL`, `SEASONAL`, `AD_HOC`, `COUNSELLING`. |
| `preference_window_start`/`_end` | DATE | Y | |
| `allotment_method` | ENUM | N | `SENIORITY`, `MERIT`, `PREFERENCE`, `MANUAL`. |
| `status` | ENUM | N | `DRAFT`, `OPEN`, `COUNSELLING`, `ALLOTTED`, `ORDERS_ISSUED`, `CLOSED`, `CANCELLED`. |
| `total_positions` | INT | Y | |
| audit fields | | N | |

#### 5.2.6 `transfer_preferences`
| Field | Type | Null | Notes |
|---|---|---|---|
| `preference_id` | UUID PK | N | |
| `drive_id` | UUID FK→transfer_drives | N | |
| `employee_id` | UUID FK→employees | N | |
| `preference_rank` | INT | N | 1 = highest. |
| `preferred_org_unit_id` | UUID FK→org_units | N | |
| `vacancy_position_id` | UUID FK→vacancy_positions | Y | |
| `allotted` | BOOLEAN | N | Default false. |
| `seniority_score` | NUMERIC(10,3) | Y | From M06. |
| audit fields | | N | |
| **Unique** | (`drive_id`,`employee_id`,`preference_rank`) | | |

#### 5.2.7 `vacancy_positions`
| Field | Type | Null | Notes |
|---|---|---|---|
| `vacancy_position_id` | UUID PK | N | |
| `org_unit_id` | UUID FK→org_units | N | |
| `designation_id` | UUID FK→designations | N | |
| `cadre` | VARCHAR(40) | Y | |
| `sanctioned_strength` | INT | N | |
| `filled_count` | INT | N | |
| `vacant_count` | INT | N | Derived/validated = sanctioned − filled. |
| `drive_id` | UUID FK→transfer_drives | Y | |
| `is_published` | BOOLEAN | N | |
| `geo_lat`/`geo_lng` | NUMERIC(9,6) | Y | For mapping. |
| audit fields | | N | |

#### 5.2.8 `clearance_checklists`
| Field | Type | Null | Notes |
|---|---|---|---|
| `clearance_checklist_id` | UUID PK | N | |
| `checklist_no` | VARCHAR(30) UNIQUE | N | e.g. `NOD-2026-000789`. |
| `transfer_order_id` | UUID FK→transfer_orders | N | |
| `employee_id` | UUID FK→employees | N | |
| `source_org_unit_id` | UUID FK→org_units | N | |
| `status` | ENUM | N | `OPEN`, `IN_PROGRESS`, `BLOCKED`, `CLEARED`, `CLEARED_WITH_DUES`, `CANCELLED`. |
| `total_items`/`cleared_items` | INT | N | |
| `has_outstanding_dues` | BOOLEAN | N | |
| `dues_recovery_ref` | VARCHAR(60) | Y | M10 recovery linkage. |
| audit fields | | N | |

#### 5.2.9 `clearance_items`
| Field | Type | Null | Notes |
|---|---|---|---|
| `clearance_item_id` | UUID PK | N | |
| `clearance_checklist_id` | UUID FK | N | |
| `department_code` | ENUM | N | `IT`, `LIBRARY`, `ACCOUNTS`, `STORES`, `ADVANCES`, `ESTATE_QUARTERS`, `HR`, `OTHER`. |
| `assigned_officer_id` | UUID FK→users | Y | Clearance Officer. |
| `status` | ENUM | N | `PENDING`, `CLEARED`, `DUES_OUTSTANDING`, `WAIVED`. |
| `dues_amount` | NUMERIC(14,2) | Y | INR. |
| `dues_description` | TEXT | Y | e.g. "Laptop SN-XXX not returned". |
| `remarks` | TEXT | Y | |
| `evidence_document_id` | UUID FK→documents | Y | |
| `cleared_at` | TIMESTAMPTZ | Y | |
| audit fields | | N | |
| **Unique** | (`clearance_checklist_id`,`department_code`) | | |

#### 5.2.10 `charge_handovers`
| Field | Type | Null | Notes |
|---|---|---|---|
| `charge_handover_id` | UUID PK | N | |
| `transfer_order_id` | UUID FK | N | |
| `phase` | ENUM | N | `HANDOVER_SOURCE`, `ASSUMPTION_DEST`. |
| `relinquishing_employee_id` | UUID FK→employees | Y | |
| `receiving_employee_id` | UUID FK→employees | Y | Successor / link officer. |
| `charge_type` | ENUM | N | `FULL`, `ADDITIONAL`, `CURRENT_DUTIES`. |
| `handover_date` | DATE | N | |
| `assets_handed` | JSONB | Y | Inventory list w/ asset IDs. |
| `cash_imprest_amount` | NUMERIC(14,2) | Y | |
| `pending_files_count` | INT | Y | |
| `handover_note_document_id` | UUID FK→documents | Y | |
| `status` | ENUM | N | `DRAFT`, `SUBMITTED`, `ACCEPTED`, `DISPUTED`. |
| `accepted_by` | UUID FK→users | Y | |
| `accepted_at` | TIMESTAMPTZ | Y | |
| audit fields | | N | |

#### 5.2.11 `relieving_orders`
| Field | Type | Null | Notes |
|---|---|---|---|
| `relieving_order_id` | UUID PK | N | |
| `relieving_order_no` | VARCHAR(30) UNIQUE | N | e.g. `RO/2026/04/0456`. |
| `transfer_order_id` | UUID FK | N | |
| `employee_id` | UUID FK→employees | N | |
| `clearance_checklist_id` | UUID FK | N | |
| `last_working_day` | DATE | N | |
| `relieving_time` | ENUM | N | `FORENOON`, `AFTERNOON`. |
| `relieved` | BOOLEAN | N | |
| `pay_stop_signalled` | BOOLEAN | N | M10 signal sent. |
| `lpc_requested` | BOOLEAN | N | Last Pay Certificate trigger. |
| `relieving_order_document_id` | UUID FK→documents | Y | |
| `status` | ENUM | N | §11. |
| `issued_by` | UUID FK→users | Y | |
| audit fields | | N | |

#### 5.2.12 `joining_reports`
| Field | Type | Null | Notes |
|---|---|---|---|
| `joining_report_id` | UUID PK | N | |
| `joining_report_no` | VARCHAR(30) UNIQUE | N | e.g. `JR/2026/04/0456`. |
| `transfer_order_id` | UUID FK | N | |
| `relieving_order_id` | UUID FK | Y | |
| `employee_id` | UUID FK→employees | N | |
| `dest_org_unit_id` | UUID FK→org_units | N | |
| `reported_date` | DATE | N | Date employee physically reported. |
| `joining_date` | DATE | N | Confirmed date of joining (statutory). |
| `joining_time` | ENUM | N | `FORENOON`,`AFTERNOON`. |
| `transit_days` | INT | Y | Derived: joining_date − LWD − holidays. |
| `transit_within_admissible` | BOOLEAN | Y | vs `joining_time_days`. |
| `charge_assumption_id` | UUID FK→charge_handovers | Y | |
| `pay_start_signalled` | BOOLEAN | N | |
| `joining_document_id` | UUID FK→documents | Y | |
| `status` | ENUM | N | §11. |
| `verified_by` | UUID FK→users | Y | HR Destination. |
| audit fields | | N | |

#### 5.2.13 `deputation_records`
| Field | Type | Null | Notes |
|---|---|---|---|
| `deputation_id` | UUID PK | N | |
| `transfer_order_id` | UUID FK | N | |
| `employee_id` | UUID FK→employees | N | |
| `borrowing_org_unit_id` | UUID FK→org_units | N | May be `EXTERNAL` type. |
| `lending_org_unit_id` | UUID FK→org_units | N | |
| `deputation_terms` | JSONB | Y | Pay protection, deputation allowance %, terms ref. |
| `start_date` | DATE | N | |
| `initial_tenure_months` | INT | N | |
| `current_end_date` | DATE | N | |
| `max_tenure_months` | INT | Y | Policy cap. |
| `extension_count` | INT | N | |
| `repatriation_due_date` | DATE | Y | |
| `repatriation_status` | ENUM | N | `ACTIVE`, `EXTENSION_REQUESTED`, `EXTENDED`, `REPATRIATION_DUE`, `REPATRIATED`. |
| audit fields | | N | |

### 5.3 Relationship map
```
employees (M01) 1───* transfer_requests *───1 transfer_orders 1───1 relieving_orders
                                   │                  │                   │
                                   │                  ├──1 clearance_checklists 1───* clearance_items
                                   │                  ├──* charge_handovers (source + dest phases)
                                   │                  ├──1 joining_reports
                                   │                  └──0..1 deputation_records
transfer_drives 1───* transfer_preferences *───1 employees
transfer_drives 1───* vacancy_positions *───1 org_units / designations
transfer_orders *───1 org_units (source, dest)
transfer_policy_rules / transfer_ban_periods ──(evaluated against)── transfer_requests/orders
ALL state changes ──> audit_log ; documents (M13) ; notifications ; workflow_* ; service_register_events (M12)
```

### 5.4 Ownership / reuse matrix
| Entity | Owner module | M05 access | Notes |
|---|---|---|---|
| `employees` | M01 | Read; Update (org_unit_id, designation_id, employment_status) on join | Update only via M01 API/service. |
| `org_units`,`designations` | platform | Read | |
| `service_register_events` | M12 | Append (write) | Via M12 SR-write API. |
| `documents` | M13 | Create/Read references | |
| `notifications`,`audit_log`,`workflow_*` | platform | Write/Read | |
| All `transfer_*`,`clearance_*`,`charge_*`,`relieving_*`,`joining_*`,`deputation_*`,`vacancy_*` | **M05** | Full CRUD | This module is system of record. |

### 5.5 Enum & reference catalog
| Enum | Values |
|---|---|
| `transfer_type` | `REQUEST`, `ADMINISTRATIVE`, `MUTUAL`, `DEPUTATION`, `PROMOTION_LINKED`, `TRANSFER_ON_REQUEST`, `COMPASSIONATE` |
| `transfer_request.status` | `DRAFT`, `SUBMITTED`, `ELIGIBILITY_CHECK`, `RECOMMENDED`, `APPROVED`, `REJECTED`, `WITHDRAWN`, `ORDER_ISSUED`, `CANCELLED` |
| `transfer_order.status` | `DRAFT`, `PENDING_APPROVAL`, `APPROVED`, `PUBLISHED`, `RELIEVING_IN_PROGRESS`, `RELIEVED`, `IN_TRANSIT`, `JOINED`, `AMENDED`, `CANCELLED`, `REVOKED` |
| `relieving_order.status` | `DRAFT`, `PENDING_CLEARANCE`, `PENDING_APPROVAL`, `ISSUED`, `RELIEVED`, `CANCELLED` |
| `joining_report.status` | `DRAFT`, `SUBMITTED`, `UNDER_VERIFICATION`, `JOINED_CONFIRMED`, `REJECTED`, `LATE_JOINING_REVIEW` |
| `clearance_item.department_code` | `IT`, `LIBRARY`, `ACCOUNTS`, `STORES`, `ADVANCES`, `ESTATE_QUARTERS`, `HR`, `OTHER` |
| `priority_category` | `PROTECTED_SPOUSE`, `MEDICAL`, `DIFFERENTLY_ABLED`, `NEAR_RETIREMENT`, `SINGLE_PARENT`, `NONE` |
| `ground` | `SPOUSE`, `MEDICAL`, `ADMINISTRATIVE`, `REQUEST`, `PROMOTION`, `DEPUTATION`, `COMPASSIONATE`, `OTHER` |
| `enforcement` | `HARD_BLOCK`, `SOFT_WARN`, `REQUIRE_OVERRIDE` |
| `repatriation_status` | `ACTIVE`, `EXTENSION_REQUESTED`, `EXTENDED`, `REPATRIATION_DUE`, `REPATRIATED` |
| `employment_status` (M01) | `ACTIVE`, `ON_LEAVE`, `SUSPENDED`, `TRANSFERRED`, `RETIRED`, `RESIGNED`, `DECEASED`, `TERMINATED` |

### 5.6 Data integrity rules
1. **One active order per employee:** an employee may have only one `transfer_order` in a non-terminal status (`PUBLISHED`→`JOINED`) at any time; a second issuance is `CONFLICT (409, TRJ_ACTIVE_TRANSFER_EXISTS)`.
2. **Relieving precondition:** a `relieving_order` may reach `ISSUED` only if its `clearance_checklist.status ∈ {CLEARED, CLEARED_WITH_DUES}` and `has_outstanding_dues` either false or `dues_recovery_ref` present.
3. **Joining precondition:** a `joining_report` may reach `JOINED_CONFIRMED` only if linked `transfer_order.status = IN_TRANSIT` (i.e., relieved) — except `JOINING_WITHOUT_RELIEF` exceptions explicitly flagged.
4. **Date monotonicity:** `order_date ≤ relieve_by_date`; `last_working_day ≥ order_date`; `joining_date ≥ last_working_day`; `repatriation_due_date ≥ start_date`.
5. **Mutual symmetry:** a `MUTUAL` request requires a reciprocal request linking `mutual_counterpart_employee_id`; both must be approved together (atomic).
6. **Sanctioned-strength guard:** allotment to a `vacancy_position` requires `vacant_count > 0` at commit (re-checked transactionally).
7. **Maker ≠ checker & transferee exclusion:** enforced on every approval/clearance write.
8. **SR posting completeness:** on each of order-publish, relieve, and join, exactly one corresponding `service_register_events` row must be confirmed; failures retried and surfaced (FR-TRJ-012).
9. **No orphan clearance:** `clearance_items` are created only with a parent `clearance_checklist`; checklist `total_items` = count of items.
10. **Soft delete** never applied to records already posted to SR (M12 immutability) — such records are cancelled/revoked with reason, not deleted.

### 5.7 Sample data (2–3 rows per module entity)

**transfer_requests**
| request_no | employee_id | transfer_type | request_origin | source→dest | ground | priority_category | status |
|---|---|---|---|---|---|---|---|
| TRQ-2026-000123 | …a1 | TRANSFER_ON_REQUEST | SELF | OU-DIST-A → OU-DIST-B | SPOUSE | PROTECTED_SPOUSE | RECOMMENDED |
| TRQ-2026-000124 | …b2 | MUTUAL | SELF | OU-DIST-B → OU-DIST-A | REQUEST | NONE | RECOMMENDED |
| TRQ-2026-000130 | …c3 | ADMINISTRATIVE | ADMIN | OU-HQ → OU-DIST-C | ADMINISTRATIVE | NONE | APPROVED |

**transfer_orders**
| order_no | employee_id | transfer_type | source→dest | order_date | relieve_by_date | status | revision_no |
|---|---|---|---|---|---|---|---|
| TO/2026/04/0456 | …c3 | ADMINISTRATIVE | OU-HQ → OU-DIST-C | 2026-04-02 | 2026-04-12 | RELIEVED | 0 |
| TO/2026/04/0457 | …a1 | TRANSFER_ON_REQUEST | OU-DIST-A → OU-DIST-B | 2026-04-05 | 2026-04-20 | IN_TRANSIT | 0 |
| TO/2026/05/0501 | …d4 | DEPUTATION | OU-HQ → OU-EXT-PSU1 | 2026-05-01 | 2026-05-15 | PUBLISHED | 0 |

**transfer_policy_rules**
| rule_code | rule_type | scope_cadre | param_value | enforcement | is_active |
|---|---|---|---|---|---|
| MIN_TENURE_MONTHS | MIN_TENURE | NULL | {"months":36} | HARD_BLOCK | true |
| NEAR_RETIREMENT_PROTECT | PROTECTED_CATEGORY | NULL | {"months_to_retire":24} | REQUIRE_OVERRIDE | true |
| COOL_AFTER_TRANSFER | COOLING_PERIOD | TEACHING | {"months":12} | SOFT_WARN | true |

**transfer_ban_periods**
| title | ban_type | start_date | end_date | exception_grounds | is_active |
|---|---|---|---|---|---|
| MCC General Election 2026 | ELECTION_MCC | 2026-03-15 | 2026-05-30 | {MEDICAL,COMPASSIONATE} | true |
| Annual Budget Session | BUDGET | 2026-02-01 | 2026-02-28 | {} | false |

**transfer_drives**
| drive_code | title | cadre | drive_type | allotment_method | status | total_positions |
|---|---|---|---|---|---|---|
| DRIVE-2026-ANNUAL | Annual Teacher Transfer 2026 | TEACHING | ANNUAL | PREFERENCE | COUNSELLING | 1200 |
| DRIVE-2026-CLERK | Ministerial Cadre Drive | MINISTERIAL | SENIORITY | ALLOTTED | ALLOTTED | 340 |

**transfer_preferences**
| drive_id | employee_id | preference_rank | preferred_org_unit_id | allotted | seniority_score |
|---|---|---|---|---|---|
| DRIVE-2026-ANNUAL | …a1 | 1 | OU-DIST-B | true | 845.250 |
| DRIVE-2026-ANNUAL | …a1 | 2 | OU-DIST-D | false | 845.250 |
| DRIVE-2026-ANNUAL | …e5 | 1 | OU-DIST-B | false | 712.000 |

**vacancy_positions**
| org_unit_id | designation_id | cadre | sanctioned_strength | filled_count | vacant_count | is_published |
|---|---|---|---|---|---|---|
| OU-DIST-B | DSG-TEACHER | TEACHING | 50 | 47 | 3 | true |
| OU-DIST-C | DSG-CLERK | MINISTERIAL | 20 | 20 | 0 | true |

**clearance_checklists**
| checklist_no | transfer_order_id | source_org_unit_id | status | total_items | cleared_items | has_outstanding_dues |
|---|---|---|---|---|---|---|
| NOD-2026-000789 | TO/2026/04/0456 | OU-HQ | CLEARED | 6 | 6 | false |
| NOD-2026-000790 | TO/2026/04/0457 | OU-DIST-A | CLEARED_WITH_DUES | 6 | 6 | true |

**clearance_items**
| checklist_no | department_code | status | dues_amount | dues_description |
|---|---|---|---|---|
| NOD-2026-000790 | IT | DUES_OUTSTANDING | 0.00 | Laptop SN-LT-9921 pending return |
| NOD-2026-000790 | ADVANCES | DUES_OUTSTANDING | 18500.00 | Festival advance balance |
| NOD-2026-000789 | LIBRARY | CLEARED | NULL | NULL |

**charge_handovers**
| transfer_order_id | phase | charge_type | handover_date | cash_imprest_amount | status |
|---|---|---|---|---|---|
| TO/2026/04/0456 | HANDOVER_SOURCE | FULL | 2026-04-10 | 5000.00 | ACCEPTED |
| TO/2026/04/0456 | ASSUMPTION_DEST | FULL | 2026-04-15 | 0.00 | ACCEPTED |

**relieving_orders**
| relieving_order_no | transfer_order_id | last_working_day | relieving_time | relieved | pay_stop_signalled | status |
|---|---|---|---|---|---|---|
| RO/2026/04/0456 | TO/2026/04/0456 | 2026-04-10 | AFTERNOON | true | true | RELIEVED |
| RO/2026/04/0457 | TO/2026/04/0457 | 2026-04-14 | AFTERNOON | true | true | RELIEVED |

**joining_reports**
| joining_report_no | transfer_order_id | reported_date | joining_date | transit_days | transit_within_admissible | status |
|---|---|---|---|---|---|---|
| JR/2026/04/0456 | TO/2026/04/0456 | 2026-04-15 | 2026-04-15 | 4 | true | JOINED_CONFIRMED |
| JR/2026/04/0457 | TO/2026/04/0457 | 2026-04-22 | 2026-04-22 | 7 | true | UNDER_VERIFICATION |

**deputation_records**
| transfer_order_id | borrowing_org_unit_id | start_date | initial_tenure_months | current_end_date | repatriation_status |
|---|---|---|---|---|---|
| TO/2026/05/0501 | OU-EXT-PSU1 | 2026-05-16 | 36 | 2029-05-15 | ACTIVE |

---

## 6. Functional Requirements

> Each FR uses: ID · Module · Primary Role(s) · User Story · Description · Acceptance Criteria · Business Rules · Data Model References · API References · UI Behavior Notes · Edge Cases · Low-Level Design table.

---

### FR-TRJ-001 — Transfer Request Initiation (all types)
- **Module:** M05-TRJ · Initiation
- **Primary Role(s):** Employee (Transferee), Reporting Manager, HR Officer, HR Admin
- **User Story:** *As an employee or HR officer, I want to initiate a transfer request of any type (on-request, administrative, mutual, deputation, promotion-linked, compassionate) so that mobility is captured in a structured, auditable way before an order is issued.*
- **Description:** Provides a unified intake for all transfer types. Self-service employees may raise `TRANSFER_ON_REQUEST`/`MUTUAL`/`COMPASSIONATE`; managers may endorse/raise for reports; HR Admin raises `ADMINISTRATIVE`; the system raises `PROMOTION_LINKED` from an M06 trigger. Captures source, requested destination, ground, supporting documents (M13), priority category, and requested effective date. On submission it runs the eligibility/policy engine (FR-TRJ-002) and routes for recommendation/approval through the workflow engine.
- **Acceptance Criteria:**
  1. A request can be created in `DRAFT` and edited until `SUBMITTED`.
  2. `transfer_type` and `request_origin` are mandatory; field combinations are validated (e.g., `MUTUAL` requires `mutual_counterpart_employee_id`).
  3. On submit, an eligibility check runs and its result is stored in `eligibility_result`; a `HARD_BLOCK` prevents submission with a clear reason.
  4. A unique `request_no` is generated on first submission.
  5. Supporting documents for `MEDICAL`/`SPOUSE` grounds are mandatory and stored in M13.
  6. Every create/submit writes `audit_log` and (on submit) creates a `workflow_instance`.
- **Business Rules:**
  - Employee origin may only create requests for self; manager for direct reports; HR Admin for their org scope.
  - Promotion-linked requests are system-originated and read-only to employees.
  - A transferee with an active non-terminal order is blocked (integrity rule 5.6-1).
- **Data Model References:**
  | Entity | Use |
  |---|---|
  | `transfer_requests` | Create/update primary record |
  | `employees` | Validate transferee, source org_unit |
  | `documents` | Supporting evidence |
  | `workflow_instances` | Approval routing |
  | `audit_log` | Trail |
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/requests` |
  | PATCH | `/api/v1/transfers/requests/{id}` |
  | POST | `/api/v1/transfers/requests/{id}/submit` |
  | GET | `/api/v1/transfers/requests?status=&type=&cursor=` |
- **UI Behavior Notes:** Wizard with type selector → details → grounds & documents → review. Inline eligibility banner (green/amber/red). Mutual flow shows counterpart search & reciprocal-link confirmation.
- **Edge Cases:** Counterpart not found / not eligible; duplicate active request; document upload failure (request stays DRAFT); promotion trigger arrives for an employee already in transit.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `TransferRequestWizard` (UI), `TransferRequestController`, `TransferRequestService`, `EligibilityClient` |
  | Backend Flow | Validate role-scope → persist DRAFT → on submit call EligibilityService → if not HARD_BLOCK, generate `request_no`, set `SUBMITTED`/`ELIGIBILITY_CHECK`, open workflow |
  | Data Operations | INSERT/UPDATE `transfer_requests`; INSERT `workflow_instances`; INSERT `audit_log` (transaction) |
  | Validation | Type/origin matrix; mandatory grounds docs; date ≥ today; mutual counterpart symmetry |
  | Authorization | Self/team/org scope per §3; JWT + RBAC + row-level |
  | State Changes & Side Effects | `DRAFT`→`SUBMITTED`→`ELIGIBILITY_CHECK`; notification to recommender |
  | Failure Handling | Eligibility upstream down → allow DRAFT save, block submit with `UPSTREAM_UNAVAILABLE`; doc upload fail rolls back submit |
  | Dependencies | FR-TRJ-002, M01, M13, workflow engine, M06 (promotion trigger) |
  | Test Guidance | Unit: type/origin matrix; integration: submit→workflow; negative: active-order block, missing medical doc |

---

### FR-TRJ-002 — Transfer Policy & Eligibility Validation
- **Module:** M05-TRJ · Policy & Eligibility
- **Primary Role(s):** System (engine), HR Admin, Transfer Authority
- **User Story:** *As the organisation, I want every transfer evaluated against tenure, ban-window, protected-category and sanctioned-strength policy so that no order violates statutory transfer rules.*
- **Description:** A rules engine evaluating a candidate request/order against `transfer_policy_rules` and `transfer_ban_periods`. Produces per-rule verdicts (`PASS`/`WARN`/`BLOCK`/`OVERRIDE_REQUIRED`) and an aggregate. `HARD_BLOCK` stops progress; `REQUIRE_OVERRIDE` permits a Transfer Authority to override with recorded justification; `SOFT_WARN` proceeds with a logged warning. Protected categories (spouse, medical, differently-abled, near-retirement, single-parent) relax or exempt specific rules.
- **Acceptance Criteria:**
  1. Engine returns an itemised result with rule_code, verdict, message for each evaluated rule.
  2. Minimum-tenure computed from employee's date of joining current post (last `JOINED` order or M01 posting date).
  3. Ban-window check is date-range and org-scope aware, honouring `exception_grounds`.
  4. Sanctioned-strength check blocks allotment when `vacant_count = 0`.
  5. Overrides require role = Transfer Authority + mandatory justification, captured in `audit_log` and `eligibility_result`.
  6. Engine is idempotent and re-runnable; the latest result is cached on the request/order.
- **Business Rules:**
  - Protected `MEDICAL`/`SPOUSE`/`COMPASSIONATE` may bypass ban windows only when listed in `exception_grounds`.
  - Near-retirement (within configured months) requires override even for admin transfers.
  - Cooling period after a recent transfer triggers `SOFT_WARN` or `BLOCK` per rule config.
- **Data Model References:** `transfer_policy_rules`, `transfer_ban_periods`, `transfer_requests.eligibility_result`, `employees`, `vacancy_positions`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/eligibility/evaluate` |
  | POST | `/api/v1/transfers/requests/{id}/override` |
  | GET | `/api/v1/transfers/policy-rules` |
- **UI Behavior Notes:** Eligibility panel lists each rule with icon + message; override modal (Transfer Authority only) demands justification ≥ 20 chars.
- **Edge Cases:** Conflicting rules (most restrictive wins); employee with no recorded current-post date (fallback to M01 DOJ); overlapping ban periods; rule effective-date boundaries.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `EligibilityService`, `PolicyRuleRepository`, `BanPeriodRepository`, `OverrideController` |
  | Backend Flow | Load active rules in scope (cadre+org) → evaluate each → aggregate (most restrictive) → persist result |
  | Data Operations | SELECT rules/ban_periods/vacancy; UPDATE `eligibility_result`; INSERT `audit_log` on override |
  | Validation | Date math (tenure, retirement); scope precedence; override role check |
  | Authorization | Evaluate: any initiator; Override: Transfer Authority only |
  | State Changes & Side Effects | Sets request to `ELIGIBILITY_CHECK`→ proceed/blocked; no SR event |
  | Failure Handling | Missing strength data → degrade strength rule to `SOFT_WARN` with notice |
  | Dependencies | FR-TRJ-001/003/004, M01, M06 |
  | Test Guidance | Rule-matrix unit tests; boundary tests on dates; override authz negative tests |

---

### FR-TRJ-003 — Counselling, Vacancy Publication & Preference Capture
- **Module:** M05-TRJ · Counselling & Preferences
- **Primary Role(s):** HR Admin, Employee, Transfer Authority
- **User Story:** *As HR, I want to publish vacancies and let eligible employees record ranked preferences so that allotment in a drive is transparent and seniority/merit-based.*
- **Description:** Publishes `vacancy_positions` (with geo-coordinates for mapping), opens a preference window for a drive, lets eligible employees submit a ranked option list, and supports counselling-based allotment by seniority/merit/preference. Feeds FR-TRJ-005 (bulk drives) and FR-TRJ-004 (order generation).
- **Acceptance Criteria:**
  1. Only published, in-scope vacancies are selectable as preferences.
  2. Employees may add/reorder/delete preferences only within the open window.
  3. Preference ranks are unique and contiguous per employee per drive.
  4. Allotment respects `allotment_method`; results mark `allotted=true` and reserve the vacancy.
  5. Seniority score is pulled from M06 at allotment time.
- **Business Rules:** Employee must pass FR-TRJ-002 to participate; a vacancy cannot be over-allotted beyond `vacant_count`; manual override by Transfer Authority is logged.
- **Data Model References:** `transfer_drives`, `transfer_preferences`, `vacancy_positions`, `employees`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/drives/{id}/vacancies` |
  | GET | `/api/v1/transfers/drives/{id}/vacancies?published=true` |
  | PUT | `/api/v1/transfers/drives/{id}/preferences` |
  | POST | `/api/v1/transfers/drives/{id}/allot` |
- **UI Behavior Notes:** Vacancy map + list; drag-to-rank preference builder with live eligibility; countdown to window close; allotment results grid for HR.
- **Edge Cases:** Window closed mid-edit; vacancy filled by another allotment concurrently; tie in seniority (deterministic tiebreak by service_no); duplicate preference.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `VacancyService`, `PreferenceService`, `AllotmentEngine`, `VacancyMap` (UI) |
  | Backend Flow | Publish vacancies → open window → capture prefs → run allotment (ordered by method) with row-level locks on vacancies |
  | Data Operations | INSERT/UPDATE `vacancy_positions`,`transfer_preferences`; UPDATE `filled/vacant` counts in transaction with `SELECT … FOR UPDATE` |
  | Validation | Window dates; rank contiguity; published-only; capacity |
  | Authorization | Vacancies/allot: HR Admin/Authority; prefs: employee (own) |
  | State Changes & Side Effects | Drive `OPEN`→`COUNSELLING`→`ALLOTTED`; allotment creates draft requests/orders feed |
  | Failure Handling | Concurrent allot → optimistic/row lock, retry; over-capacity → `CONFLICT` |
  | Dependencies | FR-TRJ-002/004/005, M06 (seniority) |
  | Test Guidance | Concurrency tests on allotment; rank-integrity; window-boundary |

---

### FR-TRJ-004 — Transfer Order Generation, Approval Chain & Publication
- **Module:** M05-TRJ · Approval & Order
- **Primary Role(s):** HR Officer, HR Admin, Transfer Authority
- **User Story:** *As a Transfer Authority, I want approved requests/allotments converted into a numbered, statutory transfer order and published so that source and destination offices act on a single authoritative document.*
- **Description:** Generates a `transfer_order` from an approved request/allotment (or directly for admin orders), routes through the configured approval chain (recommend → sanction by Appointing/Transfer Authority), assigns a statutory `order_no`, renders a bilingual PDF (M13), publishes to both offices, sets `relieve_by_date`/`joining_time_days`, and posts the **transfer SR event** (via FR-TRJ-012). Publication kicks off relieving (FR-TRJ-006).
- **Acceptance Criteria:**
  1. Order can only be created from an `APPROVED` request, an allotment, or a direct admin action with prior eligibility pass.
  2. Approval chain enforces maker ≠ checker and transferee exclusion.
  3. On approval, a unique sequential `order_no` is assigned and an immutable PDF is generated and stored in M13.
  4. Publication sets status `PUBLISHED`, notifies transferee + both offices, and triggers SR posting and clearance-checklist creation.
  5. Mutual orders are approved/published atomically as a pair.
- **Business Rules:** Re-validate FR-TRJ-002 at approval (ban windows may have changed); active-transfer uniqueness (5.6-1); deputation orders also create a `deputation_records` row (FR-TRJ-011).
- **Data Model References:** `transfer_orders`, `transfer_requests`, `documents`, `service_register_events`, `workflow_instances`, `clearance_checklists`, `deputation_records`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders` |
  | POST | `/api/v1/transfers/orders/{id}/approve` |
  | POST | `/api/v1/transfers/orders/{id}/publish` |
  | GET | `/api/v1/transfers/orders/{id}` |
- **UI Behavior Notes:** Order composer with template preview; approval timeline; publish confirmation showing downstream effects; PDF viewer.
- **Edge Cases:** Order number collision (retry sequence); PDF render failure (order stays `APPROVED`, publish blocked); ban window now active at approval; destination vacancy filled meanwhile.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `TransferOrderService`, `OrderNumberGenerator`, `PdfRenderClient(M13)`, `SrPostingClient(M12)`, `ApprovalWorkflow` |
  | Backend Flow | Create draft → workflow approval → on final approve: re-run eligibility, allocate `order_no` (sequence), render+store PDF, set APPROVED → publish: status PUBLISHED, create clearance checklist, post SR, notify |
  | Data Operations | INSERT/UPDATE `transfer_orders`; INSERT `clearance_checklists`(+items), `service_register_events`, `documents` ref, `audit_log` (single transaction; SR via outbox) |
  | Validation | Source status APPROVED; eligibility re-check; maker≠checker; date rules |
  | Authorization | Generate: HR; Approve/Publish: Transfer Authority |
  | State Changes & Side Effects | `DRAFT`→`PENDING_APPROVAL`→`APPROVED`→`PUBLISHED`→`RELIEVING_IN_PROGRESS`; SR event; M10 not yet signalled |
  | Failure Handling | SR post failure → outbox retry, order flagged `SR_PENDING` (FR-TRJ-012); PDF fail blocks publish |
  | Dependencies | FR-TRJ-002/003/006/011/012, M12, M13, workflow |
  | Test Guidance | Sequence uniqueness under load; atomic mutual pair; publish side-effect verification |

---

### FR-TRJ-005 — Bulk Transfer Drive Management
- **Module:** M05-TRJ · Bulk Drives
- **Primary Role(s):** HR Admin, Transfer Authority
- **User Story:** *As HR Admin, I want to run an annual/seasonal transfer drive that batch-processes hundreds of transfers so that large cadre movements are efficient and consistent.*
- **Description:** Manages a `transfer_drive` lifecycle: define scope/cadre, publish vacancies, open preference window (FR-TRJ-003), run allotment, and **batch-generate orders** (FR-TRJ-004) with progress tracking, partial-failure isolation, and a drive dashboard. Supports CSV import of candidate lists and bulk eligibility pre-screening.
- **Acceptance Criteria:**
  1. A drive progresses through `DRAFT`→`OPEN`→`COUNSELLING`→`ALLOTTED`→`ORDERS_ISSUED`→`CLOSED`.
  2. Bulk eligibility pre-screen flags blocked candidates before allotment.
  3. Batch order generation is resumable; a failed candidate does not abort the batch (quarantine + report).
  4. A drive dashboard shows counts by stage and pendency.
  5. Closing a drive requires all allotted candidates to have orders issued or explicitly excluded.
- **Business Rules:** Each candidate still passes per-candidate eligibility (FR-TRJ-002) and uniqueness (5.6-1); ban-window applies to whole drive unless exempted.
- **Data Model References:** `transfer_drives`, `transfer_preferences`, `vacancy_positions`, `transfer_requests`, `transfer_orders`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/drives` |
  | POST | `/api/v1/transfers/drives/{id}/screen` |
  | POST | `/api/v1/transfers/drives/{id}/generate-orders` |
  | GET | `/api/v1/transfers/drives/{id}/dashboard` |
- **UI Behavior Notes:** Drive console with stage stepper; candidate grid with eligibility chips; batch progress bar; quarantine tab listing failures with reasons.
- **Edge Cases:** Partial allotment; CSV with invalid service numbers; mid-drive ban activation; candidate withdrawal after allotment.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `DriveService`, `BulkEligibilityScreener`, `BatchOrderGenerator(jobs)`, `DriveDashboard` |
  | Backend Flow | Create drive → import/screen → allot (FR-003) → enqueue batch order jobs → aggregate results |
  | Data Operations | Bulk INSERT/UPDATE; idempotent job records; `audit_log` per candidate |
  | Validation | Cadre/scope; CSV schema; per-candidate eligibility |
  | Authorization | HR Admin / Transfer Authority |
  | State Changes & Side Effects | Drive + per-candidate order states; SR events per generated order |
  | Failure Handling | Per-candidate try/catch → quarantine; resumable job with checkpoint |
  | Dependencies | FR-TRJ-002/003/004 |
  | Test Guidance | Large-batch perf; partial-failure isolation; resume-after-crash |

---

### FR-TRJ-006 — Relieving: No-Dues / Clearance Checklist
- **Module:** M05-TRJ · Relieving — Clearance
- **Primary Role(s):** HR Officer (Source), Clearance Officers (IT, Library, Accounts, Stores, Advances, Estate/Quarters), Employee
- **User Story:** *As a source HR officer, I want a departmental no-dues checklist auto-created on order publication so that the employee is cleared by every department before relieving.*
- **Description:** On order publication a `clearance_checklist` with `clearance_items` for each configured department of the source office is generated. Each Clearance Officer marks their item `CLEARED`/`DUES_OUTSTANDING`/`WAIVED` with optional dues amount and evidence (M13). The employee sees live progress. The checklist reaches `CLEARED` (all cleared) or `CLEARED_WITH_DUES` (cleared with recovery linkage). This gates the relieving order (FR-TRJ-008).
- **Acceptance Criteria:**
  1. Checklist auto-created with one item per configured department of the source office.
  2. Only the assigned Clearance Officer (or HR override with reason) can update an item.
  3. Outstanding dues require a `dues_amount` and/or description; checklist cannot reach `CLEARED` while dues are open unless converted to `CLEARED_WITH_DUES` with `dues_recovery_ref`.
  4. Employee and source HR see real-time status; reminders sent for pending items > SLA.
  5. Every item change writes `audit_log`.
- **Business Rules:** Clearance Officer ≠ transferee; dues link to M10 recovery; `WAIVED` requires HR Admin/Authority approval.
- **Data Model References:** `clearance_checklists`, `clearance_items`, `transfer_orders`, `documents`, `notifications`.
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/transfers/orders/{id}/clearance` |
  | PATCH | `/api/v1/clearance/items/{id}` |
  | POST | `/api/v1/clearance/{checklistId}/finalize` |
- **UI Behavior Notes:** Clearance board (per-department cards: pending/cleared/dues); officer action drawer with dues + evidence; employee tracker view.
- **Edge Cases:** Department has no assigned officer (fallback to dept head queue); dues disputed; officer on leave (delegate); destination clearance not applicable.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `ClearanceService`, `ClearanceItemController`, `DuesRecoveryClient(M10)`, `ClearanceBoard` |
  | Backend Flow | On publish create checklist+items from office dept config → officers update items → finalize computes status |
  | Data Operations | INSERT checklist+items; UPDATE items; UPDATE checklist counters; `audit_log` |
  | Validation | Officer authz; dues required when outstanding; waive approval |
  | Authorization | Per-item officer; HR override logged |
  | State Changes & Side Effects | Checklist `OPEN`→`IN_PROGRESS`→`CLEARED`/`CLEARED_WITH_DUES`; gate for FR-008; M10 recovery signal |
  | Failure Handling | M10 recovery API down → allow `CLEARED_WITH_DUES` with pending ref, retry |
  | Dependencies | FR-TRJ-004/008, M10, M13 |
  | Test Guidance | Per-dept authz; dues gating; counter integrity; SLA reminder |

---

### FR-TRJ-007 — Charge Handover at Source
- **Module:** M05-TRJ · Relieving — Charge Handover
- **Primary Role(s):** Employee (relinquishing), Charge Receiving Officer, HR Officer (Source)
- **User Story:** *As a relieving employee, I want to formally hand over charge, records, assets and cash/imprest to a successor so that accountability transfers cleanly.*
- **Description:** Records a `charge_handover` (phase `HANDOVER_SOURCE`) listing assets (with asset IDs), pending files, cash/imprest balances, and a handover note (M13). The receiving officer/successor accepts or disputes. Acceptance is a precondition (configurable) for the relieving order.
- **Acceptance Criteria:**
  1. Handover captures asset inventory, cash/imprest, pending files, and a note document.
  2. Receiving officer can `ACCEPT` or `DISPUTE` with remarks.
  3. Disputed handover blocks relieving until resolved.
  4. Charge type (`FULL`/`ADDITIONAL`/`CURRENT_DUTIES`) is recorded.
- **Business Rules:** Relinquisher ≠ acceptor; cash/imprest mismatch flags an accounts clearance dependency (FR-TRJ-006).
- **Data Model References:** `charge_handovers`, `transfer_orders`, `employees`, `documents`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/charge-handover` |
  | POST | `/api/v1/charge-handovers/{id}/accept` |
  | POST | `/api/v1/charge-handovers/{id}/dispute` |
- **UI Behavior Notes:** Handover form with asset table + cash fields + note upload; acceptor review screen with accept/dispute.
- **Edge Cases:** No successor identified (handover to office/link officer); partial asset return; additional-charge relinquishment.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `ChargeHandoverService`, `ChargeController`, `ChargeForm` |
  | Backend Flow | Create handover → notify acceptor → accept/dispute updates status → gate relieving |
  | Data Operations | INSERT/UPDATE `charge_handovers`; `audit_log`; document ref |
  | Validation | Relinquisher≠acceptor; required asset/cash fields; phase=HANDOVER_SOURCE |
  | Authorization | Employee create; acceptor accept/dispute; HR view |
  | State Changes & Side Effects | `DRAFT`→`SUBMITTED`→`ACCEPTED`/`DISPUTED`; precondition for FR-008 |
  | Failure Handling | Dispute resolution loop; document upload retry |
  | Dependencies | FR-TRJ-006/008/010 |
  | Test Guidance | Accept/dispute paths; relinquisher-exclusion; gating |

---

### FR-TRJ-008 — Relieving Order, Last Working Day & Pay-Stop
- **Module:** M05-TRJ · Relieving — Order & LWD
- **Primary Role(s):** HR Officer (Source), Transfer Authority, Payroll Officer
- **User Story:** *As source HR, I want to issue a relieving order setting the last working day once clearance and handover are complete so that the employee is formally relieved and pay continuity is managed.*
- **Description:** Issues a `relieving_order` once clearance (FR-TRJ-006) and charge handover (FR-TRJ-007) preconditions are met. Sets `last_working_day`, relieving time (FN/AN), generates the relieving order PDF (M13), signals **pay-stop** and **LPC request** to M10, transitions the transfer order to `RELIEVED`→`IN_TRANSIT`, and posts the **relieving SR event** (FR-TRJ-012).
- **Acceptance Criteria:**
  1. Relieving order can only be issued when clearance status ∈ {CLEARED, CLEARED_WITH_DUES} and (if required) handover ACCEPTED.
  2. `last_working_day` ≥ order_date and ≤ `relieve_by_date` (late relief flagged for review, not hard-blocked).
  3. On issue: PDF stored, pay-stop + LPC signalled to M10, SR relieving event posted, transfer order → `IN_TRANSIT`.
  4. A unique `relieving_order_no` is generated.
- **Business Rules:** Pay-stop must align with LWD; LPC requested exactly once; relieving beyond `relieve_by_date` requires remark.
- **Data Model References:** `relieving_orders`, `clearance_checklists`, `charge_handovers`, `transfer_orders`, `documents`, `service_register_events`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/relieving-order` |
  | POST | `/api/v1/relieving-orders/{id}/issue` |
  | GET | `/api/v1/relieving-orders/{id}` |
- **UI Behavior Notes:** Relieving panel showing clearance/handover readiness gauges; LWD picker; issue button disabled until preconditions met; confirmation lists downstream signals.
- **Edge Cases:** Relieving after deadline; pay-stop signal failure (queued); employee absent on planned LWD; clearance reopened after issue (revoke path FR-TRJ-013).
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `RelievingService`, `PayrollSignalClient(M10)`, `SrPostingClient(M12)`, `RelievingPanel` |
  | Backend Flow | Verify preconditions → create relieving_order → on issue: number, render PDF, signal M10 (pay-stop+LPC), post SR, update transfer order IN_TRANSIT |
  | Data Operations | INSERT/UPDATE `relieving_orders`,`transfer_orders`; INSERT SR event, document ref, `audit_log` (txn + outbox for external signals) |
  | Validation | Precondition gate; date rules; single LPC |
  | Authorization | HR Source issue; Authority co-sign if configured |
  | State Changes & Side Effects | Relieving `PENDING_CLEARANCE`→`ISSUED`→`RELIEVED`; transfer order `RELIEVING_IN_PROGRESS`→`RELIEVED`→`IN_TRANSIT`; M10 + SR |
  | Failure Handling | M10/SR via outbox retry; PDF fail blocks issue |
  | Dependencies | FR-TRJ-006/007/009/012, M10, M12, M13 |
  | Test Guidance | Precondition gating; signal idempotency; deadline flagging |

---

### FR-TRJ-009 — Transfer-in-Transit & Joining-Time/Gap Management
- **Module:** M05-TRJ · Transit Management
- **Primary Role(s):** HR Officer (Source/Destination), Employee, Auditor
- **User Story:** *As HR, I want the period between relieving and joining tracked with admissible joining time so that transit/gap periods are visible, controlled, and not abused.*
- **Description:** Maintains the `IN_TRANSIT` status of the transfer order between LWD and joining. Computes admissible **joining time** (working days excluding holidays/weekends per calendar) from `joining_time_days`, monitors elapsed transit, flags overdue joinings, and exposes an in-transit register. Handles the pay-gap risk by ensuring pay-stop/pay-start bracket the transit and that overstayed transit is escalated.
- **Acceptance Criteria:**
  1. Transfer orders display `IN_TRANSIT` with day counter and admissible-by date.
  2. Joining-time computation excludes configured holidays/weekends.
  3. Transit exceeding admissible joining time raises an overdue flag + notification to both offices.
  4. An in-transit register lists all employees currently in transit with source/destination and elapsed days.
- **Business Rules:** Transit is bounded by policy; extension of joining time requires Transfer Authority approval (recorded); unjoined beyond grace triggers `LATE_JOINING_REVIEW` (FR-TRJ-010).
- **Data Model References:** `transfer_orders`, `relieving_orders`, `joining_reports`, holiday calendar (reference).
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/transfers/in-transit?org_unit=&cursor=` |
  | POST | `/api/v1/transfers/orders/{id}/extend-joining-time` |
- **UI Behavior Notes:** In-transit register with elapsed/limit progress bars; overdue rows highlighted; extension modal (Authority).
- **Edge Cases:** Holiday-calendar gaps; cross-region calendar differences; employee joins early; never joins (abandonment) → review/escalation.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `TransitService`, `JoiningTimeCalculator`, `InTransitRegister` |
  | Backend Flow | Derive admissible-by from LWD + working-day calc → scheduled job flags overdue → register query |
  | Data Operations | READ orders/relieving; UPDATE flags; `audit_log` on extension |
  | Validation | Calendar correctness; extension authz |
  | Authorization | Register: HR/Auditor; extension: Transfer Authority |
  | State Changes & Side Effects | Order remains `IN_TRANSIT`; overdue notification; possible `LATE_JOINING_REVIEW` |
  | Failure Handling | Calendar service missing → default Sat/Sun + national holidays with notice |
  | Dependencies | FR-TRJ-008/010, holiday calendar |
  | Test Guidance | Working-day math; overdue scheduling; extension flow |

---

### FR-TRJ-010 — Joining Report & Charge Assumption at Destination
- **Module:** M05-TRJ · Joining
- **Primary Role(s):** Employee (Transferee), HR Officer (Destination), Charge Receiving Officer, Payroll Officer
- **User Story:** *As a transferred employee, I want to submit a joining report at my destination and assume charge so that my joining date is confirmed, pay restarts, and my posting is updated.*
- **Description:** The transferee submits a `joining_report` (reported date, requested joining date/time); destination HR verifies, records charge assumption (`charge_handover` phase `ASSUMPTION_DEST`), confirms the statutory `joining_date`, computes transit vs admissible, signals **pay-start** to M10, updates the **employee master** (M01: org_unit, designation if promotion-linked, employment_status ACTIVE), posts the **joining SR event** (FR-TRJ-012), and sets the transfer order to `JOINED`.
- **Acceptance Criteria:**
  1. Joining report can be submitted only against an `IN_TRANSIT` order (exception: `JOINING_WITHOUT_RELIEF` flagged).
  2. Destination HR verification confirms `joining_date`; transit days and admissibility computed.
  3. On confirmation: charge assumption recorded, pay-start signalled, M01 posting updated, SR joining event posted, order → `JOINED`.
  4. Late joining (beyond admissible + grace) routes to `LATE_JOINING_REVIEW` with Authority decision before confirmation.
  5. Unique `joining_report_no` generated.
- **Business Rules:** Joining date ≥ LWD; M01 update is the single authoritative posting change; deputation joining also updates `deputation_records` start (FR-TRJ-011).
- **Data Model References:** `joining_reports`, `charge_handovers`, `transfer_orders`, `employees`(M01), `service_register_events`, `deputation_records`.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/joining-report` |
  | POST | `/api/v1/joining-reports/{id}/verify` |
  | POST | `/api/v1/joining-reports/{id}/confirm` |
- **UI Behavior Notes:** Joining wizard (report → charge assumption → confirm); HR verification screen with transit summary; late-joining banner with review action.
- **Edge Cases:** Reported but charge not available; joining before relieving processed at source; date disputes; promotion-linked designation change.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `JoiningService`, `EmployeeMasterClient(M01)`, `PayrollSignalClient(M10)`, `SrPostingClient(M12)`, `JoiningWizard` |
  | Backend Flow | Submit report → HR verify → confirm: record assumption, set joining_date, compute transit, signal pay-start, update M01, post SR, order JOINED |
  | Data Operations | INSERT/UPDATE `joining_reports`,`charge_handovers`,`transfer_orders`; M01 update via API; SR insert; `audit_log` (txn + outbox) |
  | Validation | Order IN_TRANSIT; date ≥ LWD; late-joining review gate |
  | Authorization | Employee submit; HR Dest verify/confirm |
  | State Changes & Side Effects | Report `SUBMITTED`→`UNDER_VERIFICATION`→`JOINED_CONFIRMED`; order `IN_TRANSIT`→`JOINED`; M01 + M10 + SR |
  | Failure Handling | M01/M10/SR via outbox retry; confirmation atomic w.r.t. local state, external signals eventually consistent with flags |
  | Dependencies | FR-TRJ-008/009/011/012, M01, M10, M12 |
  | Test Guidance | Confirm side-effects; late-joining gate; M01 posting correctness |

---

### FR-TRJ-011 — Deputation Terms & Repatriation Management
- **Module:** M05-TRJ · Deputation & Repatriation
- **Primary Role(s):** HR Admin, Transfer Authority, Employee
- **User Story:** *As HR, I want to manage deputation tenure, terms, extensions and repatriation so that lent employees return on time and terms are tracked.*
- **Description:** For `DEPUTATION` transfers, maintains a `deputation_record` capturing borrowing/lending units (borrowing may be `EXTERNAL`), terms (pay protection, deputation allowance), tenure, extensions (with caps), repatriation due date and status. Generates repatriation alerts and processes repatriation as a reverse transfer (reusing FR-TRJ-004/006/008/010).
- **Acceptance Criteria:**
  1. Deputation record auto-created when a deputation order is published.
  2. Extension requests validated against `max_tenure_months`; over-cap blocked.
  3. Repatriation-due alerts raised ahead of `current_end_date`.
  4. Repatriation initiates a reverse transfer order back to the lending unit.
- **Business Rules:** Deputation allowance/pay protection recorded in `deputation_terms`; external borrowing units modelled as `org_units` of type `EXTERNAL`; max tenure enforced by policy (FR-TRJ-002).
- **Data Model References:** `deputation_records`, `transfer_orders`, `org_units`, `employees`.
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/deputations?status=&cursor=` |
  | POST | `/api/v1/deputations/{id}/extend` |
  | POST | `/api/v1/deputations/{id}/repatriate` |
- **UI Behavior Notes:** Deputation register with tenure timeline; extension modal with cap validation; repatriation action launching reverse-transfer wizard.
- **Edge Cases:** Extension beyond cap; early recall; deputee resigns on deputation; external unit not in org tree.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `DeputationService`, `RepatriationOrchestrator`, `DeputationRegister` |
  | Backend Flow | On deputation order publish create record → manage extensions (cap check) → on repatriate create reverse transfer order |
  | Data Operations | INSERT/UPDATE `deputation_records`; create reverse `transfer_orders`; `audit_log` |
  | Validation | Tenure cap; date monotonicity; role authz |
  | Authorization | HR Admin/Authority manage; employee view |
  | State Changes & Side Effects | `ACTIVE`→`EXTENSION_REQUESTED`→`EXTENDED`/`REPATRIATION_DUE`→`REPATRIATED`; reverse order creation |
  | Failure Handling | Reverse-order failure isolated; alerts retried |
  | Dependencies | FR-TRJ-002/004/008/010 |
  | Test Guidance | Cap enforcement; repatriation reverse-flow; alert timing |

---

### FR-TRJ-012 — Service Register (SR) Event Posting
- **Module:** M05-TRJ · SR Posting
- **Primary Role(s):** System, SR Custodian/Registrar
- **User Story:** *As the SR custodian, I want every transfer, relieving and joining event reliably posted to the Digital SR so that the statutory service record is complete and accurate.*
- **Description:** Posts append-only `service_register_events` to M12 at three checkpoints: order publication (TRANSFER_ORDERED), relieving (RELIEVED), and joining (JOINED). Uses a transactional **outbox** for guaranteed delivery, idempotency keys to prevent duplicates, retry with backoff, and a reconciliation view for the SR Custodian to detect/resolve gaps.
- **Acceptance Criteria:**
  1. Exactly one SR event per checkpoint per transfer order (idempotent).
  2. Failed postings are retried; persistent failures flagged `SR_PENDING` and surfaced to SR Custodian.
  3. SR event payload includes order_no, source/destination, dates, event type, and references.
  4. A reconciliation report lists transfer orders with missing/failed SR events.
- **Business Rules:** SR events are immutable (no edit/delete); corrections are new compensating events; posting failures never block local state but must be resolved before SR closure.
- **Data Model References:** `service_register_events`(M12), `transfer_orders`, `relieving_orders`, `joining_reports`, outbox table.
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/sr/events` (M12 write) |
  | GET | `/api/v1/transfers/sr-reconciliation?status=pending` |
  | POST | `/api/v1/transfers/sr-events/{id}/retry` |
- **UI Behavior Notes:** SR reconciliation console listing pending/failed events with retry; per-order SR timeline.
- **Edge Cases:** M12 down at checkpoint; duplicate retry; partial payload; clock skew on event dates.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `SrOutboxWriter`, `SrPublisherJob`, `SrReconciliationService`, `M12Client` |
  | Backend Flow | On checkpoint write outbox row (same txn) → async publisher posts to M12 with idempotency key → mark delivered/failed → reconcile |
  | Data Operations | INSERT outbox; UPDATE delivery status; READ for reconciliation; `audit_log` |
  | Validation | Idempotency key uniqueness; payload schema |
  | Authorization | System publish; Custodian retry/reconcile |
  | State Changes & Side Effects | Order `sr_status` flag; M12 ledger append |
  | Failure Handling | Exponential backoff; dead-letter after N tries → `SR_PENDING` flag + alert |
  | Dependencies | FR-TRJ-004/008/010, M12 |
  | Test Guidance | Idempotency under retry; outbox delivery guarantee; reconciliation accuracy |

---

### FR-TRJ-013 — Order Amendment, Cancellation & Post-Relief Revocation
- **Module:** M05-TRJ · Amendment / Cancellation
- **Primary Role(s):** HR Officer, HR Admin, Transfer Authority
- **User Story:** *As a Transfer Authority, I want to amend, cancel or revoke a transfer order at the correct lifecycle stage so that corrections and recalls are handled with full audit and statutory compensation.*
- **Description:** Supports three corrective actions with stage-aware rules: **amend** (before relieving — supersede with `revision_no`++, new PDF, re-post SR correction), **cancel** (before relieving — close order, reverse clearance/handover, notify), and **revoke** (after relieving and/or joining — recall requiring reverse SR events, possible reverse posting, pay reconciliation). All require Transfer Authority approval and recorded justification.
- **Acceptance Criteria:**
  1. Amendment allowed only pre-relief; creates a new revision linked via `superseded_by_order_id`.
  2. Cancellation allowed pre-relief; reverses dependent clearance/handover records and notifies stakeholders.
  3. Revocation (post-relief/join) posts compensating SR events and triggers pay reconciliation signal to M10.
  4. Every corrective action requires justification and Authority approval; written to `audit_log`.
- **Business Rules:** Records already posted to SR are never hard-deleted (5.6-10); revocation after joining reverses the M01 posting via M01 API with reason.
- **Data Model References:** `transfer_orders`, `clearance_checklists`, `charge_handovers`, `joining_reports`, `service_register_events`, `employees`(M01).
- **API References:**
  | Method | Path |
  |---|---|
  | POST | `/api/v1/transfers/orders/{id}/amend` |
  | POST | `/api/v1/transfers/orders/{id}/cancel` |
  | POST | `/api/v1/transfers/orders/{id}/revoke` |
- **UI Behavior Notes:** Stage-aware action menu (only valid actions enabled); justification-required modal; impact preview listing reversals.
- **Edge Cases:** Amend after clearance started; cancel after partial clearance; revoke after pay already paid; concurrent amend + relieving.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `OrderCorrectionService`, `ReversalOrchestrator`, `CorrectionModal` |
  | Backend Flow | Determine allowed action by status → workflow approve → execute (supersede/reverse) → compensating SR + signals |
  | Data Operations | UPDATE orders (revision/status); reverse dependent records; INSERT compensating SR; `audit_log` (txn + outbox) |
  | Validation | Stage rules; justification mandatory; authz |
  | Authorization | Transfer Authority approves |
  | State Changes & Side Effects | `AMENDED`/`CANCELLED`/`REVOKED`; SR compensation; M10/M01 reversals |
  | Failure Handling | Reversal partial-failure → quarantine + alert; idempotent compensation |
  | Dependencies | FR-TRJ-004/006/008/010/012, M01, M10, M12 |
  | Test Guidance | Stage-gating matrix; reversal completeness; SR compensation |

---

### FR-TRJ-014 — Geographic Mapping & Transfer Analytics Dashboard
- **Module:** M05-TRJ · Mapping & Analytics
- **Primary Role(s):** HR Admin, Transfer Authority, Auditor, Reporting Manager
- **User Story:** *As a Transfer Authority, I want a map and analytics view of transfers, pendency, clearance and transit so that I can monitor mobility health and act on bottlenecks.*
- **Description:** A dashboard with a geographic map of vacancies/postings (using `geo_lat/geo_lng`), and analytics: transfers by type/stage, relieving pendency, clearance bottlenecks by department, in-transit/overdue counts, SR posting health, drive progress, and deputation tenure alerts. Feeds M14 cross-module analytics.
- **Acceptance Criteria:**
  1. Map renders vacancies/postings with filters by cadre, office, drive.
  2. KPI cards show counts for each lifecycle stage and overdue/pending items.
  3. Clearance bottleneck view ranks departments by average clearance time.
  4. All figures respect row-level org scope; Auditor sees all read-only.
  5. Data exportable (CSV/PDF) with pagination on underlying lists.
- **Business Rules:** Aggregations are read-only; no PII beyond role scope; numbers reconcile with operational records.
- **Data Model References:** `transfer_orders`, `relieving_orders`, `joining_reports`, `clearance_checklists/items`, `transfer_drives`, `vacancy_positions`, `deputation_records`.
- **API References:**
  | Method | Path |
  |---|---|
  | GET | `/api/v1/transfers/analytics/summary` |
  | GET | `/api/v1/transfers/analytics/clearance-bottlenecks` |
  | GET | `/api/v1/transfers/map/vacancies?cadre=&office=` |
- **UI Behavior Notes:** Map panel + KPI grid + trend charts; drill-down from KPI to filtered list; export buttons.
- **Edge Cases:** Missing geo-coordinates (list-only fallback); large result sets (server aggregation + pagination); time-zone in trend buckets.
- **Low-Level Design:**
  | Aspect | Detail |
  |---|---|
  | Components | `AnalyticsService`, `MapDataService`, `TransferDashboard` |
  | Backend Flow | Pre-aggregated queries with org-scope filter → cache short TTL → serve KPI/map/bottleneck |
  | Data Operations | Read-only aggregate SELECTs (indexed); optional materialized views |
  | Validation | Filter params; scope enforcement |
  | Authorization | Scoped read; Auditor global read |
  | State Changes & Side Effects | None (read-only) |
  | Failure Handling | Cache miss/timeouts → degrade to live query with limit |
  | Dependencies | All M05 entities; M14 consumption |
  | Test Guidance | Aggregation correctness; scope isolation; export integrity |

---

## 7. UI Requirements

### 7.1 Screens & layouts
| Screen | Primary users | Key elements | States covered |
|---|---|---|---|
| Transfer Request Wizard | Employee, HR | Type selector, details, grounds+docs, eligibility banner, review | empty/loading/error/success/permission |
| My Transfers (self-service) | Employee | Status timeline, current order, relieving/joining tasks | empty/loading/error |
| Transfer Orders Console | HR, Authority | Order list (filter by status/office), composer, approval timeline, PDF viewer | all |
| Drive Console | HR Admin, Authority | Stage stepper, candidate grid, vacancy map, batch progress, quarantine | all |
| Counselling/Preferences | Employee | Drag-rank preferences, vacancy map, window countdown | empty/loading/error |
| Clearance Board | HR Source, Clearance Officers, Employee | Per-department cards, dues entry, evidence upload, tracker | all incl. blocked |
| Charge Handover | Employee, Receiving Officer | Asset table, cash fields, note upload, accept/dispute | all |
| Relieving Panel | HR Source, Authority | Readiness gauges, LWD picker, issue action, downstream signal preview | all |
| In-Transit Register | HR, Auditor | Elapsed/limit bars, overdue highlight, extend action | empty/loading |
| Joining Wizard | Employee, HR Dest | Report, charge assumption, confirm, transit summary, late-joining banner | all |
| Deputation Register | HR Admin, Authority | Tenure timeline, extension, repatriation action | all |
| SR Reconciliation Console | SR Custodian | Pending/failed events, retry, per-order SR timeline | all |
| Transfer Dashboard | Authority, Admin, Auditor | Map, KPI cards, bottleneck chart, export | loading/empty/error |

### 7.2 Cross-cutting UI rules
- Mobile-first responsive; collapsible sidebar with menu icons + hamburger on small screens.
- WCAG 2.1 AA: keyboard navigation, focus order, ARIA labels, contrast ≥ 4.5:1.
- Dark mode supported via design tokens; no hardcoded colors.
- Every list paginated (≤ 100/page) with empty/loading/error states; destructive actions confirmed with typed reason.
- Real fields and live data only — no skeleton placeholders in delivered screens.
- Toasts for async results; inline validation with field-level error from API envelope.
- Bilingual labels (English + regional) on statutory documents/orders.

---

## 8. API & Integration

### 8.1 Conventions
REST under `/api/v1`; JWT bearer; RBAC + row-level scope; cursor/page pagination (`?cursor=` or `?page=&limit=` max 100); idempotency keys on POST that trigger external signals; ISO-8601 UTC timestamps; `DD-MMM-YYYY` display handled client-side.

### 8.2 Error envelope & module error-code catalog
Canonical envelope: `{ "error": { "code", "message", "field" }, "requestId" }`.

| Code | HTTP | Meaning |
|---|---|---|
| VALIDATION_ERROR | 400 | Field/payload invalid |
| AUTH_REQUIRED | 401 | Missing/expired token |
| FORBIDDEN | 403 | Role/scope/SoD violation |
| NOT_FOUND | 404 | Entity not found |
| CONFLICT | 409 | Generic conflict |
| TRJ_ACTIVE_TRANSFER_EXISTS | 409 | Employee already has active order |
| TRJ_ELIGIBILITY_BLOCKED | 422 | Hard-block policy failure |
| TRJ_BAN_WINDOW_ACTIVE | 422 | Transfer falls in ban period |
| TRJ_CLEARANCE_INCOMPLETE | 409 | Relieving attempted before clearance |
| TRJ_HANDOVER_DISPUTED | 409 | Charge handover not accepted |
| TRJ_NOT_IN_TRANSIT | 409 | Joining before relief |
| TRJ_DEPUTATION_CAP_EXCEEDED | 422 | Extension beyond max tenure |
| TRJ_SR_POST_FAILED | 503 | SR posting failed (retryable) |
| TRJ_VACANCY_FULL | 409 | Allotment to filled vacancy |
| RATE_LIMITED | 429 | Throttled |
| UPSTREAM_UNAVAILABLE | 503 | M01/M10/M12/M13 unavailable |
| INTERNAL_ERROR | 500 | Unexpected |

### 8.3 Integration points
| System | Direction | Purpose |
|---|---|---|
| M01 Employee Master | Read/Write | Validate transferee; update posting on join; reverse on revoke |
| M06 Promotion/Seniority | Read/Trigger | Promotion-linked transfer trigger; seniority/sanctioned-strength |
| M10 Payroll | Signal | Pay-stop, pay-start, LPC, dues recovery |
| M12 Digital SR | Write | SR events (order/relieve/join) via outbox |
| M13 Documents | Read/Write | Order, clearance, handover, joining PDFs |
| Workflow engine | Read/Write | Approval routing |
| Notifications | Write | Lifecycle notifications |

### 8.4 JSON examples
**Create transfer request — request**
```json
POST /api/v1/transfers/requests
{
  "employeeId": "a1111111-1111-1111-1111-111111111111",
  "transferType": "TRANSFER_ON_REQUEST",
  "requestOrigin": "SELF",
  "sourceOrgUnitId": "ou-dist-a",
  "requestedDestOrgUnitId": "ou-dist-b",
  "ground": "SPOUSE",
  "priorityCategory": "PROTECTED_SPOUSE",
  "supportingDocumentIds": ["doc-spouse-posting-001"],
  "requestedEffectiveDate": "2026-04-15"
}
```
**Response (201)**
```json
{
  "transferRequestId": "req-0001",
  "requestNo": "TRQ-2026-000123",
  "status": "DRAFT",
  "eligibilityResult": null
}
```
**Issue relieving order — error (clearance incomplete)**
```json
{
  "error": {
    "code": "TRJ_CLEARANCE_INCOMPLETE",
    "message": "Clearance checklist NOD-2026-000790 has 2 outstanding items (IT, ADVANCES).",
    "field": "clearanceChecklistId"
  },
  "requestId": "req-9f2c..."
}
```
**Confirm joining — response (200)**
```json
{
  "joiningReportId": "jr-0456",
  "joiningReportNo": "JR/2026/04/0456",
  "status": "JOINED_CONFIRMED",
  "joiningDate": "2026-04-15",
  "transitDays": 4,
  "transitWithinAdmissible": true,
  "srEvent": { "type": "JOINED", "status": "DELIVERED" },
  "payStartSignalled": true
}
```

---

## 9. Non-Functional Requirements
| Category | Requirement |
|---|---|
| Performance | P95 API < 500ms; dashboard aggregates < 2s; bulk drive of 1,000 orders processed < 30 min (async). |
| Availability | 99.9% uptime; external-signal outbox guarantees no data loss during M10/M12 downtime. |
| Scalability | Horizontal scaling; batch jobs queue-based; supports 100k active employees, 20k transfers/year. |
| Security | OIDC/SSO + MFA; RBAC + row-level org scope; SoD invariants; OWASP ASVS; parameterised queries only; secrets via env. |
| Data integrity | All multi-step writes transactional; external signals via transactional outbox; idempotency keys; no orphan records. |
| Auditability | Every state change in `audit_log` with before/after + actor + requestId; immutable SR events. |
| Privacy/Compliance | DPDP Act 2023 alignment; PII minimisation; statutory retention of orders/SR; no PII in logs. |
| Accessibility | WCAG 2.1 AA across all screens. |
| Observability | Structured logs, metrics (clearance time, transit days, SR failure rate), traces with requestId. |
| Resilience | RPO ≤ 15min, RTO ≤ 4h; retries with backoff; dead-letter + reconciliation for SR. |
| i18n/L10n | Bilingual order templates; locale dates/currency; timezone-aware display. |

---

## 10. Workflow & State Diagrams (state tables)

### 10.1 Transfer Order state table
| From | Event | Guard | To | Side effects |
|---|---|---|---|---|
| DRAFT | submit-for-approval | eligibility ≠ hard-block | PENDING_APPROVAL | workflow opened |
| PENDING_APPROVAL | approve | maker≠checker, re-eligibility pass | APPROVED | order_no, PDF |
| PENDING_APPROVAL | reject | — | CANCELLED | notify |
| APPROVED | publish | PDF present | PUBLISHED | SR TRANSFER_ORDERED, clearance created, notify |
| PUBLISHED | start-relieving | — | RELIEVING_IN_PROGRESS | — |
| RELIEVING_IN_PROGRESS | issue-relieving | clearance cleared + handover accepted | RELIEVED | relieving order, pay-stop, LPC, SR RELIEVED |
| RELIEVED | enter-transit | — | IN_TRANSIT | transit counter |
| IN_TRANSIT | confirm-joining | order in transit | JOINED | joining report, pay-start, M01 update, SR JOINED |
| PUBLISHED/RELIEVING_IN_PROGRESS | amend | pre-relief | AMENDED | supersede, new revision, SR correction |
| PUBLISHED/RELIEVING_IN_PROGRESS | cancel | pre-relief | CANCELLED | reverse clearance/handover |
| RELIEVED/IN_TRANSIT/JOINED | revoke | authority approve | REVOKED | compensating SR, pay/M01 reversal |

### 10.2 Clearance checklist state table
| From | Event | Guard | To |
|---|---|---|---|
| OPEN | first item updated | — | IN_PROGRESS |
| IN_PROGRESS | item dues outstanding | — | BLOCKED |
| IN_PROGRESS | all items cleared | no dues | CLEARED |
| BLOCKED | dues recovery linked | recovery_ref set | CLEARED_WITH_DUES |
| any | order cancelled | — | CANCELLED |

### 10.3 Joining report state table
| From | Event | Guard | To |
|---|---|---|---|
| DRAFT | submit | order IN_TRANSIT | SUBMITTED |
| SUBMITTED | HR verify | — | UNDER_VERIFICATION |
| UNDER_VERIFICATION | confirm | transit within admissible OR authority review done | JOINED_CONFIRMED |
| UNDER_VERIFICATION | flag late | transit > admissible+grace | LATE_JOINING_REVIEW |
| LATE_JOINING_REVIEW | authority decide | — | JOINED_CONFIRMED / REJECTED |

### 10.4 Deputation state table
| From | Event | Guard | To |
|---|---|---|---|
| ACTIVE | request extension | — | EXTENSION_REQUESTED |
| EXTENSION_REQUESTED | approve | within max tenure | EXTENDED |
| ACTIVE/EXTENDED | tenure nearing end | within alert window | REPATRIATION_DUE |
| REPATRIATION_DUE | repatriate | reverse order joined | REPATRIATED |

---

## 11. Notifications
| Event | Recipients | Channel | Template key |
|---|---|---|---|
| Request submitted | Recommender, HR | In-app, email | TRJ_REQ_SUBMITTED |
| Eligibility blocked | Initiator | In-app | TRJ_ELIGIBILITY_BLOCKED |
| Order published | Transferee, source HR, dest HR | In-app, email, SMS | TRJ_ORDER_PUBLISHED |
| Clearance item pending (SLA) | Clearance Officer | In-app, email | TRJ_CLEARANCE_REMINDER |
| Clearance with dues | Transferee, Accounts, source HR | In-app, email | TRJ_DUES_OUTSTANDING |
| Relieving order issued | Transferee, both offices, Payroll | In-app, email | TRJ_RELIEVED |
| In-transit overdue | Transferee, both offices, Authority | In-app, email | TRJ_TRANSIT_OVERDUE |
| Joining confirmed | Transferee, both offices, Payroll, SR | In-app, email | TRJ_JOINED |
| SR posting failed | SR Custodian | In-app, email | TRJ_SR_FAILED |
| Deputation repatriation due | HR Admin, Authority, deputee | In-app, email | TRJ_REPATRIATION_DUE |
| Order amended/cancelled/revoked | Affected parties | In-app, email | TRJ_ORDER_CORRECTED |

Notification preferences are user-configurable; statutory notifications (order/relieve/join) cannot be opted out.

---

## 12. Reporting & Analytics
| Report | Description | Audience |
|---|---|---|
| Transfer Register | All orders by type/status/office with dates | HR, Authority, Auditor |
| Relieving Pendency | Orders published but not relieved beyond SLA | HR Source, Authority |
| Clearance Bottleneck | Avg clearance time by department; outstanding dues | HR Admin, Accounts |
| In-Transit / Overdue | Employees in transit, elapsed vs admissible | HR, Authority |
| Joining Compliance | Joinings by transit-admissibility; late joinings | Authority, Auditor |
| SR Posting Health | SR events delivered/pending/failed | SR Custodian |
| Drive Progress | Per-drive stage funnel and pendency | HR Admin |
| Deputation Tenure | Active deputations, due/overdue repatriations | HR Admin, Authority |
| Vacancy & Strength | Sanctioned vs filled vs vacant by office/cadre | Authority |

All reports respect row-level scope, are paginated, exportable (CSV/PDF), and feed M14 cross-module dashboards.

---

## 13. Migration & Launch

### 13.1 Data migration
- Import historical transfer/relieving/joining records from legacy registers into `transfer_orders`/`relieving_orders`/`joining_reports` with a `legacy_ref` tag; statuses normalised to terminal (`JOINED`/`CANCELLED`).
- Backfill in-flight transfers into the correct live state (e.g., relieved-but-not-joined → `IN_TRANSIT`).
- Seed `transfer_policy_rules`, `transfer_ban_periods`, office clearance-department configs, and order templates.
- Reconcile legacy SR entries with M12; post compensating events only where gaps exist (no duplicates).

### 13.2 Cutover & launch
- Dual-run period: legacy + HRMS for one transfer cycle; reconcile counts.
- Phased rollout: pilot offices → cadre-wise → org-wide; bulk-drive features enabled after pilot sign-off.
- Go/No-Go gates: SR posting health ≥ 99.9% in pilot; zero unresolved data-integrity exceptions; UAT sign-off by Transfer Authority + SR Custodian.
- Rollback: feature-flag disable of write paths; outbox drains before cutover; backups verified (RPO ≤ 15min).

### 13.3 Training & support
- Role-based guides (employee self-service, clearance officer, HR, authority).
- In-app contextual help on each wizard; SR reconciliation runbook for custodians.

---

## 14. Traceability / Dependency / Parallel-Agent Plan

### 14.1 Traceability matrix
| FR | Entities (primary) | APIs | Dependencies | SR event |
|---|---|---|---|---|
| FR-TRJ-001 | transfer_requests | /requests* | M01, M13, workflow, FR-002 | — |
| FR-TRJ-002 | policy_rules, ban_periods | /eligibility, /override | M01, M06, FR-001 | — |
| FR-TRJ-003 | drives, preferences, vacancy_positions | /drives*, /preferences, /allot | M06, FR-002/004/005 | — |
| FR-TRJ-004 | transfer_orders | /orders* | M12, M13, workflow, FR-002/003/006/011/012 | TRANSFER_ORDERED |
| FR-TRJ-005 | drives, orders | /drives/* | FR-002/003/004 | (per order) |
| FR-TRJ-006 | clearance_checklists/items | /clearance* | M10, M13, FR-004/008 | — |
| FR-TRJ-007 | charge_handovers | /charge-handover* | FR-006/008/010 | — |
| FR-TRJ-008 | relieving_orders | /relieving-order* | M10, M12, M13, FR-006/007/009/012 | RELIEVED |
| FR-TRJ-009 | transfer_orders (transit) | /in-transit, /extend | calendar, FR-008/010 | — |
| FR-TRJ-010 | joining_reports, charge_handovers | /joining-report* | M01, M10, M12, FR-008/009/011/012 | JOINED |
| FR-TRJ-011 | deputation_records | /deputations* | FR-002/004/008/010 | — |
| FR-TRJ-012 | service_register_events, outbox | /sr*, /sr-reconciliation | M12, FR-004/008/010 | all |
| FR-TRJ-013 | transfer_orders + dependents | /amend, /cancel, /revoke | M01, M10, M12, FR-004/006/008/010/012 | compensating |
| FR-TRJ-014 | all M05 entities (read) | /analytics*, /map* | M14 | — |

### 14.2 Dependency / build order
1. **Foundation:** entity migrations, policy/ban seed, order templates.
2. **FR-TRJ-002** (eligibility engine) — prerequisite for 001/003/004.
3. **FR-TRJ-001** (request intake).
4. **FR-TRJ-012** (SR outbox) — prerequisite for 004/008/010 side effects.
5. **FR-TRJ-004** (orders) → **FR-TRJ-006** (clearance), **FR-TRJ-007** (handover).
6. **FR-TRJ-008** (relieving) → **FR-TRJ-009** (transit) → **FR-TRJ-010** (joining).
7. **FR-TRJ-003/005** (counselling/drives) layered on 002/004.
8. **FR-TRJ-011** (deputation), **FR-TRJ-013** (corrections), **FR-TRJ-014** (analytics) last.

### 14.3 Parallel-agent plan
| Agent | Owns FRs | Shared contracts to honour |
|---|---|---|
| Agent A (Intake & Policy) | FR-TRJ-001, 002 | request/eligibility API + enums |
| Agent B (Orders & Drives) | FR-TRJ-003, 004, 005 | order entity, order_no sequence, SR outbox client |
| Agent C (Relieving) | FR-TRJ-006, 007, 008 | clearance/handover/relieving entities, M10 signal client |
| Agent D (Transit & Joining) | FR-TRJ-009, 010 | M01 update client, M10 pay-start, SR client |
| Agent E (SR, Deputation, Corrections, Analytics) | FR-TRJ-011, 012, 013, 014 | SR outbox, reversal orchestrator, read models |

Shared interface contracts (entities §5, error catalog §8.2, state tables §10, SR outbox §FR-012) are frozen before parallel work to prevent drift.

### 14.4 Final Reconciliation Table (0 unresolved gaps)
| Concern | Required | Provided | Status |
|---|---|---|---|
| All 16 sections present | Yes | §1–§16 | RESOLVED |
| 10–16 FRs | Yes | 14 FRs | RESOLVED |
| Each FR full structure + LLD | Yes | All FRs | RESOLVED |
| Module entities defined with fields + samples | Yes | 13 module entities §5.2/§5.7 | RESOLVED |
| Shared entities reused not redefined | Yes | §5.4 references M01/M12/M13/platform | RESOLVED |
| All transfer types covered | Yes | enum + FR-001/004/011 | RESOLVED |
| Relieving (no-dues, handover, order, LWD) | Yes | FR-006/007/008 | RESOLVED |
| Joining (report, charge assumption, date) | Yes | FR-010 | RESOLVED |
| Transit/gap handling | Yes | FR-009 | RESOLVED |
| SR posting (M12 link) | Yes | FR-012 + traceability SR column | RESOLVED |
| Policy constraints (tenure/ban/protected/deputation) | Yes | FR-002/011 | RESOLVED |
| World-class features (counselling, drives, mapping) | Yes | FR-003/005/014 | RESOLVED |
| Error catalog + JSON examples | Yes | §8.2/§8.4 | RESOLVED |
| State tables | Yes | §10 | RESOLVED |
| Notifications, Reporting, Migration | Yes | §11/§12/§13 | RESOLVED |
| Glossary, Appendices | Yes | §15/§16 | RESOLVED |
| Unresolved gaps | 0 | 0 | RESOLVED |

---

## 15. Glossary
| Term | Definition |
|---|---|
| Transfer order | Sanctioned, numbered statutory document moving an employee from source to destination office. |
| Relieving | Formal release of an employee from the source office after clearance and handover. |
| No-dues / clearance | Departmental certification (IT, Library, Accounts, Stores, Advances, Estate) that no dues/assets are outstanding. |
| Charge handover/assumption | Transfer of duties, records, assets and cash from relinquishing to receiving officer (source) and assumption at destination. |
| Last Working Day (LWD) | Final day of duty at source; basis for pay-stop and transit computation. |
| Joining report | Document by which a transferee reports and assumes duty at the destination, fixing the joining date. |
| Transit period | Time between LWD and joining date; bounded by admissible joining time. |
| Joining time | Statutorily admissible working days allowed to travel and join. |
| Transfer-on-request | Transfer initiated by the employee, vs administrative (org-initiated). |
| Mutual transfer | Reciprocal exchange of two employees between offices. |
| Deputation | Temporary posting to a borrowing organisation with defined tenure and repatriation. |
| Repatriation | Return of a deputed employee to the lending organisation. |
| Ban/freeze period | Window (e.g., election MCC) during which transfers are restricted. |
| Sanctioned strength | Authorised number of posts in an office/cadre; basis for vacancy. |
| LPC | Last Pay Certificate issued by source payroll on relieving. |
| SR event | Append-only entry in the Digital Service Register (M12). |
| Counselling | Preference-based allotment process in a transfer drive. |

## 16. Appendices

### 16.1 Sequence (happy path, narrative)
Request → eligibility pass → recommend → Authority approve → order_no + PDF → publish (SR TRANSFER_ORDERED, clearance created) → departments clear → handover accepted → relieving order + LWD (pay-stop, LPC, SR RELIEVED) → IN_TRANSIT (joining-time clock) → report at destination → charge assumption → confirm joining (pay-start, M01 update, SR JOINED).

### 16.2 Office clearance-department default config
IT, LIBRARY, ACCOUNTS, STORES, ADVANCES, ESTATE_QUARTERS, HR — configurable per office; an office may add `OTHER` named departments.

### 16.3 Outbox & idempotency note
External signals (M10 pay-stop/start, M12 SR, M01 posting) are written to a transactional outbox in the same DB transaction as the local state change and dispatched asynchronously with idempotency keys and exponential backoff; dead-lettered items surface in the SR Reconciliation Console (FR-TRJ-012).

### 16.4 Open configuration parameters
Minimum-tenure months, near-retirement protection window, cooling period, joining-time days by distance band, clearance SLA hours per department, deputation max tenure, drive preference window length — all System-Administrator-configurable master data with seeded defaults.

---
*End of M05-TRJ BRD v1.0*
