const test = require("node:test");
const assert = require("node:assert/strict");
const { createHmac } = require("node:crypto");

const {
  createFoundationServices,
  AuditService,
  AuthorizationService,
  InMemoryLeaveSrRelayRepository,
  LeaveSrRelayService,
  NotificationService,
  ServiceRegisterService,
  stableStringify,
  ph03Ids,
} = require("../../../dist/apps/api/src");

const HMAC_KEY = "ph07b-test-hmac-key";

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph07b-g04",
    actorUserId: "user-ph07b-g04",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph07b-g04",
    ...extra,
  };
}

function buildRelay(config = {}) {
  const audit = new AuditService();
  const authorization = new AuthorizationService();
  const serviceRegister = new ServiceRegisterService(audit);
  const notifications = new NotificationService();
  const repository = new InMemoryLeaveSrRelayRepository();
  const relay = new LeaveSrRelayService(authorization, audit, serviceRegister, notifications, repository, {
    hmacKey: HMAC_KEY,
    ...config,
  });
  return { relay, repository, serviceRegister, audit };
}

function enqueueApproved(relay, leaveApplicationId, payload = { totalDays: 2 }) {
  return relay.enqueueApprovedLeave(actor(), {
    leaveApplicationId,
    employeeId: ph03Ids.employee,
    eventDate: "2026-07-20",
    payload,
  });
}

test("PH-07B G04 outbox events carry stable spell lineage and a monotonic unique event_sequence", () => {
  const { relay, repository } = buildRelay();
  const approved = enqueueApproved(relay, "leave-app-ph07b-lineage");
  const cancelled = relay.enqueueLeaveCancellation(actor(), {
    leaveApplicationId: "leave-app-ph07b-lineage",
    employeeId: ph03Ids.employee,
    eventDate: "2026-07-22",
    payload: { cancelDate: "2026-07-22" },
  });

  assert.ok(approved.leaveSpellLineageId, "approve event must carry leave_spell_lineage_id");
  assert.equal(cancelled.leaveSpellLineageId, approved.leaveSpellLineageId, "lineage is stable across approve/cancel of one spell");
  assert.equal(approved.eventSequence, 1);
  assert.equal(cancelled.eventSequence, 2, "event_sequence is monotonic within the lineage");

  const stored = repository.listOutboxEvents(actor())[0];
  assert.throws(
    () =>
      repository.insertOutboxEvent({
        ...stored,
        id: "g04-leave-outbox-duplicate",
        payload: { ...stored.payload },
      }),
    (error) => error.code === "CONFLICT" && /event_sequence already allocated/.test(error.message),
    "uniqueness on (tenant, lineage, event_sequence) must be enforced"
  );
});

test("PH-07B G04 lineage propagates from the G03 leave application into the outbox", () => {
  const services = createFoundationServices();
  const submitted = services.leave.submit(actor(), {
    employeeId: ph03Ids.employee,
    leaveTypeId: "EL",
    fromDate: "2026-08-03",
    toDate: "2026-08-04",
  });
  const approved = services.leave.approve(actor(), submitted.application.id, "idem-ph07b-lineage-approve");
  assert.ok(submitted.application.leaveSpellLineageId, "G03 issues the spell lineage");
  assert.equal(approved.outboxEvent.leaveSpellLineageId, submitted.application.leaveSpellLineageId);
  assert.equal(approved.outboxEvent.eventSequence, 1);
});

test("PH-07B G04 payload signature is a real HMAC and tampering quarantines with ERR-G04-SIGNATURE-INVALID", () => {
  const { relay, repository, serviceRegister } = buildRelay();
  const event = enqueueApproved(relay, "leave-app-ph07b-tamper", { applicationNo: "LA/2026/91001", totalDays: 3 });

  const expectedSignature = createHmac("sha256", HMAC_KEY)
    .update(
      stableStringify({
        leaveSpellLineageId: event.leaveSpellLineageId,
        eventSequence: event.eventSequence,
        payload: { applicationNo: "LA/2026/91001", totalDays: 3 },
      })
    )
    .digest("hex");
  assert.equal(event.payloadSignature, expectedSignature, "payload_signature must be HMAC-SHA256 over lineage/sequence/payload");

  const stored = repository.findOutboxEvent(actor(), event.id);
  stored.payload.totalDays = 30; // tamper with the persisted payload

  assert.throws(
    () => relay.relayEvent(actor(), event.id),
    (error) => error.details?.errorCode === "ERR-G04-SIGNATURE-INVALID",
    "tampered payload must raise ERR-G04-SIGNATURE-INVALID"
  );
  assert.equal(serviceRegister.count(actor()), 0, "a tampered event must never post to G12");
  assert.equal(repository.findOutboxEvent(actor(), event.id).status, "QUARANTINED");

  const deadLetters = relay.listDeadLetters(actor());
  assert.equal(deadLetters.length, 1, "quarantine persists an sr_dead_letter entity");
  assert.equal(deadLetters[0].failureClass, "SIGNATURE_INVALID");
  assert.equal(deadLetters[0].lastErrorCode, "ERR-G04-SIGNATURE-INVALID");
});

