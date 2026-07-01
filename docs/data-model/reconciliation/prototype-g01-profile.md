# G01 Employee-Profile — Prototype Screen Reconciliation

**Date:** 2026-07-01
**Owner file:** `docs/data-model/01-G01-employee-profile.sql` (SECTION 7 — RECON prototype additions)
**Core file (unchanged):** `docs/data-model/00-platform-core.sql`
**Sources reconciled:** PrimeSoft prototype field extracts in
`docs/data-model/reconciliation/prototype-extract/` for the 23 employee-profile / directory /
org-chart screens listed below.
**Prior recon (not re-added here):** `docs/data-model/reconciliation/g01-profile-fields.md`
(CustomFields / National_ID / Profile.docx CSV recon → SECTION 6 additions:
`national_id_types`, `employee_personal_details`, `custom_field_definitions` extras).

**Legend** — Status: PRESENT (already modelled) · PARTIAL (modelled but a real attribute was
missing) · MISSING (absent). Decision: add-column · new-table · already-present ·
note-as-UI/config · out-of-scope. Rows marked **(added)** ship in SECTION 7.

Pure UI chrome (buttons, tab labels, "My profile", "Save changes", visibility toggles,
search placeholders, masking display strings like `XXXX XXXX 4321`) is excluded.

---

## A. Data-entry screens (dedicated add/edit forms)

| Prototype field (screen) | maps to schema table.column | Status | Decision |
|---|---|---|---|
| Skill name (add-skill) | `employee_skills.skill_name` | MISSING | **new-table (added)** |
| Proficiency Beginner/Intermediate/Advanced/Expert (add-skill) | `employee_skills.proficiency` (enum `g01_skill_proficiency`) | MISSING | **new-table (added)** |
| Years of experience (add-skill) | `employee_skills.years_of_experience` | MISSING | **new-table (added)** |
| Last used (add-skill) | `employee_skills.last_used_date` | MISSING | **new-table (added)** |
| Country (add-visa) | `employee_visas.country` | MISSING | **new-table (added)** |
| Visa type — Employment Pass/Dependent visa/Schengen/Other (add-visa) | `employee_visas.visa_type` (+ `is_dependent_visa`) | MISSING | **new-table (added)** |
| Visa number (add-visa) | `employee_visas.visa_number` | MISSING | **new-table (added)** |
| Issue date / Valid till (add-visa) | `employee_visas.issue_date` / `valid_till` | MISSING | **new-table (added)** |
| Issuing authority (add-visa) | `employee_visas.issuing_authority` | MISSING | **new-table (added)** |
| Maximum stay (days per entry) (add-visa) | `employee_visas.max_stay_days` | MISSING | **new-table (added)** |
| Sponsored by — Self/External sponsor (add-visa) | `employee_visas.sponsor_type` (enum `g01_visa_sponsor_type`) + `sponsored_by` | MISSING | **new-table (added)** |
| Visa scan / soft copy (add-visa) | `employee_visas.scan_document_id` → `documents` (G13) | MISSING | **new-table (added)** |
| Certification name (add-certification) | `employee_professional_certifications.certification_name` | MISSING | **new-table (added)** |
| Issuing organisation (add-certification) | `employee_professional_certifications.issuing_organisation` | MISSING | **new-table (added)** |
| Credential ID (add-certification) | `employee_professional_certifications.credential_id` | MISSING | **new-table (added)** |
| Issue date / Expiry date (add-certification) | `employee_professional_certifications.issue_date` / `expiry_date` | MISSING | **new-table (added)** |
| Certificate file (add-certification) | `employee_professional_certifications.certificate_document_id` → `documents` | MISSING | **new-table (added)** |
| Degree / Specialisation / Institution (add-education) | `employee_education.degree_name` / `specialization` / `institution` | PRESENT | already-present |
| End year (add-education) | `employee_education.year_of_passing` | PRESENT | already-present |
| Start year (add-education) | `employee_education.start_year` | MISSING | **add-column (added)** |
| Grade type — CGPA/GPA/Percentage/Grade (add-education) | `employee_education.grade_type` | PARTIAL | **add-column (added)** (value was in `grade_or_percentage`, qualifier absent) |
| Grade / CGPA / Percentage value (add-education) | `employee_education.grade_or_percentage` | PRESENT | already-present |
| Certificate (add-education) | `employee_education.certificate_document_id` | PRESENT | already-present |
| Company / Designation (add-experience) | `employee_experience.employer_name` / `designation` | PRESENT | already-present |
| Employment type — Full-time/Part-time/Contract/Internship (add-experience) | `employee_experience.employment_type` (core `employment_type` enum) | PARTIAL | note-as-UI/config (core enum lacks Part-time/Internship; nearest core values used, core enum not altered) |
| From / (To) (add-experience) | `employee_experience.from_date` / `to_date` | PRESENT | already-present |
| Description (add-experience) | `employee_experience.job_description` | MISSING | **add-column (added)** |
| Relieving letter (add-experience) | `employee_experience.proof_document_id` → `documents` | PRESENT | already-present |
| Account number / Bank name / Branch / IFSC (bank-entry) | `employee_bank_accounts.account_number_masked`+`_token` / `bank_name` / `branch_name` / `ifsc_code` | PRESENT | already-present |
| Account type — Savings/Current (bank-entry) | `employee_bank_accounts.account_type` (enum `g01_bank_account_type`) | PRESENT | already-present |
| Penny drop status — Verified/Pending/Failed (bank-entry) | `employee_bank_accounts.penny_drop_status` (enum `g01_penny_drop_status`) | PARTIAL | **add-column (added)** (`is_verified` boolean could not express FAILED) |
| First/Middle/Last name (add-dependent) | `employee_dependents.full_name` (core) | PRESENT | already-present |
| Relation — Spouse/Son/Daughter/Father/Mother/Brother/Sister/in-laws/Other (add-dependent) | `employee_dependents.relationship` (core enum `dependent_relationship`) | PARTIAL | note-as-UI/config (in-law variants fold to `OTHER`; core enum not altered) |
| Gender / DOB (add-dependent) | `employee_dependents.gender` / `dob` (core) | PRESENT | already-present |
| Aadhaar number (add-dependent) | `employee_dependents.national_id_masked` (core, masked) | PRESENT | already-present |
| Nationality (add-dependent) | `employee_dependent_details.nationality` | MISSING | **new-table (added)** (1:1 satellite; core not redefined) |
| Phone (add-dependent) | `employee_dependent_details.phone` | MISSING | **new-table (added)** |
| Address / Same as employee address? (add-dependent) | `employee_dependent_details.address_line` / `same_as_employee_address` | MISSING | **new-table (added)** |
| Add to group medical insurance / "Insurance covered" (add-dependent, *-detail grids) | `employee_dependent_details.is_covered_group_insurance` | MISSING | **new-table (added)** |
| Add as nominee / Nominee for — Gratuity (add-dependent) | `employee_nominees.*` (dependent → nominee) | PRESENT | already-present |
| Kind of disability list (add-disability) | `employees.disability_type` (core) + `employee_certificates.certificate_type='PWD_UDID'` | PRESENT | already-present |
| UDID number (add-disability) | `employee_certificates.udid_number` | PRESENT | already-present |
| Percentage of disability (add-disability) | `employee_certificates.disability_percentage` | PRESENT | already-present |
| Date of certification (add-disability) | `employee_certificates.valid_from` | PRESENT | already-present |
| Nominee (from dependents) / Relation (nominees) | `employee_nominees.dependent_id` / `nominee_name` / `relationship` | PRESENT | already-present |
| Share % (nominees) | `employee_nominees.share_pct` | PRESENT | already-present |
| Type / Class — Gratuity/ESIC (nominees) | `employee_nominees.benefit_type` (enum `g01_benefit_type`) | PARTIAL | **add-enum-value (added)** `ESIC` (Gratuity already present) |
| ID type / Document / New/Old masked (national-id) | `national_id_types` + `employee_identity_documents` (masked value) | PRESENT | already-present (SECTION 6 recon) |

