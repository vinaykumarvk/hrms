# Cross-Module Consistency Review & Remediation (v3 → v3.1)

The 14 platform-grounded v3 BRDs were authored by independent agents, so a cross-cutting integration
review was run on five concerns, findings consolidated into a remediation spec, and fixes applied surgically.

## Review reports (evidence-first, report-only)
| Report | Concern | Verdict | Severities |
|---|---|---|---|
| `R1-sr-ingestion-consistency.md` | G12 SR ingestion contract across all writers | **MATERIAL CONFLICTS** | 2 Crit · 4 High · 5 Med · 3 Low |
| `R2-shared-entity-alignment.md` | No forking of employee master / documents / audit | PASS (minor) | 1 Med · 3 Low |
| `R3-cross-module-references.md` | Referenced FRs/entities/events exist & agree | Well-referenced; SR seam weak | 4 High · 6 Med · 2 Low |
| `R4-id-registry-collisions.md` | VAL/JOB/MSG/ERR/role id namespacing | Mostly clean; G09/G13 lagged | 2 High · 5 Med · 2 Low |
| `R5-platform-conformance.md` | Uniform platform adoption (matrix) | 79/84 PASS, no FAIL | 3 Med · 3 Low |

## Remediation applied (`REMEDIATION.md` = authoritative decisions)
- **SR ingestion contract frozen** (D1/D2): one write-port `POST /api/v1/sr/ingest`; G12 published the full
  `sr_event_type` catalog + `APPRAISAL` category + canonical writer matrix; every writer (G01/G04/G05/G06/G08/G10/G11)
  now cites identical event-type codes, populates the `(source_module, source_reference_id, source_event_version)`
  dedup tuple, sends `fact_key` for qualifying-service events, explicit `source_module`/`tenant_id`/`entity_id`,
  and uses the `is_reversal` correction envelope (invented `COMPENSATING`/`AMENDMENT` verbs removed).
- **Writer roster resolved** (F-05/F-06): G11 IS the separation/superannuation writer; G03 is NOT a writer
  (G04 posts leave); G02 is NOT an SR source (G01 posts identity events on commit); pay-fixation = G10 (not G06).
- **ID hygiene** (D3): G09 and G13 adopted `ERR-G09-*` / `ERR-G13-*` namespaces; `SIGNATURE_INVALID` collision
  resolved by namespacing both.
- **Leak cleanup** (D4): live `503`/`UPSTREAM_UNAVAILABLE`, `workflow_tasks`, `requestId` removed from G12/G09;
  G09's parallel hash-chain replaced by P05 + OPEN-PLAT-03.
- **Shared-entity naming** (D5): `org_units` (plural) standardized; G03 references G01's `employee_dependents`
  (no fork); `JOB-G01-EFFDATE` owned by G01; G03↔G04 handoff keyed on `leave_spell_lineage_id`.

Each edited BRD carries a `## Amendments (v3 → v3.1: cross-module remediation)` table (12/14 files; G07 & G14
needed no fixes). The v3 set is now mutually consistent and integration-ready.