test("PH-07B G04 failed relays schedule exponential backoff via availableAt and the picker honours it", () => {
  let now = new Date("2026-07-02T00:00:00.000Z");
  const { relay, serviceRegister } = buildRelay({ backoffBaseMs: 60_000, now: () => now });
  const event = enqueueApproved(relay, "leave-app-ph07b-backoff");

  const failed = relay.relayEvent(actor(), event.id, { simulateFailure: true });
  assert.equal(failed.status, "FAILED");
  assert.equal(failed.availableAt, "2026-07-02T00:01:00.000Z", "availableAt = now + backoffBase * 2^(attempts-1)");
  assert.ok(Date.parse(failed.availableAt) > now.getTime(), "availableAt must be in the future after a failure");

  assert.deepEqual(relay.relayReady(actor()), [], "relay must not pick a FAILED event before availableAt passes");
  assert.equal(serviceRegister.count(actor()), 0);

  now = new Date("2026-07-02T00:01:01.000Z");
  const picked = relay.relayReady(actor());
  assert.equal(picked.length, 1, "relay picks the event once availableAt has passed");
  assert.equal(picked[0].status, "POSTED");
  assert.equal(serviceRegister.count(actor()), 1);
});

test("PH-07B G04 exhausted events persist to sr_dead_letter and replay resolves the entity", () => {
  const { relay } = buildRelay({ maxAttempts: 2 });
  const event = enqueueApproved(relay, "leave-app-ph07b-dlq");
  relay.relayEvent(actor(), event.id, { simulateFailure: true });
  const exhausted = relay.relayEvent(actor(), event.id, { simulateFailure: true });
  assert.equal(exhausted.status, "DEAD_LETTERED");

  const openDlq = relay.listDeadLetters(actor());
  assert.equal(openDlq.length, 1, "exhaustion persists an sr_dead_letter entity");
  assert.equal(openDlq[0].outboxEventId, event.id);
  assert.equal(openDlq[0].state, "OPEN");
  assert.equal(openDlq[0].attemptsExhausted, 2);

  const replayed = relay.replayDeadLetter(actor(), event.id);
  assert.equal(replayed.status, "POSTED");
  assert.equal(relay.listDeadLetters(actor())[0].state, "RESOLVED_REPLAYED");
});

test("PH-07B G04 cancellation posts write sr_correction_link rows back to the original SR entry", () => {
  const { relay } = buildRelay();
  const approved = enqueueApproved(relay, "leave-app-ph07b-corr");
  const posted = relay.relayEvent(actor(), approved.id);
  const cancellation = relay.enqueueLeaveCancellation(actor(), {
    leaveApplicationId: "leave-app-ph07b-corr",
    employeeId: ph03Ids.employee,
    eventDate: "2026-07-21",
    payload: { cancelDate: "2026-07-21" },
  });
  const correcting = relay.relayEvent(actor(), cancellation.id);

  const links = relay.listCorrectionLinks(actor());
  assert.equal(links.length, 1, "a posted correction persists an sr_correction_link entity");
  assert.equal(links[0].originalSrEventId, posted.srEventId);
  assert.equal(links[0].correctingSrEventId, correcting.srEventId);
  assert.equal(links[0].leaveSpellLineageId, approved.leaveSpellLineageId);
  assert.equal(links[0].correctionType, "REVERSAL");
});

test("PH-07B G04 reconciliation compares the G03 ledger with G12 SR and emits MISSING_SR and ORPHAN_CORRECTION", () => {
  const { relay } = buildRelay();

  // Orphan correction: a cancellation posted with no original approval in the register.
  const orphan = relay.enqueueLeaveCancellation(actor(), {
    leaveApplicationId: "leave-app-ph07b-orphan",
    employeeId: ph03Ids.employee,
    eventDate: "2026-07-25",
    payload: { cancelDate: "2026-07-25" },
  });
  relay.relayEvent(actor(), orphan.id);

  // Missing SR: a ledger debit whose spell never produced an SR event.
  const ledgerEntries = [
    { employeeId: ph03Ids.employee, leaveApplicationId: "leave-app-ph07b-missing", entryType: "DEBIT", units: 2 },
  ];

  const { run, findings } = relay.runReconciliation(actor(), { ledgerEntries });
  assert.equal(run.status, "COMPLETED");
  assert.equal(run.findingsCount, 2);

  const missing = findings.find((finding) => finding.findingType === "MISSING_SR");
  assert.ok(missing, "ledger debit without an SR event must yield a MISSING_SR finding");
  assert.equal(missing.leaveApplicationId, "leave-app-ph07b-missing");
  assert.equal(missing.remediationState, "OPEN");

  const orphanFinding = findings.find((finding) => finding.findingType === "ORPHAN_CORRECTION");
  assert.ok(orphanFinding, "correction without an original must yield an ORPHAN_CORRECTION finding");
  assert.equal(orphanFinding.leaveApplicationId, "leave-app-ph07b-orphan");

  const persisted = relay.listReconciliationFindings(actor(), run.id);
  assert.equal(persisted.length, 2, "reconciliation findings are persisted entities");
});

test("PH-07B G04 reconciliation stays clean when the ledger and SR agree via lineage", () => {
  const { relay } = buildRelay();
  const approved = enqueueApproved(relay, "leave-app-ph07b-clean");
  relay.relayEvent(actor(), approved.id);
  const cancellation = relay.enqueueLeaveCancellation(actor(), {
    leaveApplicationId: "leave-app-ph07b-clean",
    employeeId: ph03Ids.employee,
    eventDate: "2026-07-23",
    payload: { cancelDate: "2026-07-23" },
  });
  relay.relayEvent(actor(), cancellation.id);

  const { run, findings } = relay.runReconciliation(actor(), {
    ledgerEntries: [
      { employeeId: ph03Ids.employee, leaveApplicationId: "leave-app-ph07b-clean", entryType: "DEBIT", units: 2 },
    ],
  });
  assert.equal(run.status, "COMPLETED");
  assert.deepEqual(findings, [], "a matched approve/cancel pair with a correction link yields no findings");
});
