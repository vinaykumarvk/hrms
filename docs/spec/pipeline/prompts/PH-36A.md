# PH-36A — G09 POSH conciliation engine + route (FR-G09-023 BR-2)

## Objective
Implement POSH conciliation (POSH Act 2013 s.10 / G09 BRD FR-G09-023 BR-2): the aggrieved complainant
may opt for conciliation **before** the inquiry; a conciliation is recorded on the case; a SETTLED
conciliation blocks the inquiry (no inquiry report proceeds); a conciliation may **not** rest on a
monetary settlement.

## Context
- `docs/brd/v3/G09-disciplinary-cases-punishment.md` FR-G09-023, BR-2 (line ~2560) and its API table (`.../conciliation`).
- Engine: `apps/api/src/modules/g09/disciplinaryService.ts` (POSH ICC route already implemented).
- Routes: `apps/api/src/routes/g09.routes.ts` (RouteDefinition[] + `routes.forEach(kernel.register)`).
- Error codes: `apps/api/src/platform/types.ts` (`G09DomainErrorCode`) + status map `apps/api/src/http/errors.ts`.

## Constraints
- Only humans mint approvals; no oracle weakening. Conciliation applies only to POSH (HARASSMENT) cases.
- BR-2: reject any monetary settlement basis with `ERR-G09-CONCILIATION-MONETARY` (422).
- Recorded before inquiry only; a SETTLED outcome must make `recordInquiryReport` refuse.
- Follow the module's existing `/api/v1/disciplinary/cases/...` route convention (not the BRD's unused `/dcp/` prefix).

## Freedom
Repository/storage shape, the exact monetary-basis detection, and the timeline/audit wording are the
implementer's choice within the constraints.

## Evidence required
- `apps/api/test/ph36a-*.test.cjs` dispatching through `createFoundationApi`: happy path (record + list),
  BR-2 monetary rejection (422), and SETTLED-blocks-inquiry.
- `bash docs/spec/pipeline/checks/ph-36a.sh` GREEN (external), typecheck + full suite green.

## Escalate when
- The BRD is ambiguous on whether a withdrawn conciliation resumes the inquiry (record the assumption).
