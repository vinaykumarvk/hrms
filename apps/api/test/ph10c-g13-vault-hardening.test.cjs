// PH-10C G13 vault hardening oracle tests (BRD G13 FR-005/006/007/009/015/017):
//   - content_hash is real SHA-256 of the uploaded BYTES, computed server-side (caller hash
//     never trusted) and re-verified on every fetch (ERR-G13-INTEGRITY_FAILED on mismatch);
//   - DI-11 scan gate through an injectable fake ScanProvider: PENDING_SCAN -> CLEAN -> ACTIVE,
//     INFECTED -> QUARANTINED (fetch blocked, ERR-G13-MALWARE_DETECTED);
//   - E21 security_clearances deny-by-default gate (ERR-G13-CLEARANCE_INSUFFICIENT, fail-closed);
//   - E12 document_audit access ledger fed by :fetch?intent=VIEW|DOWNLOAD;
//   - E8/E18 retention classes + disposition maker!=checker SoD (ERR-G13-SOD_VIOLATION).
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");

const {
  createFoundationApi,
  createFoundationServices,
  DocumentVaultService,
  InMemoryDocumentSecurityRepository,
  AuditService,
  ph03Ids,
} = require("../../../dist/apps/api/src");

const ACTOR_ID = "user-ph10c-g13";

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: ACTOR_ID,
    actorUserId: ACTOR_ID,
    permissions: ["*"],
    roles: ["records_officer"],
    fieldGrants: [],
    correlationId: "corr-ph10c-g13",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph10c-g13", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function scope() {
  return { tenantId: ph03Ids.tenant, entityId: ph03Ids.entity, actorUserId: ACTOR_ID, correlationId: "corr-ph10c-g13" };
}

