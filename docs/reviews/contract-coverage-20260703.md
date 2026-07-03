# Contract-Coverage Baseline — 2026-07-03 (PH-37A)

**Tool:** `tools/contract-coverage.mjs` (run `node tools/contract-coverage.mjs`).
**Gate:** `docs/spec/pipeline/checks/ph-37a.sh` (recomputes independently; ratchet floor below).

This report replaces the hand-waved "implemented routes cover only a fraction of the **~1,306** OpenAPI
operations" caveat carried by every tranche verdict with a **measured, per-module metric**. The contract
enumerates **1,323** operations across `docs/contracts/openapi/*.yaml` (the ~1,306 figure quoted in prior
verdicts was an earlier approximate count; the tool's exact count is 1,323). Implemented kernel routes are
attributed to a module by `operationId` prefix.

## Coverage (count-based, per module)

| Module | Contract ops | Implemented routes | Coverage |
|---|---:|---:|---:|
| G01 | 165 | 50 | 30.3% |
| G02 | 65 | 31 | 47.7% |
| G03 | 92 | 44 | 47.8% |
| G04 | 45 | 21 | 46.7% |
| G05 | 75 | 57 | 76% |
| G06 | 86 | 31 | 36% |
| G07 | 111 | 37 | 33.3% |
| G08 | 133 | 40 | 30.1% |
| G09 | 89 | 34 | 38.2% |
| G10 | 87 | 30 | 34.5% |
| G11 | 90 | 33 | 36.7% |
| G12 | 65 | 35 | 53.8% |
| G13 | 114 | 36 | 31.6% |
| G14 | 90 | 26 | 28.9% |
| P01 | 16 | 14 | 87.5% |
| **Total** | **1323** | **519** | **39.2%** |

## Ratchet floor

The gate `ph-37a.sh` enforces **total coverage ≥ 39.2%** and **implemented routes ≥ 519**. Coverage can only
be raised by adding real, tested routes; deleting routes (dropping below the floor) fails the gate. When a
future tranche raises coverage, refresh this report and the floor together.

**Ratchet history:** 392 / 29.6% (PH-37A baseline) → 397 / 30% (PH-38A: APAR calibration lifecycle) →
404 / 30.5% (PH-39A: APAR PIP lifecycle + probation-confirmation + reads) → 411 / 31.1% (PH-40A:
continuous-feedback + 360-feedback + signature reads) → 421 / 31.8% (PH-41A: FR-G07-020 training-
sponsorship + service-bond lifecycle) → 430 / 32.5% (PH-42A: FR-G07-018 external-credential lifecycle +
vendor-empanelment decisions) → **436 / 33%** (PH-43A: G14 analytics-engine reads + KPI target-setting +
predictive-score reads) → **443 / 33.5%** (PH-44A: G13 checkout-lock lifecycle + rescan + access-audit/
scan-result/module-ref reads) → **451 / 34.1%** (PH-45A: G01 Aadhaar reveal 4-eyes lifecycle + employee
legal-hold/blocking-obligation + service-no lookup) → **456 / 34.5%** (PH-46A: FR-G10-08 loan lifecycle
(instalment recovery + foreclosure) + Rule-3 concessional perquisite valuation + reads) → **462 / 34.9%**
(PH-47A: G11 PDA go-live lifecycle + grievance close + pensioner bank-account verification) → **469 / 35.4%**
(PH-48A: G12 SR-ledger chain reads + RFC-3161 timestamp/offline-bundle verification) → **475 / 35.9%**
(PH-49A: G02 step-up MFA lifecycle + change-request template management) → **482 / 36.4%** (PH-50A: G03
leave year-close simulate + encashment + mass-leave + punch-review/exception reads) → **489 / 37%** (PH-51A:
G04 X.3 outbound-integration connector lifecycle + leave→SR relay enqueue/dead-letter reads) → **495 / 37.4%**
(PH-52A: G06 FR-015 sanctioned-posts establishment lifecycle (register/revise/reconcile + reads + vacancy)) →
**504 / 38.1%** (PH-53A: G09 suspension review + show-cause response + consultation close/waive + hearing
minutes + case reads) → **513 / 38.8%** (PH-54A: G05 transfer/counselling reads — vacancy positions,
reservations, preferences, mutual orders, charge-handovers, relieving/joining reports) → **519 / 39.2%**
(PH-55A: G01 governed write-ports (identity change / transfer posting / probation confirmation) + live-record
/count reads — 6 real, service-tested operations wired to the kernel).

## Honest limitation (what this metric is NOT)

This is **count-based** coverage per module — it compares the *number* of implemented routes to the *number*
of contract operations. It does **not** yet perform per-operation path matching (OpenAPI `{employeeId}` vs
kernel `{id}`), so it does not identify *which specific* operations are missing, and a module could in
principle implement routes outside its contracted set. Per-operation path reconciliation is the natural
follow-on (would let the gate assert that each of the ~392 implemented routes maps to a contracted op and
enumerate the exact backlog). The 29.6% figure is therefore a coverage *ceiling estimate*, honest and
tracked, not a per-path conformance proof.
