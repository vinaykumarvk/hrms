# BRD Coverage Review — G13 Personal Documents Self-Service (use-case scoped)

Date: 2026-07-13
BRD under review: `docs/brd/v3/G13-document-management-secure-storage.md` — **scoped subset only**
Scope decision (same principle as prior use cases 3-7): "access personal documents — payslips,
certificates, ID proofs, appointment letters in a secure vault." Covers the self-service slice of
FR-G13-006 (access control) and FR-G13-016 (fetch contract) — not upload/ingestion admin flows,
legal hold, retention/disposition, security-clearance grant administration, DPDP DSR adjudication/
execution (the DSR self-service *raise* path already existed and is untouched), certified copies,
OCR search, key rotation, or checkout/check-in versioning.

Verdict: **GAPS-FOUND** (a live cross-employee document-listing exposure on the already-deployed
`/me/documents` page is fixed; a session permission gap blocking self-service downloads is fixed;
the clearance-gates-the-owner-too design is confirmed intentional per the BRD, not changed)

## In-scope requirement

**FR-G13-006 — Access Control** (Employee "(own)" row of the BRD's §3.2 permission matrix: View
`R (own)`, Download/Print `D/P (own)`) plus the read-half of **FR-G13-016** (intent-resolved
`:fetch` contract) needed to actually view/download a document, not just list its metadata.

## What changed this session

- Backend: `apps/api/src/modules/g13/documentVaultService.ts` —
  - **CRITICAL, live pre-existing bug**: `list()` (backing `GET /api/v1/documents`, the ONLY
    route `DocumentVaultView` — the component already mounted at `/me/documents` before this
    session — called) filters by tenant scope only, never by `ownerEmployeeId`. Any employee
    holding the coarse `g13.document.read` permission (which every seeded/demo employee holds)
    could see every other employee's document metadata (title, classification, docNo) in the
    tenant through the app's own self-service "Documents" page as it stood today — not a
    hypothetical, a live exposure in already-shipped code. Added `listMyDocuments(scope,
    employeeId)`: appraisee-self-or-override only (new `assertSelfOrOverride()` +
    `DOCUMENT_ACCESS_OVERRIDE_ROLES = ["hr_admin", "librarian", "records_manager", "system"]`,
    matching the BRD's Librarian/Records-Mgr roles plus the org-wide override convention used
    across every other module fixed this session), filtered to `ownerEmployeeId === employeeId`.
  - Added `listSecurityClearances(scope)` — a thin public read path onto the existing
    `security.listClearances()` the deny-by-default gate already consults internally; used by the
    seed's idempotency check (no new route — clearance administration is out of this use case's
    scope).
  - **Confirmed, not changed**: `requireClearance()`'s deny-by-default gate (BRD §3.3: "a
    principal sees a document only if `effective_clearance_level ≥ document.classification`")
    applies uniformly to every principal **including the document's own owner** — the BRD's
    Employee "(own)" row is itself qualified "(per clearance, P02)", so an owner needing an
    explicit clearance grant to view their own CONFIDENTIAL+ document is the BRD's stated design,
    not a bug. Verified this is real and not accidentally too strict via a dedicated test (see
    below) rather than assuming an owner-bypass was needed.
- Routes: `apps/api/src/routes/g13.routes.ts` — added `GET /api/v1/documents/employees/{id}`.
  - **Wire-leak fix (same class fixed 5 times earlier this session)**: no route in this file had
    ever stripped `tenantId`/`entityId` from `DocumentRecord` responses. Added a `toWireDocument()`
    helper and applied it to all 12 routes that return a `DocumentRecord` (create, list, the new
    list-mine, attach, checkin, supersede, get, both legal-hold-place variants, release-legal-hold,
    assign-retention-class, rescan, list-by-module-ref) — enumerated by grepping every
    `documentVault.` call site returning `document:`/`items:` of that type, not assumed complete
    from memory (after last feature's review caught an incomplete retrofit, this pass was done by
    systematic grep + re-grep, not spot-checking). `contentHash` was deliberately left un-stripped
    — an existing HTTP-level test (`ph10c-g13-vault-hardening.test.cjs`) asserts it's present on
    the create response by design (server-computed hash as anti-forgery proof), confirmed before
    assuming it should be stripped like the training/APAR modules' internal ids.
- Seed: `apps/api/src/seed/testEmployeesSeed.ts` — added `seedTestDocumentClearance()`: grants
  Rohan (who already has a seeded CONFIDENTIAL "Educational Certificate" from an earlier session's
  seed) a real ACTIVE USER-principal clearance at CONFIDENTIAL, so "access personal documents" is
  reachable end-to-end (view + download) for at least one seeded employee, not just
  listable-but-permanently-unfetchable.
