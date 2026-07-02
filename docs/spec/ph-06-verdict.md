# PH-06 Verdict — Vertical-Slice Scale-Up Review Packet

**Date:** 2026-07-02 · **Branch:** `ph02-rerun` · **Baseline:** `docs/reviews/brd-coverage-audit-20260702.md`
**Status:** machine evidence GREEN (PH-06A–D oracles + all four suites); PH-06E is the human scale-up gate.

This verdict measures what PH-06A–D actually moved against the 2026-07-02 line-item coverage audit
(brd-coverage-audit-20260702). It does **not** claim BRD completeness — the remaining NOT_FOUND
accounting is below and stays visible.

---

## 1. What PH-06A–D delivered

| Sub-phase | Delivered | Oracle |
|---|---|---|
| PH-06A | Postgres persistence substrate: `pg` pool (`apps/api/src/db/pool.ts`), migration runner (`apps/api/src/db/migrate.ts`), DDL migrations `apps/api/db/migrations/0001_platform_core.sql` (50 platform tables), `0002_g03_leave.sql` (6 tables), `0003_g05_transfer.sql` (8 tables) — the oracle asserts the 8 owned G03/G05 tables (leave_types, leave_accrual_policies, leave_ledger_entries, leave_reservations, transfer_requests, transfer_orders, clearance_checklists, clearance_items) all have DDL. Repository layer: `apps/api/src/modules/g03/leaveRepository.ts` (Pg + InMemory impls of one interface), `apps/api/src/modules/g05/transferRepository.ts`. Services consume only the repository interface; the audit's bare in-memory arrays for applications/ledger/balances/orders are gone. Integration test runs against a **real throwaway Postgres** (initdb/pg_ctl), pass=5 skipped=0. | ph-06a GREEN |
| PH-06B | G03 leave backend to BRD depth: named error codes (INSUFFICIENT_BALANCE, LEAVE_OVERLAP, ELIGIBILITY_FAILED, ENTITLEMENT_EXCEEDED, OPTIMISTIC_LOCK_CONFLICT), FR-10 leave-type/accrual-policy config entities, FR-02 holiday calendar consumed in day counting, FR-13 withdraw + partial cancel with CANCELLATION_CREDIT and corrected G04 relay. | ph-06b GREEN |
| PH-06C | G05 transfer backend to BRD depth: gapless reserve-then-commit numbering via `order_number_sequences`, relieving order with statutory `last_working_day`, joining report applying the G01 posting update, frozen-catalog SR codes (TRANSFER/RELIEVING/JOINING — non-catalog TRANSFER_JOINED etc. removed), cancel via the SR **reversal envelope** (never a forward pseudo-event), per-office configurable clearance departments (hardcoded list removed). | ph-06c GREEN |
| PH-06D | Real (non-skeleton) G03/G05 UI: controlled leave-apply form, approver inbox with wired Approve/Reject, transfer initiate form, orders list — all through the shared API client with canonical loading/empty/error states. | ph-06d GREEN |

## 2. Verification pass (all captured 2026-07-02, this branch)

- `npm run typecheck` — green; `npm test` — **147 tests, 146 pass, 0 fail** (1 = the pg integration
  test, which auto-skips without DATABASE_URL; the ph-06a oracle re-runs it against a throwaway
  initdb/pg_ctl cluster where it reports pass=5 skipped=0).
- `npm run web:typecheck` — green; `npm run web:test` — **67 tests, 67 pass, 0 fail**.
- `bash docs/spec/pipeline/checks/ph-06a.sh` → `== GREEN — PH-06A met ==`
- `bash docs/spec/pipeline/checks/ph-06b.sh` → `== GREEN — PH-06B met ==`
- `bash docs/spec/pipeline/checks/ph-06c.sh` → `== GREEN — PH-06C met ==`
- `bash docs/spec/pipeline/checks/ph-06d.sh` → `== GREEN — PH-06D met ==`
- ph-06e re-greps: all 14 previously-NOT_FOUND items now hit; all 3 fail-closed regression negatives
  clean (no `orders.length + 1`, no generic CONFLICT for balance, no non-catalog SR codes).