## B. Read / display screens (profile, directory, org-chart, detail views)

| Prototype field (screen) | maps to schema table.column | Status | Decision |
|---|---|---|---|
| Full name / Display name / Salutation / Gender / DOB / Blood group / Nationality / Marital status (my-profile, *-detail, edit-profile) | `employees.*` (core golden record) | PRESENT | already-present |
| Country of birth (my-profile) | `employee_personal_details.country_of_birth` | PRESENT | already-present (SECTION 6) |
| Father's name / Mother's name (my-profile, *-detail) | `employee_personal_details.father_name` / `mother_name` | PRESENT | already-present (SECTION 6) |
| Marriage anniversary / Marital status since (my-profile) | `employee_personal_details.marriage_anniversary_date` / `marital_status_since` | PRESENT | already-present (SECTION 6) |
| Personal email / Personal mobile / Official email / Official mobile (my-profile, *-detail, directory) | `employee_contacts.*` (enum `g01_contact_type`) | PRESENT | already-present |
| Current / Permanent address (my-profile, edit-profile) | `employee_addresses.*` (enum `g01_address_type`) | PRESENT | already-present |
| Emergency contact — Name/Mobile/Relation (my-profile, *-detail, edit-profile) | `employee_emergency_contacts.*` | PRESENT | already-present |
| Employee ID / DOJ / Group date of joining / Confirmation (my-profile, *-detail, employee-master) | `employees.service_no` / `date_of_joining` / `group_date_of_joining` / `confirmation_date` | PRESENT | already-present |
| Designation / Department / Grade / Business unit / Entity / Sub-community / Location (my-profile, directory, *-detail) | `employees.designation_id`/`org_unit_id`/`grade_id` + `entities` + `org_units` + `locations` (core masters) | PRESENT | already-present |
| Employment type / Lifecycle state / Status — Active/Notice/Pre-joining/Separated (my-profile, employee-master, my-org) | `employees.employment_type` / `employment_status` / `record_state` | PRESENT | already-present |
| Reporting manager / Reports to (my-profile, *-detail, directory, org-chart, my-org) | `employees.reporting_manager_id` (+ `employee_job_assignments.reporting_manager_id`) | PRESENT | already-present |
| Reporting level — Direct L1 / Indirect L2/L3 (my-org) | derived from `reporting_manager_id` recursion | PRESENT | note-as-UI/config (computed) |
| Internal employment history — Event/From/To/Promotion/Manager change (*-detail) | `employee_attribute_history` + `position_history` + `employee_job_assignments` + `service_register_events` (G12) | PRESENT | already-present |
| Prior employment (declared at joining) (hrbp/hod-detail) | `employee_experience.*` | PRESENT | already-present |
| Office location / Official phone (directory, directory-mini-profile) | `employee_contacts` + `locations` | PRESENT | already-present |
| DOB + Compliance flag (dob-view) | `employees.dob` + `employees.data_quality_flag` | PRESENT | already-present |
| Consent — Purpose / Status Granted/Withdrawn / Captured on / Withdraw (consent-history) | `consent_records.*` (core DPDPA ledger) | PRESENT | already-present |
| PII Tier 3 (my-profile) | `pii_tiers` (core reference) + `field_access_policies` | PRESENT | already-present |
| Dotted-line manager (my-profile) | secondary/matrix reporting | MISSING | out-of-scope (matrix-reporting; not a G01 golden-record field) |
| Work type — Hybrid (3 days office) (my-profile) | work-arrangement | MISSING | note-as-UI/config (work-arrangement policy; not modelled on G01 profile; belongs to attendance/work-policy config) |
| Notice period / Probation (my-profile) | `notice_period_policies` / `probation_policies` (core masters) | PRESENT | note-as-UI/config (derived from policy master, not a per-employee stored value) |
| Attendance (90d) / Leave balance / Last review (FY25) (my-profile) | G03 attendance-leave / G08 appraisal | — | out-of-scope (other G-modules, read-only cross-references) |
| Project history — Client/BU / Project / Role on project / Allocation / From-To / Insurance covered (*-employee-detail) | project staffing / allocation | — | out-of-scope (project-allocation / PSA module, not G01 profile) |
| Compensation / Documents / Generated letters / Audit tabs (*-detail) | G10 payroll / G13 documents / audit_log | — | out-of-scope (other modules; profile only links via `document_id` / audit trigger) |
| Bulk upload (employee-master) | `employee_import_batches` / `import_staging_rows` | PRESENT | already-present |

