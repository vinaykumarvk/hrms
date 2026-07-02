# Authority Resolution Tests (PH-02)

Status: implemented for PH-02 agentic gate.

## Executable Gate

```bash
bash docs/spec/pipeline/checks/ph-02.sh
```

Expected result:

```text
PH-02 gate GREEN
```

Latest local result:

```text
PH-02 gate GREEN; PH-01 regression passed, full schema load passed, G03/G05 authority fixtures and forced RLS verified.
```

## Required Resolver Tests

| Test | Fixture source | Expected result |
|---|---|---|
| Reporting-chain L1 | `employee_job_assignments.reporting_manager_id` for employee `...9902` | resolves employee `...9901` |
| Reports-to-position | `positions.reports_to_position_id` for `POS-REV-AS-05` | points to `POS-REV-DC-01` |
| G03 org-unit-head fallback | `g01_authority_assignments` authority `G03_LEAVE_HEAD_ASSESSMENT` | resolves employee `...9901` |
| G05 transfer authority | `g01_authority_assignments` authority `G05_TRANSFER_REVENUE` | resolves employee `...9901` |
| Delegation/acting charge | `g01_authority_delegations` row `d100...0001` | valid window exists; SoD still blocks self-approval |
| DPC committee quorum | `g01_committees` + `g01_committee_members` | active required members >= quorum |
| G06 panel constraints | `g06_promotion_panels`, `g06_promotion_panel_members` | quorum positive; recused members require reason |
| G09 inquiry constraints | `inquiry_appointments` | internal/external identity is unambiguous; recusal requires reason |

## Resolver-Type Coverage (>= 1 black-box case per resolver type)

Every `resolver_type` in `docs/spec/hrms-authority-model.yaml` has at least one test. Each case is black-box
against the resolver contract (`docs/spec/authority-resolution-contract.yaml`) and traced to a PH-02C fixture.

| resolver_type | Test case | PH-02C fixture |
|---|---|---|
| REPORTING_CHAIN | Reporting-chain L1 / L2 / skip-level; vacant-manager fallback | `reporting_chain`, `hard_resolver_cases.vacant_manager` |
| ORG_UNIT_HEAD | Org-unit-head fallback resolution | `statutory_authority` row `G03_LEAVE_HEAD_ASSESSMENT` |
| STATUTORY_AUTHORITY | Transfer authority + point-in-time (as-of) resolution | `statutory_authority` row `G05_TRANSFER_REVENUE` |
| DELEGATION | Delegation / acting-charge precedence and expiry | `delegation` row `d1000000-...-000000000001` |
| COMMITTEE | DPC quorum + recusal | `committees` `PH02-DPC-REVENUE` |
| NAMED_ROLE | RBAC role holder resolved under scope + SoD | `statutory_authority` (role-scoped assignee `...9901`) |
| NAMED_INDIVIDUAL | Explicit configured inquiry/appellate signatory | `committees` external member config |
| WORK_QUEUE | Queue identity resolution, claim under SoD | G05 `WORK_QUEUE` binding (`state_machine_trigger_map.G05`) |
| SR_CUSTODIAN | SR custodian via STATUTORY_AUTHORITY (authority_type=SR_CUSTODIAN) | `statutory_authority` row `G12_SR_CUSTODIAN_ENTITY` |
| APPELLATE_AUTHORITY | Appellate authority must differ from deciding authority | `statutory_authority` `G06_APPOINTING_GROUP_B` (statutory competence) |
| CROSS_ENTITY (STATUTORY) | Cross-entity resolution under Org-Admin widened scope, tenant isolation | `hard_resolver_cases.cross_entity_authority` |

## Point-in-Time (As-Of Date) Resolution

Resolver type: **STATUTORY_AUTHORITY** (with DELEGATION precedence) — resolution is bound to the transaction's
effective / as-of date using effective-dated authority assignments. A later assignment MUST NOT change a past
resolution (effective-dated lookup determinism + immutable snapshot replay).

Fixtures: `statutory_authority` row `G05_TRANSFER_REVENUE` (base authority holder `...9901`) and
`delegation` row `d1000000-0000-0000-0000-000000000001` (`ACTING_CHARGE`, from `...9901` to `...9902`,
valid window `2026-07-01/2026-07-31`).

