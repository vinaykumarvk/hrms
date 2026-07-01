# G13 Document-Management — Prototype ↔ Schema Reconciliation

**Scope:** PrimeSoft prototype document-management screens (document master / vault / storage /
versioning / templates / merge fields / letter queue / bulk letters / sign-off tracker /
acknowledgement campaign / policy library / policy acknowledgement).
**Owned schema file:** `docs/data-model/13-G13-document-management.sql`.
**Sources (ground truth):** `docs/data-model/reconciliation/prototype-extract/` —
`da-templates`, `da-doc-master`, `da-vault`, `da-storage`, `da-versioning`, `da-categories`,
`da-policies`, `da-merge-fields`, `da-letter-queue`, `da-bulk-letters`, `da-signoff-tracker`,
`da-ack-campaign`, `documents-oversight`, `document-upload`, `upload-document`,
`document-clusters`, `letters`, `my-letters`, `policies`, `policy-ack`.

**Legend:** PRESENT = already representable; PARTIAL = concept exists but a value/nuance leans
on an existing column or derived count; MISSING = no home in schema (added in SECTION G).
**DATA vs CONFIG** is called out per row. This pass is disjoint from the prior CSV pass
(`g13-documents.md`), which already added `document_categories`,
`document_template_name_formats`, `policy_letter_settings`, `self_generate_settings` (all CONFIG).
The vault core (`documents`, `document_versions`, `document_types`, `folders`, retention,
holds, signatures) is **unchanged**.

---

## 1. Document master / vault / storage / versioning — mostly PRESENT (DATA + CONFIG)

### da-doc-master (CONFIG — document-type master) & document-upload / upload-document (DATA)

| Prototype field/column (screen) | maps to G13 table.column | Status | Decision |
|---|---|---|---|
| Document type (da-doc-master, upload-document) | `document_types.name` / `.type_code` | PRESENT | CONFIG master |
| Category (da-doc-master, document-upload) | `document_types.category` (`g13_doc_category`) | PRESENT | closed enum ladder |
| Retention class (da-doc-master, da-versioning) | `document_types.default_retention_policy_id` → `document_retention_policies` | PRESENT | CONFIG |
| Mandatory at onboarding (da-doc-master) | onboarding-cluster config (G02/M02) | PARTIAL | CONFIG owned by onboarding-cluster module; not a G13 column |
| Cluster (M02) / Surfaces in (da-doc-master) | onboarding cluster + `document_links.module_code` | PARTIAL | "Surfaces in" is the M02 cluster/module mapping (out of G13); attach recorded via `document_links` |
| Document / File / Effective date / Notes (upload-document) | `documents` + `document_versions` (title, storage, content_hash) | PRESENT | DATA |
| Status: Pending / Uploaded / Awaiting verification (document-upload, da-vault) | `documents.status` (`document_status`) + `scan_status` | PARTIAL | "Awaiting verification" maps to a lifecycle status value; verify is an audited action (`document_audit.action`), not a new column |
| Required documents / Replace / Upload (document-upload) | `documents` version chain (`version_kind`) | PRESENT | DATA — replace = new `document_versions` row |

### da-vault (DATA — employee document vault) & documents-oversight

| Prototype field/column (screen) | maps to G13 table.column | Status | Decision |
|---|---|---|---|
| Employee / Document type / Uploaded (da-vault) | `documents.owner_employee_id` / `document_type_id` / `created_at` | PRESENT | DATA |
| Cluster / Scope (Tenant-wide / entity / Own only) (da-vault) | `folders.folder_type` + `documents.entity_id` + RLS scope | PRESENT | DATA + scope |
| Role / Vault access matrix (DM19): HR Admin, HRBP, Manager L1, Auditor, Org Admin | `document_acls.principal_type` / `principal_ref` / `rights` / `effect` | PRESENT | DATA — ACL grants (VIEW/DOWNLOAD/read-only/no-access) |
| Action: Upload / Replace / Verify (da-vault) | `document_audit.action` (VERSION_ADD / METADATA_UPDATE / …) | PRESENT | DATA — audited actions |
| Status: Yes (audit-logged) / read-only / until verified (da-vault) | `document_acls.rights` + `document_audit` | PRESENT | derived from ACL + audit |

### da-storage (CONFIG/infra + DATA audit) & da-versioning (CONFIG — retention rules)

