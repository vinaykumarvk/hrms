# R2 — Shared Canonical-Entity Alignment Review

**Scope:** Cross-cutting integration audit of 14 platform-grounded government-HRMS BRDs (`docs/brd/v3/G01..G14`) plus `docs/brd/PLATFORM_FOUNDATION.md`, for ONE concern: **no forking of the shared canonical entities** — the employee master (G01 / PrimeSoft M01), documents (G13 / M11), audit (P05 dual-log), and org units (P04 / G01).

**Reviewer:** Integration reviewer (read-only audit). **Date:** 2026-07-01.

---

## Verdict

**Strong alignment — PASS with minor findings.** Across all 12 consumer modules (G02–G12, G14) the canonical entities are **referenced, not redefined**: no module hard-defines its own `employees`, `org_units`, `documents`, or `audit_log` table; every employee foreign key is the canonical `employee_id` UUID (no module joins on `service_no`); `documents` is uniformly G13-owned and reached via `document_id`; and audit is uniformly the P05 DB-trigger dual-log — G02 explicitly **removed** its invented `cr_audit_chain` (E18) and G08 removed its bespoke per-form hash-chain, both re-grounded onto P05 + OPEN-PLAT-03. The only genuine schema-fork is **G03's re-declaration of the G01-owned `employee_dependents` satellite (E29) with divergent field names and a divergent relationship enum** (MEDIUM). The remainder are low-severity naming/consistency drifts — chiefly G05 referencing `org_unit` (singular) where every other module and the canonical use `org_units` (plural). No CRITICAL or HIGH issues; no canonical master was forked.

---

## Findings

| # | Finding | Severity | Modules involved | Evidence (file + section/quote) | Recommended fix |
|---|---------|----------|------------------|----------------------------------|-----------------|
| F1 | **G03 redefines the G01-owned `employee_dependents` satellite with divergent fields and a divergent enum.** G01 canonical E4 uses `relationship` VARCHAR(24) enum `RELATIONSHIP` (SPOUSE/SON/DAUGHTER/FATHER/MOTHER…), plus `full_name`, `gender`, `is_dependent`, `is_minor`, `is_differently_abled`, `is_legal_heir`, `heir_succession_rank`, `national_id_masked`, `proof_document_id`. G03 E29 instead defines `relation` ENUM (CHILD/SPOUSE/PARENT/OTHER), `is_surviving`, `is_disabled` — i.e. `relation`≠`relationship`, the enum value sets diverge, `is_disabled`≠`is_differently_abled`, `is_surviving` is net-new, and all of G01's heir/succession fields are absent. This is the canonical-name-divergence the check targets (item 3) and, because G11 family-pension depends on G01's `is_legal_heir`/`heir_succession_rank`, the slim mirror risks an inconsistent dependents view feeding pension. | **MEDIUM** | G03 (vs G01 owner; downstream G11) | `G01-employee-profile-management.md` §5.4 E4 `employee_dependents` (lines 682–695: `relationship` enum, `is_differently_abled`, `is_legal_heir`, `heir_succession_rank`). `G03-attendance-and-leave-management.md` §5.2 E29 `employee_dependents (EXTEND G01/M01 — R14; read/mirror)` (lines 671–681): `relation ENUM CHILD/SPOUSE/PARENT/OTHER`, `is_surviving`, `is_disabled`; note "Canonical home is G01/M01… G03 reads/mirrors; if M01 does not yet expose it, G03 owns interim and emits a dependency-amendment request to G01." | Do not re-declare the table. Adopt G01's exact column names/enum (`relationship`, `is_differently_abled`, `is_legal_heir`, `heir_succession_rank`) so the mirror is field-compatible; if G01 genuinely lacks `is_surviving`/CCL-specific needs, raise the dependency-amendment to G01 (Recon §D) and add them to the canonical E4, not a forked copy. Until then mark E29 as a read-only projection of G01 E4 with identical schema. |
| F2 | **G05 references `org_unit` (singular) as the FK target where the canonical entity is `org_units` (plural).** G05 uses `FK→org_unit` 13× across `vacancy_positions`, `clearance_checklists`, `transfer_preferences`, quarters, etc.; every other consumer module (G02/03/06/07/08/09/10/11/12/14) and the G01/PLATFORM canonical use `org_units`. Same concept, divergent name — risks FK-resolution drift at build time. | **LOW** | G05 (vs canonical `org_units`) | `G05-transfer-relieving-joining-workflow.md` §5.2 (e.g. lines 411, 421, 441, 675 `UUID FK→org_unit`); contrast `PLATFORM_FOUNDATION.md` §2/§6.2 (`org_unit`/`org_units` master) and G01 §5.4 `org_unit_id UUID FK→org_units`. Count: G05 `org_unit`(sing FK)=13, `org_units`(plural)=1; all other modules 0 singular. | Normalise all G05 FK targets to `org_units` to match the master table name; keep the column name `org_unit_id`. Pure rename, no semantic change. |
| F3 | **G04 carries a `service_no_raw` capture column** — the only place a `service_no`-shaped key appears below the master. It is explicitly a legacy as-keyed value "resolved to employee_id", so the canonical join key is preserved; flagged only so it is never promoted to a join/FK key. | **LOW (informational)** | G04 | `G04-leave-sr-integration.md` §5 (line 570: `service_no_raw varchar(64) … As-keyed; resolved to employee_id`). | Keep as a migration-provenance column only; ensure all joins resolve through `employee_id` (and `employee_id_aliases`), never `service_no_raw`. No schema change needed if that invariant holds. |
| F4 | **Residual domain hash-chain columns on P05-grounded ledgers.** G09 `case_timeline_events` (E19) still carries `row_hash`/`prev_hash` (AI-15/DI-21) although the re-grounding note states it "rides on" the P05 substrate and "does not invent a parallel cryptographic chain"; G02 `esignatures` and G08 `apar_disclosure_log` similarly retain domain chains "aligned to OPEN-PLAT-03". These are **not** `audit_log` forks (audit itself is correctly P05-only in every module) but the retained chain columns are mildly inconsistent with the stated "no parallel chain" intent. | **LOW (informational)** | G09, G02, G08 | `G09-disciplinary-cases-punishment.md` line 127 & 257 ("no module-defined `audit_log`"; "rides on this substrate rather than inventing a parallel cryptographic chain") vs line 70 AI-15 (`row_hash`/`prev_hash` on E19). `G02` §5 E18 REMOVED (lines 328, 667–669). `G08` lines 54, 603 (`apar_disclosure_log` domain ledger on P05). | Confirm the domain `row_hash`/`prev_hash` columns are derived-from / verified-against the OPEN-PLAT-03 chain (not an independent integrity source), or drop them and rely on the `/verify` endpoint over the P05 chain. Documentation alignment, not a data-model fork. |