| # | As-of date | Steps | Expected result |
|---|---|---|---|
| POINT-IN-TIME-1 | `2026-06-30` (before delegation window) | Resolve G05 TRANSFER_AUTHORITY for the fixture org unit as of `2026-06-30`. | Resolves base statutory holder `...9901` via STATUTORY_AUTHORITY. No active delegation row for this as-of, so DELEGATION precedence does not apply. `fallback_applied=false`. |
| POINT-IN-TIME-2 | `2026-07-15` (inside delegation window) | Resolve the same authority as of `2026-07-15`. | DELEGATION precedence applies: acting-charge delegate `...9902` is the effective holder for this as-of. Snapshot records `resolver_type=STATUTORY_AUTHORITY`, delegation applied, evidence `as_of=2026-07-15`. |
| POINT-IN-TIME-3 | `2026-08-01` (after delegation window) | Resolve the same authority as of `2026-08-01`. | Delegation expired (`P01_DELEGATION_EXPIRED` if requested inside the window that has lapsed); base statutory holder `...9901` resolves again. Deterministic effective-dated lookup, no drift. |
| POINT-IN-TIME-4 (no-retroactive-drift) | Replay of POINT-IN-TIME-1 after a NEW delegation is inserted with `effective_from=2026-06-01` | Insert a later-created delegation row that back-dates coverage, then replay the `2026-06-30` decision from `workflow_resolution_snapshots`. | The original `2026-06-30` resolution is replayed from the immutable snapshot and STILL resolves `...9901`. A later/back-dated assignment does not rewrite the recorded past resolution. Resolution as of any date is read from the effective-dated window active at that date, never today's rows. |

Expected error/branching maps to `docs/spec/authority-resolution-contract.yaml` error taxonomy
(`P01_DELEGATION_EXPIRED`) and `snapshot_rule.replay` in `docs/spec/hrms-authority-model.yaml`.

## No-Overlap Effective-Dated Authority Invariant (data test)

Resolver type: **STATUTORY_AUTHORITY** — resolution must be unambiguous. This is a data-integrity invariant on
the fixture substrate, not a resolver call.

Fixtures: `g01_authority_assignments` rows (`statutory_authority`: `G05_TRANSFER_REVENUE`,
`G03_LEAVE_HEAD_ASSESSMENT`, `G06_APPOINTING_GROUP_B`, `G12_SR_CUSTODIAN_ENTITY`) and `g01_authority_delegations`.

Invariant: for any `(tenant_id, scope, authority_type)` there MUST NOT exist two effective-dated authority
assignments whose `[effective_from, effective_to)` windows overlap. If two active rows share the same priority
for an as-of date with no deterministic tie-break, the resolver fails closed with `P01_RESOLVER_AMBIGUOUS`
(BLOCKED) rather than guessing.

| # | Steps | Expected result |
|---|---|---|
| NO-OVERLAP-1 | For each `(tenant_id, scope_type, scope_ref, authority_type)` group in `g01_authority_assignments`, pairwise-check effective-dated windows. | Zero overlapping windows. `G05_TRANSFER_REVENUE` has exactly one active priority-10 row for the fixture org unit (per `data_quality_assertions`). |
| NO-OVERLAP-2 | Assert active delegation windows in `g01_authority_delegations` do not overlap another active delegation for the same `(authority_code, tenant, scope)`, and that `from_employee_id != to_employee_id`. | Non-overlapping; delegate `...9902` != source `...9901`. Any overlap would make DELEGATION precedence ambiguous. |
| NO-OVERLAP-3 (negative) | Inject two overlapping active rows for the same `(tenant, ORG_UNIT scope, TRANSFER_AUTHORITY)` at equal priority and resolve as of a date inside both windows. | Resolver returns `P01_RESOLVER_AMBIGUOUS` (BLOCKED). No candidate is selected; ambiguity is never silently resolved. |

## Future Implementation Tests

When the live resolver service is implemented, add contract tests for:

- ambiguous statutory authority rows fail with `P01_RESOLVER_AMBIGUOUS`;
- no active authority row fails with `P01_RESOLVER_NOT_RESOLVED`;
- expired delegation fails with `P01_DELEGATION_EXPIRED`;
- self-approval fails with `P01_RESOLVER_SOD_BLOCKED`;
- historical approval replay reads `workflow_resolution_snapshots` and does not re-evaluate current hierarchy.