function sha256(text) {
  return crypto.createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

// Deterministic fake ScanProvider injected through the DI-11 seam. `plan.always` (when set)
// forces a verdict; otherwise the INFECTED-MARKER byte signature decides.
function fakeScanProvider(plan = {}) {
  return {
    calls: [],
    scan(request) {
      this.calls.push({ documentId: request.documentId, versionNo: request.versionNo });
      if (plan.always) {
        return { verdict: plan.always, engine: "fake-scan-provider" };
      }
      if (request.bytes.toString("utf8").includes("INFECTED-MARKER")) {
        return { verdict: "INFECTED", engine: "fake-scan-provider", threatName: "Fake.Test.Threat" };
      }
      return { verdict: "CLEAN", engine: "fake-scan-provider" };
    },
  };
}

test("PH-10C content_hash is server-side SHA-256 of the bytes; a caller hash is never trusted; CLEAN promotes to ACTIVE", async () => {
  const scanProvider = fakeScanProvider();
  const services = createFoundationServices({ g13ScanProvider: scanProvider });
  const api = createFoundationApi(services);
  const content = "Transfer order PH-10C body bytes v1";

  const created = await call(api, {
    method: "POST",
    path: "/api/v1/documents",
    headers: { "Idempotency-Key": "idem-ph10c-ingest-001" },
    body: {
      title: "Byte-ingested order",
      classification: "INTERNAL",
      content,
      // A forged caller hash MUST be ignored on the byte-ingest path.
      contentHash: "f".repeat(64),
    },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.document.contentHash, sha256(content));
  assert.notEqual(created.body.document.contentHash, "f".repeat(64));
  // DI-11: the injected provider was consulted and its CLEAN verdict promoted the document.
  assert.equal(created.body.document.status, "ACTIVE");
  assert.equal(scanProvider.calls.length, 1);

  const scans = services.documentVault.listScanResults(scope(), created.body.document.id);
  assert.equal(scans.length, 1);
  assert.equal(scans[0].verdict, "CLEAN");
  assert.equal(scans[0].engine, "fake-scan-provider");
  assert.equal(scans[0].integrityVerified, true);
});

test("PH-10C scan gate is fail-closed: PENDING_SCAN content is unfetchable until a CLEAN verdict promotes it", async () => {
  const plan = { always: "PENDING" };
  const services = createFoundationServices({ g13ScanProvider: fakeScanProvider(plan) });
  const api = createFoundationApi(services);

  const created = await call(api, {
    method: "POST",
    path: "/api/v1/documents",
    headers: { "Idempotency-Key": "idem-ph10c-pending-001" },
    body: { title: "Awaiting scan", classification: "INTERNAL", content: "bytes awaiting a verdict" },
  });
  assert.equal(created.status, 201);
  assert.equal(created.body.document.status, "PENDING_SCAN");
  const documentId = created.body.document.id;

  const blocked = await call(api, { method: "GET", path: `/api/v1/documents/${documentId}:fetch`, query: { intent: "VIEW" } });
  assert.equal(blocked.status, 412);
  assert.equal(blocked.body.error.code, "PRECONDITION_FAILED");
  assert.equal(blocked.body.error.details.status, "PENDING_SCAN");

  // Only a scan-CLEAN result promotes PENDING_SCAN to ACTIVE (DI-11).
  plan.always = "CLEAN";
  const rescanned = services.documentVault.rescan(scope(), documentId);
  assert.equal(rescanned.status, "ACTIVE");
  const view = await call(api, { method: "GET", path: `/api/v1/documents/${documentId}:fetch`, query: { intent: "VIEW" } });
  assert.equal(view.status, 200);
});

test("PH-10C NEGATIVE: an INFECTED verdict quarantines the document and fetch stays blocked", async () => {
  const services = createFoundationServices({ g13ScanProvider: fakeScanProvider() });
  const api = createFoundationApi(services);

  const created = await call(api, {
    method: "POST",
    path: "/api/v1/documents",
    headers: { "Idempotency-Key": "idem-ph10c-infected-001" },
    body: { title: "Malicious upload", classification: "INTERNAL", content: "payload INFECTED-MARKER payload" },
  });
  assert.equal(created.status, 201);
  // INFECTED -> QUARANTINED, never ACTIVE.
  assert.equal(created.body.document.status, "QUARANTINED");
  const documentId = created.body.document.id;

  const scans = services.documentVault.listScanResults(scope(), documentId);
  assert.equal(scans[0].verdict, "INFECTED");
  assert.equal(scans[0].threatName, "Fake.Test.Threat");

  const blocked = await call(api, { method: "GET", path: `/api/v1/documents/${documentId}:fetch`, query: { intent: "DOWNLOAD" } });
  assert.equal(blocked.status, 422);
  assert.equal(blocked.body.error.code, "ERR-G13-MALWARE_DETECTED");
  assert.equal(blocked.body.error.details.messageId, "ERR-G13-MALWARE_DETECTED");
});

test("PH-10C NEGATIVE: fetch re-verifies the stored bytes and withholds content on hash mismatch", async () => {
  const repository = new InMemoryDocumentSecurityRepository();
  const vault = new DocumentVaultService([], new AuditService(), repository, fakeScanProvider());
  const tenantScope = scope();

  const document = vault.createDocument(tenantScope, {
    title: "Integrity-verified order",
    classification: "INTERNAL",
    content: "original stored bytes v1",
  });
  assert.equal(document.status, "ACTIVE");
  assert.equal(document.contentHash, sha256("original stored bytes v1"));
  assert.equal(vault.fetch(tenantScope, document.id, "VIEW").intent, "VIEW");

  // Simulate storage-layer tampering underneath the recorded content_hash.
  repository.putContent(document.id, 1, Buffer.from("tampered stored bytes", "utf8"));

  assert.throws(
    () => vault.fetch(tenantScope, document.id, "DOWNLOAD"),
    (error) => {
      assert.equal(error.code, "ERR-G13-INTEGRITY_FAILED");
      assert.equal(error.details.messageId, "ERR-G13-INTEGRITY_FAILED");
      return true;
    }
  );
  // BRD FR-015: the mismatching document is quarantined and the denial is on the access ledger.
  assert.equal(vault.get(tenantScope, document.id).status, "QUARANTINED");
  const denied = vault.listAccessAudit(tenantScope, document.id).filter((row) => row.result === "DENIED");
  assert.equal(denied.length, 1);
  assert.equal(denied[0].denialReason, "ERR-G13-INTEGRITY_FAILED");
  assert.equal(denied[0].action, "DOWNLOAD");
});

test("PH-10C NEGATIVE: classification gate denies fail-closed without an ACTIVE clearance row", async () => {
  const services = createFoundationServices({ g13ScanProvider: fakeScanProvider() });
  const api = createFoundationApi(services);

  const created = await call(api, {
    method: "POST",
    path: "/api/v1/documents",
    headers: { "Idempotency-Key": "idem-ph10c-clearance-doc-001" },
    body: {
      title: "Classified inquiry report",
      classification: "SECRET",
      contentHash: "abcd".repeat(16),
    },
  });
  assert.equal(created.status, 201);
  const documentId = created.body.document.id;

  // Deny-by-default: NO security_clearances row exists for this actor => access denied,
  // even though the RBAC permission check itself passed.
  const denied = await call(api, { method: "GET", path: `/api/v1/documents/${documentId}:fetch`, query: { intent: "VIEW" } });
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, "ERR-G13-CLEARANCE_INSUFFICIENT");
  const deniedRows = services.documentVault.listAccessAudit(scope(), documentId).filter((row) => row.result === "DENIED");
  assert.equal(deniedRows.length, 1);
  assert.equal(deniedRows[0].denialReason, "ERR-G13-CLEARANCE_INSUFFICIENT");

  // DI-16 SoD on the clearance grant itself: granter cannot self-approve.
  const selfApproved = await call(api, {
    method: "POST",
    path: "/api/v1/security-clearances",
    headers: { "Idempotency-Key": "idem-ph10c-clearance-self-001" },
    body: {
      principalType: "USER",
      principalRef: ACTOR_ID,
      clearanceLevel: "SECRET",
      justification: "Self-approval attempt",
      approvedBy: ACTOR_ID,
    },
  });
  assert.equal(selfApproved.status, 403);
  assert.equal(selfApproved.body.error.code, "ERR-G13-SOD_VIOLATION");

  // An insufficient level (CONFIDENTIAL < SECRET) still denies.
  const grantedLow = await call(api, {
    method: "POST",
    path: "/api/v1/security-clearances",
    headers: { "Idempotency-Key": "idem-ph10c-clearance-low-001" },
    body: {
      principalType: "USER",
      principalRef: ACTOR_ID,
      clearanceLevel: "CONFIDENTIAL",
      justification: "Lower-level clearance",
      approvedBy: "user-ph10c-checker",
    },
  });
  assert.equal(grantedLow.status, 201);
  const stillDenied = await call(api, { method: "GET", path: `/api/v1/documents/${documentId}:fetch`, query: { intent: "VIEW" } });
  assert.equal(stillDenied.status, 403);
  assert.equal(stillDenied.body.error.code, "ERR-G13-CLEARANCE_INSUFFICIENT");

  // An ACTIVE clearance at the document's level opens access.
  const granted = await call(api, {
    method: "POST",
    path: "/api/v1/security-clearances",
    headers: { "Idempotency-Key": "idem-ph10c-clearance-ok-001" },
    body: {
      principalType: "USER",
      principalRef: ACTOR_ID,
      clearanceLevel: "SECRET",
      justification: "Case officer clearance",
      approvedBy: "user-ph10c-checker",
    },
  });
  assert.equal(granted.status, 201);
  assert.equal(granted.body.clearance.status, "ACTIVE");
  const allowed = await call(api, { method: "GET", path: `/api/v1/documents/${documentId}:fetch`, query: { intent: "VIEW" } });
  assert.equal(allowed.status, 200);
});

test("PH-10C :fetch?intent= lands VIEW/DOWNLOAD access events on the hash-chained document_audit ledger", async () => {
  const services = createFoundationServices({ g13ScanProvider: fakeScanProvider() });
  const api = createFoundationApi(services);

  const created = await call(api, {
    method: "POST",
    path: "/api/v1/documents",
    headers: { "Idempotency-Key": "idem-ph10c-audit-doc-001" },
    body: { title: "Audited memo", classification: "INTERNAL", content: "memo bytes for audit" },
  });
  const documentId = created.body.document.id;

  const view = await call(api, { method: "GET", path: `/api/v1/documents/${documentId}:fetch`, query: { intent: "VIEW" } });
  assert.equal(view.status, 200);
  const download = await call(api, { method: "GET", path: `/api/v1/documents/${documentId}:fetch`, query: { intent: "DOWNLOAD" } });
  assert.equal(download.status, 200);

  const trail = services.documentVault.listAccessAudit(scope(), documentId);
  assert.deepEqual(trail.map((row) => row.action), ["VIEW", "DOWNLOAD"]);
  assert.equal(trail.every((row) => row.result === "SUCCESS"), true);
  assert.equal(trail.every((row) => row.actorUserId === ACTOR_ID), true);
  assert.equal(trail.every((row) => row.versionNo === 1), true);
  // R5 chain: genesis prev-hash then each row chained to its predecessor.
  assert.equal(trail[0].prevHash, "0".repeat(64));
  assert.equal(trail[1].prevHash, trail[0].rowHash);
  assert.equal(trail[1].rowHash.length, 64);
});

test("PH-10C NEGATIVE: disposition approval by the proposing maker is rejected (maker!=checker SoD)", async () => {
  const services = createFoundationServices({ g13ScanProvider: fakeScanProvider() });
  const api = createFoundationApi(services);

  const retentionClass = await call(api, {
    method: "POST",
    path: "/api/v1/retention-classes",
    headers: { "Idempotency-Key": "idem-ph10c-rc-001" },
    body: { code: "RC-3Y", name: "Routine records - 3 years", retentionPeriodMonths: 36, dispositionAction: "DESTROY" },
  });
  assert.equal(retentionClass.status, 201);

  const created = await call(api, {
    method: "POST",
    path: "/api/v1/documents",
    headers: { "Idempotency-Key": "idem-ph10c-sod-doc-001" },
    body: { title: "Routine acknowledgement", classification: "INTERNAL", contentHash: "1234".repeat(16) },
  });
  const documentId = created.body.document.id;

  // Disposition needs a retention-class binding first (eligibility is class-driven).
  const noClass = await call(api, {
    method: "POST",
    path: `/api/v1/documents/${documentId}:propose-disposition`,
    headers: { "Idempotency-Key": "idem-ph10c-sod-early-001" },
    body: {},
  });
  assert.equal(noClass.status, 412);

  const assigned = await call(api, {
    method: "POST",
    path: `/api/v1/documents/${documentId}:assign-retention-class`,
    headers: { "Idempotency-Key": "idem-ph10c-sod-assign-001" },
    body: { retentionClassCode: "RC-3Y" },
  });
  assert.equal(assigned.status, 202);
  assert.equal(assigned.body.document.retentionClassCode, "RC-3Y");

  const proposed = await call(api, {
    method: "POST",
    path: `/api/v1/documents/${documentId}:propose-disposition`,
    headers: { "Idempotency-Key": "idem-ph10c-sod-propose-001" },
    body: {},
  });
  assert.equal(proposed.status, 201);
  assert.equal(proposed.body.disposition.status, "PROPOSED");
  assert.equal(proposed.body.disposition.proposedBy, ACTOR_ID);
  const dispositionId = proposed.body.disposition.id;

  // NEGATIVE (DI-10): the same actor who proposed cannot approve.
  const selfApprove = await call(api, {
    method: "POST",
    path: `/api/v1/dispositions/${dispositionId}:approve`,
    headers: { "Idempotency-Key": "idem-ph10c-sod-self-001" },
  });
  assert.equal(selfApprove.status, 403);
  assert.equal(selfApprove.body.error.code, "ERR-G13-SOD_VIOLATION");
  assert.equal(selfApprove.body.error.details.messageId, "ERR-G13-SOD_VIOLATION");

  // A DIFFERENT checker approves; execution disposes the document.
  const checkerApprove = await call(api, {
    method: "POST",
    path: `/api/v1/dispositions/${dispositionId}:approve`,
    headers: { "Idempotency-Key": "idem-ph10c-sod-checker-001" },
    actor: { userId: "user-ph10c-records-mgr", actorUserId: "user-ph10c-records-mgr" },
  });
  assert.equal(checkerApprove.status, 202);
  assert.equal(checkerApprove.body.disposition.status, "APPROVED");
  assert.equal(checkerApprove.body.disposition.approvedBy, "user-ph10c-records-mgr");

  const executed = await call(api, {
    method: "POST",
    path: `/api/v1/dispositions/${dispositionId}:execute`,
    headers: { "Idempotency-Key": "idem-ph10c-sod-exec-001" },
    actor: { userId: "user-ph10c-records-mgr", actorUserId: "user-ph10c-records-mgr" },
  });
  assert.equal(executed.status, 202);
  assert.equal(executed.body.disposition.status, "EXECUTED");
  assert.equal(executed.body.disposition.evidenceHash, "1234".repeat(16));
  const after = await call(api, { method: "GET", path: `/api/v1/documents/${documentId}` });
  assert.equal(after.body.document.status, "DISPOSED");
});

test("PH-10C legal hold still blocks disposition execution after checker approval", async () => {
  const services = createFoundationServices({ g13ScanProvider: fakeScanProvider() });
  const api = createFoundationApi(services);
  await call(api, {
    method: "POST",
    path: "/api/v1/retention-classes",
    headers: { "Idempotency-Key": "idem-ph10c-hold-rc-001" },
    body: { code: "RC-1Y", name: "Short-lived records", retentionPeriodMonths: 12, dispositionAction: "DESTROY" },
  });
  const created = await call(api, {
    method: "POST",
    path: "/api/v1/documents",
    headers: { "Idempotency-Key": "idem-ph10c-hold-doc-001" },
    body: { title: "Held memo", classification: "INTERNAL", contentHash: "5678".repeat(16) },
  });
  const documentId = created.body.document.id;
  await call(api, {
    method: "POST",
    path: `/api/v1/documents/${documentId}:assign-retention-class`,
    headers: { "Idempotency-Key": "idem-ph10c-hold-assign-001" },
    body: { retentionClassCode: "RC-1Y" },
  });
  const proposed = await call(api, {
    method: "POST",
    path: `/api/v1/documents/${documentId}:propose-disposition`,
    headers: { "Idempotency-Key": "idem-ph10c-hold-propose-001" },
    body: {},
  });
  const approved = await call(api, {
    method: "POST",
    path: `/api/v1/dispositions/${proposed.body.disposition.id}:approve`,
    headers: { "Idempotency-Key": "idem-ph10c-hold-approve-001" },
    actor: { userId: "user-ph10c-records-mgr", actorUserId: "user-ph10c-records-mgr" },
  });
  assert.equal(approved.status, 202);
  const held = await call(api, {
    method: "POST",
    path: "/api/v1/legal-holds",
    headers: { "Idempotency-Key": "idem-ph10c-hold-place-001" },
    body: { documentId, reason: "Pending inquiry" },
  });
  assert.equal(held.status, 202);

  const blocked = await call(api, {
    method: "POST",
    path: `/api/v1/dispositions/${proposed.body.disposition.id}:execute`,
    headers: { "Idempotency-Key": "idem-ph10c-hold-exec-001" },
    actor: { userId: "user-ph10c-records-mgr", actorUserId: "user-ph10c-records-mgr" },
  });
  assert.equal(blocked.status, 412);
  assert.equal(blocked.body.error.details.messageId, "ERR-G13-LEGAL_HOLD_ACTIVE");
  const after = await call(api, { method: "GET", path: `/api/v1/documents/${documentId}` });
  assert.equal(after.body.document.status, "ACTIVE");
});
