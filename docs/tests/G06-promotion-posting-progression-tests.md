# G06 — Promotion, Posting & Progression — Acceptance & E2E Test Suite

## 1. Header

| Field | Value |
|---|---|
| Module | G06 — Promotion, Posting & Progression Monitoring |
| Version traced | BRD v3.0 (`docs/brd/v3/G06-promotion-posting-progression.md`), OpenAPI 3.0.0 (`docs/contracts/openapi/G06.yaml`) |
| Contracts traced | `error-taxonomy.yaml` (G06 bare-domain codes), `state-machines.yaml` (G06 §), `auth-matrix.yaml` (G06 §) |
| Scope | FR-PPP-001 … FR-PPP-020 (seniority, eligibility, DPC, roster, orders, sealed cover, probation, officiating, MACP, posting, progression, career/succession, establishment, qualifying service, legal/sub-judice, correction cascade, refusal, multi-stream) |
| Out of scope | Pay fixation / increment SR events (owned by **G10**); external court-case management; APAR authoring (G08); disciplinary adjudication (G09) — all consumed **by reference** |
| Test types | Functional · Boundary · Negative · Authorization · State-Transition · Data-Integrity · API-Contract · E2E-Flow |

### 1.1 Traceability convention
Every case carries `Traces-to` = `FR-PPP-NNN` + AC/BR/edge-case or contract clause. Negative cases assert the **exact** `error.code` in the platform envelope and the wire HTTP status (e.g. `ENTITY_SUB_JUDICE` → **412**; most G06 domain codes → **409**). The correlation id is asserted in the `X-Correlation-Id` **response header**, never the body.

### 1.2 Test environment & data assumptions
1. **Multi-tenant.** Seed ≥2 tenants (`ten-01`, `ten-02`) and ≥2 entities (`ent-07`, `ent-09`). Every list/read query must resolve a tenant/entity scope; a scopeless query is rejected (P02 step 7), not defaulted to all.
2. **Masters (G01).** Cadre `cad-ASO`; feeder grade `desg-ASO`; promotion grade `desg-SO`; pay-scales attached. ≥30 active incumbents in `desg-ASO` with mixed `recruitment_stream ∈ {DIRECT, PROMOTEE, LDCE}`, reservation categories `{GEN, OBC, SC, ST, EWS, PwBD}`, and DOJ/DOB values including one identical-DOJ+DOB pair and one missing grade-entry-date row.
3. **Establishment (FR-015).** `sanctioned_posts` row `sp-SO-HO` with `sanctioned_strength=20`, `filled_count=14`, `dr_quota_pct=25`, `promotion_quota_pct=67`, `ldce_quota_pct=8`, sanction-order ref present.
4. **QSL (FR-016).** `qualifying_service_ledger` snapshots seeded per employee/grade at `crucial_date=2026-01-01`; `service_exclusion_rules` pinned per Appendix D.3 (EOL beyond condonable, dies-non, suspension, ad-hoc, deputation).
5. **APAR (G08) seeded by reference.** For `emp-1001`: 5 usable years meeting benchmark. For `emp-1110`: an adverse entry with `apar_communicated=false`. For `emp-1120`: adverse entry `apar_communicated=true, representation_status=DISPOSED` (usable).
6. **Disciplinary/vigilance (G09) seeded by reference.** `emp-1200` pending charge (⇒ SEALED_COVER); `emp-1201` current penalty (⇒ NOT_ELIGIBLE); `emp-1200` case concluded=EXONERATED available for the sealed-cover review path; suspension facts for QSL.
7. **Quota rule (FR-020).** `seniority_quota_rules` `qr-ASO` = DR:Promotee:LDCE `3:2:1`, `rotation_method=ROTA_QUOTA`, matching Appendix D.4 worked vector.
8. **Roles (auth-matrix G06).** Provision distinct principals: `g06_establishment_officer`, `g06_strength_officer`, `g06_roster_officer`, `g06_vigilance_clearance`, `g06_dpc_secretary`, `g06_dpc_member` (×3), `g06_appointing_authority`, `g06_reviewing_authority`, `g06_legal_officer`, `sr_custodian`, plus an `employee` and an out-of-scope tenant principal.
9. **Config.** Objection window, panel validity, probation months, MACP cap=3, debarment months, zone slab (Appendix D.1) — all set via config cascade before run. `REFUSAL_POLICY_MISSING` fixture: one cadre with debarment/MACP-clock config deliberately absent.
10. **Idempotency.** All unsafe POSTs send `Idempotency-Key` + `X-Correlation-Id`; 24h replay returns the original result.

---

## 2. Test Cases

### FR-PPP-001 — Cadre-wise Seniority List Generation (multi-stream aware)

| Field | Value |
|---|---|
| **TC-G06-001** | Functional — Generate cadre seniority list with contiguous ranks |
| Traces-to | FR-PPP-001 AC1, AC2, AC6 |
| Preconditions | ≥30 active `desg-ASO` incumbents seeded (assumption 2) |
| Test data | `POST /seniority-lists` `{cadre_id:"cad-ASO", grade_id:"desg-ASO", as_on_date:"2026-01-01", is_multi_stream:false}` |
| Steps | 1. POST create. 2. `GET /seniority-lists/{id}` and page all entries. |
| Expected | `201`; status `DRAFT`; entries = active population; ranks contiguous `1..N` (no gap/dup); each entry carries `recruitment_stream` + reservation category from G01; `X-Correlation-Id` header present. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-002** | Functional — Deterministic tie-break on identical DOJ+DOB |
| Traces-to | FR-PPP-001 AC4; edge "identical DOJ and DOB" |
| Preconditions | Identical-DOJ+DOB pair seeded |
| Test data | Same create as TC-001 |
| Steps | 1. Create list. 2. Inspect the two tied entries' `reckoning_basis`/`tiebreak_value`. |
| Expected | Both ranked deterministically per configured tie-break order (Appendix D.4); the applied basis recorded per entry; re-running produces identical order. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-003** | Boundary — Missing grade-entry-date row flagged, not silently ranked |
| Traces-to | FR-PPP-001 AC (partial result); edge "grade entry date missing"; LLD `flagged_entries[]` |
| Preconditions | One incumbent with null grade-entry-date |
| Test data | Create list over population incl. the null row |
| Steps | 1. Create list. |
| Expected | `201` partial result; the row appears in `flagged_entries[]` and is **excluded from ranks** until resolved; contiguity preserved for the rest. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-004** | Data-Integrity — Manual rank override audited with mandatory reason |
| Traces-to | FR-PPP-001 AC5; `VAL-COMMENT`/`ERR-REASON-REQ` |
| Preconditions | DRAFT list from TC-001 |
| Test data | `PATCH /seniority-lists/{id}/entries/{entryId}` `{rank_position:5, reason:"clerical correction"}`; then a second PATCH with `reason` omitted |
| Steps | 1. PATCH with reason → success. 2. PATCH without reason. |
| Expected | Step 1: `200`, P05 audit row written with reason. Step 2: `422` `VALIDATION_FAILED` (message id `ERR-REASON-REQ`). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-005** | Data-Integrity — One active list per scope invariant |
| Traces-to | FR-PPP-001 BR "exactly one active list per scope" |
| Preconditions | An active list exists for `cad-ASO/desg-ASO/ent-07` |
| Test data | Second create for the same scope |
| Steps | 1. Create duplicate-scope list. |
| Expected | Blocked; `409 CONFLICT` (`ERR-DUP-INSTANCE`) — no second concurrently-active list for the scope. |
| Priority | P2 |