---

## Counts

| Status | Count |
|---|---|
| PRESENT | 34 |
| PARTIAL | 5 |
| MISSING | 22 |

(MISSING rows resolve to: 3 new satellite tables + 1 dependent-details satellite covering the
add-skill / add-visa / add-certification / add-dependent-extras fields; plus the display-only
MISSING rows `dotted-line manager` and `work type`, marked out-of-scope / config rather than added.)

## Structures added (SECTION 7 of `01-G01-employee-profile.sql` — additive only)

**New enums**
- `g01_skill_proficiency` (BEGINNER/INTERMEDIATE/ADVANCED/EXPERT)
- `g01_visa_sponsor_type` (SELF_SPONSORED/EXTERNAL_SPONSOR)
- `g01_penny_drop_status` (PENDING/VERIFIED/FAILED)
- `g01_benefit_type` **+ value** `ESIC` (ALTER TYPE ADD VALUE)

**New tables** (uuid PK, tenant/entity, audit cols, `row_version`, RLS, indexes; sample rows)
- `employee_skills` — add-skill (3 seed rows)
- `employee_visas` — add-visa / work-permit (2 seed rows)
- `employee_professional_certifications` — add-certification, professional creds (2 seed rows)
- `employee_dependent_details` — add-dependent extras + "Insurance covered" (2 seed rows; + 2 seed rows into core `employee_dependents` as data, not a redefinition)

**Columns added to existing G01 satellites**
- `employee_education` — `start_year`, `grade_type` (+ range check)
- `employee_experience` — `job_description`
- `employee_bank_accounts` — `penny_drop_status`

`00-platform-core.sql` was **not modified** — no core-owned field was genuinely missing
(dependent extras handled via a satellite; work-type/dotted-line are out-of-scope for the
profile golden record).
