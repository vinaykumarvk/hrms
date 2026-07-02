// PH-10A: G12/G13 integrity substrate — real SHA-256 hashing (known-vector), trusted-time
// recorded_at, the hash-chained sr_status_events sub-ledger, and G13 append-only version rows
// with checkout locks. Executed against the compiled dist under `npm test`.
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationServices,
  ph03Ids,
  sha256Hex,
  stableStringify,
} = require("../../../dist/apps/api/src");

const GENESIS_HASH = "0".repeat(64);

function actor(userId) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId,
    actorUserId: userId,
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph10a",
  };
}

function srRequest(overrides = {}) {
  return {
    sourceModule: "G01",
    sourceReferenceId: `employee:identity:ph10a:${overrides.sourceEventVersion ?? 1}:${overrides.seq ?? 1}`,
    sourceEventVersion: 1,
    employeeId: "emp-ph10a-0001",
    eventTypeCode: "IDENTITY_CHANGE",
    eventDate: "2026-07-01",
    factKey: `EMP:emp-ph10a-0001|IDENTITY|${overrides.seq ?? 1}`,
    payload: { displayName: `Kiran Chain ${overrides.seq ?? 1}` },
    documentIds: [],
    ...overrides,
  };
}

test("PH-10A sha256Hex is real SHA-256 (node crypto) — known vector", () => {
  // FIPS 180-4 known vector: SHA-256("abc").
  assert.equal(sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  assert.equal(sha256Hex(""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
});

test("PH-10A G12 entry chain uses SHA-256 over canonical content including server-stamped recorded_at", () => {
  const services = createFoundationServices();
  const scope = actor("user-ph10a-ledger");
  const first = services.serviceRegister.ingest(scope, "idem-ph10a-chain-1", srRequest({ seq: 1 })).event;
  const second = services.serviceRegister.ingest(scope, "idem-ph10a-chain-2", srRequest({ seq: 2 })).event;

  // Explicit genesis convention and chain linkage.
  assert.equal(first.previousHash, GENESIS_HASH);
  assert.equal(second.previousHash, first.entryHash);

  // recorded_at is trusted time: server-assigned at append (callers cannot supply it — the ingest
  // request has no such field) and DISTINCT from the legal eventDate.
  assert.ok(Number.isFinite(Date.parse(second.recordedAt)), "recordedAt is a server-stamped timestamp");
  assert.notEqual(second.recordedAt, second.eventDate);

  // The entry hash is recomputable as SHA-256 over the canonical serialization INCLUDING recordedAt,
  // proving recorded_at is part of the hashed content.
  const recomputed = sha256Hex(
    stableStringify({
      tenantId: second.tenantId,
      entityId: second.entityId,
      sequenceNo: second.sequenceNo,
      employeeId: second.employeeId,
      sourceModule: second.sourceModule,
      sourceReferenceId: second.sourceReferenceId,
      sourceEventVersion: second.sourceEventVersion,
      eventTypeCode: second.eventTypeCode,
      eventDate: second.eventDate,
      factKey: second.factKey,
      payload: second.payload,
      documentIds: second.documentIds,
      reversalOfEventId: second.reversalOfEventId,
      recordedAt: second.recordedAt,
      previousHash: second.previousHash,
    })
  );
  assert.equal(second.entryHash, recomputed);
  const tampered = sha256Hex(stableStringify({ recordedAt: "1999-01-01T00:00:00.000Z" }));
  assert.notEqual(second.entryHash, tampered);
});

test("PH-10A G12 sr_status_events sub-ledger: status changes are hash-chained appends, never field updates", () => {
  const services = createFoundationServices();
  const scope = actor("user-ph10a-status");
  const original = services.serviceRegister.ingest(scope, "idem-ph10a-status-1", srRequest({ seq: 11 })).event;
  const reversal = services.serviceRegister.reverseFromSource(scope, "idem-ph10a-status-2", original.id, "Order quashed").event;

  // The main event row's status is only a projection of the sub-ledger: the content chain is
  // untouched (entryHash unchanged) while the projection now reads SUPERSEDED.
  const originalAfter = services.serviceRegister.getEvent(scope, original.id);
  assert.equal(originalAfter.entryHash, original.entryHash);
  assert.equal(originalAfter.status, "SUPERSEDED");

  // Hash-chained sr_status_events rows: ACTIVE(original) -> ACTIVE(reversal) -> SUPERSEDED(original).
  const statusEvents = services.serviceRegister.getStatusEvents(scope, original.employeeId);
  assert.equal(statusEvents.length, 3);
  assert.equal(statusEvents[0].toValue, "ACTIVE");
  assert.equal(statusEvents[0].targetEventId, original.id);
  assert.equal(statusEvents[0].prevStatusHash, GENESIS_HASH);
  assert.equal(statusEvents[1].targetEventId, reversal.id);
  assert.equal(statusEvents[1].prevStatusHash, statusEvents[0].statusHash);
  assert.equal(statusEvents[2].transitionKind, "SUPERSESSION");
  assert.equal(statusEvents[2].targetEventId, original.id);
  assert.equal(statusEvents[2].fromValue, "ACTIVE");
  assert.equal(statusEvents[2].toValue, "SUPERSEDED");
  assert.equal(statusEvents[2].relatedEventId, reversal.id);
  assert.equal(statusEvents[2].prevStatusHash, statusEvents[1].statusHash);

  // Each status row's hash is real SHA-256 over its canonical content + prev hash, and each row
  // carries its own trusted-time recorded_at stamp.
  for (const row of statusEvents) {
    assert.match(row.statusHash, /^[0-9a-f]{64}$/);
    assert.ok(Number.isFinite(Date.parse(row.recordedAt)));
  }
  const recomputed = sha256Hex(
    stableStringify({
      tenantId: statusEvents[2].tenantId,
      entityId: statusEvents[2].entityId,
      employeeId: statusEvents[2].employeeId,
      targetEventId: statusEvents[2].targetEventId,
      statusSequenceNo: statusEvents[2].statusSequenceNo,
      transitionKind: statusEvents[2].transitionKind,
      fromValue: statusEvents[2].fromValue,
      toValue: statusEvents[2].toValue,
      relatedEventId: statusEvents[2].relatedEventId,
      actor: statusEvents[2].actor,
      recordedAt: statusEvents[2].recordedAt,
      prevStatusHash: statusEvents[2].prevStatusHash,
    })
  );
  assert.equal(statusEvents[2].statusHash, recomputed);

  // NEGATIVE: there is no mutator that edits status in place — status is append-only.
  assert.equal(typeof services.serviceRegister.setStatus, "undefined");
  assert.equal(typeof services.serviceRegister.updateStatus, "undefined");
});

test("PH-10A G13 checkIn appends immutable version rows (append-only history)", () => {
  const services = createFoundationServices();
  const scope = actor("user-ph10a-vault");
  const document = services.documentVault.createDocument(scope, {
    title: "Service book extract",
    ownerEmployeeId: ph03Ids.employee,
    classification: "CONFIDENTIAL",
    contentHash: "1111".repeat(16),
  });

  const afterCheckin = services.documentVault.checkIn(scope, document.id, { contentHash: "2222".repeat(16) });
  assert.equal(afterCheckin.currentVersionNo, 2);

  // Version history is append-only rows — checkIn appended a NEW row; the prior row survives.
  const versions = services.documentVault.listVersions(scope, document.id);
  assert.equal(versions.length, 2);
  assert.deepEqual(
    versions.map((version) => version.versionNo),
    [1, 2]
  );
  assert.equal(versions[0].contentHash, "1111".repeat(16));
  assert.equal(versions[1].contentHash, "2222".repeat(16));
});

test("PH-10A NEGATIVE G13: mutation/deletion of an existing version row is rejected (append-only, immutable)", () => {
  const services = createFoundationServices();
  const scope = actor("user-ph10a-immutable");
  const document = services.documentVault.createDocument(scope, {
    title: "Charge memorandum",
    classification: "CONFIDENTIAL",
    contentHash: "3333".repeat(16),
  });
  services.documentVault.checkIn(scope, document.id, { contentHash: "4444".repeat(16) });

  const rows = services.documentVault.listVersionRows(scope, document.id);
  assert.equal(rows.length, 2);
  for (const row of rows) {
    assert.ok(Object.isFrozen(row), "version rows are frozen on append");
  }
  // Attempted in-place mutation of a version row throws (strict mode) and changes nothing.
  assert.throws(() => {
    rows[0].contentHash = "beef".repeat(16);
  }, TypeError);
  assert.throws(() => {
    delete rows[0].contentHash;
  }, TypeError);
  assert.equal(services.documentVault.listVersionRows(scope, document.id)[0].contentHash, "3333".repeat(16));

  // And the service exposes no update/delete path for an existing version row.
  assert.equal(typeof services.documentVault.updateVersion, "undefined");
  assert.equal(typeof services.documentVault.deleteVersion, "undefined");
});

test("PH-10A NEGATIVE G13: check-in under another actor's active checkout lock is rejected with ERR-G13-DOCUMENT_LOCKED", () => {
  const services = createFoundationServices();
  const holder = actor("user-ph10a-holder");
  const intruder = actor("user-ph10a-intruder");
  const document = services.documentVault.createDocument(holder, {
    title: "Draft order",
    classification: "INTERNAL",
    contentHash: "5555".repeat(16),
  });

  const lock = services.documentVault.checkout(holder, document.id, "Editing draft");
  assert.equal(lock.status, "ACTIVE");
  assert.equal(lock.lockedBy, "user-ph10a-holder");

  // NEGATIVE: conflicting write by another actor rejected with the registered taxonomy code.
  assert.throws(
    () => services.documentVault.checkIn(intruder, document.id, { contentHash: "6666".repeat(16) }),
    (error) => error.code === "ERR-G13-DOCUMENT_LOCKED"
  );
  // NEGATIVE: a second checkout by another actor is rejected the same way.
  assert.throws(
    () => services.documentVault.checkout(intruder, document.id),
    (error) => error.code === "ERR-G13-DOCUMENT_LOCKED"
  );

  // The holder can check in; the lock survives check-in — release is explicit.
  const updated = services.documentVault.checkIn(holder, document.id, { contentHash: "7777".repeat(16) });
  assert.equal(updated.currentVersionNo, 2);
  assert.equal(services.documentVault.getCheckoutLock(holder, document.id).status, "ACTIVE");

  // Only the holder may release; after explicit release the other actor may write.
  assert.throws(
    () => services.documentVault.releaseCheckout(intruder, document.id),
    (error) => error.code === "FORBIDDEN"
  );
  const released = services.documentVault.releaseCheckout(holder, document.id);
  assert.equal(released.status, "RELEASED");
  const afterRelease = services.documentVault.checkIn(intruder, document.id, { contentHash: "8888".repeat(16) });
  assert.equal(afterRelease.currentVersionNo, 3);
});