| Prototype field/column (screen) | maps to G13 table.column | Status | Decision |
|---|---|---|---|
| Object storage / Encryption at rest & in transit / KMS (da-storage) | `storage_objects.bucket / object_key / encryption_alg / kms_key_id / wrapped_dek` | PRESENT | DATA |
| Storage class: Hot / Cold-tier archive / WORM (da-storage, da-versioning) | `storage_objects.storage_class` (`g13_storage_class`) + `worm_retain_until` | PRESENT | DATA |
| Virus scanning / Virus quarantine / Large file rejected (da-storage) | `scan_results.malware_verdict / threat_name / decompressed_ratio` | PRESENT | DATA (append-only) |
| Pre-signed URL audit / Recent security events (90d) (da-storage) | `document_audit` (SHARE/DOWNLOAD/…) + `document_shares` | PRESENT | DATA |
| DR replica / Primary region / Total storage / usage-by-category (da-storage) | infra/observability metrics | PARTIAL | infra config/telemetry — not a schema DATA table |
| Retention class rules: Hot retention / Cold retention / Final disposition (da-versioning) | `document_retention_policies.retention_period_months / disposition_action / is_permanent` | PRESENT | CONFIG |
| Cold-tier transition trigger / after 90 days unchanged (da-versioning) | `storage_objects.storage_class` + retention job | PRESENT | CONFIG-driven job |
| All-versions / Acknowledgement record / Sign-off transactions retention (da-versioning) | retention class examples (see §5 ack tables) | PRESENT | CONFIG examples |

---

## 2. Templates & merge fields (da-templates, letters, da-merge-fields)

| Prototype field/column (screen) | maps to G13 table.column | Status | Decision |
|---|---|---|---|
| Template name / Code / Version / Status (da-templates, letters) | logical ref via `document_types.letter_template_ref` | PARTIAL | **CONFIG** — the letter-template register (Template inventory DM20) is an M11-owned master referenced by a logical uuid; **not added** (kept as external config ref, consistent with existing design) |
| Trigger (On confirmation / On promotion approval / …) (da-templates) | letter-template register (M11) | PARTIAL | CONFIG — template trigger metadata lives with the external register |
| Invoked by (M01 / M02 / M03 / M08 / M09 …) (da-templates) | letter-template register (M11) | PARTIAL | CONFIG — module-origin metadata on the external register |
| Signature (da-templates) | `document_types.requires_signature` / `allowed_signature_types` | PRESENT | CONFIG |
| Type / Variables / Last updated (letters) | template register + `merge_field_catalog` | PARTIAL | "Variables" = merge fields (see below) |
| **Merge field / token {{ }} (da-merge-fields)** | `merge_field_catalog.field_key` | **MISSING** | **ADD** `merge_field_catalog`; `UNIQUE (tenant_id, field_key)` |
| Merge-field label ("L1 manager full name") (da-merge-fields) | `merge_field_catalog.label` | MISSING | ADD |
| Source (M01 / M03 / M06 / M08 / P04 / System) (da-merge-fields) | `merge_field_catalog.source` (varchar — open set) | MISSING | ADD |
| Notes (Resolved at sign time / Populated only for confirmed / Used in FnF) (da-merge-fields) | `merge_field_catalog.resolution_note` | MISSING | ADD |

*(Merge-field catalogue is a reference/config-adjacent catalogue but explicitly in the recon
add-list; it is the variable dictionary the letter-generation DATA below resolves against.)*

---

## 3. Letter queue & bulk letters (da-letter-queue, da-bulk-letters, my-letters) — DATA