### FR-PPP-002 — Publication, Objections & Finalisation

| Field | Value |
|---|---|
| **TC-G06-006** | State-Transition (valid) — Publish tentative via P01 checker |
| Traces-to | FR-PPP-002 AC1; state 11.1 DRAFT→PUBLISHED_TENTATIVE |
| Preconditions | DRAFT list; caller = `g06_appointing_authority` (checker) ≠ maker |
| Test data | `POST /seniority-lists/{id}/publish` `{objection_window_start:"2026-02-01", objection_window_end:"2026-02-28"}` |
| Steps | 1. Publish. |
| Expected | `200`; status `PUBLISHED_TENTATIVE`; baseline frozen; window opens (X.2 notify scope). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-007** | Negative — Publish a list with a rank gap/duplicate |
| Traces-to | FR-PPP-002; error `SENIORITY_RANK_CONFLICT` |
| Preconditions | List doctored to contain a duplicate rank |
| Test data | `POST /seniority-lists/{id}/publish` |
| Expected | `409` `SENIORITY_RANK_CONFLICT`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-008** | Boundary — Objection accepted on window boundary, rejected after close |
| Traces-to | FR-PPP-002 AC2; error `OBJECTION_WINDOW_CLOSED` |
| Preconditions | Published list; window `2026-02-01`…`2026-02-28` |
| Test data | File objection at `2026-02-28` (last day) then at `2026-03-01` |
| Steps | 1. `POST /seniority-lists/{id}/objections` on last day. 2. Same after close. |
| Expected | Step 1: `201`. Step 2: `409` `OBJECTION_WINDOW_CLOSED` (unless condoned → `TIME_BARRED`, `ERR-PAST-DATED`). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-009** | Functional — Dispose objection UPHELD triggers audited re-rank preserving contiguity |
| Traces-to | FR-PPP-002 AC3, AC4 |
| Preconditions | Objection filed on a PUBLISHED_TENTATIVE list |
| Test data | `POST /objections/{id}/dispose` `{disposal:"UPHELD", disposal_remarks:"seniority corrected"}` |
| Steps | 1. Dispose UPHELD. 2. Re-page entries. |
| Expected | `200`; entries re-ranked, contiguity preserved; P05 audit; objector notified (X.2). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-010** | Negative — Finalise blocked while an objection is open |
| Traces-to | FR-PPP-002 BR; error `OBJECTIONS_PENDING` |
| Preconditions | List with one `SUBMITTED`/`UNDER_REVIEW` objection |
| Test data | `POST /seniority-lists/{id}/finalise` |
| Expected | `409` `OBJECTIONS_PENDING`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-011** | State-Transition (valid) — Finalise supersedes prior final list |
| Traces-to | FR-PPP-002 AC5; state 11.1 OBJECTIONS_CLOSED→FINALISED, FINALISED→SUPERSEDED |
| Preconditions | All objections disposed; window closed; a prior FINALISED list exists for scope |
| Test data | `POST /seniority-lists/{id}/finalise` |
| Expected | `200`; new list `FINALISED`; prior list `SUPERSEDED` (single-active invariant); notified PDF stored in G13. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-012** | Negative — Finalise blocked while list is sub-judice |
| Traces-to | FR-PPP-002 BR (§5.6-20); FR-PPP-017; error `ENTITY_SUB_JUDICE` **412** |
| Preconditions | List has an active `legal_case_links.interim_stay=true` → `INTERIM_STAYED` |
| Test data | `POST /seniority-lists/{id}/finalise` |
| Expected | `412` `ENTITY_SUB_JUDICE`; `error.field="seniority_list_id"`; `details.legal_case_link_id` present. |
| Priority | P1 |

### FR-PPP-020 — Multi-Stream Inter-se Seniority Construction (rota-quota)

| Field | Value |
|---|---|
| **TC-G06-013** | Functional — Combined construction matches Appendix D.4 worked vector |
| Traces-to | FR-PPP-020 AC2, AC4; FR-PPP-001 AC3 |
| Preconditions | Multi-stream DRAFT list; quota rule `qr-ASO` (3:2:1, ROTA_QUOTA) |
| Test data | `POST /seniority-lists/{id}/construct-combined` `{quota_rule_id:"qr-ASO"}` |
| Steps | 1. Construct. 2. `GET /seniority-lists/{id}/rotation-trace`. |
| Expected | `200`; interleave order == Appendix D.4 vector; each entry carries `quota_slot_label` + `rotation_cycle_no`; trace slots map to streams deterministically. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-014** | Functional — Unfilled quota slot carries forward (no silent loss) |
| Traces-to | FR-PPP-020 AC3; edge "quota slot exhausted" |
| Preconditions | LDCE stream short of its quota this cycle |
| Test data | Construct combined with `unfilled_quota_carry_forward=true` |
| Expected | `200`; unfilled LDCE slot linked/carried to next cycle; no rank silently dropped; trace shows the carry-forward. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-015** | Negative — Construction with an untagged stream entry |
| Traces-to | FR-PPP-020 edge; error `STREAM_TAG_MISSING` |
| Preconditions | One entry with null `recruitment_stream` |
| Test data | `POST /seniority-lists/{id}/construct-combined` |
| Expected | `409` `STREAM_TAG_MISSING`; entry flagged for manual tagging; partial result (no corrupt interleave committed). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-016** | Negative — Invalid rota-quota rule (ratios non-positive) |
| Traces-to | FR-PPP-020 failure handling; error `QUOTA_RULE_INVALID` |
| Test data | `POST /seniority-quota-rules` with a `0:-1:1` ratio, then construct |
| Expected | `409` `QUOTA_RULE_INVALID`; construction refused. |
| Priority | P2 |

### FR-PPP-003 — Eligibility Rule Engine & Computation

