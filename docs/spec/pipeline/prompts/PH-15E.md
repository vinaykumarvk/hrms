/goal
  objective: Build G13 envelope encryption and the DPDP data-subject-request lattice at BRD depth. The coverage
    delta (docs/reviews/brd-coverage-delta-20260703.md) names "KMS envelope encryption" and "DPDP DSR" as still
    NOT_FOUND after PH-10C hardened hashing, scan gating, clearances, and disposition SoD. Implement per
    FR-G13-005: real envelope encryption behind an injectable KeyProvider interface — every stored blob encrypted
    with a unique per-object DEK using AES-256-GCM, the DEK wrapped by a master key so only wrapped_dek +
    kms_key_id are persisted (plaintext DEKs and blobs never stored), with a local master-key implementation of
    the KeyProvider for this environment; key rotation re-wraps DEKs under the new master key WITHOUT re-encrypting
    or rewriting object bytes (JOB-G13-KEYROTATE semantics); decryption with the wrong key fails closed. Per
    FR-G13-018: data_subject_requests with the erasure-vs-retention precedence lattice (VAL-G13-LATTICE / DI-15) —
    statutory retention, active legal hold, and WORM override erasure with outcome EXEMPT_RETAINED plus a recorded
    legal basis; only non-exempt documents erase via the redaction-marker path (documents.dpdp_erasure_state
    updated, audit PII overwritten with the redaction marker); the request lifecycle
    (RECEIVED -> UNDER_REVIEW -> EXEMPTED/PARTIALLY_FULFILLED/FULFILLED/REJECTED) is persisted and auditable.
  context:
    - docs/reviews/brd-coverage-delta-20260703.md      # G13 remaining: KMS envelope encryption, DPDP DSR
    - docs/brd/v3/G13-document-management-secure-storage.md   # FR-G13-005 (AES-256-GCM DEK, wrapped_dek/kms_key_id,
                                                       #   JOB-G13-KEYROTATE re-wrap), FR-G13-018 (E22
                                                       #   data_subject_requests, VAL-G13-LATTICE, EXEMPT_RETAINED,
                                                       #   redaction-marker path, dpdp_erasure_state);
                                                       #   ERR-G13-ERASURE_EXEMPTED, ERR-G13-LEGAL_HOLD_ACTIVE,
                                                       #   ERR-G13-INTEGRITY_FAILED, ERR-G13-SOD_VIOLATION
    - docs/data-model/13-G13-document-management.sql   # authoritative table/column names
    - apps/api/src/modules/g13/** , apps/api/src/routes/g13.routes.ts   # PH-10C vault hardening to build on
    - apps/api/test/ph10c-g13-vault-hardening.test.cjs # existing vault test conventions (fake providers injectable)
  constraints:
    - Real cryptography, not markers: use node:crypto aes-256-gcm with a fresh random DEK + IV per object and
      auth-tag verification on decrypt; a runtime encrypt/decrypt round-trip must be exercised by an executed test.
    - KeyProvider is an injectable interface (like the PH-10C ScanProvider seam) with a local master-key
      implementation; key material comes from environment/config — never hardcode secrets or log key bytes.
    - Rotation re-wraps: after rotating the master key, previously stored objects still decrypt and the stored
      ciphertext bytes are unchanged (assert byte-identity of the stored object across rotation in a test).
    - Wrong-key decryption fails closed with a thrown error (surface as the registered integrity failure,
      ERR-G13-INTEGRITY_FAILED) and never returns partial plaintext.
    - Lattice precedence is deny-erasure-first: statutory retention / active legal hold / WORM -> EXEMPT_RETAINED
      with legal_basis_exemption recorded; erasure attempted against a held/retained/WORM document is blocked with
      error.code === 'ERR-G13-ERASURE_EXEMPTED' (409, the registered "DPDP erasure overridden by statutory/hold/
      WORM basis" code); the DPO who exempts is not the executor (reuse the ERR-G13-SOD_VIOLATION guard).
    - Erasure of non-exempt documents follows the redaction-marker path: dpdp_erasure_state updated and audit PII
      replaced by the redaction marker — no physical deletion of audit rows.
    - Parameterised queries only; transactions around multi-step writes; no console.log; no stack traces in responses.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: Envelope encryption + rotation
      max_iterations: 8
      repeat_until: apps/api/src/modules/g13/** encrypts stored blobs with per-object AES-256-GCM DEKs wrapped via
        the KeyProvider (only wrapped_dek + kms_key_id persisted), decrypts through unwrap + auth-tag verification,
        rotates by re-wrapping DEKs without touching ciphertext, and fails closed on a wrong key.
      steps: [KeyProvider interface + local impl, encrypt path, decrypt + fail-closed, rotation re-wrap]
    - name: DSR lattice + erasure path
      max_iterations: 8
      repeat_until: data_subject_requests persist the lifecycle; ERASURE evaluates each in-scope document against
        the VAL-G13-LATTICE precedence (retention/hold/WORM -> EXEMPT_RETAINED + basis); non-exempt documents
        erase via the redaction-marker path updating dpdp_erasure_state; blocked erasure throws the registered code.
      steps: [DSR store + lifecycle, lattice evaluator, exempt outcomes + basis, redaction-marker erasure]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains (a) a runtime encrypt/decrypt round-trip test on real bytes, (b) a
        rotation test asserting old objects decrypt and ciphertext is byte-identical, (c) NEGATIVE wrong-key
        decrypt asserting a thrown ERR-G13-INTEGRITY_FAILED, (d) NEGATIVE erasure blocked by legal hold asserting
        error.code === 'ERR-G13-ERASURE_EXEMPTED', (e) a lattice test covering
        EXEMPT_RETAINED vs fulfilled erasure with dpdp_erasure_state transitions; `npm run typecheck` + `npm test`
        pass; `bash docs/spec/pipeline/checks/ph-15e.sh` RED items all closed.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g13/** naming KeyProvider, aes-256-gcm, wrapped_dek, kms_key_id, data_subject_requests,
      VAL-G13-LATTICE, EXEMPT_RETAINED, dpdp_erasure_state and the ERR codes above
    - apps/api/test/*.test.cjs: round-trip + rotation tests + both fail-closed negatives + lattice coverage
    - `bash docs/spec/pipeline/checks/ph-15e.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - A retention floor or lattice precedence case is not decidable from the BRD (surface the precise question;
      do not guess an erasure outcome).
    - Real KMS/HSM integration is required beyond the KeyProvider seam (record as an integration dependency; the
      local master-key impl stays injectable).
    - The redaction-marker path in the audit substrate is missing a hook (raise against the P05 substrate owner;
      do not delete audit rows).
