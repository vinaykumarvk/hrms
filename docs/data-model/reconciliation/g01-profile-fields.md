# G01 Employee-Profile — Field Reconciliation (ground-truth exports vs. schema)

**Date:** 2026-07-01
**Owner file:** `docs/data-model/01-G01-employee-profile.sql`
**Sources reconciled:**
- `DwnB Form Fields/Additional Config/CustomFields-Export.csv` (41-row custom-field framework)
- `DwnB Form Fields/Organisation/National_ID-Export_1_.csv` (8 configurable statutory-ID types)
- `DwnB Form Fields/Profile.docx` (employee-profile field dictionary) + prototype labels
- Baseline: `01-G01-employee-profile.sql` (E2–E34), `00-platform-core.sql` (`employees`), BRD v3 §5

**Legend:** PRESENT = already modelled · PARTIAL = modelled but missing attributes/config · MISSING = absent.
Rows marked **(added)** are delivered by the SECTION 6 RECON additions in the amended schema.

---

## A. Custom-field framework (CustomFields-Export.csv → E15/E16)

The baseline `custom_field_definitions` (E15) existed but was scoped **only** to `profile_sections`
(`section_id NOT NULL`) and lacked the CSV's external id, editability, numeric-format and
display-target/FOR-object attributes. The CSV's "Display in" targets (HR Documents, Recruitment
Requisition, Separation Manager, Performance, Employee Termination…) are arbitrary HR objects, not
profile sections — so `section_id` is now nullable and a free-text `display_target`/`for_object`
carries the CSV semantics.

| CSV column | maps to G01 table.column | Status | Decision |
|---|---|---|---|
| Field Name | `custom_field_definitions.label` | PRESENT | — |
| Field Id | `custom_field_definitions.external_field_id` | MISSING → **(added)** | ALTER ADD column; carries `a64902e57de4a6`-style id |
| Type | `custom_field_definitions.data_type` (enum `g01_custom_field_type`) | PARTIAL → **(extended)** | enum lacked Dropdown/Multi-Select/Text-Area; added `DROPDOWN`,`MULTI_SELECT_DROPDOWN`,`TEXT_AREA` (Text Field→`TEXT`, Date→`DATE`) |
| Display in | `custom_field_definitions.display_target` | MISSING → **(added)** | ALTER ADD column (free text; object the field renders on) |
| Is Required | `custom_field_definitions.is_required` | PRESENT | — |
| Is Editable | `custom_field_definitions.is_editable` | MISSING → **(added)** | ALTER ADD boolean DEFAULT true |
| Allow Decimals | `custom_field_definitions.allow_decimals` | MISSING → **(added)** | ALTER ADD boolean DEFAULT false |
| Number Separator | `custom_field_definitions.number_separator` | MISSING → **(added)** | ALTER ADD varchar (nullable; e.g. thousands separator) |
| FOR | `custom_field_definitions.for_object` | MISSING → **(added)** | ALTER ADD varchar (CSV "Others"/object class) |
| (section scoping) | `custom_field_definitions.section_id` | PARTIAL → **(loosened)** | `DROP NOT NULL` so non-profile-section fields (CSV targets) are storable |
| per-employee VALUES | `employee_custom_field_values` (value_text/number/date/bool/document_id + `uq(employee_id,field_def_id)`) | PRESENT | typed value columns incl. DOCUMENT already present |

## B. National-ID configurability (National_ID-Export_1_.csv → national_id_types + E9)

The baseline modelled statutory IDs only as a **closed Postgres enum** `g01_identity_doc_type`
(AADHAAR/PAN/PASSPORT/VOTER_ID/DRIVING_LICENSE/PRAN/RATION_CARD). CONVENTIONS §4 requires
tenant-configurable value sets to be **master tables**, and the CSV proves per-type configurability
(alias, mandatory flags, temporary-ID, issued-from/till, document flags, uniqueness, masking) plus
types the enum lacks (EPF, ESIC, UAN). This is the principal MISSING structure.

| CSV column | maps to G01 table.column | Status | Decision |
|---|---|---|---|
| Code | `national_id_types.id_code` (UNIQUE per tenant) | MISSING → **(added)** | new config-master table |
| Option | `national_id_types.label` | MISSING → **(added)** | display name |
| Applicable For | `national_id_types.applicable_for` | MISSING → **(added)** | India / All Employees |
| Enable/Disable | `national_id_types.is_enabled` | MISSING → **(added)** | |
| Alias | `national_id_types.alias` | MISSING → **(added)** | |
| Temporary ID Enable/Disable + Alias | `national_id_types.temporary_id_enabled` / `temporary_id_alias` | MISSING → **(added)** | |
| Issued From Enable/Alias/Mandatory | `national_id_types.issued_from_enabled` / `issued_from_alias` / `issued_from_mandatory` | MISSING → **(added)** | |
| Issued Till Enable/Alias/Mandatory | `national_id_types.issued_till_enabled` / `issued_till_alias` / `issued_till_mandatory` | MISSING → **(added)** | |
| ID Document Enable/Alias/Mandatory | `national_id_types.id_document_enabled` / `id_document_alias` / `id_document_mandatory` | MISSING → **(added)** | drives whether a scan is required |
| Mandatory for Activation | `national_id_types.mandatory_for_activation` | MISSING → **(added)** | |
| Mandatory for Addition | `national_id_types.mandatory_for_addition` | MISSING → **(added)** | |
| Is Unique | `national_id_types.is_unique` | MISSING → **(added)** | |
| Masking | `national_id_types.masking` | MISSING → **(added)** | nullable mask pattern |
| (bridge to enum) | `national_id_types.maps_to_doc_type` | n/a → **(added)** | optional link to legacy `g01_identity_doc_type` |
| per-employee ID value | `employee_identity_documents` (`doc_number_masked`, `doc_number_token`, `aadhaar_ref_key`, `scan_document_id`, `issue_date`, `expiry_date`) | PRESENT | Aadhaar still vault-only via ref key |
| ↳ type link | `employee_identity_documents.national_id_type_id` (FK) | MISSING → **(added)** | ALTER ADD FK to config master (nullable; enum retained for back-compat) |
| ↳ temporary-ID value | `employee_identity_documents.is_temporary_id` / `temporary_id_value` | MISSING → **(added)** | supports CSV "Temporary ID" flow |
| ↳ Issued From/Till | `employee_identity_documents.issue_date` / `expiry_date` | PRESENT | CSV Issued-From/Till map to existing issue/expiry |