| Field | Value |
|---|---|
| **TC-G06-017** | Functional — Eligibility cites QSL snapshot (not recomputed) |
| Traces-to | FR-PPP-003 AC1 |
| Preconditions | Case `FIELD_ASSEMBLED`; QSL snapshots seeded |
| Test data | `POST /promotion-cases/{caseId}/compute-eligibility` |
| Steps | 1. Compute. 2. `GET /employees/emp-1001/eligibility?caseId=`. |
| Expected | `202` batch; each result carries `qsl_snapshot_id` + `qualifying_service_years` sourced from the ledger; no re-derivation of service. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-018** | Negative — Uncommunicated adverse APAR cannot be relied on (Dev Dutt gate) |
| Traces-to | FR-PPP-003 AC3; `VAL-G06-APAR-USABLE`; error `APAR_NOT_USABLE` |
| Preconditions | `emp-1110` adverse APAR `apar_communicated=false` |
| Test data | Compute eligibility relying on that entry (or supersession citing it) |
| Expected | `apar_usable=false`; entry not counted; reliance path returns `409` `APAR_NOT_USABLE`; trace records the decision. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-019** | Functional — Communicated + representation-disposed adverse APAR is usable |
| Traces-to | FR-PPP-003 AC2; `VAL-G06-APAR-USABLE` |
| Preconditions | `emp-1120` `apar_communicated=true, representation_status=DISPOSED` |
| Test data | Compute eligibility |
| Expected | `apar_usable=true`; entry counts toward `apar_min_count_meeting_benchmark`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-020** | Boundary — EWS/creamy-layer certificate expired on crucial date |
| Traces-to | FR-PPP-003 AC4; error `EWS_CERT_EXPIRED` |
| Preconditions | Reserved candidate with EWS cert expiring one day before `crucial_date` |
| Test data | Compute eligibility |
| Expected | Category benefit **not applied**; reason code recorded; `409` `EWS_CERT_EXPIRED` on the reserved-benefit path. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-021** | Negative — LDCE exam gate not passed |
| Traces-to | FR-PPP-003 AC5; error `EXAM_NOT_PASSED` |
| Preconditions | Rule `requires_exam_pass=true`; candidate has no PASS `exam_results` |
| Test data | Compute eligibility |
| Expected | `409` `EXAM_NOT_PASSED`; `failure_reasons` includes `EXAM_NOT_PASSED`. Result `AWAITED` → `PROVISIONALLY_ELIGIBLE`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-022** | Functional — Pending charge ⇒ SEALED_COVER; current penalty ⇒ NOT_ELIGIBLE |
| Traces-to | FR-PPP-003 AC6 |
| Preconditions | `emp-1200` pending charge; `emp-1201` current penalty (G09 by reference) |
| Test data | Compute eligibility |
| Expected | `emp-1200` → `SEALED_COVER`; `emp-1201` → `NOT_ELIGIBLE`; vigilance "not cleared" overrides APAR pass. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-023** | State-Transition (invalid) — Re-compute frozen after DPC_HELD |
| Traces-to | FR-PPP-003 AC6 "frozen post DPC_HELD" |
| Preconditions | Case at `DPC_HELD` |
| Test data | `POST /promotion-cases/{caseId}/compute-eligibility` |
| Expected | `409 CONFLICT` — eligibility frozen; recompute allowed only in `DRAFT`/`FIELD_ASSEMBLED`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-024** | API-Contract — APAR PII field-masked for unauthorised role |
| Traces-to | FR-PPP-003 BR (P02 field mask); auth resolution step 8 |
| Preconditions | Caller lacks TIER-3 APAR field grant |
| Test data | `GET /employees/{id}/eligibility?caseId=` |
| Expected | `200`; `apar_detail_json` rendered as masked placeholder (not omitted-silently leak); authorised role sees unmasked. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-025** | Negative — G08 APAR upstream unavailable maps to retryable precondition, never 503 |
| Traces-to | FR-PPP-003 failure handling; taxonomy X.3 (no public 503) |
| Preconditions | G08 gateway forced down |
| Test data | Compute eligibility |
| Expected | Assessment saved `PENDING`; response `412 PRECONDITION_FAILED` (retryable) or `500 INTERNAL` for non-retryable — **never** a 503; retried via X.3 circuit breaker. |
| Priority | P2 |

### FR-PPP-004 — Promotion Case Creation & Field Assembly

| Field | Value |
|---|---|
| **TC-G06-026** | Functional — Create case with vacancy derived from sanctioned_posts |
| Traces-to | FR-PPP-004 AC1, AC2; `VAL-G06-VACANCY-RECON` |
| Preconditions | `sp-SO-HO` seeded; finalised seniority list exists |
| Test data | `POST /promotion-cases` (JSON per BRD §9.6 example) |
| Expected | `201`; `vacancy_count` == computed promotion-quota vacancies from `sanctioned_posts`; not a free-typed number. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-027** | Negative — Vacancy not reconciled with establishment |
| Traces-to | FR-PPP-004 AC2/edge; error `VACANCY_NOT_RECONCILED` |
| Preconditions | Manual `vacancy_count` ≠ sanctioned promotion-quota vacancies |
| Test data | `POST /promotion-cases` with mismatched vacancy |
| Expected | `409` `VACANCY_NOT_RECONCILED`; assembly blocked. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-028** | Negative — Assemble field without a finalised seniority list |
| Traces-to | FR-PPP-004 AC1; error `SENIORITY_LIST_NOT_FINAL` |
| Preconditions | Only a PUBLISHED_TENTATIVE list exists |
| Test data | `POST /promotion-cases/{id}/assemble-field` |
| Expected | `409` `SENIORITY_LIST_NOT_FINAL`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-029** | Functional — Zone of consideration uses pinned DoPT slab (Appendix D.1) |
| Traces-to | FR-PPP-004 AC3; edge tie at zone boundary |
| Preconditions | Vacancy count set; candidates ordered by seniority |
| Test data | `POST /promotion-cases/{id}/assemble-field` |
| Expected | Zone computed via non-linear slab (not flat multiplier); reserved-category extended zone applied; tied seniority at boundary → both included. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-030** | Negative — Empty eligible field |
| Traces-to | FR-PPP-004 edge; error `NO_ELIGIBLE_CANDIDATES` |
| Preconditions | All in-zone candidates NOT_ELIGIBLE |
| Test data | `POST /promotion-cases/{id}/assemble-field` |
| Expected | `409` `NO_ELIGIBLE_CANDIDATES`. |
| Priority | P2 |

### FR-PPP-005 — DPC / Panel Constitution & Proceedings

