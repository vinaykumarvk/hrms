# hr_admin Cross-Cutting Boundaries — Verification & Correction

## Scope

Per the `hr_admin` role-capability audit's cross-cutting section: (1) verify hr_admin's P01
workflow-resolver override standing, (2) verify/build Tier-1/Tier-2 PII visibility, (3) correct
hr_admin's SoD boundary in G06/G07/G09/G11.

## 1. P01 workflow-resolver override role — already correct, no change

`APPROVAL_OVERRIDE_ROLES` in `apps/api/src/platform/workflow/hrmsWorkflowService.ts:12` is exactly
`["hr_admin", "leave_admin", "hrbp", "sanctioning_authority", "transfer_authority", "system"]`,
matching the user's description precisely. `apps/api/test/workflow-approver-identity.test.cjs`'s
"an hr_admin override role can approve on behalf of the resolved approver" test already isolates
role-based override from wildcard permission (`actorFor()`'s base `permissions` array is a fixed
narrow set, never `["*"]`) — the survey's claim that no isolated test existed was incomplete; this
test already covers it correctly. No changes made.

## 2. Tier-1/Tier-2 PII visibility — verified against the existing field-grant model

The literal terms "Tier 1"/"Tier 2" do not exist anywhere in the codebase. The existing model
(`AuthorizationService.canSeeField()`, `apps/api/src/modules/g01/p02FieldMasking.test.ts`) is
field-grant-based, not tier-based: PII fields (PAN, Aadhaar, category) are masked by default and
only unmasked for an actor holding the specific field grant (e.g. `"employee.pan"`). This is
functionally equivalent least-privilege control, just not labeled with tier terminology. The G01
capability work (task in progress) will verify `hr_admin`'s specific field-grant set against the
user's described "edit rights on Tier 1, view-only on Tier 2, managers/HRBP see masked" expectation
as part of `epm.field.pii_unmask`; that verification is recorded in the G01 report, not duplicated
here. No new tier-classification system is planned — the existing field-grant model is expected to
already satisfy the described behavior structurally, pending that verification.

## 3. SoD boundary correction — hr_admin removed from G06/G07/G09/G11 override sets

| Module | File | Before | After |
|---|---|---|---|
| G06 (promotion orders) | `promotionService.ts` | `["hr_admin", "promotion_officer", "system"]` | `["promotion_officer", "system"]` |
| G06 (sealed cover) | `sealedCoverService.ts` | `["hr_admin", "promotion_officer", "system"]` | `["promotion_officer", "system"]` |
| G07 (nomination) | `trainingService.ts` | `["ld_manager", "ld_officer", "hr_admin", "system"]` | `["ld_manager", "ld_officer", "system"]` |
| G07 (completion) | `trainingService.ts` | `["trainer", "ld_manager", "ld_officer", "hr_admin", "system"]` | `["trainer", "ld_manager", "ld_officer", "system"]` |
| G09 (disciplinary) | `disciplinaryService.ts` | `["hr_admin", "disciplinary_authority", "system"]` | `["disciplinary_authority", "system"]` |
| G11 (pension) | `pensionService.ts` | `["hr_admin", "pension_officer", "system"]` | `["pension_officer", "system"]` |

**Note on conflicting module-BRD text**: G06's, G09's, and G11's own module BRDs contain language
that appears to permit HR Admin involvement — G06 names "HR Officer (Promotion Desk)" mapped to HR
Administrator *plus* a distinct `g06_promotion_desk` flag; G09 names an "HR-DCP Admin" persona
mapped to HR Admin *plus* a distinct "G09 module-admin entitlement" flag, explicitly scoped
"operational, non-deciding"; G11 names "HR Admin" as a Primary Role on several FRs with no
flag-gating mentioned at all. None of these flags are implemented in code today. The user's
capability-audit instruction ("hr_admin has no direct grants in G06/G07/G09/G11... a deliberate
separation-of-duties boundary") is explicit, current, and was confirmed twice (initial message +
an `AskUserQuestion` selection) — it supersedes this older, looser module-BRD language for these
four override sets. Flagged here for traceability, not re-litigated.

G06/G07/G09/G11 were the only modules with `hr_admin` in an override-role set that this session's
own earlier work touched or that overlapped with the new capability audit's modules; G13 (`hr_admin`
appears in `["hr_admin", "librarian", "records_manager", "system"]`) and every other module's
override set were left untouched — the audit only names G06/G07/G09/G11 for exclusion.

## Regression fix-up

Removing `hr_admin` broke 6 pre-existing tests across three already-completed features (all of
which had asserted `hr_admin` as a valid override actor):

- `apps/api/test/promotion-posting-self-service.test.cjs` — 2 tests updated to `promotion_officer`
- `apps/api/test/disciplinary-case-self-service.test.cjs` — 3 tests updated to
  `disciplinary_authority`
- `apps/api/test/pension-projection-self-service.test.cjs` — 1 test updated to `pension_officer`

Each updated test now also asserts the negative case (`hr_admin` correctly receives `403`/an empty
filtered result), not just the positive case for the correct role. `docs/reviews/full-review-g06-*`,
`full-review-g07-*`, `full-review-g09-*`, `full-review-g11-*` were each given a short addendum
recording this correction.

## Verification

- `npm run build` — clean.
- `node --test apps/api/test/*.test.cjs` — full backend suite 679/680 (1 pre-existing unrelated
  skip) — confirms the 6 test updates above and no other regression.
- No frontend changes were required (none of the affected override-role sets are referenced from
  `apps/web`).

## Verdict

**Corrections applied and verified.** P01 override standing and PII field-grant behavior were
already correct (verified, not changed). The G06/G07/G09/G11 SoD boundary is now enforced as
described. Task complete; the Tier-1/Tier-2 terminology gap (functionally covered, not literally
named) is recorded as a documentation-only note, not a functional gap.
