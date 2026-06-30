# v3 Cross-Module Remediation Spec (authoritative decisions)

Consolidated from R1–R5 integration reviews (`docs/review/R1..R5*.md`). Every fix agent MUST conform to
these decisions so the modules converge instead of re-diverging. Make **surgical edits** to the live spec
sections; record each change in the file's existing `Amendments` area or a new `## Amendments (v3 → v3.1: cross-module remediation)` table.

## D1 — Canonical SR ingestion contract (G12 is the single source of truth)
- **Write-port URL:** `POST /api/v1/sr/ingest` (and `POST /api/v1/sr/ingest/reversal`) is the ONLY ledger
  write path. Module-local `.../post-to-sr` endpoints are permitted **internal façades** that MUST state
  "relays to `POST /api/v1/sr/ingest`". No writer may use `/api/v1/sr/events` or imply a direct table INSERT.
- **Dedup tuple (mandatory on every ingest call):** `(source_module, source_reference_id, source_event_version)`.
  Rename any `source_event_id` → `source_reference_id`. The HTTP `Idempotency-Key` header value may be a
  writer-local hash, but the persisted dedup tuple is the contract.
- **`fact_key` (mandatory for qualifying-service-bearing events):** G04, G05, G06, G10, G11 MUST derive and
  send `fact_key` per the event type's `fact_correlation_rule` (G12 FR-01). Missing → `SR_FACT_KEY_REQUIRED`.
- **Provenance:** explicit `source_module` field (NOT inferred), value in `G01..G14, G12_MANUAL, G12_LEGACY`,
  validated against the type's `allowed_source_modules`.
- **Scoping:** `tenant_id` and `entity_id` are explicit required fields on the ingest payload (G12 hashes
  `tenant_id`+`employee_id` into `entry_hash`).
- **Reversal/correction:** use G12's `is_reversal=true` + `reverses_source_reference_id` envelope with a
  published `*_REVERSAL`/`*_CANCELLED` partner type. **Remove** G05 `COMPENSATING` and G04 `AMENDMENT`
  correction verbs; G12 auto-spawns the corrigendum. Never delete/edit (supersede-only).
- **Event taxonomy:** G12 publishes a `sr_event_type` row (with `allowed_source_modules` + `payload_schema`)
  for EVERY code any writer emits, and adds an **`APPRAISAL`** `event_category` (G08 `APAR_FINAL_GRADE`).
  Each writer cites the exact published `event_type_code`.

## D2 — Canonical SR writer matrix (publish in G12 FR-01/FR-02 and mirror in MODULE_RECONCILIATION §D)
| source_module | Posts (event categories) | Notes |
|---|---|---|
| G01 | identity/qualification/personal-data life events (incl. name/DOB/category change, deceased) | G01 owns the master, so G01 posts identity-change SR events. **G02 is NOT an SR source** — G02 is the approval workflow whose committed change causes G01 to post. |
| G04 | leave spells affecting service/qualifying service | **G04 is the leave→SR writer** (G03 feeds G04; G03 does NOT post to SR). |
| G05 | transfer / relieving / joining | event codes `TRANSFER`/`RELIEVING`/`JOINING` family — align names to G12 catalog. |
| G06 | promotion / posting / officiating / MACP / confirmation | pay-fixation SR owned here OR G10 — pick one (recommend G06 posts the *establishment* event, G10 posts the *pay* event; no double-claim). |
| G08 | appraisal final grade (APAR) | category `APPRAISAL`. |
| G09 | disciplinary penalty / exoneration / suspension (+ `*_REVERSAL`) | **reference implementation — already conformant; do not regress.** |
| G10 | pay / increment events | Phase-2: author the SR-posting FR now (endpoint, codes, fact_key, dedup tuple, source_module=G10) but mark "deferred build". Ledger framing = "net-new G12 ledger on P05 substrate", not "Platform primitive". |
| G11 | separation / superannuation / retirement life events | **G11 IS a writer** for the separation/superannuation event; remove any "consumes only" wording; add to reconciliation writer list. |

