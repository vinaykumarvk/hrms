# PH-08 Statutory Administration Wave Plan

PH-08 builds the statutory administration modules after PH-07 established employee transactions and leave-to-SR integration. The implementation remains inside the HRMS modular monolith and uses the existing P01 workflow, P02 authorization, P05 audit, G12 Service Register, G13 document vault, notifications, and in-memory foundation stores.

| Step | Gate | Scope | External oracle |
|---|---:|---|---|
| PH-08A | auto | Freeze PH-08 detailed plan, prompts, checks, pipeline wiring, and OpenAPI binding markers for G05/G06/G07/G08/G09. | `bash docs/spec/pipeline/checks/ph-08a.sh` |
| PH-08B | auto | Complete G05 advanced transfer scope: representation, retention, cancellation, deemed relief, and SR-safe transfer events. | `bash docs/spec/pipeline/checks/ph-08b.sh` |
| PH-08C | auto | Implement G06 seniority, promotion case, DPC quorum/recusal, promotion effecting, MACP, and SR events. | `bash docs/spec/pipeline/checks/ph-08c.sh` |
| PH-08D | auto | Implement G07 training/certification and G08 APAR appraisal/sealed-cover/final-grade posting. | `bash docs/spec/pipeline/checks/ph-08d.sh` |
| PH-08E | auto | Implement G09 disciplinary case lifecycle, authority competence, charge/inquiry/penalty/appeal, sealed/confidential routing, and SR penalty events. | `bash docs/spec/pipeline/checks/ph-08e.sh` |
| PH-08F | auto | Add UI proof, statutory conformance verdict, manifest evidence, and full API/web regression. | `bash docs/spec/pipeline/checks/ph-08f.sh` |

## Scope Rules

- Every statutory SR event must post through G12. No module may edit SR ledger rows.
- G05, G06, G08, and G09 own their own statutory facts, but cross-module impacts must be exposed as explicit signals or fixtures until later phases consume them.
- G06 and G09 remain separate subphase gates because DPC and disciplinary due process carry the highest statutory risk.
- G07 certifications post to SR only when the certification is marked significant.
- G08 sealed-cover appraisal data must not feed G06 until released.
- PH-08 remains in-memory, consistent with PH-03 through PH-07, until persistence hardening is scheduled.

## Evidence

- `apps/api/test/ph08-g05-transfer-full.test.cjs`
- `apps/api/test/ph08-g06-promotion.test.cjs`
- `apps/api/test/ph08-g07-g08-training-apar.test.cjs`
- `apps/api/test/ph08-g09-disciplinary.test.cjs`
- `apps/web/test/ph08-statutory-wave.test.cjs`
- `docs/spec/ph-08-verdict.md`
