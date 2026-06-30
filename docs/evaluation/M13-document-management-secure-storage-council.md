# Adversarial Idea Evaluator — Council Report

**Subject:** M13 — Document Management and Secure Storage BRD (v1)
**Framed question:** Is this DMS/Secure-Storage BRD complete, correct, and world-class (upload/versioning, encryption/KMS, classification access control, virus scan, OCR/search, retention/legal-hold/WORM, e-sign, audit, and the attach/fetch contract for all modules) for a leading global organisation's HRMS with public-sector statutory needs — and what makes it bulletproof?
**Documents read:** `docs/brd/v1/M13-document-management-secure-storage.md`, `docs/brd/SHARED_FOUNDATION.md`
**Method:** 5 independent advisors → anonymous peer review → chairman synthesis → adopted improvements.

---

## 1. The Five Advisors

### Advisor 1 — The Proponent

This is the strongest single-module BRD in the suite, and rightly so: M13 is the spine every other module hangs documents on, and it is specified as a true enterprise content service, not a file folder. Twenty entities give a coherent, normalised model — `documents` as a canonical reference with `document_versions`, `storage_objects`, `scan_results`, ACLs, retention, holds, disposition, and an append-only `document_audit`. The separation of *metadata in Postgres / binaries in object storage / DEKs wrapped by KMS* is exactly the layering Workday/SuccessFactors-class systems use, and envelope encryption with per-classification CMKs (Appendix B) is best practice.

The governance story is genuinely world-class for a public-sector archive: WORM enforced at the **storage object-lock layer** (FR-014, BR-1) rather than only in the app; legal hold that overrides retention (DI-4); maker-checker disposition with `proposed_by ≠ approved_by` (DI-10) ending in a certified destruction record with a retained tombstone hash; and an explicit "destruction is logical + physical, certificate retained" rule. That is records-management maturity most HRMS vendors never reach.

The attach/fetch contract (FR-003 / FR-016) is the right architectural bet — modules store only a `document_id`, never binaries, and link polymorphically through `document_links` (`module_code` + `entity_name` + `entity_ref_id` + `link_role`). One binary can be PROOF in M02 and EXHIBIT in M09 with two links and no duplication. The deny-by-default, DENY-wins ACL engine with four dimensions (RBAC + relationship + classification + need-to-know), sealed-record hiding from the subject, and authorization **post-filtering** of search results (not just rank suppression) are correctly stated. DLP auto-classification, dynamic watermarking, PAdES e-sign, redaction, certified true copies, and an immutable audit exportable for e-discovery round out a defensible, statutory-grade design. The error catalog, state tables, and 0-gap reconciliation make it genuinely buildable. This is a credible foundation.

### Advisor 2 — The Contrarian

The polish hides several load-bearing failures.

**1. Deduplication structurally breaks the encryption and crypto-shred story.** DI-6 reuses one `storage_objects` row for identical `content_hash` and increments `ref_count`. But each blob has a *unique DEK* and FR-005 BR-1 mandates a *dedicated CMK for CONFIDENTIAL+ separate from INTERNAL/PUBLIC*. If a CONFIDENTIAL doc and an INTERNAL doc share bytes, they share one blob, one DEK, one CMK — you cannot satisfy per-classification key separation and content dedup simultaneously. Worse, dedup makes **crypto-shredding impossible**: destroying the DEK to render a disposed document irrecoverable would destroy every co-referencing document.

