# PH-02 Review Packet (Verdict)

Phase: PH-02 — Define Missing HRMS Master Data, Hierarchy, and Authority Matrices
Sub-phase producing this packet: PH-02D (authority-resolution test suite + review packet)
Status: READY FOR HUMAN SIGN-OFF
Date: 2026-07-02

Artefacts under review:

- Model: `docs/spec/hrms-authority-model.yaml` (PH-02A)
- Fixtures: `docs/spec/hrms-seed-data-plan.yaml` (PH-02C)
- Resolver contract: `docs/spec/authority-resolution-contract.yaml` (PH-01)
- Test suite (oracle): `docs/tests/authority-resolution-tests.md` (PH-02D)
- Plan of record: `docs/spec/phased-plan.yaml` PH-02

---

## 1. Traceability — every `generated_tests` item and every `review_criterion` maps to a test (0 gaps)

### 1a. `phased-plan.yaml` PH-02 `generated_tests`

| generated_tests item | Kind | Test in `authority-resolution-tests.md` | Resolver type / fixture |
|---|---|---|---|
| reporting-chain L1/L2/skip-level resolution | unit | Reporting-chain L1; Resolver-Type Coverage (REPORTING_CHAIN) | REPORTING_CHAIN / `reporting_chain` |
| position-authority resolution by employee as-of date | unit | Point-in-Time (As-Of Date) Resolution POINT-IN-TIME-1..4 | STATUTORY_AUTHORITY+DELEGATION / `G05_TRANSFER_REVENUE`, `d1000000-...0001` |
| org-unit-head fallback | unit | G03 org-unit-head fallback; vacant-manager fallback | ORG_UNIT_HEAD / `G03_LEAVE_HEAD_ASSESSMENT`, `vacant_manager` |
| delegation and acting-charge precedence | unit | Delegation/acting charge; POINT-IN-TIME-2/3 | DELEGATION / `delegation` row `d1000000-...0001` |
| committee quorum and recusal | unit | DPC committee quorum; G06 panel constraints | COMMITTEE / `committees` PH02-DPC-REVENUE |
| no overlapping effective-dated authority assignments | data | No-Overlap Effective-Dated Authority Invariant NO-OVERLAP-1..3 | STATUTORY_AUTHORITY / `g01_authority_assignments` |
| tenant/entity scoping enforcement | data | Cross-entity coverage row; `data_quality_assertions` scoping | STATUTORY_AUTHORITY / `cross_entity_authority` |
| SoD test data for self-approval denial | data | Delegation/acting charge (SoD blocks self-approval) | DELEGATION+SoD / `delegation` `sod_note` |

### 1b. PH-02 `review_criteria`

| review_criterion | Evidencing test / artefact | Verdict |
|---|---|---|
| Every resolver output is explainable and auditable | Resolver-Type Coverage table (>=1 case per type); snapshot immutable evidence `snapshot_rule` / `resolution_snapshot.required_evidence` | MET |
| Ambiguous authority is blocked, never guessed | NO-OVERLAP-3 (negative) -> `P01_RESOLVER_AMBIGUOUS` BLOCKED; model `fail_closed` clauses | MET |
| Effective-dated lookup rules are deterministic | POINT-IN-TIME-1..4 (no retroactive drift); `deterministic_tie_break` `[priority_asc, effective_from_desc, authority_code_asc]` | MET |
| HRMS seed data can drive G03 and G05 without ad hoc test-only bypasses | `vertical_slice_bindings` G03_leave / G05_transfer resolve from real fixtures; see section 3 | MET |
| Operational implementation stays scoped to facts and fixtures | Suite is black-box against the contract; no service/schema change in PH-02D | MET |

Coverage gaps: **0**. Every `generated_tests` item and every `review_criterion` has at least one evidencing test.
Every `resolver_type` in `hrms-authority-model.yaml` has >= 1 test (Resolver-Type Coverage table).

---

