// PH-15E G13 oracle tests (BRD G13 FR-005 envelope encryption + FR-018 DPDP DSR lattice):
//   - runtime encrypt/decrypt round-trip on real bytes: every stored blob is encrypted with a
//     unique per-object aes-256-gcm DEK wrapped behind the injectable KeyProvider seam — only
//     wrapped_dek + kms_key_id are persisted, never plaintext or a plaintext DEK;
//   - JOB-G13-KEYROTATE rotation: DEKs are re-wrapped under the new master key, previously
//     stored objects still decrypt, and the stored ciphertext bytes are byte-identical;
//   - NEGATIVE wrong-key decrypt: auth-tag verification fails closed with a thrown
//     ERR-G13-INTEGRITY_FAILED — no partial plaintext;
//   - E22 data_subject_requests lifecycle (RECEIVED -> UNDER_REVIEW -> EXEMPTED/
//     PARTIALLY_FULFILLED/FULFILLED/REJECTED) with the VAL-G13-LATTICE precedence: statutory
//     retention / active legal hold / WORM override erasure => EXEMPT_RETAINED + legal basis;
//   - NEGATIVE erasure blocked by legal hold: error.code === 'ERR-G13-ERASURE_EXEMPTED' (409);
//   - redaction-marker erasure path: documents.dpdp_erasure_state transitions, audit PII
//     overwritten with the marker — audit rows are never deleted.
const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationApi,
  createFoundationServices,
  DocumentVaultService,
  InMemoryDocumentSecurityRepository,
  LocalMasterKeyProvider,
  encryptEnvelope,
  decryptEnvelope,
  AuditService,
  DPDP_REDACTION_MARKER,
  ph03Ids,
} = require("../../../dist/apps/api/src");

const ACTOR_ID = "user-ph15e-custodian";
const DPO_ID = "user-ph15e-dpo";

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: ACTOR_ID,
    actorUserId: ACTOR_ID,
    permissions: ["*"],
    roles: ["records_officer"],
    fieldGrants: [],
    correlationId: "corr-ph15e-g13",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph15e-g13", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function scope(actorUserId = ACTOR_ID) {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, actorUserId, correlationId: "corr-ph15e-g13" };
}

function newVault(masterKeySecret) {
  const repository = new InMemoryDocumentSecurityRepository(new LocalMasterKeyProvider({ masterKeySecret }));
  const vault = new DocumentVaultService([], new AuditService(), repository);
  return { repository, vault };
}

test("PH-15E runtime aes-256-gcm envelope round-trip: unique per-object DEK, only wrapped_dek + kms_key_id persisted", async () => {
  const { repository, vault } = newVault("ph15e-master-secret-A");
  const content = "PH-15E confidential order body bytes — envelope round-trip";

  const document = vault.createDocument(scope(), { title: "Envelope round-trip", classification: "INTERNAL", content });
  assert.equal(document.status, "ACTIVE");

  // Round-trip on real bytes: the stored ciphertext decrypts back to the exact plaintext.
  const decrypted = repository.getContent(document.id, 1);
  assert.equal(decrypted.toString("utf8"), content);

  // Only ciphertext + wrapped_dek + kms_key_id are persisted: no plaintext, no plaintext DEK.
  const stored = repository.getStorageObject(document.id, 1);
  assert.equal(stored.encryptionAlg, "aes-256-gcm");
  assert.equal(stored.objectBytes.includes(Buffer.from(content, "utf8")), false);
  assert.equal(stored.wrappedDek.length > 0, true);
  assert.match(stored.kmsKeyId, /^local-master\/v1$/);
  assert.equal("dek" in stored, false);
  assert.equal("plaintext" in stored, false);

  // Two objects with identical plaintext get DIFFERENT per-object DEKs (unique DEK per object).
  const second = vault.createDocument(scope(), { title: "Envelope twin", classification: "INTERNAL", content });
  const storedTwin = repository.getStorageObject(second.id, 1);
  assert.equal(stored.wrappedDek.equals(storedTwin.wrappedDek), false);
  assert.equal(stored.objectBytes.equals(storedTwin.objectBytes), false);

  // The fetch path (integrity re-verification over the decrypted bytes) still serves the document.
  const fetched = vault.fetch({ ...scope(), roles: [] }, document.id, "VIEW");
  assert.equal(fetched.intent, "VIEW");
});

