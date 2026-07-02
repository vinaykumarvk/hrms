# PH-03 Foundation Review Packet (Human Gate)

Branch: `ph02-rerun`
Scope: PH-03A + PH-03B + PH-03C — the HRMS foundation service layer, systems of record, cross-cutting
infrastructure, and read-only migration staging. This is the gate before the PH-04 API contract phase
and the PH-04+ module waves.

Verification (this packet):
- `npm run typecheck` — PASS
- `npm test` — PASS, **48/48** node:test subtests, 0 failed
- `bash docs/spec/pipeline/checks/ph-03c.sh` — GREEN

---

## 1. What was built across PH-03

### PH-03A — Platform service layer (authority resolution)
The Authority Resolver (`apps/api/src/platform/authority-resolution/authorityResolutionService.ts`) is the
routing brain that every module wave will consume through the P01 workflow. PH-03A added the
`NAMED_INDIVIDUAL` resolver family (explicit configured user id, no fallback/inference; self-approval and
inactive/absent configured id fail closed) and wired it into resolver precedence. A typed precedence suite
(16 cases) covers all resolver families, the ambiguity→BLOCKED path, and as-of snapshot determinism.

### PH-03B — Systems of record (G01 / G12 / G13)
Black-box suites were added over the already-implemented systems of record, exercising the public
foundation contracts against the `ph03` seed:
- **G12 Service Register** — idempotent replay, semantic dedup (dedup tuple + `fact_key` collapse to one
  append-only ledger row), reused-idempotency-key-with-divergent-payload rejection, and
  supersede-not-delete reversal. No update/delete mutator is exposed (append-only by API shape).
- **G13 Document Vault** — legal hold / WORM retention block disposal and retention-delete, fail-closed,
  document retained intact.
- **G01 Employee Master** — P02 PII field-masking on serialization (masked for under-privileged viewers,
  unmasked with field grants, least-privilege partial grants), and a G01→G12 integration proving a
  governed identity change drives exactly one SR row with correct provenance.
- **Repair (implementation-only):** the G01→G12 test revealed a non-atomic multi-step write in
  `EmployeeMasterService.governedIdentityChange` (master mutated before SR ingest, leaving a partial write
  when the ledger deduped/rejected). Fixed by appending the SR fact first and committing the master
  mutation + audit only on a genuinely new ledger row.

### PH-03C — Infrastructure + read-only migration staging (this sub-phase)
- **Cross-cutting infra** already present and exercised: `jobs/jobService.ts`, `notifications/notificationService.ts`,
  integration boundaries via `foundationServices.ts`, and the security registry
  `security/foundationServiceRegistry.ts`.
- **Read-only migration staging** (`migration/staging/migrationStagingService.ts`): staged legacy identities
  load into an isolated staging store; a reconciliation report classifies matched / missing / duplicate
  legacy identities; and a **gated `promote()`** was added that is BLOCKED on any reconciliation mismatch
  and holds no write handle into the employee master — so promotion cannot mutate the system of record
  partially or fully. `listStaged()` and a per-row `STAGED → PROMOTED` status were added additively.
- **RLS / tenant-isolation proof** and **migration reconciliation proof** added as the two suites the gate
  was missing (see §5).

---

## 2. Resolver-family coverage

All resolver families referenced by the trigger map (PH-02A) are defined and precedence-tested in PH-03A:
`REPORTING_CHAIN` (direct manager preferred, `reports_to_position` fallback), `STATUTORY_AUTHORITY`
(priority precedence; two active same-priority rows → BLOCKED, never guessed), `DELEGATION` /
acting-charge (overrides base holder; delegate == subject → SoD self-approval blocked), `ORG_UNIT_HEAD`
(`org_units.head_employee_id` preferred, authority-assignment fallback), `NAMED_ROLE`, `NAMED_INDIVIDUAL`,
`WORK_QUEUE`, and `COMMITTEE` (quorum members resolved; quorum shortfall → BLOCKED). As-of snapshot
determinism is asserted: a later-effective authority change does not alter a historical resolution.

## 3. Service Register append-only + legal-hold guarantees

- **Append-only:** the SR exposes `ingest` and `reverseFromSource` only; there is no `updateEvent` /
  `deleteEvent` mutator (asserted in tests). Reversal supersedes via a new sequenced row that references
  the original; it never rewrites history. Hash-chained sequence (`previousHash`, `sequenceNo`) is verified.
- **Idempotency / dedup:** replay of the same idempotency key returns the original event; semantic dedup
  (`fact_key`) collapses differing source references to one ledger row; a reused key with a divergent
  payload is rejected rather than silently overwriting.
- **Legal hold:** G13 disposal and retention-delete fail closed under legal hold / WORM; the document is
  retained intact.

## 4. Test inventory

`npm test` runs `npm run build` then `node --test apps/api/test/*.test.cjs`. Each `*.test.cjs` wraps the
compiled typed source-of-truth `*.test.ts` (typechecked by the project build) in node:test. Total: **48
subtests, all passing.**