---

## Positive confirmations (no fork detected)

- **No hard fork of any canonical table.** A scan for module-owned `#### … employees | employee_master | org_units | documents | audit_log | security_audit_log` definitions across G02–G14 returned **none**. Each module lists these under "Referenced (owned elsewhere)" / ownership-and-reuse matrices (e.g. G02 §5.2 lines 721–725; G05 line 709; G06 lines 905–910; G07 lines 687–691; G09 line 306; G14 lines 752–758).
- **Employee FK key is consistent (check 2 — PASS).** Every child/transaction table across all 12 modules uses `employee_id UUID FK→employees`. No module uses `service_no` as a foreign key (only G04's provenance-only `service_no_raw`, F3).
- **`documents` is consistently G13-owned (check 4 — PASS).** All modules attach/fetch via `document_id UUID FK→documents (G13/M11)` and store references only (G02 E3 `change_request_documents`, G05/G06/G09/G11/G12/G14 document FKs). The G13 attach contract is the canonical `document_links` (E7: `module_code`, `entity_name`, `entity_ref_id`, `link_role`); consumer modules reference `documents` rather than re-defining it.
- **Audit is consistently the P05 dual-log (check 5 — PASS).** No per-module `audit_log` is defined anywhere. G02 explicitly **removed** `cr_audit_chain` (E18 → P05 + OPEN-PLAT-03); G08 replaced its invented per-form hash-chain with the P05 substrate; G04/G07/G09/G11 state "G0x defines no `audit_log`" and capture via the P05 DB-trigger.
- **Org model not forked.** G05 `vacancy_positions` is an explicitly **non-authoritative read-through cache** of G06/G01 strength (`sanctioned_strength_cached`, `strength_source`, `strength_as_of`, "never the source of truth"), not a redefinition of `positions`/`org_units` (G05 §5.2.7, lines 417–432).
- **Payroll/pension employee data are point-in-time snapshots, not master copies.** G10/G11 snapshot emoluments/calc inputs as-of cutoff and reference G01 as the golden source (G10 line 160; G11 lines 132, 169, 193) — no employee-master redefinition.

---

## Severity counts

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 0 |
| Medium | 1 |
| Low | 3 (incl. 2 informational) |
