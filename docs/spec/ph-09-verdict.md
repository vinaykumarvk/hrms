# PH-09 Verdict — Payroll and Pension Wave (updated at PH-09E)

## Gate decision

PH-09E's oracle (`bash docs/spec/pipeline/checks/ph-09e.sh`) going GREEN is **necessary, not
sufficient**: this is a HUMAN gate. A human reviewer must inspect the UI evidence below before
PH-09 is treated as complete. This verdict makes no 100% claim — the majority of G10/G11 BRD
line items remain NOT_FOUND (see the accounting below).

## Baseline

The delta below is measured against **`docs/reviews/brd-coverage-audit-20260702.md`**, which
found at audit time:

| BRD | Items | CONFIRMED | PARTIAL | NOT_FOUND | Audit finding on UI |
|---|---:|---:|---:|---:|---|
| G10 Payroll | 111 | 8 | 6 | 97 | every user-facing FR UI-MISSING (metric card + `evidence-line` stub only) |
| G11 Retirement/Pension | 118 | 9 | 6 | 103 | every user-facing FR UI-MISSING (metric card + `evidence-line` stub only) |

No line-item re-audit has been run since; the "moved" rows below are named, file-evidenced
deliveries from PH-09A–PH-09E, not a recount. Anything not named as moved should be presumed
still open.

## G10 Payroll — delta

### Moved since the audit (NOT_FOUND / UI-MISSING → implemented and tested)

| Area (BRD anchor) | Delivered by | Evidence |
|---|---|---|
| E05/E06/E07 pay_components, pay_rules (whitelist DSL, `ERR-G10-RULE-EXPR`), rate_tables with effective-dated fail-closed resolution and state-dimensioned PT (`ERR-G10-PT-STATE`) | PH-09A | `apps/api/src/modules/g10/payRuleRepository.ts`, `apps/api/test/ph09a-rule-substrate.test.cjs` |
| Engine compute on a frozen snapshot: E12 payslips + E13 append-only payslip_lines, G03 LWP proration, determinism (byte-identical recompute), run immutability (`ERR-G10-RUN-IMMUTABLE`), single in-flight FINAL run (`ERR-G10-RUN-INFLIGHT`), arrears month-wise breakup, net-pay floor with deduction_carryforwards (`ERR-G10-RECOVERY-NET`), reopen/supersession with YTD self-heal (VAL-G10-YTD-DERIVE) | PH-09B | `apps/api/src/modules/g10/payrollEngineService.ts`, `apps/api/test/ph09b-payroll-engine.test.cjs` |
| Disbursement ledger tie-out (`ERR-G10-RECON-TIEOUT`), G09 penalty recovery bounded by net-pay floor + CPC s.60 cap, FNF settlement consolidation with SoD, PAY_FIXATION/ANNUAL_INCREMENT posting via the G12 ingest contract | PH-09D | `apps/api/src/modules/g10/compensationIntegrationService.ts`, `apps/api/test/ph09d-compensation-integration.test.cjs` |
| **UI (this sub-phase):** run console driving the full lifecycle create → lock-inputs → compute → reconcile → approve → lock → disburse against the real g10 routes, with only the status-valid action enabled and API rejections (PAYROLL_SOD, preconditions) surfaced as visible error states; payslip view rendering the computed run's component lines (BASIC/DA/HRA/NPS/PT trace) with PAN masked per P02 via profile-360 and the bank account rendered fail-closed masked; canonical empty/loading/error/no-permission states; the `evidence-line` stub cards removed | PH-09E | `apps/web/src/modules/g10/PayrollRunConsole.tsx`, `apps/web/src/modules/g10/PayslipView.tsx`, `apps/web/src/modules/g10/PayrollWorkspace.tsx`, `apps/web/src/api/hrmsClient.ts`, `apps/web/src/api/fixtureHrmsClient.ts`, `apps/web/test/ph09e-compensation-ui.test.cjs` |

### Still open — remaining NOT_FOUND (named, with owners)

| Gap (still NOT_FOUND) | Owner |
|---|---|
| Income tax / TDS engine: old-vs-new regime comparison, monthly TDS projection, investment declarations, perquisite valuation | G10 follow-on wave (statutory tax design decision required) |
| Form-16 / Form-24Q and statutory return generation | G10 follow-on wave |
| Bank payment file generation with digital signing / DSC and bank acknowledgement ingestion — today only the `X3_BANK_SANDBOX` marker batch exists; no signed file, no DSC, no ack round-trip | G10 follow-on wave + X.3 integration owner |
| GL / accounting posting of payroll results | G10 follow-on wave |
| Payslip publication to employee self-service (E12/E13 have **no HTTP read route**; the PH-09E payslip view renders the run compute response lines, not the persisted E12/E13 ledger), payslip PDF + digital signature | G10 follow-on wave |
| Pay revisions / re-fixation and supplementary runs beyond the PH-09B arrears slice (pay-commission revision, G06 promotion re-fixation feeds) | G10 follow-on wave (with G06 feed) |
| Loans & advances full lifecycle (sanction, schedule, closure) — only carryforward/FNF consumption exists | G10 follow-on wave |
| Scheduled jobs (JOB-G10-*), statutory notifications (X.2), persistent storage (in-memory repositories remain) | G10 follow-on wave / platform hardening |