| Suite (cjs wrapper) | Typed source | Focus |
|---|---|---|
| `ph03-foundation.test.cjs` | inline | 8 foundation cases (resolver, G01/G12/G13, workflow, tenant isolation, migration, security hygiene) |
| `authorityResolver.precedence.test.cjs` | `.../authority-resolution/authorityResolver.precedence.test.ts` | 16 resolver-precedence cases |
| `srSemanticDedup.test.cjs` | `.../g12/srSemanticDedup.test.ts` | SR idempotency, dedup, append-only |
| `legalHoldDisposal.test.cjs` | `.../g13/legalHoldDisposal.test.ts` | legal-hold blocks disposal |
| `p02FieldMasking.test.cjs` | `.../g01/p02FieldMasking.test.ts` | PII masking / field grants |
| `g01ToG12SrIngest.test.cjs` | `.../g01/g01ToG12SrIngest.test.ts` | governed change → one SR row |
| `rlsTenantIsolation.test.cjs` (**PH-03C**) | `.../security/rlsTenantIsolation.test.ts` | RLS cross-entity + cross-tenant isolation (6 cases) |
| `migrationStagingReconciliation.test.cjs` (**PH-03C**) | `.../migration/staging/migrationStagingReconciliation.test.ts` | read-only staging, reconciliation, gated promotion (6 cases) |

Toolchain oracles (toolchain-independent, in `ph-03c.sh`): no production `console.log` in `apps/api/src`,
no stack-trace leak in error responses, endpoint protection markers present.

## 5. RLS / security proof

- **RLS (row-level security) — `rlsTenantIsolation.test.ts`:** black-box against the data-access/repo layer
  (`EmployeeMasterService`, `DocumentVaultService`) with a two-tenant, two-entity fixture. Proven: a viewer
  scoped to entity A reads only entity-A rows and gets `null`/NOT_FOUND for entity-B and tenant-T2 rows; a
  tenant-T2 viewer cannot read any tenant-T1 row; an **authorized** cross-entity viewer (tenant-scoped, no
  entity pin) reads across both entities of its tenant but still cannot cross the tenant boundary. The
  authorization-enforced read path (`readProfile`) fails closed (NOT_FOUND, no cross-entity leak).
- **Migration read-only — `migrationStagingReconciliation.test.ts`:** staged records load into staging
  without touching the SoR; the reconciliation report classifies matched/missing/duplicate; promotion is
  BLOCKED on a missing-identity mismatch and on a duplicate-only mismatch (fail-closed on any defect); a
  blocked promotion leaves the production employee count unchanged and no row promoted; only a clean
  reconciliation permits promotion, and even a clean promotion does not grow the SoR.
- **Security hygiene:** service registry entries are all `protected` with non-empty permissions; error
  sanitization returns `{code:"INTERNAL", message:"Request failed"}` for unexpected errors (no stack trace
  / internal path leak); parameterised access only (in-memory repositories, no SQL string interpolation);
  secrets are not present in these layers.

## 6. Known gaps / caveats (honest residual risk)

1. **In-memory repositories.** The foundation is proven against in-memory stores, not SQL-backed
   repositories with database-enforced RLS policies. RLS here is enforced in the `inScope` predicate at the
   repo layer, not by Postgres `ROW LEVEL SECURITY`. The PH-00D/PH-02 SQL schema declares forced RLS, but
   the wiring of these services onto that SQL layer is future work — a real deployment must re-prove
   isolation at the database boundary.
2. **Migration promotion is intentionally minimal.** `promote()` gates on a clean reconciliation and, by
   construction, has no write path into the employee master (that is the read-only guarantee). It therefore
   does not yet perform an actual SoR insert/update on the clean path; the production upsert, transactional
   boundary, and audit of a real promotion land when the SQL-backed repositories exist.
3. **No HTTP surface yet.** These are service internals. "Endpoint protection markers present" is satisfied
   by the service registry, not by live route guards. PH-04 owns route handlers, request/response
   validation, idempotency headers, and per-route auth — public/protected enforcement must be re-verified there.
4. **Adapter seams open.** Object storage, KMS, AV scan, and RFC-3161 timestamp integrations for G13, and
   the live SQL-backed `workflow-postgres` adapter, remain stubs/seams for later phases.
5. **PUDA provenance.** External distribution/productization of PUDA-derived workflow code remains on the
   human/legal hold recorded since PH-00; internal HRMS build is cleared to proceed.

## 7. Ready for the PH-04 module waves?

**YES — proceed to PH-04 (API contract binding).**

Why: the foundation service layer, all resolver families, the append-only Service Register, the
legal-hold/WORM document guarantees, tenant + cross-entity RLS isolation, and the read-only,
fail-closed migration staging path are all implemented and proven green (48/48 tests, typecheck clean,
no console.log / stack-trace / unprotected-marker findings). The residual risks in §6 are **deferred, not
blocking**: they are the SQL-backing, route-binding, and external-integration seams that PH-04+ explicitly
own, and each is scoped so that a single unfinished seam does not compromise the proven foundation
contracts. The two enforcement guarantees that most affect the module waves — RLS isolation and
"migration never writes the SoR until reconciled" — are demonstrated at the layer the modules consume, so
the waves can build on them safely, with the standing requirement that RLS be re-proven at the SQL boundary
once the persistent repositories land.
