/goal
  objective: Harden the G13 document vault to BRD security depth. The audit shows attach/version/hold slices with no
    real content integrity, no malware gate, no clearance enforcement, no access audit intent, no disposition SoD.
    Implement: content_hash computed server-side as real SHA-256 over the uploaded BYTES and re-verified on every
    fetch (mismatch -> ERR-G13-INTEGRITY_FAILED, content withheld); the DI-11 scan gate — new content enters
    PENDING_SCAN and only a scan-CLEAN result promotes to ACTIVE, behind an injectable scan-provider interface
    (fake provider in tests; INFECTED result -> QUARANTINED and unfetchable); a security_clearances store with a
    DENY-BY-DEFAULT classification gate (no clearance record => no access to CONFIDENTIAL+; ERR-G13-CLEARANCE_INSUFFICIENT);
    access-audit events for VIEW/DOWNLOAD captured via the fetch intent parameter (:fetch?intent=, missing intent ->
    ERR-G13-FETCH_INTENT_REQUIRED); and retention classes with disposition maker!=checker SoD (ERR-G13-SOD_VIOLATION).
  context:
    - docs/reviews/brd-coverage-audit-20260702.md      # G13: KMS/scan/clearance/DPDP absent; 28/43 NOT_FOUND
    - docs/brd/v3/G13-document-management-secure-storage.md   # E15 scan_results, E21 security_clearances, E12 document_audit,
                                                       #   E18 disposition_records; ERR-G13-INTEGRITY_FAILED, ERR-G13-MALWARE_DETECTED,
                                                       #   ERR-G13-CLEARANCE_INSUFFICIENT, ERR-G13-FETCH_INTENT_REQUIRED, ERR-G13-SOD_VIOLATION; DI-11
    - docs/data-model/13-G13-document-management.sql   # authoritative table/column names
    - apps/api/src/modules/g13/** (PH-10A version rows + locks) , apps/api/src/routes/g13.routes.ts
    - apps/api/src/platform/audit/** , apps/api/src/platform/authorization/**   # audit + P02 surfaces to reuse
  constraints:
    - content_hash is computed by the service from the bytes it stores — never trusted from the caller; fetch
      recomputes and compares before returning content; a mismatch withholds content, raises
      ERR-G13-INTEGRITY_FAILED, and writes a security audit event.
    - Scan gate is fail-closed: PENDING_SCAN content is not fetchable for normal intents; only a CLEAN scan_results
      row promotes to ACTIVE; INFECTED quarantines (status QUARANTINED, fetch blocked, MSG/audit emitted). The scan
      provider is an interface (DI-11); tests inject a fake returning CLEAN or INFECTED deterministically.
    - Clearance gate is deny-by-default: access to a classified document requires an ACTIVE security_clearances row
      at or above the document's classification_level; absence of a row denies (never defaults to allow), raising
      ERR-G13-CLEARANCE_INSUFFICIENT.
    - Every content fetch requires an explicit intent (VIEW, DOWNLOAD, ...); the access event (actor, document,
      version, intent) lands in the append-only document_audit ledger.
    - Disposition: the approving checker must differ from the proposing maker (ERR-G13-SOD_VIOLATION); retention
      classes bind documents to disposition eligibility; legal hold still blocks execution.
    - Executed NEGATIVE tests required: (1) hash mismatch on fetch -> ERR-G13-INTEGRITY_FAILED, (2) INFECTED ->
      QUARANTINED and fetch blocked, (3) no-clearance fetch of a classified doc denied fail-closed. Plus a
      maker==checker disposition rejection test.
    - Parameterised queries; transactions; no console.log; no stack traces; never log document contents or PII values.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Byte integrity + scan gate
      max_iterations: 7
      repeat_until: content_hash is SHA-256 of stored bytes, verified on fetch with ERR-G13-INTEGRITY_FAILED on
        mismatch; PENDING_SCAN -> CLEAN -> ACTIVE and INFECTED -> QUARANTINED flows work through the injectable
        scan-provider interface.
      steps: [server-side hashing + fetch verification, scan provider interface + fake, scan state machine]
    - name: Clearance, intent audit, disposition SoD
      max_iterations: 7
      repeat_until: security_clearances deny-by-default gate guards classified fetches; :fetch requires intent and
        writes VIEW/DOWNLOAD events to document_audit; disposition maker!=checker enforced with retention classes.
      steps: [clearance store + gate, fetch intent + access audit, retention classes + disposition SoD]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains the three NEGATIVE tests plus the SoD rejection test; `npm run typecheck`
        + `npm test` pass; `bash docs/spec/pipeline/checks/ph-10c.sh` GREEN.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g13/** hardening code naming the BRD entities/codes above
    - apps/api/test/*.test.cjs: integrity-mismatch, quarantine, clearance-deny, disposition-SoD tests
    - `bash docs/spec/pipeline/checks/ph-10c.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - Real KMS/crypto-shred or an external scanner is required beyond the interface boundary (stub only behind DI-11,
      record the integration debt; do not fake CLEAN results outside tests).
    - Classification-lattice rules conflict between BRD and P02 grants for a concrete case — surface, fail closed.
