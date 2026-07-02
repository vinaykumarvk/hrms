# BRD Coverage Delta — 2026-07-03 (post PH-04→PH-10 gated rebuild)

Baseline: `docs/reviews/brd-coverage-audit-20260702.md` (~1,400 line items; ~9% CONFIRMED,
~84% NOT_FOUND; thin vertical slices, in-memory stores, metric-card UI, rubber-stamp oracles).

Method: the seven waves were rebuilt through the re-baselined pipeline (`docs/spec/pipeline/
REBASELINE.md`) — one fresh agent per sub-phase, every oracle run EXTERNALLY by the driver,
each wave verdict content-checked by its oracle to cite the audit and name remaining gaps.
This delta is compiled from those oracle-enforced verdicts (ph-04..ph-10-verdict.md) plus
hard tree metrics; it is a capability-level delta, not a fresh line-item recount.

## Hard metrics (2026-07-02 → 2026-07-03)

| Metric | Audit baseline | Now |
|---|---|---|
| API tests | 125 (slice-scoped) | **279 pass** (behavioral + negative) |
| Web tests | 32 (marker-scoped) | **121 pass** (submit-path + suppression negatives) |
| Persistence | in-memory arrays; SQL DDL unconsumed | **21 migrations, 19 repositories (in-memory + Postgres impls), verified on a live throwaway cluster** |
| Domain error codes as thrown `code:` values | ~0 (generic + marker strings) | **71 registered wire codes** |
| UI | read-only metric cards, 0 API calls | **14/14 modules canonical states; live client; forms/consoles for all waves** |
| Oracles | marker-grep rubber stamps | **35 behavioral fail-closed checks, all externally verified GREEN** |

## What each wave closed (oracle-verified)

- **PH-04 API**: kernel idempotency replay, G01 create/changes-feed/governed decisions, workflow
  task routes, G12 real cursor paging + reversal envelope, G13 fetch-intent + DI-14. Honest
  contract coverage disclosed: 3.6% of the 1,306 OpenAPI ops (drift 0).
- **PH-05 UI**: real fetch client + session/guards (no wildcard grants), workflow action forms
  with mandatory comments, API-wired record views with masked PII, 14/14 state coverage.
- **PH-06**: Postgres substrate (G03/G05); G03 domain codes/config/withdraw/partial-cancel/
  holidays; G05 gapless numbering, frozen SR catalog codes, reversal-cancel, posting update,
  configurable clearances; real G03/G05 forms.
- **PH-07**: G01 satellites + attribute-history + transactional outbox feed; G04 statutory relay
  (lineage+sequence UNIQUE, HMAC signatures, backoff, DLQ, ledger-vs-SR reconciliation); G02
  sensitivity catalog + SoD + RETURNED/resubmit/withdraw + masked diff; G03 attendance derivation
  + locked payroll feed; employee-wave UI.
- **PH-08**: sanctioned-posts + QSL kernels; G05 administration (handover/deputation/served-on/
  quarters); G06 eligibility/rosters/refusal-debarment/probation/sub-judice + real domain codes;
  G07 taxonomy→Gap Contract + lapsed_mandatory; G08 cycles/weightage/representation/multi-RO;
  G09 full natural-justice chain incl. Art. 311 guard + hash-chained timeline; statutory UI.
- **PH-09**: deterministic payroll engine (DSL order, feed-driven proration, arrears breakup,
  YTD derivation, lock immutability, in-flight guard, carryforwards — integer paise, float ban);
  pension scheme branching OPS/NPS/UPS/service-gratuity + commutation factors + family pension +
  gratuity ceilings + Rule 9; disbursement tie-out + SoD + CPC s.60 recovery caps + FnF + SR
  provenance via G12 ingest only + pre-credit verify; money-wave UI with masked payslips.
- **PH-10**: real SHA-256 (known-vector probed) + status sub-ledger + append-only versions +
  checkout locks; G12 verify/tamper-detect + Merkle anchors + gap register + attestations +
  redacted certified extracts; G13 byte-hash verify + scan gate + clearances deny-by-default +
  access audit + disposition SoD; G14 KPI versioning + DDL-backed marts + k-anonymity suppression
  + scope-policy maker-checker + bitemporal as-of-knowledge; live suppression-respecting dashboard.

## Remaining NOT_FOUND (named in the wave verdicts; owners recorded there)

Statutory/feature depth still open, by module: G01 (Aadhaar vault, dedup/merge, privacy/DPDP
console, bulk import, lifecycle separate/reactivate); G02 (bulk corrections, e-sign, fraud/
velocity, grievance, retro-impact fan-out, step-up auth); G03 (shifts/rosters, punch ingestion,
comp-off, year-close, encashment); G04 (mapping catalog, partition leases/reaper, conformance
gate, pre-pension certificate); G05 (counselling, drives, vacancy lifecycle, mutual transfer);
G06 (rota-quota multi-stream, sealed cover full, correction cascade, career paths); G07 (LMS/xAPI,
credentials, sponsorship/bonds, DPDP retention); G08 (calibration, 360, PIP, DSC signing, probation
confirmation); G09 (POSH/ICC, personal hearings, SLA pause, vigilance register, evidence vault
listing); G10 (TDS/tax engine, Form-16/24Q, bank file DSC/positive-pay, loans, perquisites, GL);
G11 (pensioner master/life certificates, revisions/DA relief runs, treasury/PDA, grievances,
DigiLocker); G12 (§65B certificates, LTV renewal, subscriptions/feed, offline QR, real TSA);
G13 (KMS envelope encryption, OCR/search, e-sign PAdES-LTV, watermark/certified copies, DPDP DSR,
sharing, real AV engine); G14 (NLQ, embedded BI, predictive+fairness, mobile briefing, report
builder). Plus: contract-op coverage is 3.6% — most of the 1,306 OpenAPI operations remain
unimplemented route surface.

## Pipeline position

48/68 phases done (externally verified). **Eight human gates are GREEN-verified and PARKED
awaiting approval tokens** (PH-03C, PH-04D, PH-05E, PH-06E, PH-07E, PH-08F, PH-09E, PH-10E) —
per the re-baseline rules only a human creates `approvals/<id>.approved`. PH-11..PH-14
(UAT/release governance) are sequenced behind them and are human-required by gate_policy.

## Verdict

The build has moved from "demo slices with self-certified green" to a **verified, persisted,
statutory-core foundation with honest oracles** — but it is **not BRD-complete**: the line-item
mission ("zero gaps across ~1,400 items") still has the feature-depth backlog above. Closing it
means further gated tranches (a PH-15+ expansion via plan-to-pipeline), each wave the same way:
real oracle, external verification, human gate.