test("PH-15E JOB-G13-KEYROTATE rotation re-wraps wrapped_dek without rewriting ciphertext; old objects still decrypt", async () => {
  const { repository, vault } = newVault("ph15e-master-secret-A");
  const content = "PH-15E bytes stored before the master-key rotation";
  const document = vault.createDocument(scope(), { title: "Pre-rotation object", classification: "INTERNAL", content });

  const before = repository.getStorageObject(document.id, 1);
  assert.equal(before.kmsKeyId, "local-master/v1");

  const report = vault.rotateEncryptionKeys(scope());
  assert.equal(report.kmsKeyId, "local-master/v2");
  assert.equal(report.rewrappedObjects >= 1, true);

  const after = repository.getStorageObject(document.id, 1);
  // Rotation re-wraps the DEK under the new master key WITHOUT touching object bytes:
  assert.equal(after.objectBytes.equals(before.objectBytes), true, "ciphertext must be byte-identical across rotation");
  assert.equal(after.wrappedDek.equals(before.wrappedDek), false, "wrapped_dek must be re-wrapped");
  assert.equal(after.kmsKeyId, "local-master/v2");

  // Previously stored objects still decrypt after rotation.
  const decrypted = repository.getContent(document.id, 1);
  assert.equal(decrypted.toString("utf8"), content);
});

test("PH-15E NEGATIVE wrong-key decrypt fails closed with thrown ERR-G13-INTEGRITY_FAILED (no partial plaintext)", async () => {
  const providerA = new LocalMasterKeyProvider({ masterKeySecret: "ph15e-master-secret-A" });
  const wrongKeyProvider = new LocalMasterKeyProvider({ masterKeySecret: "ph15e-master-secret-WRONG" });
  const envelope = encryptEnvelope(Buffer.from("wrong-key fail-closed payload", "utf8"), providerA);

  // Wrong key: same kms_key_id name, different key bytes — GCM auth-tag verification must throw.
  assert.throws(
    () => decryptEnvelope(envelope, wrongKeyProvider),
    (error) => {
      assert.equal(error.code, "ERR-G13-INTEGRITY_FAILED");
      return true;
    }
  );

  // Tampered ciphertext under the RIGHT key also fails closed with the same registered code.
  const tampered = { ...envelope, objectBytes: Buffer.from(envelope.objectBytes) };
  tampered.objectBytes[tampered.objectBytes.length - 1] ^= 0xff;
  assert.throws(
    () => decryptEnvelope(tampered, providerA),
    (error) => {
      assert.equal(error.code, "ERR-G13-INTEGRITY_FAILED");
      return true;
    }
  );

  // The intact envelope still decrypts with the correct provider.
  assert.equal(decryptEnvelope(envelope, providerA).toString("utf8"), "wrong-key fail-closed payload");
});

async function createOwnedDocument(api, idem, body) {
  const response = await call(api, {
    method: "POST",
    path: "/api/v1/documents",
    headers: { "Idempotency-Key": idem },
    body,
  });
  assert.equal(response.status, 201);
  return response.body.document;
}

