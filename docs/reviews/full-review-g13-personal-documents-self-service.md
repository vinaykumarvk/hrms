# Full Review: G13 Personal Documents Self-Service

## Update 2026-07-13 (post-review verification)

F2 (LOW, trivial/additive) has been fixed: `DOCUMENT_FETCH_ERROR_MESSAGES` in
`apps/web/src/modules/g13/MyDocumentsPanel.tsx` now also maps `FORBIDDEN` and
`ERR-G13-INTEGRITY_FAILED` to specific user-facing messages, matching every other code `fetch()`
can throw. `npm run web:typecheck` re-run clean. F1 (actor-trust thinning, not live-exploitable
today) and F3 (403-vs-404 enumeration signal) were left as-is per the review's own recommendation —
both are explicitly framed as opportunistic/judgment-call hardening, not defects, and fixing them
would mean touching the shared `assertSelfOrOverride`/`assertOwnerOrOverride` trust boundary or a
cross-module 403/404 convention decision, disproportionate to this use case's scope.

**Verdict: PASS (post-remediation)** — unchanged from the original PASS; this update is a minor
UX-completeness fix, not a verdict correction.

Original review text preserved below.

---

## Verdict
PASS

## Scope
- **target**: G13 "personal documents self-service" (list/view/download own documents at `/me/documents`), the fix-forward of the already-shipped `DocumentVaultView` cross-employee exposure.
- **selected path**: light/standard (single-module security-and-read-path fix on a stable contract; matches the `full-review` skill's evidence-first, report-only mode).
- **files reviewed**:
  - `apps/api/src/modules/g13/documentVaultService.ts` (diff: `list()` L372-384, `listMyDocuments()` L385-390, `isDocumentAccessOverride()` L391-393, `assertSelfOrOverride()` L395-401, `assertOwnerOrOverride()` L407-412, `fetch()` L579-641, `get()` L1225-1232, `listSecurityClearances()` new)
  - `apps/api/src/routes/g13.routes.ts` (diff: `toWireDocument()` L9-12, new `GET /api/v1/documents/employees/{id}` L59-68, `toWireDocument()` applied to 12 `DocumentRecord`-returning routes)
  - `apps/web/src/modules/g13/MyDocumentsPanel.tsx` (new, 129 lines)
  - `apps/api/src/seed/testEmployeesSeed.ts` (`seedTestDocumentClearance()`)
  - `apps/web/src/app/session.ts` (demo session gained `g13.document.download`, plus many unrelated other-module permissions from the same session)
  - `apps/web/src/App.tsx` (`/me/documents` route swapped `DocumentVaultView` → `MyDocumentsPanel`)
  - `apps/web/src/api/hrmsClient.ts` / `fixtureHrmsClient.ts` (`listMyDocuments`, `fetchDocument`, `DocumentSummary`/`DocumentViewGrant`/`DocumentDownloadGrant` types)
  - `apps/api/test/personal-documents-self-service.test.cjs` (8 tests)
  - `apps/web/test/e2e/personal-documents-self-service.spec.ts` (1 Playwright test)
  - Reference/consistency check: `apps/api/src/modules/g01/bankAccountService.ts` (maker!=checker + `toWireX()`), `apps/api/src/modules/g12/serviceRegisterService.ts` (`SR_TIMELINE_OVERRIDE_ROLES` self-scope pattern)
- **artefacts used**: `docs/reviews/brd-coverage-g13-personal-documents-self-service-2026-07-13.md` (2026-07-13, verdict GAPS-FOUND — its own embedded post-review fix record for 2 CRITICAL findings was treated as prior, already-closed history, not re-reported here); `docs/brd/v3/G13-document-management-secure-storage.md` (§3.2 permission matrix, §3.3 access model) referenced via the coverage doc, not re-read line-by-line since the coverage doc already traces it.

## Checks run

| Check | Ran? | Result | Evidence |
|---|---|---|---|
| `npm run build` (tsc, full monorepo) | Yes | PASS | Clean compile, no errors |
| `node --test apps/api/test/personal-documents-self-service.test.cjs` | Yes | PASS 8/8 | All 8 tests green, incl. the 2 post-review CRITICAL-regression tests |
| `npm run web:typecheck` | Yes | PASS | Clean, no errors |
| `npm run web:test` (full web unit suite) | Yes | PASS 153/153 | Includes prior UIR/UI-remediation suites, no regression |
| `npx playwright test personal-documents-self-service` | Yes | PASS 1/1 (14.1s) | Real browser run against real local API bridge — login as Kiran, list/view/download own doc, stranger's doc absent |
| Live self-scope probe: plain employee `GET /api/v1/documents/{strangerDocId}` | Yes (ad-hoc, independent of shipped tests) | 403 FORBIDDEN, no content leaked | `/tmp/.../g13-probe.cjs` run against `dist/` build |
| Live probe: `:fetch?intent=VIEW` and `:fetch?intent=DOWNLOAD` on a stranger's doc | Yes | Both 403 FORBIDDEN | Same probe script |
| Live probe: wire-leak scan on `listMyDocuments`/`fetch` responses | Yes | No `tenantId`/`entityId`; fields are `id,docNo,title,ownerEmployeeId,status,classification,currentVersionNo,contentHash,isWorm,legalHold,links` and grant tokens only | Same probe script |
| Live probe: `actorUserId` spoofing (caller sets `actorUserId` ≠ `userId` on a hand-built actor object) | Yes | Succeeded when calling `api.dispatch()` directly, but traced to a test-harness-only path — not reachable through the real HTTP boundary | `apps/api/src/http/apiKernel.ts:53-58`, `tools/local-api-server.mjs:38-58` both force `actorUserId === userId`/`claims.sub`; see Findings F1 |
| Live probe: 404-vs-403 enumeration signal | Yes | Nonexistent doc id → 404 NOT_FOUND; existing-but-not-mine → 403 FORBIDDEN (distinguishable) | Same probe script |
| BRD coverage cross-check (no re-reporting deferred/already-fixed items) | Yes | Confirmed — the 2 CRITICAL findings named in the coverage doc's "Post-review fix" section are already closed in the current diff (`list()` ownership filter, `assertOwnerOrOverride` on `get()`/`fetch()`) | `documentVaultService.ts` L372-412, L585, L1230 |
| Component substance / anti-skeleton scan of `MyDocumentsPanel.tsx` | Yes | Real state machine, real API calls, real data rendering — see table below | — |

## Findings

| ID | Severity | Domain | File:line | Claim | Evidence | Recommended action | Repair mode eligible? |
|---|---|---|---|---|---|---|---|
| F1 | LOW/P3 | Security (defense-in-depth) | `apps/api/src/modules/g13/documentVaultService.ts:396,408` (`assertSelfOrOverride`/`assertOwnerOrOverride` read `scope.actorUserId`); `apps/api/src/http/apiKernel.ts:66-67` (`context.actor` passed to handlers is the raw caller-supplied actor `{...actor, correlationId}`, not the kernel-derived `scope` object at L53-58) | All G13 self-scope checks trust `context.actor.actorUserId` as passed by the route layer, not the kernel's own independently-derived `scope.actorUserId`. In the real HTTP path (`tools/local-api-server.mjs:38-58`) this is safe today because `decodeActor()` hardcodes `actorUserId: claims.sub` (same as `userId`), so no live exploit exists. But the trust boundary is one layer thinner than it needs to be: any future caller construction path (a second HTTP bridge, a test helper reused in prod-adjacent tooling, a future service-to-service actor) that sets `actorUserId` independently of `userId` would silently defeat every ownership check in this file. | Live-verified via direct `api.dispatch()` call with `actorUserId` ≠ `userId`: listing succeeded for the spoofed identity. Not reachable today via the real dev bridge or any registered route, since every actual actor-construction site sets `actorUserId = userId`/`claims.sub` in lockstep. | Prefer `context.scope.actorUserId` (kernel-derived, already computed at `apiKernel.ts:56`) over `context.actor.actorUserId` for ownership checks, or have `assertSelfOrOverride`/`assertOwnerOrOverride`/`isDocumentAccessOverride` accept the kernel `scope` instead of the raw `actor`. Same class of thinning exists in the `g12` `SR_TIMELINE_OVERRIDE_ROLES` pattern this session copied from, so if amended, amend both for consistency. | Yes — implementation-only change (swap which field is read), no contract change |
| F2 | LOW/P3 | Quality | `apps/web/src/modules/g13/MyDocumentsPanel.tsx:11-16` (`DOCUMENT_FETCH_ERROR_MESSAGES`) vs `apps/api/src/modules/g13/documentVaultService.ts:411` (`assertOwnerOrOverride` throws `FORBIDDEN`) and `:706` (`ERR-G13-INTEGRITY_FAILED`) | The panel's error-message map covers 4 of the ~6 error codes `fetch()` can actually throw (`ERR-G13-CLEARANCE_INSUFFICIENT`, `ERR-G13-MALWARE_DETECTED`, `PRECONDITION_FAILED`, `NOT_FOUND`) but omits `FORBIDDEN` (the new ownership gate) and `ERR-G13-INTEGRITY_FAILED`. Both fall through to the generic "The document could not be opened." message — a safe, non-crashing default, not a functional break. | Read `documentVaultService.ts` `fetch()` body for the full throw set; cross-referenced against the panel's map. | Add `FORBIDDEN` and `ERR-G13-INTEGRITY_FAILED` entries to `DOCUMENT_FETCH_ERROR_MESSAGES` for a more specific user-facing message (the generic fallback is acceptable but less informative than the existing pattern for other codes). | Yes — trivial, additive, no contract change |
| F3 | LOW/P3 | Security (info disclosure, minor) | `apps/api/src/modules/g13/documentVaultService.ts:1225-1232` (`get()`) | `GET /api/v1/documents/{id}` distinguishes a nonexistent document id (404 NOT_FOUND) from an existing-but-not-owned document id (403 FORBIDDEN). This lets an authenticated employee enumerate which document ids exist in the tenant (without seeing content) by observing 403 vs 404, a standard low-severity ID-enumeration signal. | Live probe: nonexistent id → `404 NOT_FOUND`; real stranger doc id → `403 FORBIDDEN`. | Optional hardening: collapse both cases to `404 NOT_FOUND` for non-override actors (standard IDOR mitigation of "don't confirm existence"). Judgment call — many systems in this same codebase (e.g., G12 SR) likely have the same shape; flag for consistency review rather than a point fix if adopted. | Yes if adopted, but this is a judgment/consistency call, not a clear defect — recommend accepting as-is unless a broader IDOR-hardening pass is scoped |

No CRITICAL or HIGH findings. No MEDIUM findings beyond what the BRD coverage doc already recorded as deferred (11 non-`DocumentRecord` routes' wire-leak, `grantSecurityClearance` idempotency, `DocumentVaultView.tsx` left unrouted) — those are not re-reported here per the task instructions.

## Component substance check

| Component | File | Inputs | API calls | Data renders | Verdict |
|---|---|---|---|---|---|
| `MyDocumentsPanel` | `apps/web/src/modules/g13/MyDocumentsPanel.tsx` | `client: HrmsClient`, `employeeId: string`, `refreshToken: number` | `client.listMyDocuments(employeeId)` on mount/refresh (real `GET /api/v1/documents/employees/{id}`, live-verified 200 with real seeded data); `client.fetchDocument(documentId, intent)` on View/Download click (real `GET /api/v1/documents/{id}:fetch?intent=...`, live-verified via Playwright to return distinct VIEW render-token vs DOWNLOAD grant-token bodies) | Renders real document title, docNo, classification, legal-hold flag per item; renders real loading/error/empty states via shared `OperationalState`; renders live fetch-result grant details (`expiresInSeconds`, `versionNo`) and live fetch-error messages keyed off the real API error code | Real component — not a skeleton. Full state machine (loading/error/empty/ready), real network calls, real per-row interaction, real error-code-driven messaging. |

Design note (not a defect): "Download" issues a short-lived `grantToken` per the whole system's grant-based contract (`DocumentDownloadGrant`, no raw byte stream anywhere in the API), matching the VIEW render-token design. There is no `window.open`/blob-download wiring anywhere in this codebase for any module, so this is consistent platform-wide behavior, not an under-built affordance specific to G13.

## Traceability impact

No requirements, contracts, or state machines were changed by this diff — it closes gaps against the existing BRD §3.2/§3.3 rows that `brd-coverage-g13-personal-documents-self-service-2026-07-13.md` already traced. This review adds no new FR/AC; it validates the prior coverage doc's claims independently (live probes, not just re-reading its narrative) and finds them accurate.

## Required amendments

None. All findings are LOW severity, implementation-only, and repair-mode eligible — no requirement, contract, LLD, state-machine, or error-taxonomy amendment is needed.

## Verification commands

```bash
npm run build
node --test apps/api/test/personal-documents-self-service.test.cjs
npm run web:typecheck
npm run web:test
npx playwright test --config apps/web/playwright.config.ts personal-documents-self-service
```

All five ran clean in this review (build clean; 8/8 backend tests; web typecheck clean; 153/153 web unit tests; 1/1 Playwright e2e in 14.1s).

## Remaining risks

- **F1 (actor-trust thinning)**: not exploitable today through any real caller path in this repo, but is a latent footgun if a new actor-construction site (another HTTP bridge, a service-to-service caller) is added without preserving the `actorUserId === userId` invariant. Recommend addressing opportunistically, not urgently.
- **F3 (403/404 enumeration)**: standard low-severity signal, consistent with likely behavior elsewhere in the codebase; not unique to this feature. No evidence of practical exploitability beyond existence-confirmation (no content or metadata is exposed).
- Deferred items already recorded in the BRD coverage doc (11 non-`DocumentRecord` routes' wire-leak, `grantSecurityClearance` idempotency gap, unrouted `DocumentVaultView.tsx`) remain open and are intentionally not repeated here — see that document for owner/reasoning.
- This review did not re-audit the wider session's unrelated module changes (G01/G03/G05/G07/G08/G10/G11/G12 files also showing in `git status`) — scope was G13 personal-documents self-service only, per the task.