## G11 Retirement and Pension — delta

### Moved since the audit (NOT_FOUND / UI-MISSING → implemented and tested)

| Area (BRD anchor) | Delivered by | Evidence |
|---|---|---|
| E30–E36 effective-dated rule tables (DA relief, commutation factors, family-pension rates, gratuity ceilings, retirement ages, pension limits, rounding) with as-of resolution that fails closed off-window | PH-09A | `apps/api/src/modules/g11/pensionRuleRepository.ts`, `apps/api/test/ph09a-rule-substrate.test.cjs` |
| Scheme-BRANCHED benefit compute (OPS flat 50% clamped / UPS assured payout with opt-in + min guarantee / NPS indicative vs death/invalidation defaults / SERVICE_GRATUITY_ONLY below threshold, `ERR-G11-SCHEME-MISMATCH` on cross-scheme), commutation by age-next-birthday, gratuity with E33 ceiling clamp, family pension incl. ENHANCED window, Rule-9 provisional pension with DCRG withheld | PH-09C | `apps/api/src/modules/g11/pensionBenefitRepository.ts`, `apps/api/src/routes/g11.routes.ts` |
| Pre-credit account verification gate (E42): disbursement without an ACTIVE PASSED verification fails closed with `ERR-G11-ACCOUNT-VERIFY` | PH-09D | `apps/api/src/modules/g11/pensionDisbursementService.ts`, `apps/api/test/ph09d-compensation-integration.test.cjs` |
| **UI (this sub-phase):** pension case console (case intake with OPS/NPS/UPS scheme, SR_VERIFICATION_GATE service-verification form, case list with status) and a benefit-estimator form that posts to the scheme-branched `:compute` endpoint and renders the server-returned figures (outcome, amount, rule version, formula) — the browser validates inputs but computes no statutory figure; canonical empty/loading/error/no-permission states; the `evidence-line` stub card removed | PH-09E | `apps/web/src/modules/g11/PensionCaseConsole.tsx`, `apps/web/src/modules/g11/PensionWorkspace.tsx`, `apps/web/src/api/hrmsClient.ts`, `apps/web/src/api/fixtureHrmsClient.ts`, `apps/web/test/ph09e-compensation-ui.test.cjs` |

### Still open — remaining NOT_FOUND (named, with owners)

| Gap (still NOT_FOUND) | Owner |
|---|---|
| Pensioner lifecycle after PPO: life certificates (Jeevan Pramaan) capture/expiry stop-payment, periodic DA-relief revision runs to active pensioners, family-pension transfer on pensioner death, PPO amendment/supersession beyond first issue | G11 follow-on wave |
| Pension disbursement execution to pensioner accounts (PDA/bank), signed payment files and acknowledgement ingestion — only the E42 verification gate exists | G11 follow-on wave + X.3 integration owner |
| Commutation restoration schedule (15-year restoration), GPF final payment integration | G11 follow-on wave |
| Pension revisions on pay-commission change (re-fixation of past PPOs) | G11 follow-on wave |
| UI for commutation / gratuity / family pension / Rule-9 provisional pension (the PH-09C endpoints have no web surface; PH-09E shipped the case console + estimator only) | G11 follow-on UI slice |
| Scheduled jobs (JOB-G11-*), statutory notifications, persistent storage | G11 follow-on wave / platform hardening |

## Masking evidence (P02, fail-closed)

- PAN reaches the payslip view only through `GET /api/v1/employees/{id}/profile-360`, which
  masks per the actor's P02 fieldGrants server-side; the view renders `[HIDDEN]` whenever no
  masked value is present (`maskFailClosed`), and the raw value never reaches the DOM.
- The salary bank account number is not exposed by any web-facing route; the payslip view
  renders it fail-closed masked and the web test asserts both masked identity fields render
  exactly `[HIDDEN]` and that no raw-PAN pattern appears in the markup
  (`apps/web/test/ph09e-compensation-ui.test.cjs`, negative assertions).

## Test evidence

- API: `npm run typecheck` + `npm test` — 252 tests, 251 pass, 1 skipped (pre-existing skip).
- Web: `npm run web:typecheck` + `npm run web:test` — 114 tests, 114 pass, including the
  PH-09E lifecycle, scheme-branch estimator round-trip, and masked-PAN negative assertions.
- Oracle: `bash docs/spec/pipeline/checks/ph-09e.sh` GREEN.

## Statement for the human reviewer

The check going GREEN is necessary but **not sufficient**. G10 and G11 now have a real,
route-wired compensation UI and a substantially deeper engine than at the audit baseline, but
the remaining-gap tables above are still the larger share of the two BRDs: tax/TDS, Form-16/24Q,
signed bank files/DSC, payslip publication from E12/E13, revisions, pensioner lifecycle and life
certificates, and pension disbursement execution are all still open with named owners. Review the
UI surfaces and this delta before accepting PH-09.
