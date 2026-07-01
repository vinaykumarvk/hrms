# G13 Document-Management — CSV ↔ Schema Reconciliation

**Scope:** document categories / templates / letter settings (DwnB "Additional Config" exports).
**Owned schema file:** `docs/data-model/13-G13-document-management.sql`.
**Sources (ground truth):** `docs/HRMS Deliverables to Development Phase/DwnB Form Fields/Additional Config/`
- `Document_Category_-Export.csv`
- `Document_Template_Name_Formats_Export_1_.csv`
- `Policy_And_Letter_Settings_-Export.csv`
- `Self_Generate_Setings_-Export.csv`

**Legend:** PRESENT = column already representable; PARTIAL = concept exists but needs a new column;
MISSING = no home in schema (added in SECTION F). All four exports are **CONFIG** (tenant/company
setup masters), **not transactional DATA**. The vault tables (`documents`, `document_versions`,
`document_types`, `folders`, retention, holds, …) are unchanged.

---

## 1. Document_Category_-Export.csv — CONFIG (category master + profile-field linkage)

DarwinBox "Document Category" is a tenant-configurable grouping of employee document/profile fields.
It is **distinct from the closed `g13_doc_category` enum** (IDENTITY/SERVICE/… hardcoded ladder):
this export is a per-tenant master keyed by `DOCCAT_N` with an editable name and a linked field list,
so per CONVENTIONS §4 it is a **master table**, not an enum. → new `document_categories` +
`document_category_profile_fields`.

| CSV column | maps to G13 table.column | Status | Decision |
|---|---|---|---|
| Document Category ID (`DOCCAT_1`) | `document_categories.category_code` | MISSING | ADD table `document_categories`; business key `UNIQUE (tenant_id, category_code)` |
| Document Category Name* | `document_categories.name` | MISSING | ADD |
| Select Employee Profile Fields* (comma-list) | `document_category_profile_fields.profile_field_key` (1 row/field) | MISSING | ADD child table; normalise comma-list; `UNIQUE (document_category_id, profile_field_key)` |
| Status (Active) | `document_categories.status` (`g13_config_status`) | MISSING | ADD; new enum `g13_config_status` |
| Created On / Created By / Updated On / Updated By | `document_categories.created_at/created_by/updated_at/updated_by` | PRESENT | Standard audit cols (CONVENTIONS §3) |

Note: the linked field slugs (`profile_pic`, `bank_aadhar_img`, "BGV Report", …) are employee-profile
attribute keys owned by **G01**; stored here as text keys (linkage only), no cross-module FK.

## 2. Document_Template_Name_Formats_Export_1_.csv — CONFIG (generated-doc file naming)

No vault table covers generated-document file-naming patterns. `document_types.letter_template_ref`
links a template but carries no naming format. → new `document_template_name_formats`.

| CSV column | maps to G13 table.column | Status | Decision |
|---|---|---|---|
| Format Name (`company custom`) | `document_template_name_formats.format_name` | MISSING | ADD |
| Format Code (`DOCFORMAT_1`) | `document_template_name_formats.format_code` | MISSING | ADD; `UNIQUE (tenant_id, format_code)` |
| Document Template Folder | `document_template_name_formats.template_folder` | MISSING | ADD (text label; not the vault `folders` tree) |
| Default (Yes/No) | `document_template_name_formats.is_default` (boolean) | MISSING | ADD |
| Document Template Format (`Employee Name_Employee ID_…`) | `document_template_name_formats.name_format` | MISSING | ADD (pattern string) |
| Prefix / Suffix | `document_template_name_formats.prefix` / `.suffix` | MISSING | ADD |
| Status (Active) | `document_template_name_formats.status` (`g13_config_status`) | MISSING | ADD |
| Created On / By, Updated On / By | standard audit cols | PRESENT | CONVENTIONS §3 |

## 3. Policy_And_Letter_Settings_-Export.csv — CONFIG (per-company letter settings)