## D3 — Identifier-registry hygiene
- **G09 and G13** MUST adopt the `ERR-G09-*` / `ERR-G13-*` namespace for module error codes in LIVE
  FR/API/failure-handling sections (bare `UPPER_SNAKE` codes → `ERR-G##-*` mapped onto the 8 standard HTTP
  codes). Resolve the `SIGNATURE_INVALID` collision (G12 vs G13) by namespacing both (`ERR-G12-…`, `ERR-G13-…`).
- No module redefines a shared platform id (`VAL-PAN`, `VAL-AADHAAR`, `MSG-SYS-*`, `ERR-FORBIDDEN`, the SR
  ledger append-validation) — cite it. Consolidate the 3-way SR-append validation under G12's `VAL`/rule.
- **Role codes:** "Appointing Authority" (and any actor named by >1 module) gets ONE canonical role code in
  RBAC-addition terms; modules cite it, not a divergent local code.

## D4 — Residual invented-convention leaks (remove from LIVE sections; keep only in override tables)
- **G12:** remove live `503`/`UPSTREAM_UNAVAILABLE` (FR-02 edge cases → `INTERNAL 500`/`ERR-LOADFAIL` via X.3),
  rename the live `workflow_tasks` entity reference → P01 `workflow_actions`, remove `requestId` from
  audit/observability text (use `X-Correlation-Id`).
- **G09:** remove invented codes + `503` from FR failure-handling tables; drop the parallel module hash-chain
  mirror — statutory tamper-evidence = P05 dual-log + OPEN-PLAT-03 (not a G09-owned chain).

## D5 — Shared-entity naming
- **`org_units`** (plural) everywhere — fix G05's singular `org_unit`.
- **`employee_dependents`** is G01-owned; **G03 references it** (remove G03's re-declaration with divergent
  field names / relationship enum; if G03 needs extra fields, add them as a G03 satellite keyed to the G01 entity).
- **`JOB-G01-EFFDATE`** is registered/owned by **G01** (the effective-dating job on the master); G02 and others
  cite it (do not invent `JOB-M01-EFFDATE`/unregistered variants).
- **G03↔G04 leave handoff:** agree the correlation key = **`leave_spell_lineage_id`** (G04's key); G03 exposes
  it on the approved-leave event; align the signed-capture shape G04 expects to what G03 emits.

## File → fix ownership (one agent per file, no overlaps)
- **G12** — D1 catalog (publish all writer codes + APPRAISAL category + canonical writer matrix + write-port), D4 leaks, D3 append-validation consolidation, F-05/F-06 writer-roster freeze.
- **G04** — D1 (write-port URL, dedup tuple, fact_key, source_module, tenant/entity, remove `AMENDMENT`), D5 (G03↔G04 key), event codes cite G12.
- **G05** — D1 (write-port, dedup tuple, fact_key, source_module, tenant/entity, remove `COMPENSATING`), D5 (`org_units`).
- **G06** — D1 (dedup tuple incl. rename `source_event_id`→`source_reference_id`, fact_key, codes), D2 pay-fixation no-double-claim.
- **G08** — D1 (façade relays to /sr/ingest, dedup tuple, source_module, tenant/entity, APPRAISAL category code).
- **G09** — D3 (ERR-G09-* namespace), D4 (remove 503/invented codes + parallel hash-chain), F-12 reword "INSERT" → "append via FR-02".
- **G10** — D1/D2 (author deferred SR-posting FR with full contract), D4 framing ("net-new G12 ledger on P05").
- **G11** — D1/D2 (G11 IS the separation/superannuation writer; add endpoint/codes/fact_key/tuple; remove "consumes only").
- **G13** — D3 (ERR-G13-* namespace, SIGNATURE_INVALID collision).
- **G01** — D2 (G01 posts identity/qualification SR events; cite the canonical write-port/tuple), D5 (own `JOB-G01-EFFDATE`, own `employee_dependents`).
- **G02** — D2 (G02 is NOT an SR source — identity SR posting is by G01 on commit; reword), cite `JOB-G01-EFFDATE`.
- **G03** — D5 (reference G01 `employee_dependents`; expose `leave_spell_lineage_id` on approved-leave event for G04; confirm G03 does NOT post to SR).
- **G14** — (low) ensure analytics source list reflects that leave-SR feeds come via G04/G12, not G02/G04 direct.