| Field | Value |
|---|---|
| **TC-G06-031** | Authorization/SoD — Candidate cannot be a panel member |
| Traces-to | FR-PPP-005 AC1; auth `g06.dpc.grade` sod "cannot be in own promotion field"; error `PANEL_CONFLICT_OF_INTEREST` |
| Preconditions | An in-field candidate also nominated as a `g06_dpc_member` |
| Test data | `POST /promotion-cases/{id}/panels` including that member |
| Expected | `409` `PANEL_CONFLICT_OF_INTEREST` (P02 SoD). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-032** | Negative — Proceedings recorded without quorum |
| Traces-to | FR-PPP-005 AC/ BR; error `QUORUM_NOT_MET` |
| Preconditions | Panel with attendance below quorum config |
| Test data | `POST /panels/{id}/proceedings` |
| Expected | `409` `QUORUM_NOT_MET`; sitting recorded as adjourned, no verdicts committed. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-033** | State-Transition (valid) — PARALLEL_ALL_OF verdicts freeze eligibility |
| Traces-to | FR-PPP-005 AC3; state 11.2 PANEL_CONSTITUTED→DPC_HELD |
| Preconditions | Quorum met; panel current |
| Test data | `PATCH /candidates/{id}/verdict {dpc_verdict:"FIT"}` for each member branch |
| Expected | Case → `DPC_HELD` only when all member branches (PARALLEL_ALL_OF) join; verdict idempotent on replay; eligibility frozen. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-034** | Negative — Supersession citing an unusable APAR entry blocked |
| Traces-to | FR-PPP-005 AC3 (impr. #2); error `APAR_NOT_USABLE` |
| Preconditions | Junior placed above senior citing an uncommunicated adverse APAR |
| Test data | Record supersession verdict citing that APAR |
| Expected | `409` `APAR_NOT_USABLE`; supersession refused. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-035** | Boundary — Select-list count must not exceed vacancies |
| Traces-to | FR-PPP-005 AC4; state 11.2 guard `count ≤ vacancies`; error `VACANCY_EXCEEDED` |
| Preconditions | vacancy_count=6; 7 candidates marked FIT+selected |
| Test data | `POST /promotion-cases/{id}/select-list/approve` |
| Expected | `409` `VACANCY_EXCEEDED`; approval blocked at 7; passes at ≤6. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-036** | Authorization/SoD — Select-list approver ≠ DPC secretary/maker |
| Traces-to | FR-PPP-005 AC5; auth `g06.promotion.approve` sod maker≠checker |
| Preconditions | Secretary/maker attempts self-approval |
| Test data | `POST /promotion-cases/{id}/select-list/approve` as the maker |
| Expected | `403 FORBIDDEN` (SoD; maker == checker). Approval succeeds only for `g06_appointing_authority`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-037** | Functional — Supplementary/Review DPC for sealed/missed candidates |
| Traces-to | FR-PPP-005 AC; edge panel expiring / sealed later cleared |
| Test data | `POST /promotion-cases/{id}/supplementary-dpc` |
| Expected | `201`; a fresh panel/instance constituted for the residual candidates without disturbing the effected select list. |
| Priority | P2 |

### FR-PPP-006 — Reservation Roster Management & Compliance

| Field | Value |
|---|---|
| **TC-G06-038** | Functional — Own-merit reserved candidate migrates to UR point, reserved point preserved |
| Traces-to | FR-PPP-006 AC1; `VAL-G06-ROSTER-OWNMERIT`; N.R. Parmar case |
| Preconditions | Reserved (OBC) candidate tops UR merit; `selected_on_own_merit=true` |
| Test data | `POST /rosters/{id}/points/{pointId}/fill {filled_by_employee_id, filled_in_case_id, selected_on_own_merit:true, adjusted_against_category:"GEN"}` |
| Steps | 1. Fill UR point. 2. `GET /promotion-cases/{id}/roster-compliance`. |
| Expected | UR point filled with `adjusted_against_category=GEN`; reserved point left **un-consumed**; compliance report itemises the own-merit migration. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-039** | Negative — Own-merit reserved candidate placed on a reserved point |
| Traces-to | FR-PPP-006 failure handling; error `OWN_MERIT_MIGRATION_REQUIRED` |
| Test data | Fill a **reserved** point with an own-merit reserved candidate |
| Expected | `409` `OWN_MERIT_MIGRATION_REQUIRED`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-040** | Negative — Roster point double-fill |
| Traces-to | FR-PPP-006 AC5; error `ROSTER_POINT_OCCUPIED` |
| Preconditions | Point already filled |
| Test data | `POST /rosters/{id}/points/{pointId}/fill` again |
| Expected | `409` `ROSTER_POINT_OCCUPIED`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-041** | Negative — Category mismatch on roster fill |
| Traces-to | FR-PPP-006 AC1; error `ROSTER_CATEGORY_MISMATCH` |
| Test data | Fill an SC point with a GEN (non-own-merit) candidate |
| Expected | `409` `ROSTER_CATEGORY_MISMATCH`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-042** | Authorization — De-reservation requires authority ref and P01 checker |
| Traces-to | FR-PPP-006 AC2; auth `g06.roster.apply` (roster officer) / checker |
| Test data | `POST /rosters/{id}/points/{pointId}/de-reserve {dereservation_authority_ref, reason}` with and without `dereservation_authority_ref` |
| Expected | Without ref → `422 VALIDATION_FAILED`; with ref by non-checker → `403 FORBIDDEN`; with ref by checker → `200`, carry-forward linkage preserved. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-043** | Data-Integrity — 50% ceiling / PwBD-horizontal breach flagged in compliance |
| Traces-to | FR-PPP-006 AC3 |
| Preconditions | Roster fills push reserved share past 50% |
| Test data | `GET /promotion-cases/{id}/roster-compliance` |
| Expected | `compliant=false`; deviation + 50%-ceiling/PwBD-horizontal breach flagged; `own_merit_migrations` count reported. |
| Priority | P2 |

### FR-PPP-007 / 019 — Order Generation, Acceptance, Refusal & SR Posting

| Field | Value |
|---|---|
| **TC-G06-044** | Functional — Generate orders only for FIT+selected while panel current |
| Traces-to | FR-PPP-007 AC1 |
| Preconditions | Select list approved; panel `panel_valid_until` in future |
| Test data | `POST /promotion-cases/{id}/orders/generate` |
| Expected | `201`; orders generated only for `is_selected=true, dpc_verdict=FIT`; document rendered to G13. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-045** | Boundary — Order generation from an expired panel |
| Traces-to | FR-PPP-007 AC1 (impr. #11); `VAL-G06-PANEL-CURRENCY`; error `PANEL_EXPIRED` |
| Preconditions | `now > panel_valid_until` |
| Test data | `POST /promotion-cases/{id}/orders/generate` |
| Expected | `409` `PANEL_EXPIRED`; requires supplementary/review DPC to proceed. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-046** | State-Transition (valid) — Non-response ⇒ DEEMED_ACCEPTED |
| Traces-to | FR-PPP-007 AC3; state 11.3 ISSUED→DEEMED_ACCEPTED |
| Preconditions | Order ISSUED; acceptance window lapsed |
| Test data | Advance clock past window; system job runs |
| Expected | Order → `DEEMED_ACCEPTED` (no employee action). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-047** | Functional — Decline creates a refusal with debarment + MACP-clock effect |
| Traces-to | FR-PPP-007 AC3 → FR-PPP-019 AC1 |
| Preconditions | Order ISSUED; refusal policy config present |
| Test data | `POST /orders/{id}/decline {refusal_date, reason}` |
| Expected | `200` `PromotionRefusal`; `status=ACTIVE`, `debarment_until` computed, `macp_clock_effect ∈ {NONE,STOP,FORFEIT_NEXT,RESET}`; order → `DECLINED`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-048** | Negative — Decline when debarment/MACP-clock config absent |
| Traces-to | FR-PPP-019 failure; error `REFUSAL_POLICY_MISSING` |
| Preconditions | Cadre with deliberately-absent refusal config |
| Test data | `POST /orders/{id}/decline` |
| Expected | `409` `REFUSAL_POLICY_MISSING`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-049** | Negative — Re-consideration within active debarment window |
| Traces-to | FR-PPP-019 AC2; error `EMPLOYEE_DEBARRED` |
| Preconditions | Active refusal, `next_consideration_after` in future |
| Test data | Assemble field / include the debarred employee in a new case |
| Expected | `409` `EMPLOYEE_DEBARRED`; FR-004 field assembly excludes them within window. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-050** | Authorization — Waive a refusal (P01 checker, audited) |
| Traces-to | FR-PPP-019 AC5 |
| Test data | `POST /refusals/{id}/waive {reason}` as `g06_appointing_authority` vs as `employee` |
| Expected | Checker → `200` `status=WAIVED`, debarment lifted, P05 audit; employee → `403 FORBIDDEN`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-051** | State-Transition (valid) — Effect order posts SR PROMOTION via /sr/ingest |
| Traces-to | FR-PPP-007 AC4; state 11.3 ACCEPTED→EFFECTED; §9.7.1 |
| Preconditions | Order ACCEPTED/DEEMED_ACCEPTED; no active stay; SR available |
| Test data | `POST /orders/{id}/effect` |
| Expected | `200`; status `EFFECTED`; `sr_event_id` stored; SR call `event_type=PROMOTION`, `source_module="G06"`, `source_reference_id=order_id`, `source_event_version`, `fact_key`, explicit `tenant_id`/`entity_id`; probation auto-created (FR-009); G01 designation signal emitted. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-052** | Negative — Effect blocked while interim stay active |
| Traces-to | FR-PPP-007 AC5; FR-PPP-017; `VAL-G06-SUBJUDICE`; error `ENTITY_SUB_JUDICE` **412** |
| Preconditions | Linked `legal_case_links.interim_stay=true` |
| Test data | `POST /orders/{id}/effect` |
| Expected | `412` `ENTITY_SUB_JUDICE`; order → `INTERIM_STAYED`, **not** EFFECTED; no SR posted. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-053** | Data-Integrity — SR down at effect: order held, not falsely EFFECTED |
| Traces-to | FR-PPP-007 edge; error `SR_POSTING_FAILED` **412** |
| Preconditions | G12 `/sr/ingest` forced unavailable |
| Test data | `POST /orders/{id}/effect` |
| Expected | `412` `SR_POSTING_FAILED`; order stays `ISSUED`/`ACCEPTED` (not EFFECTED); whole tx rolled back; retried. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-054** | API-Contract — Idempotent effect / SR dedup on replay |
| Traces-to | FR-PPP-007 edge; `VAL-G06-SR-EVENT`; dedup tuple |
| Preconditions | Order already EFFECTED with `sr_event_id` |
| Test data | Replay `POST /orders/{id}/effect` with same `Idempotency-Key` |
| Expected | Original result returned (no duplicate SR row); dedup on `(source_module="G06", source_reference_id, source_event_version)`. |
| Priority | P1 |

### FR-PPP-008 — Sealed Cover Handling & Review DPC

| Field | Value |
|---|---|
| **TC-G06-055** | Authorization — Sealed-cover list visible only to authorised roles |
| Traces-to | FR-PPP-008 AC1 (P02 field-restricted, TIER-3) |
| Test data | `GET /sealed-covers?status=open` as `g06_vigilance_clearance`/`g06_appointing_authority` vs unauthorised role |
| Expected | Authorised → `200` list; unauthorised → `403 FORBIDDEN` (or empty scope, never leaks TIER-3 content). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-056** | Negative — Review sealed cover before the G09 case concludes |
| Traces-to | FR-PPP-008 AC; error `SEALED_COVER_NOT_REVIEWABLE` |
| Preconditions | Linked G09 case still open |
| Test data | `POST /sealed-covers/{candidateId}/review {outcome:"FIT"}` |
| Expected | `409` `SEALED_COVER_NOT_REVIEWABLE`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-057** | Functional — Exoneration → Review DPC effects with notional date (+ cascade if juniors ahead) |
| Traces-to | FR-PPP-008 AC3; FR-PPP-018 link |
| Preconditions | G09 case concluded EXONERATED; juniors already promoted |
| Test data | `POST /sealed-covers/{candidateId}/review {outcome:"FIT"}` |
| Expected | `200`; promotion effected with notional date preserving seniority; correction cascade (FR-018) triggered where juniors were promoted ahead. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-058** | Functional — Partially-upheld minor-penalty branch decision |
| Traces-to | FR-PPP-008 AC4 (impr. #20) |
| Test data | `POST /sealed-covers/{candidateId}/minor-penalty-decision {decision:"PROMOTE_WITH_PENALTY"}` |
| Expected | `200`; branch decision (`PROMOTE_WITH_PENALTY`/`DEFER`/`SUPERSEDE`) recorded and audited. |
| Priority | P2 |

### FR-PPP-009 — Probation Lifecycle

| Field | Value |
|---|---|
| **TC-G06-059** | Negative — Declare probation before the period elapses |
| Traces-to | FR-PPP-009 AC; error `PROBATION_NOT_COMPLETE` |
| Preconditions | Probation `scheduled_end` in future |
| Test data | `POST /probations/{id}/declare` |
| Expected | `409` `PROBATION_NOT_COMPLETE`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-060** | Boundary — Extension beyond policy cap |
| Traces-to | FR-PPP-009 BR; error `PROBATION_EXTENSION_LIMIT` |
| Preconditions | Probation already extended to cap |
| Test data | `POST /probations/{id}/extend {extended_to, reason}` beyond cap |
| Expected | `409` `PROBATION_EXTENSION_LIMIT`; within cap → `200`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-061** | State-Transition (valid) — Declare satisfactory posts CONFIRMATION SR |
| Traces-to | FR-PPP-009 AC5; state 11.6 ON_PROBATION→DECLARED_SATISFACTORY; §9.7.1 |
| Preconditions | Period elapsed |
| Test data | `POST /probations/{id}/declare` |
| Expected | `200` `DECLARED_SATISFACTORY`; SR `event_type=CONFIRMATION` posted (source_reference_id = probation id). |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-062** | State-Transition (valid) — Revert reverses order (SUPERSEDED) + SR |
| Traces-to | FR-PPP-009 BR; state 11.6 →REVERTED |
| Test data | `POST /probations/{id}/revert` |
| Expected | `200` `REVERTED`; source order → `SUPERSEDED`; SR `REVERSION` posted. |
| Priority | P2 |

### FR-PPP-010 — Ad-hoc / Officiating / In-situ

| Field | Value |
|---|---|
| **TC-G06-063** | Negative — Overlapping officiating arrangement for the same post |
| Traces-to | FR-PPP-010 BR; error `OFFICIATING_OVERLAP` |
| Preconditions | Active arrangement on `sp-SO-HO` |
| Test data | `POST /officiating` overlapping the same post |
| Expected | `409` `OFFICIATING_OVERLAP`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-064** | State-Transition (valid) — Regularise only when the same incumbent is selected |
| Traces-to | FR-PPP-010 AC3; state 11.5 ACTIVE→REGULARISED |
| Preconditions | Linked regular case `SELECT_LIST_APPROVED`; incumbent selected |
| Test data | `POST /officiating/{id}/regularise` |
| Expected | `200` `REGULARISED`; regular order created; SR posted. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-065** | State-Transition (invalid→guard) — Regular DPC selects another ⇒ SUPERSEDED_BY_REGULAR |
| Traces-to | FR-PPP-010 AC4 (impr. #20); error `NO_REGULAR_SELECTION` |
| Preconditions | Regular DPC selected a different person |
| Test data | `POST /officiating/{id}/regularise` (attempt), then `POST /officiating/{id}/terminate` |
| Expected | Regularise → `409` `NO_REGULAR_SELECTION`; arrangement moves to `SUPERSEDED_BY_REGULAR`, terminated (not regularised), SR end (`OFFICIATING_CANCELLED`) posted. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-066** | Functional — Officiating start/end posts SR OFFICIATING |
| Traces-to | FR-PPP-010 AC5; §9.7.1 |
| Test data | `POST /officiating` then `POST /officiating/{id}/terminate` |
| Expected | Start posts `event_type=OFFICIATING`; terminate posts `OFFICIATING_CANCELLED` (or `is_reversal=true`); source_reference_id = arrangement id. |
| Priority | P2 |

### FR-PPP-011 — Financial Up-gradation (ACP/MACP)

| Field | Value |
|---|---|
| **TC-G06-067** | Boundary — MACP cap: 3 up-gradations exhausted |
| Traces-to | FR-PPP-011 AC3; `VAL-G06-MACP-CAP`; error `MACP_CAP_REACHED` |
| Preconditions | Employee with 3 EFFECTED financial up-gradations |
| Test data | `POST /financial-upgradations/{id}/sanction` for a 4th |
| Expected | `409` `MACP_CAP_REACHED`; `count(EFFECTED) ≤ 3` enforced (no combined promotions+MACP cap). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-068** | Functional — Regular promotion resets clock / reduces remaining entitlement |
| Traces-to | FR-PPP-011 AC3 (corrected cap); edge clock reset |
| Preconditions | Employee took a regular promotion before MACP due |
| Test data | `GET /financial-upgradations?status=due` after `JOB-G06-MACP-DUE` |
| Expected | Due recomputed via `clock_reset_date`; remaining entitlement reduced by the regular promotion (not a combined cap). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-069** | Functional — Active refusal applies MACP-clock effect |
| Traces-to | FR-PPP-011 AC4; FR-PPP-019 |
| Preconditions | Active `promotion_refusals` with `macp_clock_effect=FORFEIT_NEXT` |
| Test data | Run MACP due detection / screen |
| Expected | `refusal_effect_applied=true`; next up-gradation forfeited/stopped/reset per recorded effect. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-070** | State-Transition (valid) — Defer on current penalty |
| Traces-to | FR-PPP-011 AC5; state 11.4 →DEFERRED |
| Preconditions | Current disciplinary penalty |
| Test data | `POST /financial-upgradations/{id}/defer` |
| Expected | `200` `DEFERRED`; re-evaluated on penalty expiry. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-071** | Data-Integrity — Sanction posts MACP SR (G12) + hands pay event to G10 (no PAY_FIXATION from G06) |
| Traces-to | FR-PPP-011 AC5; §9.7.1 pay-fixation boundary |
| Test data | `POST /financial-upgradations/{id}/sanction` |
| Expected | SR `event_type=MACP` posted by G06; a pay-fixation event handed to G10; G06 does **not** post `PAY_FIXATION`/`ANNUAL_INCREMENT`. |
| Priority | P1 |

### FR-PPP-012 — Posting after Promotion

| Field | Value |
|---|---|
| **TC-G06-072** | Negative — Posting created for a non-EFFECTED order |
| Traces-to | FR-PPP-012 AC1 |
| Preconditions | Order in `ISSUED` (not EFFECTED) |
| Test data | `POST /orders/{id}/postings` |
| Expected | `409 CONFLICT` — posting only for an EFFECTED order. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-073** | Negative — Destination post not sanctioned/vacant |
| Traces-to | FR-PPP-012 AC2; `VAL-G06-VACANCY-RECON`; error `POST_NOT_AVAILABLE` |
| Preconditions | `to_sanctioned_post_id` with `current_vacancies=0` |
| Test data | `POST /orders/{id}/postings` |
| Expected | `409` `POST_NOT_AVAILABLE`; no free-text vacancy assumption. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-074** | State-Transition (valid) — NOT_JOINED terminal state with consequence |
| Traces-to | FR-PPP-012 AC4 (impr. #20); state 11.7 →NOT_JOINED |
| Preconditions | Report-by date passed without joining |
| Test data | `POST /postings/{id}/mark-not-joined {consequence:"FORFEITED"}` |
| Expected | `200`; status `NOT_JOINED`; `not_joined_consequence ∈ {ORDER_REVIEW,FORFEITED,EXTENSION_GRANTED}`; forfeiture frees the sanctioned post. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-075** | Functional — JOINED posts SR POSTING + signals G01 org_unit |
| Traces-to | FR-PPP-012 AC5; §9.7.1 |
| Test data | `POST /postings/{id}/sync-movement` (G05) → JOINED |
| Expected | On JOINED, SR `event_type=POSTING` posted (G06-owned); `employees.org_unit_id` update signalled to G01; no `TRANSFER/RELIEVING/JOINING` code emitted by G06. |
| Priority | P2 |

### FR-PPP-013 — Progression Monitoring

| Field | Value |
|---|---|
| **TC-G06-076** | Functional — Progression alerts generated & deduped per period |
| Traces-to | FR-PPP-013 AC1, AC2 |
| Test data | `POST /progression/run` (per-period run key), then `GET /progression/alerts` |
| Expected | Alerts on configurable lead time; deduped per employee/type/cycle (idempotent run key); stagnation computed from QSL net years. Re-run does not duplicate. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-077** | Data-Integrity — Increment rows mirror G10; G06 never authoritatively sets release/withhold |
| Traces-to | FR-PPP-013 AC3 (impr. #18) |
| Test data | Inspect `increment_monitor` rows |
| Expected | Rows keyed by `g10_increment_ref` are mirror-only; withhold/release owned by G10; rows without a G10 ref are alert-only projections. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-078** | Authorization — Employee sees only own progression timeline |
| Traces-to | FR-PPP-013 AC4 (P02 own-record scope) |
| Test data | `GET /employees/{id}/progression-timeline` as self vs another employee's id |
| Expected | Self → `200`; other → `403/404` (scope filter, no leak). |
| Priority | P2 |

### FR-PPP-014 — Career-Path / Succession (Advisory)

| Field | Value |
|---|---|
| **TC-G06-079** | Functional — Advisory career path never auto-promotes |
| Traces-to | FR-PPP-014 (advisory/optional boundary note §2.3) |
| Test data | `POST /career-paths`, `POST /succession-plans`, `GET /eligibility-dashboard` |
| Expected | Reads competencies from G07, feeds analytics to G14; creates **no** promotion case/order and is not a source of truth for competencies. |
| Priority | P3 |

### FR-PPP-015 — Sanctioned-Post & Establishment Register

| Field | Value |
|---|---|
| **TC-G06-080** | Data-Integrity — Quota split must not exceed 100 |
| Traces-to | FR-PPP-015 AC2; `VAL-G06-QUOTA-SPLIT`; error `QUOTA_SPLIT_INVALID` |
| Test data | `POST /sanctioned-posts` `{dr_quota_pct:40, promotion_quota_pct:50, ldce_quota_pct:20}` (=110) |
| Expected | `409` `QUOTA_SPLIT_INVALID`; sum ≤100 enforced. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-081** | Data-Integrity — filled_count must not exceed sanctioned_strength |
| Traces-to | FR-PPP-015 AC2; error `STRENGTH_INCONSISTENT` |
| Test data | `POST /sanctioned-posts` / reconcile yielding `filled_count > sanctioned_strength` |
| Expected | `409` `STRENGTH_INCONSISTENT`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-082** | Functional — Vacancy computation = current + anticipated + carried-forward |
| Traces-to | FR-PPP-015 AC3 |
| Test data | `GET /sanctioned-posts/{id}/vacancy-computation` |
| Expected | `current_vacancies = sanctioned_strength − filled_count`; promotion-quota vacancies = (current + anticipated + carried-forward) × promotion_quota_pct; figure consumed by FR-004. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-083** | Authorization — Strength revision requires P01 checker |
| Traces-to | FR-PPP-015 AC5; auth `g06.vacancy.compute` (strength officer independent of case maker) |
| Test data | `POST /sanctioned-posts` revise as maker vs checker |
| Expected | Maker self-approval → `403 FORBIDDEN`; checker-approved revision → versioned `REVISED`/`ARCHIVED`, P05 audit. |
| Priority | P2 |

### FR-PPP-016 — Qualifying-Service Ledger & Exclusion Engine

| Field | Value |
|---|---|
| **TC-G06-084** | Functional — Compute net qualifying years with itemised exclusion breakdown |
| Traces-to | FR-PPP-016 AC1; `VAL-G06-QUALSVC`; Appendix D.3 |
| Test data | `POST /qualifying-service/compute {employee_id, grade, as_of}` |
| Expected | `net_qualifying_years = gross − Σ(excluded)`; `exclusion_breakdown_json` itemises EOL-beyond-condonable / dies-non / suspension / ad-hoc / deputation; non-negative. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-085** | Data-Integrity — Snapshot immutable; recompute supersedes (no edit) |
| Traces-to | FR-PPP-016 AC2 |
| Test data | Compute; then re-`POST /qualifying-service/compute` for same key; `GET /qualifying-service/{snapshotId}` on both |
| Expected | Original snapshot unchanged; new snapshot created with `superseding_snapshot_id` lineage; prior `is_current=false`; soft-delete only (P05 lineage). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-086** | Boundary — Overlapping EOL and dies-non not double-counted |
| Traces-to | FR-PPP-016 AC1/edge; Appendix D.3 |
| Preconditions | Employee with overlapping EOL + dies-non period |
| Test data | Compute QSL |
| Expected | Overlapping period excluded once (no double count); breakdown shows single exclusion. |
| Priority | P2 |

### FR-PPP-017 — Legal-Case Linkage & Sub-Judice

| Field | Value |
|---|---|
| **TC-G06-087** | Authorization/SoD — Only Legal Officer writes legal links |
| Traces-to | FR-PPP-017 BR; auth `g06.legal.link` sod "cannot adjudicate" |
| Test data | `POST /legal-case-links` as `g06_legal_officer` vs `g06_appointing_authority` |
| Expected | Legal Officer → `201`; adjudication role → `403 FORBIDDEN`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-088** | State-Transition (valid) — Interim stay → INTERIM_STAYED; vacate restores prior state |
| Traces-to | FR-PPP-017 AC2; state 11.9 |
| Test data | `POST /legal-case-links/{id}/interim-stay {interim_stay:true}` then vacate |
| Expected | Linked entity → `INTERIM_STAYED`, effecting/finalise/posting blocked; on vacate, prior state restored. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-089** | Functional — Adverse disposal triggers a correction event |
| Traces-to | FR-PPP-017 AC4; FR-PPP-018 |
| Test data | `POST /legal-case-links/{id}/dispose {status:"DISPOSED_ADVERSE"}` |
| Expected | Outcome recorded; a `correction_events` row auto-created (FR-018) for the affected entity. |
| Priority | P2 |

### FR-PPP-018 — Correction Lineage & Recompute Cascade

| Field | Value |
|---|---|
| **TC-G06-090** | Data-Integrity — Re-rank of a FINALISED list only via a correction event (no silent edit) |
| Traces-to | FR-PPP-018 AC1 |
| Preconditions | FINALISED list |
| Test data | Attempt direct entry PATCH on a FINALISED list, then `POST /correction-events` |
| Expected | Direct edit rejected (`409 CONFLICT`); re-rank permitted only through an approved correction event. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-091** | Authorization/SoD — Correction approval maker ≠ checker (P01) |
| Traces-to | FR-PPP-018 AC5; state 11.9 PENDING→RUNNING guard |
| Test data | `POST /correction-events/{id}/approve` as maker vs `g06_appointing_authority` |
| Expected | Maker self-approve → `403 FORBIDDEN`; checker → `200`, list → `UNDER_CORRECTION`. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-092** | E2E-Flow — Court-ordered retrospective re-rank cascade + pay-anomaly to G10 |
| Traces-to | FR-PPP-018 AC3, AC4; §9.6 cascade example |
| Preconditions | Court adverse disposal on a finalised list where a junior now outranks a senior |
| Test data | Create correction (`reason_class=COURT_ORDER`) → approve → `POST /correction-events/{id}/run-cascade` |
| Expected | `200` `cascade_status=COMPLETED`; entries re-ranked (`superseded_by_correction`), QSL re-snapshotted; `pay_anomaly_flag=true` with `pay_anomaly_signal_ref` to G10; SR correction posted via `/sr/ingest/reversal` (`is_reversal=true`, `reverses_source_reference_id`, `PROMOTION_CANCELLED`). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-093** | Data-Integrity — Cascade failure rolls back atomically |
| Traces-to | FR-PPP-018 BR; error `CASCADE_FAILED` |
| Preconditions | Cascade forced to fail mid-run |
| Test data | `POST /correction-events/{id}/run-cascade` |
| Expected | `409` `CASCADE_FAILED`; `cascade_status=ROLLED_BACK`; no partial re-rank persisted; JOB-FAIL/`MSG-SYS-JOBFAIL` alert; cascade idempotent/resumable on retry. |
| Priority | P1 |

### Cross-cutting — Authorization

| Field | Value |
|---|---|
| **TC-G06-094** | Authorization — Unauthenticated request rejected |
| Traces-to | Platform envelope; taxonomy `UNAUTHENTICATED` 401 |
| Test data | `POST /seniority-lists` with no/expired Bearer token |
| Expected | `401` `UNAUTHENTICATED`; no resource created. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-095** | Authorization — Cross-tenant read isolation (no existence leak) |
| Traces-to | auth resolution step 7; P02 scope_safety |
| Preconditions | List belongs to `ten-01/ent-07` |
| Test data | `GET /seniority-lists/{id}` as a `ten-02` principal |
| Expected | `404 NOT_FOUND` (indistinguishable from absent; never leaks existence). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-096** | Authorization — DPC Secretary cannot vote/grade |
| Traces-to | auth `g06.dpc.convene` sod "cannot vote or grade" |
| Test data | `PATCH /candidates/{id}/verdict` as `g06_dpc_secretary` |
| Expected | `403 FORBIDDEN`; only `g06_dpc_member` may grade. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-097** | Authorization — SR post write enforces maker ≠ checker |
| Traces-to | auth `g06.sr.post` sod; §9.7.1 |
| Test data | `POST /sr/ingest` where writer == the checker of the originating order |
| Expected | `403 FORBIDDEN` (SoD) / P01-enforced maker≠checker on the SR write. |
| Priority | P2 |

### Cross-cutting — API-Contract

| Field | Value |
|---|---|
| **TC-G06-098** | API-Contract — Canonical error envelope + correlation id header |
| Traces-to | taxonomy envelope §1 |
| Test data | Any negative (e.g. TC-052) |
| Expected | Body = `{error:{code,message,field,details}}` and nothing else; `X-Correlation-Id` in **response header**, not body; message resolved from an ERR-*/MSG-* id. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-099** | API-Contract — Cursor pagination bound (default 25 / max 100) |
| Traces-to | conventions `pagination_bound`; OpenAPI Limit/Cursor |
| Test data | `GET /promotion-cases/{id}/candidates?limit=500` and default |
| Expected | `limit` clamped to max 100; `next_cursor` returned; stable ordering by `sort`. |
| Priority | P2 |

| Field | Value |
|---|---|
| **TC-G06-100** | API-Contract — Idempotency-Key required on unsafe POST; 24h replay |
| Traces-to | conventions; OpenAPI IdempotencyKey |
| Test data | `POST /promotion-cases` without `Idempotency-Key`, then twice with same key |
| Expected | Missing key → rejected per contract; same-key replay within 24h returns the original result (no duplicate case). |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-101** | Data-Integrity — No double SR-claim of the pay event |
| Traces-to | §9.7.1 pay-fixation boundary; FR-PPP-007 AC4 / FR-PPP-011 AC5 |
| Test data | Inspect all SR calls from `effect` and `sanction` |
| Expected | G06 emits only establishment codes (`PROMOTION/OFFICIATING/MACP/CONFIRMATION/POSTING/REVERSION`); **never** `PAY_FIXATION`/`ANNUAL_INCREMENT` and never a `TRANSFER/RELIEVING/JOINING` code — those belong to G10/G05. |
| Priority | P1 |

### Cross-cutting — E2E Flow

| Field | Value |
|---|---|
| **TC-G06-102** | E2E-Flow — DPC → promotion order → effect posts PROMOTION to /sr/ingest |
| Traces-to | FR-PPP-004→005→006→007; state 11.2/11.3; §9.7.1 |
| Preconditions | Finalised seniority list; sanctioned post; eligible field; roster |
| Test data | assemble-field → compute-eligibility → constitute panel → verdicts FIT → approve select list (≤ vacancies, roster ok) → generate orders → accept → effect |
| Steps | Drive the full chain end to end for a clean candidate. |
| Expected | Case `DRAFT→FIELD_ASSEMBLED→ELIGIBILITY_DONE→PANEL_CONSTITUTED→DPC_HELD→SELECT_LIST_APPROVED→ORDERS_ISSUED`; order `ISSUED→ACCEPTED→EFFECTED`; a single SR `PROMOTION` event posted to `POST /api/v1/sr/ingest` with correct dedup tuple + `fact_key` + tenant/entity; probation created; roster point tagged; G01 designation signal emitted; **no** pay SR from G06. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-103** | E2E-Flow — MACP due → screen → sanction posts MACP to /sr/ingest, pay event to G10 |
| Traces-to | FR-PPP-011; FR-PPP-016; §9.7.1 |
| Preconditions | QSL net years meet threshold; no current penalty; cap<3 |
| Test data | `JOB-G06-MACP-DUE` → `screen` → `sanction` |
| Expected | `financial_upgradation` `DUE→UNDER_SCREENING→SANCTIONED→EFFECTED`; SR `MACP` posted by G06 (source_reference_id = upgradation id); pay-fixation handed to G10; cap and QSL citation honoured. |
| Priority | P1 |

| Field | Value |
|---|---|
| **TC-G06-104** | E2E-Flow — Officiating → regular DPC selects another → SUPERSEDED_BY_REGULAR |
| Traces-to | FR-PPP-010 AC4; state 11.5 |
| Preconditions | Active officiating on `sp-SO-HO`; regular case selects a different incumbent |
| Test data | approve regular select-list → attempt regularise → terminate |
| Expected | Regularise refused (`NO_REGULAR_SELECTION`); arrangement → `SUPERSEDED_BY_REGULAR`; SR `OFFICIATING_CANCELLED` posted; regular order effected for the selected candidate. |
| Priority | P2 |

---

## 3. Traceability Matrix (FR → TC ids)

| FR | Title | TC ids | Gaps |
|---|---|---|---|
| FR-PPP-001 | Seniority list generation | TC-G06-001, 002, 003, 004, 005 | none |
| FR-PPP-002 | Publication, objections, finalisation | TC-G06-006, 007, 008, 009, 010, 011, 012 | none |
| FR-PPP-003 | Eligibility rule engine | TC-G06-017, 018, 019, 020, 021, 022, 023, 024, 025 | none |
| FR-PPP-004 | Case creation & field assembly | TC-G06-026, 027, 028, 029, 030, 102 | none |
| FR-PPP-005 | DPC / panel constitution | TC-G06-031, 032, 033, 034, 035, 036, 037, 096, 102 | none |
| FR-PPP-006 | Reservation roster | TC-G06-038, 039, 040, 041, 042, 043, 102 | none |
| FR-PPP-007 | Order gen / accept / refuse / SR | TC-G06-044, 045, 046, 047, 051, 052, 053, 054, 101, 102 | none |
| FR-PPP-008 | Sealed cover & Review DPC | TC-G06-055, 056, 057, 058 | none |
| FR-PPP-009 | Probation lifecycle | TC-G06-059, 060, 061, 062 | none |
| FR-PPP-010 | Officiating / ad-hoc | TC-G06-063, 064, 065, 066, 104 | none |
| FR-PPP-011 | Financial upgradation (MACP) | TC-G06-067, 068, 069, 070, 071, 103 | none |
| FR-PPP-012 | Posting after promotion | TC-G06-072, 073, 074, 075 | none |
| FR-PPP-013 | Progression monitoring | TC-G06-076, 077, 078 | none |
| FR-PPP-014 | Career/succession (advisory) | TC-G06-079 | none |
| FR-PPP-015 | Sanctioned-post register | TC-G06-080, 081, 082, 083 | none |
| FR-PPP-016 | Qualifying-service ledger | TC-G06-084, 085, 086, 103 | none |
| FR-PPP-017 | Legal linkage & sub-judice | TC-G06-012, 052, 087, 088, 089 | none |
| FR-PPP-018 | Correction lineage & cascade | TC-G06-057, 089, 090, 091, 092, 093 | none |
| FR-PPP-019 | Refusal consequences | TC-G06-047, 048, 049, 050 | none |
| FR-PPP-020 | Multi-stream inter-se seniority | TC-G06-013, 014, 015, 016 | none |
| Cross-cutting (auth/API/E2E) | Platform + SR contract | TC-G06-094, 095, 096, 097, 098, 099, 100, 101, 102, 103, 104 | n/a |

**FR coverage: 20 of 20 FRs (FR-PPP-001…020) — 0 gaps.**

## 4. Coverage Summary

### 4.1 Count by type

Each TC is counted once under the **primary** type declared in its header row.

| Type | Count |
|---|---|
| Functional | 25 |
| Negative | 24 |
| Authorization (incl. Authorization/SoD) | 13 |
| State-Transition (valid + invalid) | 13 |
| Data-Integrity | 12 |
| Boundary | 8 |
| API-Contract | 5 |
| E2E-Flow | 4 |
| **Total** | **104** |

### 4.2 Count by priority

| Priority | Count |
|---|---|
| P1 (critical / litigation-bearing) | 67 |
| P2 (important) | 36 |
| P3 (advisory) | 1 |
| **Total** | **104** |

### 4.3 Error-code assertion coverage (negatives)

`SENIORITY_RANK_CONFLICT` (007) · `OBJECTION_WINDOW_CLOSED` (008) · `OBJECTIONS_PENDING` (010) · `ENTITY_SUB_JUDICE` 412 (012, 052) · `STREAM_TAG_MISSING` (015) · `QUOTA_RULE_INVALID` (016) · `APAR_NOT_USABLE` (018, 034) · `EWS_CERT_EXPIRED` (020) · `EXAM_NOT_PASSED` (021) · `VACANCY_NOT_RECONCILED` (027) · `SENIORITY_LIST_NOT_FINAL` (028) · `NO_ELIGIBLE_CANDIDATES` (030) · `PANEL_CONFLICT_OF_INTEREST` (031) · `QUORUM_NOT_MET` (032) · `VACANCY_EXCEEDED` (035) · `OWN_MERIT_MIGRATION_REQUIRED` (039) · `ROSTER_POINT_OCCUPIED` (040) · `ROSTER_CATEGORY_MISMATCH` (041) · `PANEL_EXPIRED` (045) · `REFUSAL_POLICY_MISSING` (048) · `EMPLOYEE_DEBARRED` (049) · `SR_POSTING_FAILED` 412 (053) · `SEALED_COVER_NOT_REVIEWABLE` (056) · `PROBATION_NOT_COMPLETE` (059) · `PROBATION_EXTENSION_LIMIT` (060) · `OFFICIATING_OVERLAP` (063) · `NO_REGULAR_SELECTION` (065) · `MACP_CAP_REACHED` (067) · `POST_NOT_AVAILABLE` (073) · `QUOTA_SPLIT_INVALID` (080) · `STRENGTH_INCONSISTENT` (081) · `CASCADE_FAILED` (093) · `UNAUTHENTICATED` 401 (094) · `NOT_FOUND` (095). All 31 G06 domain codes + key platform codes are asserted.
