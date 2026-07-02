/goal
  objective: Build the G12 admissibility and distribution layer at BRD depth. The coverage delta
    (docs/reviews/brd-coverage-delta-20260703.md) names "sect. 65B certificates, LTV renewal, subscriptions/feed"
    as still NOT_FOUND after PH-10B built verify/tamper-detect, Merkle anchors, and certified extracts. Implement
    per FR-18: sr_authenticity_certificates (E24) — a sect. 65B / Bharatiya Sakshya Adhiniyam certificate for a
    certified extract binding the extract's content_digest, the covering anchor_id (chain head at issue), the
    statute_reference, and a structured chain-of-custody assembled from ledger/provenance/attestation data (never
    free-typed), with issuance access-logged as GENERATE_65B and refused when the certificate digest does not
    match the extract or the underlying chain fails verification (tamper). Per FR-13: sr_subscriptions with an
    authenticated pull feed (since_seq cursor, per-subscriber last_delivered_seq) delivering only the subscriber's
    registered event_categories with minimised payloads — no cross-subscriber/cross-tenant leak — and WEBHOOK/
    MESSAGE_BUS registration rejected with SR_DELIVERY_MODE_DEFERRED. Per FR-19: sr_ltv_renewals (E25) recording
    re-anchor/renewal events over existing anchors (RE_ANCHOR / ALGORITHM_MIGRATION) such that no historical
    entry_hash is recomputed or overwritten and renewed artefacts still verify.
  context:
    - docs/reviews/brd-coverage-delta-20260703.md      # G12 remaining: 65B certificates, LTV renewal, subscriptions/feed
    - docs/brd/v3/G12-digital-service-register.md      # FR-18 (E24 sr_authenticity_certificates, GENERATE_65B,
                                                       #   BR-18.1 statutory extracts only), FR-13 (sr_subscriptions,
                                                       #   since_seq/last_delivered_seq, SR_DELIVERY_MODE_DEFERRED,
                                                       #   payload minimisation), FR-19 (E25 sr_ltv_renewals,
                                                       #   no historical hash rewrite)
    - docs/data-model/12-G12-digital-service-register.sql   # authoritative table/column names
    - apps/api/src/modules/g12/** , apps/api/src/routes/g12.routes.ts   # PH-10B chain/anchor/extract substrate to build on
    - apps/api/test/ph10b-integrity-pillars.test.cjs   # existing chain/anchor/tamper test conventions
  constraints:
    - A 65B certificate is only issued for a qualified-signed statutory extract (BR-18.1), and only after the
      extract's chain verifies against its covering anchor; a tampered chain or digest mismatch refuses issuance
      fail-closed (FR-18 AC4) — assert the refusal as a thrown error code in an executed test.
    - The chain-of-custody block is generated from stored ingestion/attestation/supersession data (BR-18.2);
      it must not accept a caller-supplied custody narrative.
    - The pull feed is scoped per subscriber: cursor state lives on the subscription (last_delivered_seq), events
      are filtered to the subscription's event_categories and tenant scope, and a subscriber can never read
      another subscriber's cursor or another tenant's events — cover the cross-subscriber negative in a test.
    - Feed payloads are minimised (sr_event_id, category, employee ref, content reference — not full sensitive
      payloads); subscribers dedupe by sr_event_id; corrigenda/reversals re-emit on the feed.
    - LTV renewal is additive evidence: a renewal writes an sr_ltv_renewals row and a new anchor over existing
      chain heads; original signed bytes and historical entry_hash values are never recomputed or overwritten —
      assert post-renewal verification of pre-renewal entries in a test.
    - Parameterised queries only; transactions around multi-step writes; no console.log; no stack traces in responses.
    - Do NOT weaken any oracle under docs/spec/pipeline/checks/**; do NOT touch phases.yaml, .state/, or approvals/.
  work_loops:
    - name: 65B certificates over the verified chain
      max_iterations: 8
      repeat_until: apps/api/src/modules/g12/** issues sr_authenticity_certificates for statutory extracts binding
        content_digest + anchor_id + statute_reference + generated chain-of-custody, logs GENERATE_65B, and
        refuses issuance on digest mismatch or failed chain verification.
      steps: [certificate record + digest/anchor binding, custody assembly from stored data, tamper-refusal gate, access log]
    - name: Subscriptions feed + LTV renewals
      max_iterations: 8
      repeat_until: sr_subscriptions register categories and serve GET feed?since_seq= scoped to the subscriber
        (cursor advance, category/tenant filter, minimised payload, WEBHOOK -> SR_DELIVERY_MODE_DEFERRED); and
        sr_ltv_renewals record RE_ANCHOR/ALGORITHM_MIGRATION renewals over existing anchors with prior entries
        still verifying unchanged.
      steps: [subscription store + activation, cursor feed + scoping, deferred-mode rejection, renewal + re-anchor]
    - name: Oracle tests + verify
      max_iterations: 4
      repeat_until: apps/api/test contains (a) a 65B issuance test binding digest + anchor + custody, (b) NEGATIVE
        tampered-chain/digest-mismatch refusal asserted via the thrown error code, (c) a feed-scoping test
        asserting subscriber A never receives subscriber B's out-of-category/out-of-tenant events, (d) a cursor
        resume test, (e) an LTV renewal test asserting pre-renewal entries verify unchanged afterwards;
        `npm run typecheck` + `npm test` pass; `bash docs/spec/pipeline/checks/ph-15d.sh` RED items all closed.
      steps: [write executed tests, run typecheck/test, run oracle, fix]
  evidence_required:
    - apps/api/src/modules/g12/** naming sr_authenticity_certificates, sr_subscriptions, sr_ltv_renewals,
      GENERATE_65B, since_seq/last_delivered_seq, SR_DELIVERY_MODE_DEFERRED
    - apps/api/test/*.test.cjs: certificate + feed-scoping + cursor + renewal tests + the tamper negative
    - `bash docs/spec/pipeline/checks/ph-15d.sh` GREEN (external oracle; not self-certified)
  escalate_when:
    - The PH-10B anchor/extract substrate lacks a fact the certificate must cite (raise the gap; do not fabricate
      custody or anchor references).
    - Real TSA/CA signing is required beyond the existing signing seam (record as an integration dependency;
      keep the seam injectable, do not call external services from tests).
    - Feed scoping conflicts with an existing consumer contract (surface it; do not widen a subscriber's scope).
