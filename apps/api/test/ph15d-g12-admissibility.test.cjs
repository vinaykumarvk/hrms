// PH-15D: G12 admissibility + longevity pillars on the PH-10B integrity substrate
// (BRD G12 FR-18/13/19) — §65B/BSA authenticity certificates (E24 sr_authenticity_certificates)
// binding content_digest + covering anchor_id + a GENERATED chain-of-custody with issuance
// access-logged GENERATE_65B and NEGATIVE fail-closed refusals (tampered chain, digest
// mismatch, non-qualified signature); sr_subscriptions (E16) with the single authenticated
// pull feed (since_seq / last_delivered_seq cursor, category + tenant scoping, minimised
// payloads, WEBHOOK -> SR_DELIVERY_MODE_DEFERRED); and sr_ltv_renewals (E25) recording
// RE_ANCHOR / ALGORITHM_MIGRATION renewals over EXISTING anchors with pre-renewal entries
// still verifying unchanged. Executed against the compiled dist under `npm test`.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationApi,
  createFoundationServices,
  verifyEntryChain,
  ph03Ids,
  sha256Hex,
  stableStringify,
  STATUTE_REFERENCE_65B_BSA,
} = require("../../../dist/apps/api/src");

function actor(userId, extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: ["*"],
    correlationId: "corr-ph15d",
    ...extra,
  };
}

function ingest(services, scope, employeeId, seq, eventTypeCode = "IDENTITY_CHANGE", payload = undefined) {
  return services.serviceRegister.ingest(scope, `idem-ph15d-${scope.tenantId}-${employeeId}-${seq}`, {
    sourceModule: "G01",
    sourceReferenceId: `employee:ph15d:${employeeId}:${seq}`,
    sourceEventVersion: 1,
    employeeId,
    eventTypeCode,
    eventDate: `2026-0${Math.min(seq, 9)}-15`,
    factKey: `EMP:${employeeId}|${eventTypeCode}|${seq}`,
    payload: payload ?? { displayName: `Person ${seq}`, basicPay: 56100 + seq },
    documentIds: [],
  }).event;
}

/** Build one statutory (qualified-signed, anchored) extract ready for a §65B certificate. */
function issueStatutoryExtract(services, scope, employeeId) {
  services.srIntegrity.runAnchorJob(scope, `run-ph15d-anchor-${employeeId}`);
  const extract = services.srIntegrity.issueCertifiedExtract(scope, scope, {
    employeeId,
    issuedTo: "Central Administrative Tribunal",
    purpose: "statutory production",
  });
  services.srIntegrity.attestChainHead(scope, {
    employeeId,
    attestationKind: "EXTRACT_SIGN",
    attestedRole: "SR_CUSTODIAN",
    signatureMethod: "PKI_QUALIFIED",
    certificateSerial: "CA-SERIAL-91002",
    subjectType: "EXTRACT",
    subjectId: extract.id,
  });
  return extract;
}

// ---------------------------------------------------------------------------------------
// FR-18: sr_authenticity_certificates — issuance binds digest + anchor + generated custody.
// ---------------------------------------------------------------------------------------