Per-company (entity) HR policy sign-off / letter render settings. One settings row per company.
→ new `policy_letter_settings`.

| CSV column | maps to G13 table.column | Status | Decision |
|---|---|---|---|
| Select Company (`PSI`) | `policy_letter_settings.company_code` (+ `entity_id` FK) | MISSING | ADD; `UNIQUE (tenant_id, company_code)` (one row/company) |
| HR Policy Sign-Off Text* | `policy_letter_settings.policy_signoff_text` | MISSING | ADD |
| HR Letter Acknowledgment Text* | `policy_letter_settings.letter_ack_text` | MISSING | ADD |
| Letter CTC Font Size (`14px`) | `policy_letter_settings.letter_ctc_font_size` | MISSING | ADD |
| Letter CTC Font | `policy_letter_settings.letter_ctc_font` | MISSING | ADD |
| Letter CTC Padding (`5px`) | `policy_letter_settings.letter_ctc_padding` | MISSING | ADD |
| Block HR Policy On Mobile (Yes/No) | `policy_letter_settings.block_policy_on_mobile` (boolean) | MISSING | ADD |
| Created On / Updated On / Updated By | standard audit cols | PRESENT | CONVENTIONS §3 |

## 4. Self_Generate_Setings_-Export.csv — CONFIG (self-service letter-gen defaults)

Config for self-service HR-letter generation: companies in scope + default letter heads / signing
authorities / signatures. → new `self_generate_settings`.

| CSV column | maps to G13 table.column | Status | Decision |
|---|---|---|---|
| Self Generation Setting ID* (`SELFGEN_1`) | `self_generate_settings.setting_code` | MISSING | ADD; `UNIQUE (tenant_id, setting_code)` |
| HR Letter Generation Setting Name* | `self_generate_settings.name` | MISSING | ADD |
| Select Company* (comma-list) | `self_generate_settings.companies` (text[]) | MISSING | ADD |
| Select Company Code* (comma-list) | `self_generate_settings.company_codes` (text[]) | MISSING | ADD |
| User Assignment* | `self_generate_settings.user_assignment` | MISSING | ADD |
| Letter Generation Access (users) | `self_generate_settings.letter_generation_access` (text[]) | MISSING | ADD |
| Default Letter Head-HTML* (`LETHEAD_2`) | `self_generate_settings.default_letter_head_html_ref` | MISSING | ADD (logical ref; letter-head master out of G13 scope, no FK) |
| Default Letter Head-DOCX (`LETHEAD_1`) | `self_generate_settings.default_letter_head_docx_ref` | MISSING | ADD (logical ref) |
| Default Signing Authority 1–4 (`SIGNAUTH_N`) | `self_generate_settings.default_signing_authority_1..4` | MISSING | ADD (logical refs; signing-authority master out of scope) |
| Default Signature 1–4 | `self_generate_settings.default_signature_1..4` | MISSING | ADD (logical refs) |
| Status (Active) | `self_generate_settings.status` (`g13_config_status`) | MISSING | ADD |
| Created On / Updated On / Updated By | standard audit cols | PRESENT | CONVENTIONS §3 |

---

## Summary of decisions

- **New enum:** `g13_config_status` (`ACTIVE`, `INACTIVE`).
- **New tables (SECTION F):** `document_categories`, `document_category_profile_fields`,
  `document_template_name_formats`, `policy_letter_settings`, `self_generate_settings`.
- All follow CONVENTIONS: `uuid` PK, `tenant_id`/`entity_id`, standard audit set, tenant-scoped RLS,
  FK + query indexes, tenant-scoped business-key uniqueness.
- Letter-head / signing-authority / employee-profile-field references are stored as **logical text
  refs** (masters owned outside G13 scope) — no cross-module FK.

### Counts

| Status | Count |
|---|---|
| PRESENT | 12 (audit columns across the 4 CSVs) |
| PARTIAL | 0 |
| MISSING | 28 (business columns needing new structures) |