| Prototype field/column (screen) | maps to G13 table.column | Status | Decision |
|---|---|---|---|
| **Letter type (da-letter-queue)** | `letter_generation_requests.letter_type` | **MISSING** | **ADD** `letter_generation_requests` |
| Employee / Candidate (da-letter-queue) | `letter_generation_requests.employee_id` (null for candidates) + `subject_name` | MISSING | ADD; nullable FK employees + display name |
| Merge fields: "All 10 resolved" (da-letter-queue) | `letter_generation_requests.merge_fields_total / merge_fields_resolved` | MISSING | ADD |
| Requested by (HR Admin M09 cycle / M03 flow / self-service) (da-letter-queue) | `letter_generation_requests.requested_by` + `request_context` | MISSING | ADD |
| Signer(s): Awaiting HR sig / CEO sig (da-letter-queue) | `letter_generation_requests.signer_summary` + `signature_request_id` (→ `signature_requests`) | PARTIAL→MISSING | `signature_requests` covers signing; the **generation queue** state (requested-by, merge-resolution, validation) had no home → ADD |
| Status: Scheduled / Validation error / Awaiting sig (da-letter-queue) | `letter_generation_requests.status` (`g13_letter_request_status`) + `validation_error` / `scheduled_at` | MISSING | ADD; new enum |
| Action: Resolve (da-letter-queue) | app action on the request row | MISSING | ADD (covered by status transition) |
| **Job / Template / Records / Progress / Failed / ETA / Status (da-bulk-letters)** | `bulk_letter_jobs.*` | **MISSING** | **ADD** `bulk_letter_jobs`; generic core `jobs` doesn't carry letter batch counters → new table (`job_ref` logical ref to `jobs`) |
| Bulk status: In progress / Complete / Failed / Held / Awaiting ack / Awaiting employee action / Sign-off (no letter) (da-bulk-letters) | `bulk_letter_jobs.status` (`g13_bulk_job_status`) | MISSING | ADD; new enum |
| My letters: Document / Type / Issued on / Download (my-letters) | `documents` (produced letter) + `document_links` | PRESENT | DATA — issued letters are documents; view over `letter_generation_requests.generated_document_id` |

---

## 4. Sign-off tracker & acknowledgement campaign (da-signoff-tracker, da-ack-campaign) — DATA

| Prototype field/column (screen) | maps to G13 table.column | Status | Decision |
|---|---|---|---|
| **Policy / Letter (da-signoff-tracker) / Document (da-ack-campaign)** | `acknowledgement_campaigns.document_id` (+ `document_title`) | **MISSING** | **ADD** `acknowledgement_campaigns` |
| Audience / Audience (UAG / population) (da-signoff-tracker, da-ack-campaign) | `acknowledgement_campaigns.audience_description` + `audience_uag_ref` | MISSING | ADD; UAG is a logical ref |
| Purpose (annual refresh / non-repudiation) (da-signoff-tracker) | `acknowledgement_campaigns.purpose` | MISSING | ADD |
| Reminder cadence (Weekly / Every 3 days / Daily final week) (da-ack-campaign) | `acknowledgement_campaigns.reminder_cadence` | MISSING | ADD |
| Escalate after SLA to (da-ack-campaign) | `acknowledgement_campaigns.escalate_after_sla_to` | MISSING | ADD (logical role ref) |
| Started / Deadline / Closing (da-signoff-tracker) | `acknowledgement_campaigns.started_at / deadline / status` (`g13_ack_campaign_status`) | MISSING | ADD; new enum (DRAFT/ACTIVE/CLOSING/COMPLETE) |
| Acknowledged / Assigned / Pending / Overdue counts (da-signoff-tracker, documents-oversight) | `acknowledgement_campaigns.acknowledged_count / assigned_count / pending_count / overdue_count` | MISSING | ADD (rollup counters) |
| Save draft / Launch campaign / New campaign (da-ack-campaign) | `acknowledgement_campaigns.status` transitions | MISSING | ADD |

---

## 5. Policy acknowledgement record — non-repudiation (policy-ack, documents-oversight, DM25) — DATA

| Prototype field/column (screen) | maps to G13 table.column | Status | Decision |
|---|---|---|---|
| **Who acknowledged (da-signoff-tracker DM25, policy-ack "Self")** | `document_acknowledgements.employee_id` | **MISSING** | **ADD** `document_acknowledgements` |
| Which version was active at the time (DM25) | `document_acknowledgements.document_version_no` | MISSING | ADD |
| What was acknowledged (DM25) / Document (policy-ack) | `document_acknowledgements.document_id` (+ `document_title`) | MISSING | ADD |
| Snapshot of the consent text shown (DM25) | `document_acknowledgements.consent_text_snapshot` | MISSING | ADD (write-once snapshot) |
| Browser / app version (DM25) | `document_acknowledgements.app_version` (+ `ip_address`) | MISSING | ADD |
| Status: Acknowledge / Read / Pending / Awaiting (policy-ack, documents-oversight) | `document_acknowledgements.status` (`g13_ack_status`) | MISSING | ADD; new enum (PENDING/ACKNOWLEDGED/OVERDUE) |
| Issued / Due (policy-ack) | `document_acknowledgements.assigned_at / due_date / acknowledged_at` | MISSING | ADD |
| Audit linkage / Non-repudiation / consent basis (da-signoff-tracker) | `document_acknowledgements.consent_record_id` → core `consent_records` | PARTIAL→MISSING | platform `consent_records` is the DPDP consent ledger; the per-policy version-snapshot ack had no home → ADD with optional linkage |