test("PH-15E data_subject_requests lifecycle + VAL-G13-LATTICE: hold/WORM/statutory => EXEMPT_RETAINED; blocked erasure throws ERR-G13-ERASURE_EXEMPTED; non-exempt erases via the redaction marker", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const subject = "emp-ph15e-subject-1";

  const erasable = await createOwnedDocument(api, "idem-ph15e-dsr-doc-a", {
    title: "Erasable personal file",
    ownerEmployeeId: subject,
    classification: "INTERNAL",
    content: "personal data of the subject — erasable",
  });
  const held = await createOwnedDocument(api, "idem-ph15e-dsr-doc-b", {
    title: "Held personal file",
    ownerEmployeeId: subject,
    classification: "INTERNAL",
    content: "personal data of the subject — under legal hold",
  });
  const worm = await createOwnedDocument(api, "idem-ph15e-dsr-doc-c", {
    title: "WORM personal file",
    ownerEmployeeId: subject,
    classification: "INTERNAL",
    content: "personal data of the subject — WORM locked",
    isWorm: true,
  });
  const statutory = await createOwnedDocument(api, "idem-ph15e-dsr-doc-d", {
    title: "Statutory personal file",
    ownerEmployeeId: subject,
    classification: "INTERNAL",
    content: "personal data of the subject — statutory retention",
  });

  // Active legal hold on B; permanent retention class (statutory floor) on D.
  assert.equal(
    (await call(api, {
      method: "POST",
      path: "/api/v1/legal-holds",
      headers: { "Idempotency-Key": "idem-ph15e-dsr-hold" },
      body: { documentId: held.id, reason: "Ongoing litigation" },
    })).status,
    202
  );
  assert.equal(
    (await call(api, {
      method: "POST",
      path: "/api/v1/retention-classes",
      headers: { "Idempotency-Key": "idem-ph15e-dsr-rc" },
      body: { code: "SR-PERM", name: "Service records — permanent", isPermanent: true, dispositionAction: "REVIEW" },
    })).status,
    201
  );
  assert.equal(
    (await call(api, {
      method: "POST",
      path: `/api/v1/documents/${statutory.id}:assign-retention-class`,
      headers: { "Idempotency-Key": "idem-ph15e-dsr-rc-assign" },
      body: { retentionClassCode: "SR-PERM" },
    })).status,
    202
  );

  // View the erasable document once so its audit trail has PII rows to redact later.
  assert.equal((await call(api, { method: "GET", path: `/api/v1/documents/${erasable.id}:fetch`, query: { intent: "VIEW" } })).status, 200);

  // AC1: register — statutory clock starts, lifecycle begins at RECEIVED.
  const registered = await call(api, {
    method: "POST",
    path: "/api/v1/dsr",
    headers: { "Idempotency-Key": "idem-ph15e-dsr-register" },
    body: { dataSubjectEmployeeId: subject, requestType: "ERASURE" },
  });
  assert.equal(registered.status, 201);
  assert.equal(registered.body.dataSubjectRequest.status, "RECEIVED");
  assert.match(registered.body.dataSubjectRequest.dsrNo, /^DSR\//);
  assert.equal(typeof registered.body.dataSubjectRequest.receivedAt, "string");
  const dsrId = registered.body.dataSubjectRequest.id;

  // AC2: DPO adjudication evaluates every in-scope document against the precedence lattice.
  const adjudicated = await call(api, {
    method: "POST",
    path: `/api/v1/dsr/${dsrId}:adjudicate`,
    headers: { "Idempotency-Key": "idem-ph15e-dsr-adjudicate" },
    actor: { userId: DPO_ID, actorUserId: DPO_ID },
  });
  assert.equal(adjudicated.status, 202);
  assert.equal(adjudicated.body.dataSubjectRequest.status, "UNDER_REVIEW");
  assert.equal(adjudicated.body.dataSubjectRequest.affectedDocumentCount, 4);
  const outcomes = new Map(adjudicated.body.dataSubjectRequest.outcomes.map((outcome) => [outcome.documentId, outcome]));
  assert.equal(outcomes.get(erasable.id).decision, "ERASE");
  assert.equal(outcomes.get(held.id).decision, "EXEMPT_RETAINED");
  assert.match(outcomes.get(held.id).basis, /LEGAL_HOLD/);
  assert.equal(outcomes.get(worm.id).decision, "EXEMPT_RETAINED");
  assert.match(outcomes.get(worm.id).basis, /WORM/);
  assert.equal(outcomes.get(statutory.id).decision, "EXEMPT_RETAINED");
  assert.match(outcomes.get(statutory.id).basis, /STATUTORY_RETENTION/);

  // AC7 SoD: the adjudicating DPO may not execute — ERR-G13-SOD_VIOLATION (403).
  const selfExecute = await call(api, {
    method: "POST",
    path: `/api/v1/dsr/${dsrId}:execute`,
    headers: { "Idempotency-Key": "idem-ph15e-dsr-sod" },
    actor: { userId: DPO_ID, actorUserId: DPO_ID },
  });
  assert.equal(selfExecute.status, 403);
  assert.equal(selfExecute.body.error.code, "ERR-G13-SOD_VIOLATION");

  // NEGATIVE: erasure attempted against the held document is BLOCKED with the registered 409.
  const blocked = await call(api, {
    method: "POST",
    path: `/api/v1/dsr/${dsrId}:execute`,
    headers: { "Idempotency-Key": "idem-ph15e-dsr-blocked" },
    body: { documentId: held.id },
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code, "ERR-G13-ERASURE_EXEMPTED");
  assert.equal(blocked.body.error.details.messageId, "ERR-G13-ERASURE_EXEMPTED");
  assert.match(blocked.body.error.details.legalBasisExemption, /LEGAL_HOLD/);
  // The held document is recorded EXEMPT_RETAINED — dpdp_erasure_state, content untouched.
  const heldAfter = (await call(api, { method: "GET", path: `/api/v1/documents/${held.id}` })).body.document;
  assert.equal(heldAfter.dpdpErasureState, "EXEMPT_RETAINED");
  assert.equal(heldAfter.status, "ACTIVE");
  assert.equal(heldAfter.title, "Held personal file");

  // Full execution by the custodian: exempt docs retained with basis, the rest erased.
  const executed = await call(api, {
    method: "POST",
    path: `/api/v1/dsr/${dsrId}:execute`,
    headers: { "Idempotency-Key": "idem-ph15e-dsr-execute" },
  });
  assert.equal(executed.status, 202);
  assert.equal(executed.body.dataSubjectRequest.status, "PARTIALLY_FULFILLED");
  assert.equal(executed.body.dataSubjectRequest.erasureMethod, "CRYPTO_SHRED");
  assert.match(executed.body.dataSubjectRequest.legalBasisExemption, /LEGAL_HOLD/);

  // AC5 redaction-marker path (never physical deletion): dpdp_erasure_state transitions to
  // CRYPTO_SHRED, the header title is redacted, and prior audit PII carries the marker while
  // every audit row is retained.
  const erasedAfter = (await call(api, { method: "GET", path: `/api/v1/documents/${erasable.id}` })).body.document;
  assert.equal(erasedAfter.dpdpErasureState, "CRYPTO_SHRED");
  assert.equal(erasedAfter.title, DPDP_REDACTION_MARKER);
  assert.equal(erasedAfter.status, "DISPOSED");
  const auditRows = services.documentVault.listAccessAudit(scope(), erasable.id);
  assert.equal(auditRows.length >= 2, true, "audit rows are retained, never deleted");
  const preErasureRow = auditRows.find((row) => row.action === "VIEW");
  assert.equal(preErasureRow.actorUserId, DPDP_REDACTION_MARKER);
  const erasureRow = auditRows[auditRows.length - 1];
  assert.equal(erasureRow.action, "ERASURE");
  assert.equal(erasureRow.result, "SUCCESS");

  // Exempt documents keep their content and record EXEMPT_RETAINED (WORM + statutory too).
  for (const exemptId of [worm.id, statutory.id]) {
    const exempt = (await call(api, { method: "GET", path: `/api/v1/documents/${exemptId}` })).body.document;
    assert.equal(exempt.dpdpErasureState, "EXEMPT_RETAINED");
    assert.notEqual(exempt.status, "DISPOSED");
  }
});

test("PH-15E DSR terminal statuses: all-erasable => FULFILLED, all-exempt => EXEMPTED, and REJECT closes the lifecycle", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);

  // All-erasable subject -> FULFILLED.
  const plain = await createOwnedDocument(api, "idem-ph15e-f-doc", {
    title: "Only erasable file",
    ownerEmployeeId: "emp-ph15e-subject-2",
    classification: "INTERNAL",
    content: "subject-2 personal data",
  });
  const fulfilledDsr = (await call(api, {
    method: "POST",
    path: "/api/v1/dsr",
    headers: { "Idempotency-Key": "idem-ph15e-f-register" },
    body: { dataSubjectEmployeeId: "emp-ph15e-subject-2", requestType: "ERASURE" },
  })).body.dataSubjectRequest;
  await call(api, {
    method: "POST",
    path: `/api/v1/dsr/${fulfilledDsr.id}:adjudicate`,
    headers: { "Idempotency-Key": "idem-ph15e-f-adjudicate" },
    actor: { userId: DPO_ID, actorUserId: DPO_ID },
  });
  const fulfilled = await call(api, {
    method: "POST",
    path: `/api/v1/dsr/${fulfilledDsr.id}:execute`,
    headers: { "Idempotency-Key": "idem-ph15e-f-execute" },
  });
  assert.equal(fulfilled.body.dataSubjectRequest.status, "FULFILLED");
  assert.equal(
    (await call(api, { method: "GET", path: `/api/v1/documents/${plain.id}` })).body.document.dpdpErasureState,
    "CRYPTO_SHRED"
  );

  // All-exempt subject (WORM) -> EXEMPTED with EXEMPT_RETAINED and the basis recorded.
  await createOwnedDocument(api, "idem-ph15e-e-doc", {
    title: "Only WORM file",
    ownerEmployeeId: "emp-ph15e-subject-3",
    classification: "INTERNAL",
    content: "subject-3 personal data",
    isWorm: true,
  });
  const exemptDsr = (await call(api, {
    method: "POST",
    path: "/api/v1/dsr",
    headers: { "Idempotency-Key": "idem-ph15e-e-register" },
    body: { dataSubjectEmployeeId: "emp-ph15e-subject-3", requestType: "ERASURE" },
  })).body.dataSubjectRequest;
  await call(api, {
    method: "POST",
    path: `/api/v1/dsr/${exemptDsr.id}:adjudicate`,
    headers: { "Idempotency-Key": "idem-ph15e-e-adjudicate" },
    actor: { userId: DPO_ID, actorUserId: DPO_ID },
  });
  const exempted = await call(api, {
    method: "POST",
    path: `/api/v1/dsr/${exemptDsr.id}:execute`,
    headers: { "Idempotency-Key": "idem-ph15e-e-execute" },
  });
  assert.equal(exempted.body.dataSubjectRequest.status, "EXEMPTED");
  assert.equal(exempted.body.dataSubjectRequest.erasureMethod, "EXEMPT_RETAINED");

  // REJECT closes the lifecycle without touching any document.
  const rejectedDsr = (await call(api, {
    method: "POST",
    path: "/api/v1/dsr",
    headers: { "Idempotency-Key": "idem-ph15e-r-register" },
    body: { dataSubjectEmployeeId: "emp-ph15e-subject-2", requestType: "ERASURE" },
  })).body.dataSubjectRequest;
  const rejected = await call(api, {
    method: "POST",
    path: `/api/v1/dsr/${rejectedDsr.id}:adjudicate`,
    headers: { "Idempotency-Key": "idem-ph15e-r-adjudicate" },
    actor: { userId: DPO_ID, actorUserId: DPO_ID },
    body: { decision: "REJECT", resolutionNote: "Identity not established" },
  });
  assert.equal(rejected.body.dataSubjectRequest.status, "REJECTED");

  // The lifecycle is reportable: the DSR register lists every request for the tenant.
  const listed = services.documentVault.listDataSubjectRequests(scope());
  assert.equal(listed.length, 3);
});