- Bug fix (same class as G07/G08's permission-string mismatches found earlier this session): the
  demo employee session (`apps/web/src/app/session.ts`) granted `g13.document.read` but not
  `g13.document.download` — the `:fetch?intent=DOWNLOAD` route separately requires
  `g13.document.download` (BRD FR-G13-016 AC6: "the file grant is served ONLY with the distinct
  DOWNLOAD right"). The demo employee could list and view documents but never actually download
  one through the real running app before this fix (caught live by the new e2e test, not
  discovered by static review).
- Frontend: `MyDocumentsPanel.tsx` (new) — lists only the employee's own documents and lets them
  open a View or Download grant per document; replaces `DocumentVaultView` at the `/me/documents`
  route (that component's own general, unscoped listing and its dedicated `ph05-records.test.cjs`
  suite are left untouched — it's not routed anywhere else today but isn't part of this use case's
  fix). `hrmsClient.ts`/`fixtureHrmsClient.ts` — added `listMyDocuments`, `fetchDocument`,
  `DocumentViewGrant`/`DocumentDownloadGrant` types.
- Tests: `apps/api/test/personal-documents-self-service.test.cjs` (6 tests: seed produces a real
  CONFIDENTIAL certificate, wire-leak regression, self-vs-cross-employee 403 on the new list route,
  hr_admin override, seeded-clearance view+download succeeds, and — the important negative case —
  a plain employee WITHOUT a clearance grant is denied their own CONFIDENTIAL document, proving the
  clearance-gates-the-owner design is real rather than assumed) and
  `apps/web/test/e2e/personal-documents-self-service.spec.ts` (1 Playwright test, builds two
  documents — one owned by the logging-in employee, one by a stranger — via direct API calls
  classified INTERNAL to isolate the listing/view/download self-service flow from the separate
  clearance-grant mechanics already covered by the backend tests; confirms the stranger's document
  never appears in the employee's own list).

## Post-review fix (full-review, BLOCKING — 2 CRITICAL findings)

The dispatched `/full-review` returned a BLOCKING verdict with two CRITICAL findings, both
independently live-verified by the reviewer against the running code, not just read from the diff:

1. **The original unscoped `GET /api/v1/documents` (`list()`) was still live.** This session's fix
   added a correctly-scoped sibling (`listMyDocuments`) but never touched `list()` itself — the
   pre-existing route any employee's `g13.document.read` permission reaches was still returning
   every tenant document with no ownership filter. Confirmed live: Sunita (a plain employee) could
   list documents owned by all 6 other seeded employees through this route. Not reachable through
   the shipped web UI (its only prior caller, `DocumentVaultView.tsx`, was already unrouted after
   this session's `MyDocumentsPanel` swap), but fully live via any direct API client.
2. **`requireClearance()` has no per-document ACL/ownership dimension — a CONFIDENTIAL+ clearance
   grant silently unlocks every document at that classification tenant-wide, not just the
   grantee's own.** The BRD (§3.3) requires classification-level clearance **AND** an ACL/
   relationship grant, joined by AND — this codebase only ever implemented the first half.
   Confirmed live: the clearance this session seeded for Rohan (so he could view his own
   CONFIDENTIAL certificate) also let him successfully view Sunita's unrelated CONFIDENTIAL
   document — a direct violation of "(own)" scoping and of the BRD's stated two-dimensional gate.

Both are fixed by giving `list()`, `get()`, and `fetch()` the same ownership-or-override gate
`listMyDocuments()` already had: `list()` now returns only the caller's own (or ownerless/
organisational) documents for non-override actors, matching the exact BRD row split (Librarian/
Records-Mgr/Auditor keep a plain "R" via the override-role set; Employee gets "R (own)"). `get()`
and `fetch()` now enforce a new `assertOwnerOrOverride()` check before their existing status/
clearance logic — a document with an owner can only be read by that owner or an override actor,
regardless of clearance level. This is the practical implementation of the BRD's missing
"ACL/relationship" dimension for the self-service case (a document's owner is its own ACL), without
building a separate ACL entity/table this scope didn't call for. Documents with no
`ownerEmployeeId` (organisational artefacts) are deliberately exempted from the ownership gate —
an initial version broke 2 pre-existing tests (`ph10c-g13-vault-hardening.test.cjs`,
`ph15e-g13-envelope-dsr.test.cjs`) that fetch ownerless test documents with a non-override actor;
narrowing the gate to only apply when `ownerEmployeeId` is actually set fixed both while preserving
the closed cross-employee gap.

Verified: 2 new regression tests (general-list no longer cross-leaks; a CONFIDENTIAL clearance no
longer unlocks another employee's document) added to
`apps/api/test/personal-documents-self-service.test.cjs` (now 8 tests total). Full backend suite
641/642 (1 pre-existing skip), web unit 153/153, and Playwright e2e 26/26 — all pass with zero
regressions.

The review's remaining MEDIUM finding (11 non-`DocumentRecord` routes — clearance grant, retention
class, checkout/disposition/DSR/audit/certified-copy/OCR families — still return raw
`tenantId`/`entityId`) and LOW finding (`grantSecurityClearance` has no service-level, only a
seed-wrapper-level, idempotency guard against duplicate ACTIVE clearance rows) are lower-severity
internal-hygiene items outside this pass's ownership/access-control fix; recorded in Deferred Gaps
below rather than silently dropped.

## Coverage Matrix — FR-G13-006/016 (self-service document access scope)

| AC | Verdict | Evidence |
|---|---|---|
| Employee views only their own documents (list) | **REMEDIATED THIS SESSION (CRITICAL, incl. post-review fix)** | `list()` leaked every tenant document to any `g13.document.read` holder; `listMyDocuments()` scoped a new route, and — after full-review caught it — `list()` itself is now also need-to-know scoped for non-override actors |
| Employee views own document (per clearance, P02) | DONE (pre-existing, confirmed not a bug) + **REMEDIATED (CRITICAL)** | `requireClearance()` gating CONFIDENTIAL+ uniformly is confirmed correct per BRD §3.3; what was missing was the BRD's second, AND-joined ACL dimension — a clearance grant no longer unlocks another employee's document, only the grantee's own (`get()`/`fetch()` now both ownership-or-override gated) |
| Employee downloads own document (D/P own) | **REMEDIATED THIS SESSION** | Demo session lacked `g13.document.download`; added. Route-level intent-split (VIEW vs DOWNLOAD) untouched (pre-existing, correct) |
| Wire responses strip internal tenantId/entityId | **REMEDIATED THIS SESSION** | All 12 `DocumentRecord`-returning routes now go through `toWireDocument()` |
| Seeded data exercises the full flow (list → view → download) | **BUILT THIS SESSION** | `listMyDocuments()` + route + `seedTestDocumentClearance()` — none of this existed before |

## Deferred Gaps (flagged, not fixed — with reasoning)

| Gap | Size | Why deferred |
|---|---|---|
| 11 non-`DocumentRecord` routes (clearance grant, retention class, checkout/disposition/DSR/audit/certified-copy/OCR families) still return raw `tenantId`/`entityId` | S | Same internal-id-hygiene class as the `DocumentRecord` fix, but on record types (`SecurityClearanceRecord`, `DispositionRecord`, `DataSubjectRequestRecord`, etc.) outside this pass's `DocumentRecord`-shaped scope; flagged by full-review, not silently ignored |
| `grantSecurityClearance()` has no service-level idempotency guard against duplicate ACTIVE rows for the same principal/level — only the seed wrapper's own pre-check prevents it | S | Not exercised by any route beyond the seed path in this pass; a real gap for any other direct caller, but out of the self-service scope named here |
| `attach`/`checkin`/etc. still return `contentHash`/`links`/`retentionClassCode` unstripped (only tenantId/entityId stripped) | S | These fields are legitimate business data for admin/librarian flows (confirmed `contentHash` is asserted present by a pre-existing test); stripping them would be an unrequested behavior change beyond the internal-id leak this pass targets |
| `DocumentVaultView.tsx`'s own unscoped `list()` call remains as a general-purpose component, now unrouted | S | Not deleted since it has its own dedicated pre-existing test suite and may be a legitimate future admin surface; simply no longer mounted at the self-service route |

## Scorecard

```
LINE-ITEM COVERAGE (FR-G13-006/016 self-service document access scope)
================================================================================
Total items audited:        5
DONE (pre-existing, confirmed correct): 1 (clearance gates the owner too — BRD-literal, not a bug)
REMEDIATED THIS SESSION:      4 (list-scoping + ACL-dimension CRITICAL leaks, download permission, wire-leak)
BUILT THIS SESSION (net-new): 1 (end-to-end seeded flow: list → view → download)
```

## Verdict: GAPS-FOUND

The most significant findings this pass were not missing features but live security bugs — one
pre-existing, one introduced mid-pass by this session's own seed data. First: the self-service
"Documents" page mounted at `/me/documents` called the general, unscoped `list()`, leaking every
employee's document metadata to every other employee holding the ordinary `g13.document.read`
permission. This session's first fix pass added a correctly-scoped sibling route but left that
original route live; `/full-review` caught the miss and it is now closed at the source. Second,
and more subtle: the BRD's access model requires classification clearance AND an ACL/relationship
grant, but only the first half was ever implemented in this codebase — meaning the very clearance
this session seeded so an employee could view their own CONFIDENTIAL document also silently
unlocked every other employee's CONFIDENTIAL+ document tenant-wide. Both are now closed by a
single ownership-or-override gate applied consistently to `list()`, `get()`, and `fetch()`.
Downloads also now work through the real app for the first time (a permission-grant gap blocked
them before), and the BRD's stricter "clearance gates everyone, including the owner" design was
verified as intentional — via a dedicated failing-case test — rather than assumed to be a bug and
silently loosened.