test("PH-15D FR-18 §65B certificate issuance binds content_digest + covering anchor_id + generated chain-of-custody and is access-logged GENERATE_65B", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const scope = actor("user-ph15d-cert");
  ingest(services, scope, "emp-ph15d-0001", 1);
  ingest(services, scope, "emp-ph15d-0001", 2);
  const extract = issueStatutoryExtract(services, scope, "emp-ph15d-0001");

  const response = api.dispatch({
    method: "POST",
    path: `/api/v1/sr/extracts/${extract.id}/authenticity-certificate`,
    headers: { "X-Correlation-Id": "corr-ph15d", "Idempotency-Key": "idem-ph15d-cert-1" },
    actor: actor("user-ph15d-cert"),
    body: {},
  });
  assert.equal(response.status, 201);
  const certificate = response.body;

  // sr_authenticity_certificates row: statute reference + digest + anchor binding (AC1/AC4/AC5).
  assert.equal(certificate.statuteReference, STATUTE_REFERENCE_65B_BSA);
  assert.match(certificate.statuteReference, /65B/);
  assert.equal(certificate.contentDigest, extract.contentDigest);
  assert.equal(certificate.anchorId, extract.anchorId);
  assert.equal(certificate.extractId, extract.id);
  assert.match(certificate.certificateNo, /^SR-65B-\d{6}$/);
  // Qualified signer identity + serial from the EXTRACT_SIGN attestation (AC2/AC3, BR-18.1).
  assert.equal(certificate.signingCertificateSerial, "CA-SERIAL-91002");
  assert.match(certificate.signerIdentity, /SR_CUSTODIAN/);
  assert.equal(certificate.tsaTimestampToken.length > 0, true);

  // BR-18.2: chain-of-custody GENERATED from stored ledger/provenance/attestation data.
  const custody = certificate.chainOfCustody;
  assert.equal(custody.ingestionProvenance.length, 2);
  assert.equal(custody.ingestionProvenance[0].sourceModule, "G01");
  assert.equal(custody.ingestionProvenance[0].sourceReferenceId, "employee:ph15d:emp-ph15d-0001:1");
  assert.equal(custody.attestationLineage.some((row) => row.attestationKind === "EXTRACT_SIGN" && row.signatureMethod === "PKI_QUALIFIED"), true);
  assert.equal(custody.systemIdentity.length > 0, true);
  assert.equal(custody.issuingOperator, "user-ph15d-cert");

  // FR-18 AC3: issuance is access-logged with the GENERATE_65B action.
  const generate65bLog = services.audit
    .listAudit(scope)
    .find((entry) => entry.action === "GENERATE_65B" && entry.subjectRef === `sr_authenticity_certificates:${certificate.id}`);
  assert.notEqual(generate65bLog, undefined);

  // Read-back via the GET route.
  const fetched = api.dispatch({
    method: "GET",
    path: `/api/v1/sr/authenticity-certificates/${certificate.id}`,
    headers: { "X-Correlation-Id": "corr-ph15d" },
    actor: actor("user-ph15d-cert"),
  });
  assert.equal(fetched.status, 200);
  assert.equal(fetched.body.certificate.certificateNo, certificate.certificateNo);
});

test("PH-15D FR-18 NEGATIVE: issuance is refused fail-closed for a tampered chain (verify path runs first) and for a digest mismatch", () => {
  const services = createFoundationServices();
  const scope = actor("user-ph15d-tamper");
  ingest(services, scope, "emp-ph15d-0002", 1);
  ingest(services, scope, "emp-ph15d-0002", 2);
  ingest(services, scope, "emp-ph15d-0002", 3);
  const extract = issueStatutoryExtract(services, scope, "emp-ph15d-0002");

  // BR-18.1 first: an extract without a qualified EXTRACT_SIGN attestation never qualifies.
  ingest(services, scope, "emp-ph15d-0099", 1);
  const provisional = services.srIntegrity.issueCertifiedExtract(scope, scope, { employeeId: "emp-ph15d-0099", issuedTo: "loan desk" });
  assert.throws(
    () => services.srAdmissibility.issueAuthenticityCertificate(scope, provisional.id),
    (error) => error.details.messageId === "SR_SIGNATURE_NOT_QUALIFIED" && error.code === "VALIDATION_FAILED"
  );

  // Simulate storage-level tampering of ledger entry 2's content (the very forgery the
  // certificate must never launder): replace the stored row with a mutated copy.
  const storedEvents = services.serviceRegister["events"];
  const index = storedEvents.findIndex((event) => event.employeeId === "emp-ph15d-0002" && event.sequenceNo === 2);
  assert.notEqual(index, -1);
  storedEvents[index] = { ...storedEvents[index], payload: { ...storedEvents[index].payload, basicPay: 9999999 } };
  assert.equal(verifyEntryChain(services.serviceRegister.getEntryChain(scope, "emp-ph15d-0002")).result, "FAIL");

  // The FR-04 verify path runs FIRST inside issuance and refuses with the thrown code.
  assert.throws(
    () => services.srAdmissibility.issueAuthenticityCertificate(scope, extract.id),
    (error) => error.details.messageId === "SR_CERT_CHAIN_TAMPERED" && error.code === "CONFLICT" && error.details.firstFailure.sequenceNo === 2
  );
  // Nothing was persisted for the refused issuance (fail-closed, no partial write).
  assert.equal(services.srAdmissibility.listSubscriptions(scope).length, 0);
  assert.equal(services.audit.listAudit(scope).some((entry) => entry.action === "GENERATE_65B"), false);

  // Digest mismatch (FR-18 AC4): an intact chain but a tampered stored extract snapshot —
  // the recomputed content_digest no longer matches, so issuance is refused.
  storedEvents[index] = { ...storedEvents[index], payload: { ...storedEvents[index].payload, basicPay: 56102 } };
  assert.equal(verifyEntryChain(services.serviceRegister.getEntryChain(scope, "emp-ph15d-0002")).result, "OK");
  const storedExtract = services.srIntegrity["repository"]["extracts"].find((row) => row.id === extract.id);
  storedExtract.renderedEvents[0].payload.displayName = "Forged Name";
  assert.notEqual(sha256Hex(stableStringify(storedExtract.renderedEvents)), extract.contentDigest);
  assert.throws(
    () => services.srAdmissibility.issueAuthenticityCertificate(scope, extract.id),
    (error) => error.details.messageId === "SR_CERT_DIGEST_MISMATCH" && error.code === "CONFLICT"
  );
});