## C. Standard profile field dictionary (Profile.docx → core + satellites)

| Profile.docx group / field | maps to G01 table.column | Status | Decision |
|---|---|---|---|
| Biographical — Salutation/First/Middle/Last/Gender/DOB/Nationality/Marital/Blood Group/Category/Disability | `employees.*` (core) | PRESENT | core golden record |
| Biographical — Country Of Birth | `employee_personal_details.country_of_birth` | MISSING → **(added)** | satellite (core not redefined) |
| Biographical — Marital Status Since | `employee_personal_details.marital_status_since` | MISSING → **(added)** | satellite |
| Biographical — Marriage Anniversary | `employee_personal_details.marriage_anniversary_date` | MISSING → **(added)** | satellite |
| Biographical — Father's Name / Mother / Spouse | `employee_personal_details.father_name`/`mother_name`/`spouse_name` | MISSING → **(added)** | satellite |
| Biographical — Languages Spoken | `employee_personal_details.languages_spoken` (text[]) | MISSING → **(added)** | satellite |
| Contact — LinkedIn ID | `employee_personal_details.linkedin_id` | MISSING → **(added)** | satellite |
| Contact — Personal/Official Email, Mobile 1/2, Official Number | `employee_contacts` (E2) | PRESENT | typed contacts |
| Address — Current/Permanent (line/landmark/pincode/country/state/city) | `employee_addresses` (E3) | PRESENT | address_type enum |
| Emergency — Name/Mobile/Relation (+ 2nd) | `employee_emergency_contacts` (E6) | PRESENT | priority column supports 2nd |
| Employment — Employee ID/DOJ/Group DOJ/Confirmation/Retirement/Type/Manager/Org | `employees.*` + `employee_job_assignments` (E13) + `positions` (E12) | PRESENT | effective-dated placement |
| Education Qualifications / Certifications | `employee_education` (E7) + `employee_certificates` (E25) | PRESENT | |
| Work Experience | `employee_experience` (E8) | PRESENT | |
| Family — Dependant / Nominee | `employee_dependents` (core) + `employee_nominees` (E5) | PRESENT | core-owned + nominee satellite |
| Bank Details — Acct/Bank/Branch/IFSC | `employee_bank_accounts` (E10) | PRESENT | masked + tokenised |
| Personal Identity — Aadhaar/PAN/Passport/DL/Voter/Issue/Valid Till | `employee_identity_documents` (E9) + `aadhaar_vault` (E22) | PRESENT | see §B for configurability |
| Social Security — EPF/ESIC/UAN/PRAN/Gratuity/LWF/PF numbers | `national_id_types` (config) + `employee_identity_documents` (values) | PARTIAL → **(enabled)** | now storable as configurable ID types (EPF/ESIC/UAN were absent from enum) |
| Personal / Employment Documents (Aadhaar Front/Back, PAN Card, NDA, letters…) | `employee_identity_documents.scan_document_id`, `employee_education.certificate_document_id`, `employee_custom_field_values.value_document_id` → `documents` (G13) | PRESENT | document-on-profile via `document_id` refs |
| Photo | `employee_photos` (E11) | PRESENT | |
| Profile completeness / sections config | `employee_profile_completeness` (E18) + `profile_sections` (E14) | PRESENT | |
| Vaccination / Asset / Health-Insurance / Job-Application / Performance-Notes sub-sections | (other G-modules / custom fields) | OUT OF SCOPE | belong to other modules or custom-field framework |

---

## Counts

| Status | Count |
|---|---|
| PRESENT | 24 |
| PARTIAL (extended/loosened in place) | 5 |
| MISSING (new column/table added) | 24 |

## Structures added (see SECTION 6 of `01-G01-employee-profile.sql`)

- **`national_id_types`** — configurable statutory-ID master (21 config columns; `UNIQUE(tenant_id,id_code)`; RLS; 3 seed rows).
- **`employee_personal_details`** — 1:1 biographical satellite (country/place of birth, marital-status-since, marriage anniversary, father/mother/spouse name, languages, LinkedIn; `UNIQUE(employee_id)`; RLS; 2 seed rows).
- **`custom_field_definitions`** — +6 columns (`external_field_id`, `display_target`, `for_object`, `is_editable`, `allow_decimals`, `number_separator`); `section_id` NOT NULL dropped.
- **`g01_custom_field_type`** enum — +`DROPDOWN`, `MULTI_SELECT_DROPDOWN`, `TEXT_AREA`.
- **`employee_identity_documents`** — +`national_id_type_id` (FK), +`is_temporary_id`, +`temporary_id_value`.