## 2. Explainability, auditability, and ambiguity-blocked (with evidence)

- **Explainable / auditable.** Every resolution writes an immutable `workflow_resolution_snapshots` row carrying
  `resolver_type`, `resolver_rule`, `candidate_set`, `selected_assignees`, `exclusion_reasons`, `fallback_applied`,
  `as_of`, and the `hierarchy_version` / `authority_matrix_version` / `source_data_version`
  (`docs/spec/authority-resolution-contract.yaml` `resolution_snapshot`; `hrms-authority-model.yaml` `snapshot_rule`).
  A past decision is **replayed from the snapshot, never re-resolved against today's hierarchy** — verified by
  POINT-IN-TIME-4 (no-retroactive-drift).
- **Ambiguity is BLOCKED, never guessed.** When two active rows share priority with no deterministic tie-break,
  the resolver fails closed with `P01_RESOLVER_AMBIGUOUS` (evidence: NO-OVERLAP-3, and `fail_closed` clauses on
  STATUTORY_AUTHORITY / NAMED_ROLE / SR_CUSTODIAN / APPELLATE_AUTHORITY). Vacant manager falls back to the
  org-unit head deterministically rather than guessing a peer (`vacant_manager` fixture; ORG_UNIT_HEAD fallback).
- **Deterministic effective-dated lookup.** Resolution binds to the as-of date via effective-dated windows; a
  later or back-dated assignment does not rewrite a recorded past resolution (POINT-IN-TIME series;
  NO-OVERLAP invariant guarantees a single active window per `(tenant, scope, authority_type)`).

---

## 3. G03 / G05 drivable from the seed without test-only bypasses

- **G03 leave** (`vertical_slice_bindings.G03_leave`): subject `...9902` resolves primary approver `...9901` via
  REPORTING_CHAIN over `employee_job_assignments`, with ORG_UNIT_HEAD fallback via `G03_LEAVE_HEAD_ASSESSMENT`.
  Vacant-manager variant (`hard_resolver_cases.vacant_manager`) exercises the deterministic fallback.
- **G05 transfer** (`vertical_slice_bindings.G05_transfer`): STATUTORY_AUTHORITY `TRANSFER_AUTHORITY` resolves
  `...9901` from `g01_authority_assignments` (`G05_TRANSFER_REVENUE`), with acting-charge delegation
  `d1000000-...0001` and the cross-entity widened-scope case (`cross_entity_authority`).
- Both slices resolve from real seeded rows honouring `tenant_id`/`entity_id` scoping. **No test-only bypass of
  the authority model** is used; the suite is black-box against the resolver contract. G03 and G05 are therefore
  drivable directly from the seed.

---

## 4. Residual risks

1. **Live resolver not yet implemented.** PH-02 freezes data contracts and fixtures; the executable resolver
   (and thus runtime enforcement of the point-in-time and no-overlap invariants) lands in PH-03. Until then the
   negative cases (NO-OVERLAP-3 ambiguity, POINT-IN-TIME-3 expiry) are contract-level expectations, not runtime assertions.
2. **No DB-level exclusion constraint yet.** The no-overlap invariant is asserted over fixtures and by resolver
   fail-closed behaviour; a Postgres exclusion/`daterange` constraint on `g01_authority_assignments` is recommended
   as hardening in the schema phase (advisory, not a PH-02 blocker).
3. **Production authority import deferred.** Government service-book / order imports and PUDA historical migration
   remain future P06 migration work; fixtures are `schema_seed_only`.
4. **Committee workflow execution deferred.** PH-02 supplies quorum/recusal data contracts; full committee
   workflow behaviour (voting, replacement scheduling) is G06/G09.

---

## Verdict

PH-02 authority-resolution substrate is **explainable, auditable, deterministic, and ambiguity-blocked**, with
full test traceability (0 gaps) and G03/G05 drivable from the seed without test-only bypasses. Recommended:
**PASS** to PH-03, carrying the residual risks above.