// ---------------------------------------------------------------------------------------
// FR-13: sr_subscriptions + authenticated pull feed with since_seq/last_delivered_seq.
// ---------------------------------------------------------------------------------------

test("PH-15D FR-13 pull feed is scoped per subscriber: category filter, minimised payload, and no cross-subscriber/cross-tenant leak", () => {
  const services = createFoundationServices();
  const scopeA = actor("user-ph15d-feed");
  // Subscriber A (G11): pension-relevant categories only. Subscriber B (G06): promotions.
  const subA = services.srAdmissibility.registerSubscription(scopeA, { subscriberModule: "G11", eventCategories: ["PAY_REVISION"] });
  const subB = services.srAdmissibility.registerSubscription(scopeA, { subscriberModule: "G06", eventCategories: ["PROMOTION"] });
  assert.equal(subA.status, "PAUSED"); // AC1: nothing flows before custodian activation
  services.srAdmissibility.activateSubscription(scopeA, subA.id);
  services.srAdmissibility.activateSubscription(scopeA, subB.id);

  ingest(services, scopeA, "emp-ph15d-0003", 1, "PAY_REVISION", { basicPay: 61200 });
  ingest(services, scopeA, "emp-ph15d-0003", 2, "PROMOTION", { toGrade: "SO" });
  ingest(services, scopeA, "emp-ph15d-0003", 3, "PAY_REVISION", { basicPay: 63400 });

  // Another tenant's ledger — must NEVER surface on tenant A's feed (no cross-tenant leak).
  const scopeOther = actor("user-ph15d-other", { tenantId: "tenant-ph15d-other", entityId: undefined });
  ingest(services, scopeOther, "emp-ph15d-9001", 1, "PAY_REVISION", { basicPay: 99999 });

  const pageA = services.srAdmissibility.pullFeed(scopeA, subA.id);
  // Category scoping: subscriber A receives ONLY its registered categories...
  assert.deepEqual(pageA.items.map((item) => item.eventCategory), ["PAY_REVISION", "PAY_REVISION"]);
  // ...and never subscriber B's out-of-category event or the other tenant's employees.
  assert.equal(pageA.items.some((item) => item.eventCategory === "PROMOTION"), false);
  assert.equal(pageA.items.some((item) => item.employeeId === "emp-ph15d-9001"), false);
  // Payload minimisation (AC4): identifiers + content reference — no sensitive payload fields.
  for (const item of pageA.items) {
    assert.equal(typeof item.srEventId, "string");
    assert.match(item.contentRef, /^[0-9a-f]{64}$/);
    assert.equal("payload" in item, false);
    assert.equal("basicPay" in item, false);
  }

  // Subscriber B's cursor is untouched by A's pull, and B sees only its own category.
  const pageB = services.srAdmissibility.pullFeed(scopeA, subB.id);
  assert.deepEqual(pageB.items.map((item) => item.eventCategory), ["PROMOTION"]);
  assert.equal(pageB.sinceSeq, 0); // B's last_delivered_seq was not advanced by A's read

  // Cross-tenant isolation of subscription/cursor state: tenant B cannot resolve tenant A's
  // subscription id at all (NOT_FOUND — cursor unreadable across tenants).
  assert.throws(() => services.srAdmissibility.pullFeed(scopeOther, subA.id), (error) => error.code === "NOT_FOUND");
});