**2. The dedup oracle leaks existence.** Dedup keyed on plaintext SHA-256 lets anyone who can upload a *guessed* file observe a hit (faster store, `ref_count`, the BRD's own "duplicate detected" edge case) and thereby confirm that a specific known document — a particular charge-sheet template, a named salary letter — already exists. That is a confirmation attack on a SECRET store.

**3. The signed-URL fetch bypasses audit, ACL and watermark.** FR-016 returns `contentUrl: https://blob.gov/...?sig=...`. That URL goes *direct to blob*, not through the gateway that FR-012 says "emits every audit event." So DOWNLOAD via signed URL escapes `document_audit`, escapes the mandatory CONFIDENTIAL+ watermark (FR-011 BR-3), and is forwardable within TTL — IDOR-by-URL on the most sensitive records, in a system whose entire value is "prove who accessed what."

**4. `clearance_level` is undefined.** §3.3 and FR-006 gate everything on `clearance_level ≥ document.classification`, but no field on `users`/`employees` and no entity stores a principal's clearance. The central access rule references an attribute that does not exist.

**5. The search index is a second, weaker copy of SECRET content.** OCR/extracted text is indexed in OpenSearch; post-filtering hides it at query time, but the raw index holds plaintext tokens of CONFIDENTIAL/SECRET documents with no stated encryption-at-rest or exclusion rule — a parallel exfiltration surface outside the encrypted blob store.

**Risk the author missed:** **PAdES signatures and the audit log are not durable over the decades these records live.** A PAdES signature without RFC-3161 trusted timestamping and LTV becomes unverifiable the moment the signer's certificate expires/revokes — guaranteed for 30-year and permanent records. And audit "immutability" is only DB-grant-enforced (DI-3), so a privileged DBA defeats the tamper-evidence the whole module promises. Both must be cryptographically anchored.

### Advisor 3 — The First Principles Thinker

Strip it to essence: M13 must do three irreducible things — (a) store a byte-stream durably and confidentially, (b) hand other modules a stable reference and a permissioned way to get it back, (c) prove custody (who/when/immutable) for statutory records. Everything else is feature.

The hidden assumption is that all of this must be **built**. The BRD silently specifies an in-house OpenText/Documentum/Veeva-Vault — *plus* DocuSign (FR-010), *plus* AWS Macie (DLP, FR-016), *plus* Textract (OCR, FR-008), *plus* a redaction studio (FR-011). That is four mature commercial categories rebuilt at once. The justification — "CGG on-prem government cloud" — is real but unstated, and it is doing enormous work. If managed/COTS services *are* reachable, most of FR-008/010/011/016's engine logic is buy-not-build and the BRD should specify *integration contracts*, not *implementations*.

The cleaner decomposition is **object store + thin metadata + pluggable services**: S3-compatible object-lock for durability/WORM, KMS for keys, a small metadata/ACL/audit core (the genuinely bespoke part — the four-dimensional authorization engine and the attach/fetch contract are the real intellectual property here), and *adapters* to AV, OCR, DLP, and signing providers behind interfaces. The BRD half-acknowledges this (`StorageProvider` interface, FR-016) but only for storage; it should apply the same provider-abstraction discipline to AV/OCR/DLP/PKI so the build is a *thin orchestration layer*, not a content-processing platform.

A second first-principles tension: **WORM + dedup + crypto-shred + DPDP erasure cannot all be literally true.** Immutability says "never change the bytes"; dedup says "share the bytes"; crypto-shred says "destroy the key to forget"; DPDP erasure says "remove this person's data on request." These pull in four directions and the BRD treats each in isolation. The honest model names the *precedence lattice*: statutory retention / legal hold > WORM > DPDP erasure (via legal-basis exemption, fulfilled by crypto-shred only where no shared blob), and dedup is permitted *only within a single key/classification/security domain* so shredding is local. Make the lattice explicit and the contradictions dissolve.

### Advisor 4 — The Outsider

I am the records clerk and the M07 developer who must *use* this. Two problems: it is intimidating, and a few simple things are missing under the sophistication.

The vocabulary wall is real — PAdES, envelope encryption, wrapped DEK, object-lock retain-until, crypto-shred, ICAP, deferrable FK, "convergent" dedup. There is no one-paragraph "what happens when I drag a PDF in" story for a non-engineer, and the glossary, while present, sits at the very end. A government records officer approving a disposition needs a plain narrative, not a state table.

The **role roster is overloaded and overlapping**: Document Owner vs Employee (Self-Service) do nearly the same thing; "DMS Librarian / Records Officer" vs "Records Manager (Custodian)" vs "Security/DLP Officer" split duties in ways that will confuse a 200-person office that has *one* person doing all three. Nine module roles on top of the nine shared roles is a lot to provision. And the matrix gates everything on a "clearance level" the org has no obvious process to *assign* — who decides a clerk is CONFIDENTIAL-cleared, and where is that recorded?

For the integrating developer, the attach example is good but the **fetch contract is ambiguous on the most basic question**: if I have VIEW but not DOWNLOAD, what does `:fetch` give me? It returns a `contentUrl` to the raw file either way — so VIEW-only leaks the downloadable bytes. A normal developer will not notice the watermark/audit subtlety and will happily expose the URL. The contract should make "view = streamed watermarked render" and "download = file" *structurally different responses*, so the easy path is the safe path. Finally, "print is audited" reads as a promise the Outsider knows browsers cannot keep; Appendix D admits it — but the permission matrix and FR-012 still say P/print as if it were enforced. Be honest in the body, not only the appendix.

### Advisor 5 — The Executor

Feasibility is high but the **sequencing buries the real critical path**. M13 is the long pole for the *entire program*: M01–M12 cannot finish their document features until M13's attach/fetch contract and `documents` entity exist. The build order (§16.2) correctly starts with storage+KMS, but it treats M13 as self-contained. In reality the **Monday step is: freeze and publish a stub/mock attach/fetch contract (`:attach`, `:fetch`, error catalog, `document_id` semantics) on day one** so all 13 other module teams develop against a contract while M13's internals are built behind it. Without that, M13 serialises the whole suite.

Dependencies that will bite: (1) **KMS is a single point of catastrophic failure** — "KMS down ⇒ 503, no plaintext fallback" is correct security but there is no key-DR/escrow/recovery runbook; lose or corrupt a CMK and every document is permanently dark. That is the #1 availability risk and it is unspecified. (2) **Object-lock semantics differ by provider** — true WORM (S3 Object Lock COMPLIANCE mode) vs the "government blob" backend may not be equivalent; the WORM guarantee must be proven on the *actual* CGG storage before FR-014 is credible (the launch checklist has one line for this — good, but it should be a gating spike, not a checkbox). (3) **AV/OCR/DLP/PKI are four external integrations**, each with its own latency, outage, and licensing reality; the async pipeline (scan→OCR→index→DLP) is correct but needs a durable queue, dead-letter handling, and back-pressure that the BRD only gestures at.

Practical scope cut for v1: defer redaction (FR-011 redaction), certified-copy studio, and DRAWN e-sign; ship upload + encryption + WORM + audit + attach/fetch + access control + AV first. That is the bulletproof core; the rest is fast-follow. Estimate the bespoke authorization engine and the audit-immutability work as the highest-risk, longest-pole *code*, distinct from the integrations.

---

## 2. Anonymous Peer Review

*Advisors anonymised A–E (A=Proponent, B=Contrarian, C=First Principles, D=Outsider, E=Executor).*

**Reviewer 1 (on B, the Contrarian).**
*Strongest:* The dedup-vs-CMK-vs-crypto-shred contradiction (B-1) is the single most important finding — it is a genuine architectural impossibility, not a nitpick, and it cascades into disposition and DPDP. Convincing because it ties three "good" rules into a knot.
*Biggest blind spot:* B asserts the signed URL bypasses audit but doesn't acknowledge the BRD's own NFR ("no raw storage keys to clients") shows *intent* to proxy — B should distinguish "wrong" from "underspecified."
*Missed by all five:* No one costed the **migration** risk — re-ingesting decades of legacy scans through scan+OCR+dedup+encrypt is a multi-month batch with its own failure modes (§15 is one page).

**Reviewer 2 (on C, the First Principles Thinker).**
*Strongest:* Naming the precedence lattice (retention/hold > WORM > erasure; dedup only within a key domain) is the unifying insight that resolves four scattered contradictions at once.
*Biggest blind spot:* C's "buy not build" is right in spirit but hand-waves that the *government on-prem* constraint may genuinely forbid SaaS DocuSign/Macie/Textract for PII — the build may be forced, and C should weigh data-sovereignty before recommending COTS.
*Missed by all five:* **Backup/restore of the metadata Postgres** and its consistency with the immutable object store and KMS — a point-in-time DB restore could resurrect a disposed document's metadata while its blob is gone (or vice-versa).

**Reviewer 3 (on A, the Proponent).**
*Strongest:* Correctly identifies the attach/fetch contract and four-dimension ACL as the real, irreplaceable IP — the part worth building well.
*Biggest blind spot:* A praises "audit immutability" at face value (DI-3) without noticing it is only DB-grant-enforced and defeatable by a DBA — the very claim the module sells.
*Missed by all five:* **Notifications leak metadata** — emails like "Action: sign {docNo}" / "Legal hold {holdNo}" route document and matter identifiers through email; for SECRET/sealed matters even the existence is sensitive (the BRD says "omit content" but not "omit identifiers for sealed/SECRET").

**Reviewer 4 (on E, the Executor).**
*Strongest:* "Publish the stub attach/fetch contract on day one" is the highest-leverage action in the whole report — it unblocks 13 teams and de-risks the program critical path.
*Biggest blind spot:* E defers redaction/certified-copy but for a *statutory* archive certified true copies are a legal necessity (RTI/disclosure), not a nice-to-have — the cut may be wrong for public sector.
*Missed by all five:* **No SoD on legal-hold *release***. Placement and release are both "Legal Hold Admin"; release re-enables destruction and is the single most dangerous action in e-discovery — it needs dual control, which the BRD requires for disposition but not for the hold that gates it.

**Reviewer 5 (on D, the Outsider).**
*Strongest:* The VIEW-vs-DOWNLOAD fetch ambiguity is a usability finding that is *also* a security finding — "make the easy path the safe path" is exactly right and developers will get it wrong as written.
*Biggest blind spot:* D underweights that the role overlap is partly deliberate SoD (placer ≠ approver) — collapsing roles naively would *break* segregation; the fix is clearer naming/provisioning, not fewer roles.
*Missed by all five:* **Anti-brute-force on `/shared/{token}` and break-glass** — opaque token + bcrypt password is good, but there is no rate-limit/lockout on password attempts against a public link endpoint.

---

## 3. Chairman Synthesis

### Agreements (high consensus)
- The **attach/fetch contract + four-dimensional deny-by-default ACL + storage/KMS/WORM/audit core** is the right, world-class skeleton and the genuine IP worth building.
- The BRD is **strong on governance** (WORM at storage layer, legal hold > retention, maker-checker disposition, tombstones) — ahead of most commercial HRMS.
- Several "individually correct" rules **collide**: dedup, per-classification CMK, crypto-shred, WORM, and DPDP erasure cannot all be literally satisfied without an explicit precedence lattice and a dedup security-domain boundary.
- The **signed-URL fetch** as written undermines audit, watermark, and the VIEW/DOWNLOAD distinction — the system's core promises.

### Clashes
- **Build vs buy (C vs A/E):** C wants a thin orchestration layer over COTS AV/OCR/DLP/PKI; A/E note the government on-prem/sovereignty constraint may force the build. *Resolution: not fundamental — adopt provider-abstraction for all four engines (already done for storage) so build-vs-buy becomes a deployment choice, not an architecture rewrite.*
- **Scope cut (E vs Reviewer 4):** E defers certified copies/redaction; Reviewer 4 says certified true copies are statutorily mandatory. *Resolution below (focused pass).*

### Blind spots none caught well
- Legacy **migration** scale/risk (one page for a multi-month, multi-million-file batch).
- **DB restore vs immutable-store/KMS consistency** (restore can resurrect disposed metadata).
- **Notification metadata leakage** for sealed/SECRET matters.

### Idea evolution
The proposal should evolve from "a comprehensive ECM we will build" to "a **thin, bespoke custody-and-contract core** (documents, attach/fetch, four-dimensional ACL, cryptographically-anchored audit, WORM/retention/hold lattice) wrapping **provider-abstracted engines** (AV/OCR/DLP/PKI/storage), governed by an explicit precedence lattice, with the contract frozen and stubbed on day one." That keeps every strength, removes the contradictions, and de-risks the program critical path.

### Focused second pass — the one FUNDAMENTAL clash (certified copies: defer vs mandatory)
Resolution: **Split FR-011.** Watermarking and **certified true copies are v1** (statutory/RTI necessity, and certified copies are simple stamped+optionally-signed renditions reusing the version+WORM machinery already built). **Interactive redaction is fast-follow** (it is a genuine studio with irreversibility-verification complexity and lower day-one demand; disclosure can be served by certified copy + manual redaction interim). This satisfies both the statutory obligation (Reviewer 4) and the risk-based sequencing (E).

### Risk Register

| # | Risk | Severity | Source Advisor | Mitigation |
|---|------|----------|----------------|------------|
| R1 | Dedup vs per-classification CMK vs crypto-shred contradiction (cannot satisfy all) | Critical | B / C | Scope dedup to one classification/key/security domain; add `key_scope` to `storage_objects`; never dedup cross-classification; document that shared blobs preclude crypto-shred |
| R2 | Signed-URL fetch bypasses audit, watermark, ACL; forwardable IDOR | Critical | B / D | Bind signed URL to user+session(+IP), short TTL, one-time use; route downloads through audited proxy; split VIEW (watermarked render) vs DOWNLOAD (file) |
| R3 | `clearance_level` referenced but undefined in the data model | Critical | B / D | Add clearance attribute/entity for principals; define assignment workflow + audit |
| R4 | PAdES signatures not durable (no RFC-3161 TSA / LTV) for decade-long records | Critical | B | Mandatory trusted timestamp + PAdES-LTV (OCSP/CRL embedding); store timestamp tokens |
| R5 | Audit log immutability only DB-grant-enforced; defeatable by DBA | High | B / Rev3 | Hash-chain `document_audit` (`prev_hash`/`row_hash`); periodically anchor to WORM/external notary |
| R6 | KMS is single point of catastrophic, unrecoverable failure | High | E | CMK backup/escrow, multi-region/HSM replication, key-recovery runbook; key-loss behavior defined |
| R7 | Search index = unencrypted second copy of SECRET content | High | B | Encrypt index at rest, access-scope it; exclude SECRET/TOP_SECRET full-text (metadata-only) or per-domain index |
| R8 | DPDP erasure vs statutory retention/WORM/hold unreconciled | High | C | Precedence lattice + BR: statutory/legal-basis exemption overrides erasure; else crypto-shred; data-subject-request entity |
| R9 | Dedup oracle confirms existence of known documents | High | B | Scope dedup to security domain; suppress user-visible dedup signals; consider keyed hash |
| R10 | Legal-hold release has no SoD; re-enables destruction | High | Rev4 | Dual control + reason on hold *release* (and high-value placement); audit |
| R11 | Legal hold (SAVED_SEARCH/EMPLOYEE) doesn't capture future-matching docs | High | B | Continuous-evaluation job auto-holds new matches while active; custodian hold-notice + acknowledgement |
| R12 | Disposition on stale/incorrect retention anchor (no event contract) | High | B | Event-driven anchor recompute (M01/M09/M11 outbox); block auto-destroy without confirmed final anchor |
| R13 | Over-build: rebuilding DocuSign+Macie+Textract+ECM at once | Med-High | C / E | Provider-abstract AV/OCR/DLP/PKI behind interfaces; thin orchestration; phase advanced FRs |
| R14 | M13 serialises the whole program (critical-path long pole) | High | E | Freeze + publish stubbed attach/fetch contract day one; 13 teams build against mock |
| R15 | Orphaned documents have no owner/lifecycle (only "flagged") | Med | B | Orphan-reaper FR/job + default retention + review queue + state |
| R16 | No anti-brute-force on `/shared/{token}` password / break-glass | Med | Rev5 | Rate-limit + lockout + alerting on share/break-glass auth attempts |
| R17 | OCR/preview/render workers DoS-able by crafted files | Med | B | Sandbox renderers; resource/decompression limits beyond AV archive-depth |
| R18 | Legacy migration scale/risk underspecified | Med | Rev1 | Treat as a gated programme: phased ingest, reconciliation SLAs, failure/dead-letter handling |
| R19 | DB point-in-time restore vs immutable store/KMS inconsistency | Med | Rev2 | Restore runbook reconciling metadata with disposed blobs/keys; consistency checks |
| R20 | Notifications leak doc/matter identifiers for sealed/SECRET items | Med | Rev3 | Suppress identifiers for sealed/SECRET; generic notice + in-app secure retrieval |
| R21 | Data residency/sovereignty of replicas unspecified | Med | C | NFR: all replicas (incl. cross-zone) in-country; DPDP localisation |
| R22 | TOP_SECRET + heavy check-in/out are likely over-engineering | Low-Med | C / D | Drop/justify TOP_SECRET; make check-out optional per type (M13 doesn't author content) |

### Recommendation
**Proceed — the BRD is a strong, defensible foundation — but it is not yet bulletproof.** Treat v2 as a *correctness and contradiction-resolution* pass, not a rewrite. The skeleton (entities, attach/fetch, ACL, WORM, audit, governance) stays. Fix the four Critical items (R1–R4) and the audit-immutability + KMS-DR + search-index + DPDP-lattice High items before build, freeze the contract day one, abstract the four engines, and phase redaction as fast-follow. Done, this is best-in-class for a statutory government HRMS.

### The One Thing To Do First
**Freeze and publish the stubbed attach/fetch contract and `documents` entity (with the corrected VIEW-vs-DOWNLOAD fetch and a defined `clearance_level`) on day one** — it is the program's critical path that unblocks all 13 other modules, and pinning it now forces resolution of the fetch/audit/watermark hole (R2) and the clearance gap (R3) before they calcify.

---

## Adopted Improvements for BRD v2

1. **Define `clearance_level`.** Add a principal-clearance attribute (new `security_clearances` entity or `users.clearance_level` field) plus an assignment/approval workflow and audit; FR-006/§3.3 must reference a real field. *(R3)*
2. **Resolve dedup vs key-separation.** Add `key_scope`/`security_domain` to `storage_objects`; permit dedup **only within one classification/key domain**; prohibit cross-classification dedup; state explicitly that shared blobs preclude crypto-shred. *(R1, R9)*
3. **Eliminate the dedup oracle.** Scope dedup per security domain, suppress user-visible "duplicate detected" signals, and consider a keyed/HMAC dedup index; add a rule that dedup never reveals existence across principals. *(R9)*
4. **Fix the fetch contract.** Make `:fetch` return **structurally different** responses for VIEW (short-TTL, one-time, session/user-bound *streamed watermarked render* through an audited proxy) vs DOWNLOAD (file, only with DOWNLOAD right); never hand a raw forwardable blob URL for CONFIDENTIAL+; ensure every served byte writes `document_audit`. *(R2)*
5. **Make signatures decade-durable.** Mandate RFC-3161 trusted timestamping and **PAdES-LTV** (embed OCSP/CRL) for all signatures and statutory/WORM documents; add fields/entity for timestamp tokens and revocation data so signatures remain verifiable after certs expire. *(R4)*
6. **Cryptographically anchor the audit log.** Hash-chain `document_audit` (add `prev_hash`, `row_hash`) and periodically anchor digests to WORM/external notary, so immutability is provable, not merely DB-grant-enforced. *(R5)*
7. **Restrict signature methods by document type.** Remove/limit `DRAWN` for statutory orders; require DSC or Aadhaar eSign (IT Act §3A) for statutory types; record the legal basis per signature. *(quality/legal)*
8. **Add a KMS key-DR/escrow policy.** CMK backup, multi-region/HSM replication, documented key-recovery runbook, and defined behavior on key loss; elevate KMS to a named top-tier availability risk in NFRs. *(R6)*
9. **Secure the search index.** Require encryption-at-rest and access-scoping on the index, and **exclude SECRET/TOP_SECRET full text** (metadata-only) or use a separately-secured per-domain index. *(R7)*
10. **Add a DPDP precedence lattice.** New business rule and a `data_subject_requests` entity: statutory retention / legal hold / WORM override erasure via legal-basis exemption; where no statutory basis exists, fulfil erasure by domain-local crypto-shred. *(R8)*
11. **Add SoD on legal-hold release.** Dual control + mandatory reason for releasing a hold (and high-value placement), mirroring disposition maker-checker. *(R10)*
12. **Make holds capture future matches.** Continuous-evaluation job auto-adds new documents matching an active SAVED_SEARCH/EMPLOYEE/CASE hold; add a custodian hold-notice + acknowledgement workflow. *(R11)*
13. **Specify event-driven anchor recompute.** M13 subscribes to M01/M09/M11 lifecycle events (retire/case-close) via an outbox/event bus to compute disposition dates; block auto-DESTROY without a confirmed final anchor; recompute safely on anchor correction. *(R12)*
14. **Provider-abstract all four engines.** Apply the storage-provider pattern to AV, OCR, DLP, and PKI behind interfaces so the build is thin orchestration and build-vs-buy is a deployment choice. *(R13)*
15. **Freeze + stub the attach/fetch contract day one.** Publish a mock `:attach`/`:fetch` + error catalog so the other 13 modules build against the contract while M13 internals are constructed. *(R14)*
16. **Add an orphaned-document lifecycle.** New FR/job (orphan reaper), default retention for zero-link documents, a review queue, and an explicit state — not just "flagged in housekeeping." *(R15)*
17. **Add anti-brute-force controls.** Rate-limit + lockout + alerting on `/shared/{token}` password attempts and on break-glass authentication. *(R16)*
18. **Sandbox and resource-limit OCR/preview/render workers** against decompression/billion-laughs/nested-PDF DoS, treating render of untrusted content as hostile. *(R17)*
19. **Phase scope deliberately.** v1 = upload + encryption + WORM + audit + attach/fetch + ACL + AV + **certified true copies** (statutory necessity) + watermark; **fast-follow = interactive redaction**. Make heavy check-out/check-in optional per type (M13 doesn't author content); drop/justify `TOP_SECRET`. *(R13, R22, focused-pass resolution)*
20. **Harden migration, restore, residency, and notifications.** Treat legacy migration as a gated programme with reconciliation SLAs and dead-letter handling; add a DB-restore-vs-immutable-store/KMS consistency runbook; add a data-residency NFR (all replicas in-country); suppress doc/matter identifiers in notifications for sealed/SECRET items. *(R18, R19, R20, R21)*
21. **Add a plain-language "upload-to-active" narrative** and consolidate/clarify overlapping roles (Document Owner vs Employee; Librarian vs Records Officer vs Records Manager) and clearance assignment, without breaking SoD. *(usability)*