Re-verification depth: every item on the ph-06e re-grep list was independently confirmed with
`file:line` (Section 3); beyond that list I re-checked repository SQL table coverage, default runtime
wiring (Section 5), and the audit's three named regressions. I did **not** re-audit the full 118-item
G03 / 34-item G05 BRD line lists — the remaining-gap numbers in Section 4 therefore reuse the audit's
own grain and are marked as estimates where they are estimates.

## 3. Coverage delta vs brd-coverage-audit-20260702

Baseline (audit, line-item grain): **G03 = 9/118 CONFIRMED, 12 PARTIAL, 97 NOT_FOUND**;
**G05 = 9/34 CONFIRMED, 6 PARTIAL, 19 NOT_FOUND** (G05 audited at coarser FR/capability grain).

| Module | Audit CONFIRMED | Audit NOT_FOUND | Closed in PH-06 (evidence: file:line + test) | Remaining NOT_FOUND |
|---|---|---|---|---|
| G03 | 9/118 | 97 | FR-02 holidays: `apps/api/src/modules/g03/leaveService.ts:661` (addHoliday), `:141` (all-holiday spell rejected) — test `ph06b-g03-leave-brd-depth.test.cjs:190`. FR-10 config: leaveService.ts:14-28 (leave_types/leave_accrual_policies projections) — test `:32`. FR-13 withdraw: leaveService.ts:358 — test `:114`; partial cancel w/ CANCELLATION_CREDIT: leaveService.ts:398-433 — test `:149`. Named errors: INSUFFICIENT_BALANCE :146, ENTITLEMENT_EXCEEDED :152, ELIGIBILITY_FAILED :734, LEAVE_OVERLAP :753, OPTIMISTIC_LOCK_CONFLICT :779 — tests `:51`,`:64`,`:84`,`:100`. Persistence: `apps/api/src/modules/g03/leaveRepository.ts:1` (pg), 6 tables in `apps/api/db/migrations/0002_g03_leave.sql` — test `ph06-persistence.test.cjs:81,:118`. UI: `apps/web/src/modules/g03/LeaveApplyForm.tsx:132` (real onSubmit form), `LeaveApproverInbox.tsx:99-102` (Approve/Reject) — tests `ph06d-demo-ui.test.cjs:14,:31,:61`. | **~85 of 118 line items still NOT_FOUND** (estimate at audit grain). Whole FRs untouched: FR-01 shift/roster, FR-03/04 punch ingestion + daily processing (still simplified/PARTIAL), FR-07/08 WFH/OD, FR-09 comp-off, FR-14 backdate/team-calendar, FR-15 year-close, FR-16 encashment, FR-17 payroll feed (signals only), FR-21 DPDP consent, FR-22 counters, FR-23 forecast/mass-leave/blackout. |
| G05 | 9/34 | 19 | Gapless numbering: `apps/api/src/modules/g05/transferService.ts:206-220` (reserveOrderNumber, reserve-then-commit, commit :262) — test `ph06c-g05-transfer-brd-depth.test.cjs:49`. Frozen SR codes: :318 TRANSFER, :448 RELIEVING, :508 JOINING — test `:66`. Relieving order + last_working_day: :421-464. Posting update on join (FR-G05-010): :524-548 via employeeMaster.applyTransferPosting — test `:66`. Cancel via SR reversal envelope (reversalOfEventId): :675, :703 — test `:118`. Configurable clearance departments: :164-166 config API, :285-286 per-office consumption — test `:151`. Persistence: `apps/api/src/modules/g05/transferRepository.ts:1` (pg), 8 tables in `apps/api/db/migrations/0003_g05_transfer.sql` — test `ph06-persistence.test.cjs:186,:246`. UI: `apps/web/src/modules/g05/TransferInitiateForm.tsx:105`, `TransferOrdersList.tsx:7-9` (loading/error/empty) — tests `ph06d-demo-ui.test.cjs:38,:61,:164`. | **~13 of 34 items still NOT_FOUND** (estimate at the audit's FR/capability grain). Untouched: counselling/representation workflow depth, transfer drives (table exists in DDL, no runtime), deputation records + tenure caps, government quarters/estate clearance, charge handovers incl. UNDER_PROTEST, joining-time/transit entitlement by distance band, order acknowledgement / deemed-served gate, late-joining review. |

Method note: the audit counted G03 at AC/BR line-item grain (118) but published its detail table at FR
grain; PH-06 closures are therefore cited per closed capability with exact `file:line`, and the new
NOT_FOUND totals are **bounded estimates** (~85/118 G03, ~13/34 G05), not re-audited counts. What is
not an estimate: every row in the "Closed" column above exists in code and is exercised by the named
green test, and every re-grep + negative in the ph-06e oracle passes.

## 4. Remaining gaps — explicit accounting (do NOT read this verdict as BRD-complete)

- **G03 → PH-07D:** FR-01 shift/roster, FR-03 punch ingestion, FR-04 daily attendance processing,
  FR-15 leave-year close, FR-16 encashment, FR-17 real payroll feed with period locks (today:
  in-memory READY_FOR_G10 signals only, `apps/api/src/modules/g03/leaveService.ts:117-118` — the
  attendance and payrollSignals arrays are still in-memory by design; they are PH-07D scope).
- **G05 → PH-08B:** counselling/representation depth, transfer drives runtime, deputation records +
  tenure caps + repatriation, quarters/estate clearance, charge handovers (UNDER_PROTEST/dispute),
  joining-time by distance band, order acknowledgement/deemed-served gate, late-joining review
  (all named in `docs/spec/pipeline/prompts/PH-08B.md`).
- **Cross-cutting (unchanged from the audit):** module ERR-Gxx-* taxonomy only partially emitted,
  JOB-Gxx-* scheduled jobs unregistered, statutory notification templates largely unimplemented,
  and the other 12 modules (G01/G02/G04/G06–G14) are untouched by PH-06 — their ~1,050 NOT_FOUND
  items remain for the PH-07…PH-14 waves.

## 5. Persistence substrate outcome

- **In Postgres (DDL + Pg repository + integration-tested):** G03 leave_types, leave_accrual_policies,
  leave_applications, leave_balances, leave_reservations, leave_ledger_entries; G05 transfer_requests,
  transfer_orders, order_number_sequences, clearance_checklists, clearance_items, relieving_orders,
  joining_reports. Parameterised queries only (oracle-enforced negative).
- **Still in memory:** the default server wiring (`apps/api/src/platform/foundationServices.ts:62-67`)
  injects `InMemoryLeaveRepository`/`InMemoryTransferRepository`; `PgLeaveRepository`/`PgTransferRepository`
  are proven by `apps/api/test/ph06-persistence.test.cjs` against a real throwaway cluster but are not
  yet the default runtime path (a DATABASE_URL-driven switch is follow-on work). G03 attendance records
  and payroll signals remain in-memory arrays (PH-07D scope). All non-G03/G05 modules remain in-memory.

## 6. Scale-up recommendation (for the human gate)

**Recommend: APPROVE scale-up of the PH-06 wave pattern to the remaining modules — with three riders.**

The pattern (per wave: Postgres substrate → backend to BRD depth with named errors/config entities →
real UI → external fail-closed oracle with regression negatives → honest delta verdict) demonstrably
moved real coverage in both pilot modules and caught/killed all three audit regressions. Risks the
reviewer should weigh:

1. **In-memory default wiring** — until foundationServices switches on DATABASE_URL, "Postgres-backed"
   is proven-in-test, not running-in-dev. Make the wiring switch an early PH-07 exit criterion.
2. **Estimate drift** — remaining-gap totals here are grain-consistent estimates, not a fresh 118-item
   re-audit. Schedule a `brd-coverage` re-audit after PH-07/PH-08 so the trend line is measured, not
   extrapolated.
3. **Statutory-core sequencing** — the audit's biggest risks (G10 payroll maths, G11 pension schemes,
   G09 natural justice, G12 evidentiary chain) are still fully open; the wave order should keep
   prioritising them over convenience modules.

If these riders are acceptable, park PH-06E as approved and release PH-07A.