test("PH-15D FR-13 cursor resume: since_seq replays, last_delivered_seq advances durably, and corrigenda re-emit", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const scope = actor("user-ph15d-cursor");
  const sub = services.srAdmissibility.registerSubscription(scope, { subscriberModule: "G14", eventCategories: ["ALL"] });
  services.srAdmissibility.activateSubscription(scope, sub.id);

  const first = ingest(services, scope, "emp-ph15d-0004", 1, "INCREMENT", { basicPay: 57000 });
  ingest(services, scope, "emp-ph15d-0004", 2, "INCREMENT", { basicPay: 58000 });

  // First pull: everything from the durable cursor (0); cursor advances.
  const firstPull = api.dispatch({
    method: "GET",
    path: "/api/v1/sr/feed",
    query: { subscription_id: sub.id },
    headers: { "X-Correlation-Id": "corr-ph15d" },
    actor: actor("user-ph15d-cursor"),
  });
  assert.equal(firstPull.status, 200);
  assert.equal(firstPull.body.items.length, 2);
  assert.equal(firstPull.body.lastDeliveredSeq, 2);

  // Idle re-pull without since_seq: resumes AFTER the durable cursor — nothing re-delivered.
  const idlePull = services.srAdmissibility.pullFeed(scope, sub.id);
  assert.equal(idlePull.items.length, 0);
  assert.equal(idlePull.sinceSeq, 2);

  // New append (a corrigendum annotation referencing the first entry) re-emits on the feed.
  ingest(services, scope, "emp-ph15d-0004", 3, "CORRIGENDUM", { reason: "typo", originalEventId: first.id });
  const resumed = api.dispatch({
    method: "GET",
    path: "/api/v1/sr/feed",
    query: { subscription_id: sub.id, since_seq: "2" },
    headers: { "X-Correlation-Id": "corr-ph15d" },
    actor: actor("user-ph15d-cursor"),
  });
  assert.equal(resumed.status, 200);
  assert.equal(resumed.body.sinceSeq, 2);
  assert.equal(resumed.body.items.length, 1);
  assert.equal(resumed.body.items[0].eventCategory, "CORRIGENDUM");
  assert.equal(resumed.body.items[0].supersedesEventId, first.id); // AC5: consumers re-read the corrected fact
  assert.equal(resumed.body.lastDeliveredSeq, 3);

  // Explicit since_seq=0 REPLAYS the whole feed (subscribers dedupe by sr_event_id) while
  // the durable cursor stays at the high-water mark.
  const replay = services.srAdmissibility.pullFeed(scope, sub.id, 0);
  assert.equal(replay.items.length, 3);
  assert.equal(new Set(replay.items.map((item) => item.srEventId)).size, 3);
  assert.equal(replay.lastDeliveredSeq, 3);
});

test("PH-15D FR-13 NEGATIVE: WEBHOOK/MESSAGE_BUS registration is rejected with SR_DELIVERY_MODE_DEFERRED; paused subscribers receive nothing", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const scope = actor("user-ph15d-deferred");

  for (const deliveryMode of ["WEBHOOK", "MESSAGE_BUS"]) {
    assert.throws(
      () => services.srAdmissibility.registerSubscription(scope, { subscriberModule: "G14", eventCategories: ["ALL"], deliveryMode }),
      (error) => error.details.messageId === "SR_DELIVERY_MODE_DEFERRED" && error.code === "VALIDATION_FAILED"
    );
  }
  // Same rejection over the wire.
  const response = api.dispatch({
    method: "POST",
    path: "/api/v1/sr/subscriptions",
    headers: { "X-Correlation-Id": "corr-ph15d", "Idempotency-Key": "idem-ph15d-webhook" },
    actor: actor("user-ph15d-deferred"),
    body: { subscriberModule: "G11", eventCategories: ["ALL"], deliveryMode: "WEBHOOK" },
  });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.details.messageId, "SR_DELIVERY_MODE_DEFERRED");

  // BR-13.2: a PAUSED (not yet activated) subscription receives nothing.
  const paused = services.srAdmissibility.registerSubscription(scope, { subscriberModule: "G06", eventCategories: ["ALL"] });
  assert.throws(
    () => services.srAdmissibility.pullFeed(scope, paused.id),
    (error) => error.details.messageId === "SR_SUBSCRIPTION_NOT_ACTIVE"
  );
});