---

## 6. Policy library & policy categories (da-policies, policies, da-categories) — CONFIG/derived

| Prototype field/column (screen) | maps to G13 table.column | Status | Decision |
|---|---|---|---|
| Policy name / Version / Last updated (da-policies, policies) | `documents.title` + `document_versions.version_no` | PRESENT | DATA — a policy is a `documents` row of a policy type |
| Category: Finance / Legal / COVID-19 (da-policies, da-categories) | `document_tags` (CLASSIFICATION/KEYWORD) or `document_types.category` | PARTIAL | CONFIG — policy grouping via tags/type; **not** a new master (distinct from CSV `document_categories`) |
| Policy categories master: Examples / Notes / Policy count / Status (da-categories) | derived count over policies + `document_tags` | PARTIAL | CONFIG/derived — **not added** (reference-only grouping; policy_count is a rollup) |
| Sign-off (yes/no) (da-policies) | `document_types.requires_signature` + presence of `acknowledgement_campaigns` | PRESENT | CONFIG + DATA |
| Acknowledgement rate (da-policies, documents-oversight) | derived: `acknowledgement_campaigns.acknowledged_count / assigned_count` | PRESENT | derived rollup |
| Acknowledge in queue / required (policies) | `document_acknowledgements` (§5) | PRESENT | DATA |
| Archived (DM15) / Published (da-policies) | `documents.status` (`document_status`) | PRESENT | DATA |

---

## 7. Document clusters (document-clusters) — CONFIG (onboarding/M02, out of G13 DATA scope)

| Prototype field/column (screen) | maps to G13 table.column | Status | Decision |
|---|---|---|---|
| Cluster name / type / templates (Sign-Off / Undertaking / Reference) (document-clusters) | onboarding-cluster config (G02/M02) | PARTIAL | CONFIG owned by the onboarding module; G13 stores the produced documents + `document_links` |
| Documents to include (M11 DM17) (document-clusters) | `document_types` catalogue + link at generation | PARTIAL | CONFIG mapping owned by cluster template |
| Signature method: Aadhaar e-sign (NeSL) / DocuSign / In-app draw (document-clusters) | `document_types.allowed_signature_types` + `signatures.signature_type` (`g13_signature_type`) | PRESENT | CONFIG + DATA |
| Sign-off required / Completion gate / SLA for completion / Auto-escalation (document-clusters) | onboarding-cluster config + `sla_settings` (core) | PARTIAL | CONFIG owned by cluster/onboarding; sign-off DATA lands in `acknowledgement_campaigns` / `signature_requests` |
| Cluster status by candidate / Overall / Mandatory / Joining date (document-clusters) | onboarding progress (G02/M02) | PARTIAL | DATA owned by onboarding module; not G13 |

---

## Summary of decisions

- **New enums (SECTION G):** `g13_letter_request_status`, `g13_bulk_job_status`,
  `g13_ack_campaign_status`, `g13_ack_status`.
- **New DATA tables (SECTION G):** `merge_field_catalog`, `letter_generation_requests`,
  `bulk_letter_jobs`, `acknowledgement_campaigns`, `document_acknowledgements`.
- All follow CONVENTIONS: `uuid` PK, `tenant_id`/`entity_id`, standard audit set,
  tenant-scoped RLS (FORCE), FK + query indexes, tenant-scoped business-key uniqueness.
- **Not added (config / derived / other-module-owned):** letter-template register
  (M11 config via `document_types.letter_template_ref`), policy library / policy categories
  (documents + tags + derived counts), document-cluster templates & onboarding progress
  (G02/M02 config), storage infra/DR telemetry.
- Letter-template / letter-head / signing-authority / UAG-population references are stored as
  **logical refs** (masters owned outside G13 DATA scope) — no cross-module FK.
- The prior CSV pass additions (`document_categories`, `document_template_name_formats`,
  `policy_letter_settings`, `self_generate_settings`) are **not** re-added.

### Counts

| Status | Count |
|---|---|
| PRESENT | 24 |
| PARTIAL | 16 |
| MISSING | 25 (business fields homed in the 5 new SECTION G tables) |

*(PARTIAL includes rows spanning two verdicts, e.g. "PARTIAL→MISSING" where an existing table
covers part of the concept and a new column/table covers the rest; those are tallied under
MISSING for the added field and noted inline.)*
