const test = require("node:test");
const assert = require("node:assert/strict");

const { FoundationError } = require("../../../dist/apps/api/src");
const { PgSrIntegrityRepository } = require("../../../dist/apps/api/src/modules/g12/srIntegrityRepository");
const { PgSrAdmissibilityRepository } = require("../../../dist/apps/api/src/modules/g12/srAdmissibilityRepository");
const { PgLeaveSrCatalogRepository } = require("../../../dist/apps/api/src/modules/g04/leaveSrCatalogRepository");

// Verifies the statutory-integrity production DB layer (G12 SR integrity/anchoring, G12 §65B
// admissibility/subscriptions, G04 SR-event mapping catalog + pre-pension certificates) at the
// SQL/parameter-binding layer via a stub pool — no live Postgres. Extends the money/PII-critical
// stub-pool suite to the statutory-correctness layer core to a government HRMS.

function capturingPool(rowFactory) {
  const calls = [];
  const pool = {
    query: async (sql, params) => {
      calls.push({ sql, params });
      return rowFactory ? rowFactory() : { rows: [{ id: "stub-id" }], rowCount: 1 };
    },
  };
  return { pool, calls };
}

// ---- G12 SR integrity (anchors / attestations / gap register) ----------------------------------

test("G12 PgSrIntegrityRepository.insertAttestation: binds the attestation columns (signedDigest, attestedBy, TSA chain) and returns the id", async () => {
  const { pool, calls } = capturingPool(() => ({ rows: [{ id: "att-1" }], rowCount: 1 }));
  const repo = new PgSrIntegrityRepository(pool);
  const id = await repo.insertAttestation({
    tenantId: "t1", entityId: "e1", subjectType: "SR_EVENT", subjectId: "sr-1", employeeId: "emp-1",
    attestationKind: "EXTRACT_SIGN", attestedBy: "custodian-1", attestedRole: "sr_custodian",
    signatureMethod: "DSC", certificateSerial: "cert-9", tsaTimestampToken: "tsa-tok", tsaAuthority: "CA-1",
    signedDigest: "sha256:abc",
  });
  const p = calls[0].params;
  assert.equal(id, "att-1");
  assert.equal(p[2], "SR_EVENT", "subjectType bound");
  assert.equal(p[5], "EXTRACT_SIGN", "attestationKind bound");
  assert.equal(p[6], "custodian-1", "attestedBy bound");
  assert.equal(p[9], "cert-9", "certificateSerial bound");
  assert.equal(p[11], "CA-1", "tsaAuthority bound");
  assert.equal(p[12], "sha256:abc", "signedDigest bound");
  assert.match(calls[0].sql, /attestation/i);
});

test("G12 PgSrIntegrityRepository.updateGapStatus: binds the 7 gap-register columns", async () => {
  const { pool, calls } = capturingPool(() => ({ rows: [], rowCount: 1 }));
  const repo = new PgSrIntegrityRepository(pool);
  await repo.updateGapStatus({
    tenantId: "t1", id: "gap-1", gapStatus: "RESOLVED", explanationCode: "BACKFILLED",
    resolvedEventId: "sr-9", corroboratedBy: "custodian-1", closedAt: "2026-07-14",
  });
  const p = calls[0].params;
  assert.equal(p[2], "RESOLVED");
  assert.equal(p[3], "BACKFILLED");
  assert.equal(p[4], "sr-9");
  assert.equal(p[6], "2026-07-14");
});

// ---- G12 §65B admissibility (certificates / authenticated pull-feed subscriptions) ---------------

test("G12 PgSrAdmissibilityRepository.updateSubscriptionStatus: binds (tenant, subscriptionId, status, actorUserId)", async () => {
  const { pool, calls } = capturingPool(() => ({ rows: [], rowCount: 1 }));
  const repo = new PgSrAdmissibilityRepository(pool);
  await repo.updateSubscriptionStatus({ tenantId: "t1", actorUserId: "sub-admin-1" }, "sub-9", "ACTIVE");
  const p = calls[0].params;
  assert.equal(p[0], "t1");
  assert.equal(p[1], "sub-9");
  assert.equal(p[2], "ACTIVE");
  assert.equal(p[3], "sub-admin-1");
});

// ---- G04 SR-event mapping catalog + pre-pension certificates -----------------------------------

test("G04 PgLeaveSrCatalogRepository.retireMapping: binds (mappingId, retiredBy), returns the row, throws CONFLICT when nothing retired", async () => {
  const ok = capturingPool(() => ({ rows: [{ id: "map-1", status: "RETIRED" }], rowCount: 1 }));
  const repoOk = new PgLeaveSrCatalogRepository(ok.pool);
  const row = await repoOk.retireMapping("map-1", "custodian-1");
  assert.equal(ok.calls[0].params[0], "map-1");
  assert.equal(ok.calls[0].params[1], "custodian-1");
  assert.equal(row.id, "map-1");

  const empty = capturingPool(() => ({ rows: [], rowCount: 0 }));
  const repoEmpty = new PgLeaveSrCatalogRepository(empty.pool);
  await assert.rejects(
    () => repoEmpty.retireMapping("map-missing", "custodian-1"),
    (error) => error instanceof FoundationError && error.code === "CONFLICT"
  );
});

test("G04 PgLeaveSrCatalogRepository.markCertificateConsumed: binds (certificateId, tenantId), throws NOT_FOUND when unconsumed", async () => {
  const ok = capturingPool(() => ({ rows: [{ id: "cert-1", consumed: true }], rowCount: 1 }));
  const repoOk = new PgLeaveSrCatalogRepository(ok.pool);
  const row = await repoOk.markCertificateConsumed("cert-1", "t1");
  assert.equal(ok.calls[0].params[0], "cert-1");
  assert.equal(ok.calls[0].params[1], "t1");
  assert.equal(row.id, "cert-1");

  const empty = capturingPool(() => ({ rows: [], rowCount: 0 }));
  const repoEmpty = new PgLeaveSrCatalogRepository(empty.pool);
  await assert.rejects(
    () => repoEmpty.markCertificateConsumed("cert-missing", "t1"),
    (error) => error instanceof FoundationError && error.code === "NOT_FOUND"
  );
});