// ---------------------------------------------------------------------------------------
// FR-19: sr_ltv_renewals — additive re-anchoring; history never rewritten.
// ---------------------------------------------------------------------------------------

test("PH-15D FR-19 LTV renewal: RE_ANCHOR/ALGORITHM_MIGRATION write sr_ltv_renewals + a NEW anchor while every pre-renewal entry still verifies unchanged", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const scope = actor("user-ph15d-ltv");
  ingest(services, scope, "emp-ph15d-0005", 1);
  ingest(services, scope, "emp-ph15d-0005", 2);
  const extract = issueStatutoryExtract(services, scope, "emp-ph15d-0005");
  const anchorsBefore = services.srIntegrity.listAnchors(scope);
  assert.equal(anchorsBefore.length, 1);

  // Snapshot pre-renewal evidence: every stored entry_hash and the original anchor row.
  const preRenewalChain = services.serviceRegister.getEntryChain(scope, "emp-ph15d-0005");
  const preRenewalHashes = preRenewalChain.map((event) => event.entryHash);
  const originalAnchor = anchorsBefore[0];

  // Crypto-migration renewal over the extract via the route (RFC 4998 evidence record).
  const response = api.dispatch({
    method: "POST",
    path: "/api/v1/sr/ltv/renew",
    headers: { "X-Correlation-Id": "corr-ph15d", "Idempotency-Key": "idem-ph15d-ltv-1" },
    actor: actor("user-ph15d-ltv"),
    body: {
      subjectType: "EXTRACT",
      subjectId: extract.id,
      renewalKind: "ALGORITHM_MIGRATION",
      priorAlgorithm: "SHA-256",
      newAlgorithm: "SHA-384",
      triggeredBy: "ALGO_DEPRECATION",
    },
  });
  assert.equal(response.status, 201);
  const migration = response.body;
  assert.equal(migration.renewalKind, "ALGORITHM_MIGRATION");
  assert.equal(typeof migration.newAnchorId, "string");
  assert.match(migration.evidenceRecordRef, /^ERS-[0-9a-f]{32}$/);

  // RE_ANCHOR renewal over the ORIGINAL anchor itself (renewals stack over existing anchors).
  const reAnchor = services.srAdmissibility.recordLtvRenewal(scope, "run-ph15d-reanchor", {
    subjectType: "ANCHOR",
    subjectId: originalAnchor.id,
    renewalKind: "RE_ANCHOR",
    triggeredBy: "SCHEDULE",
  });
  assert.equal(reAnchor.subjectId, originalAnchor.id);
  assert.equal(typeof reAnchor.newAnchorId, "string");
  assert.notEqual(reAnchor.newAnchorId, originalAnchor.id);

  // sr_ltv_renewals rows recorded for both renewals.
  const renewals = services.srAdmissibility.listLtvRenewals(scope);
  assert.deepEqual(renewals.map((row) => row.renewalKind).sort(), ["ALGORITHM_MIGRATION", "RE_ANCHOR"]);

  // BR-19.1/BR-19.3 + FR-19 AC3: renewal is ADDITIVE — new anchors appended, the original
  // anchor row untouched, and NO historical entry_hash recomputed or overwritten.
  const anchorsAfter = services.srIntegrity.listAnchors(scope);
  assert.equal(anchorsAfter.length, 3);
  assert.deepEqual(anchorsAfter[0], originalAnchor);
  const postRenewalChain = services.serviceRegister.getEntryChain(scope, "emp-ph15d-0005");
  assert.deepEqual(postRenewalChain.map((event) => event.entryHash), preRenewalHashes);

  // FR-19 AC4: pre-renewal entries STILL VERIFY after renewal (recompute-from-content).
  assert.equal(verifyEntryChain(postRenewalChain).result, "OK");
  assert.equal(services.srIntegrity.verifyEmployee(scope, "emp-ph15d-0005").result, "OK");
  // ...and the renewed extract can still take a §65B certificate (verification intact).
  const certificate = services.srAdmissibility.issueAuthenticityCertificate(scope, extract.id);
  assert.equal(certificate.contentDigest, extract.contentDigest);
});
