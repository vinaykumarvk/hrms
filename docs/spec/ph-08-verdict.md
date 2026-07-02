# PH-08 Verdict - Statutory Administration Wave

## Gate Decision

PH-08 is GREEN for agentic progression to PH-09.

The statutory administration wave now has executable backend and UI evidence for G05 full transfer administration, G06 promotion/seniority/DPC/MACP, G07 training/certification, G08 APAR, and G09 disciplinary due process. The implementation stays inside the established modular monolith and uses the shared P01 workflow, P02 authorization, P05 audit, G12 Service Register, G13 document vault, and notification services.

## Scope Delivered

### G05 Transfer Full Scope

G05 now extends beyond the PH-06 transfer proof slice. It supports representation filing, retention order, cancellation, deemed relief, documents, audit, notifications, and G05-owned SR events.

The added SR event types are `TRANSFER_RETAINED`, `TRANSFER_CANCELLED`, and `TRANSFER_DEEMED_RELIEVED`. The original transfer-joining path remains intact and PH-06 regression tests continue to pass.

### G06 Promotion, Seniority, DPC, and MACP

G06 implements deterministic seniority ranking, seniority publication/finalisation, promotion case creation, DPC quorum and recusal checks, promotion order issue/effecting, and MACP effecting.

The service explicitly enforces `DPC_QUORUM` and `DPC_RECUSAL` before orders are issued. Promotion and MACP post establishment facts through G12 as `PROMOTION_EFFECTED` and `MACP_EFFECTED`. Pay computation is not implemented in G06; the module emits `G06_PAY_IMPACT_SIGNAL` records for G10.

### G07 Training and Certification

G07 implements training session creation, nomination workflow through `WF-G07-NOMINATION`, approval/waitlist handling, completion, certification document generation, and significant-certification SR posting.

Significant certifications post to G12 as `TRAINING_CERTIFICATION_POSTED` with source module `G07`.

### G08 APAR

G08 implements APAR form opening, self-submission, reporting officer assessment, reviewing officer review, accepting authority finalisation, document generation, and final-grade SR posting as `APAR_FINAL_GRADE`.

Sealed-cover forms are represented explicitly with `SEALED_COVER` and suppress promotion feed evidence through `G08_G06_FEED_SUPPRESSED` until released. Final-grade SR posting is blocked while sealed-cover suppression remains active.

### G09 Disciplinary Cases

G09 implements disciplinary case opening, authority competence, charge memo service, inquiry report, penalty order, appeal decision, confidential routing, G13 documents, G12 penalty posting, and downstream impact signals.

The service enforces `G09_AUTHORITY_COMPETENCE`: the disciplinary authority cannot be the charged employee, and appellate authority cannot be the same as the disciplinary authority. Penalty posting supports `MAJOR_PENALTY`, and appeal decisions record `APPEAL_DECIDED`; set-aside appeals post a reversal event.

## SR Conformance

SR conformance is preserved across the statutory wave:

| Module | SR writer | Example event |
|---|---|---|
| G05 | G05 | `TRANSFER_RETAINED`, `TRANSFER_CANCELLED`, `TRANSFER_DEEMED_RELIEVED` |
| G06 | G06 | `PROMOTION_EFFECTED`, `MACP_EFFECTED` |
| G07 | G07 | `TRAINING_CERTIFICATION_POSTED` |
| G08 | G08 | `APAR_FINAL_GRADE` |
| G09 | G09 | `MAJOR_PENALTY`, penalty reversal on appeal set-aside |

All statutory SR writes go through G12 ingest. No module edits SR ledger rows directly.

## Evidence

Primary backend evidence:

- `apps/api/src/modules/g05/transferService.ts`
- `apps/api/src/modules/g06/promotionService.ts`
- `apps/api/src/modules/g07/trainingService.ts`
- `apps/api/src/modules/g08/aparService.ts`
- `apps/api/src/modules/g09/disciplinaryService.ts`
- `apps/api/src/routes/g05.routes.ts`
- `apps/api/src/routes/g06.routes.ts`
- `apps/api/src/routes/g07.routes.ts`
- `apps/api/src/routes/g08.routes.ts`
- `apps/api/src/routes/g09.routes.ts`

Primary test evidence:

- `apps/api/test/ph08-g05-transfer-full.test.cjs`
- `apps/api/test/ph08-g06-promotion.test.cjs`
- `apps/api/test/ph08-g07-g08-training-apar.test.cjs`
- `apps/api/test/ph08-g09-disciplinary.test.cjs`
- `apps/web/test/ph08-statutory-wave.test.cjs`

Gate evidence:

- `bash docs/spec/pipeline/checks/ph-08a.sh`
- `bash docs/spec/pipeline/checks/ph-08b.sh`
- `bash docs/spec/pipeline/checks/ph-08c.sh`
- `bash docs/spec/pipeline/checks/ph-08d.sh`
- `bash docs/spec/pipeline/checks/ph-08e.sh`
- `bash docs/spec/pipeline/checks/ph-08f.sh`
- `npm run check`
- `npm run web:check`

## Residual Caveats

- Stores remain in-memory, consistent with PH-03 through PH-07. Persistence hardening remains a later phase.
- G06 pay impact signals are inputs for G10 only; pay fixation and money calculation remain PH-09 scope.
- G09 penalty impact signals are ready for G06/G11 consumption, but downstream G11 pension effects remain PH-09.
- UI panels are fixture-backed proof surfaces; backend route and service tests prove live behavior.
- This phase proves representative statutory paths, not every BRD edge case in the full G05/G06/G07/G08/G09 domain.

## Recommendation

Proceed to PH-09. PH-08 provides stable statutory facts and upstream signals for payroll and pension work.
