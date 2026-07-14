// PH-16C — G04 versioned mapping catalog, relay partition leases + stuck-in-flight reaper,
// and the pre-pension completeness certificate at BRD depth (FR-G04-02 / FR-G04-15 / FR-G04-18):
//   - sr_event_mapping: DRAFT/PUBLISHED/RETIRED lifecycle; PUBLISHED versions immutable
//     (changes create a new version); mandatory statutory_rule_ref for POST_SR;
//   - NEGATIVE: publishing an intersecting PUBLISHED effective range ->
//     error.code === 'ERR-G04-MAPPING-OVERLAP' (409, VAL-G04-MAPCOVER);
//   - NEGATIVE: a POST_SR mapping without statutory_rule_ref ->
//     error.code === 'VAL-G04-CITATION' (422, fail-closed);
//   - pinned_mapping_version resolved ONCE at first claim and persisted on the outbox row;
//     a reaped retry reuses the pinned version even after a newer version is PUBLISHED;
//   - relay_partition_lease: per-partition in-order claim with claimed_at/lease_expires_at;
//     an ACTIVE lease is never double-claimed; JOB-G04-REAPER returns expired IN_FLIGHT
//     events to retry-eligible with attempt_count incremented and never touches a live lease;
//   - prepension_certificate: PASS only when open_high_critical_findings = 0 AND
//     provisional_entries_remaining = 0 (and lineage complete); FAIL names blocking counts;
//     real SHA-256 checksum over the evidence bundle; append-only; consumed_by_g11_at stamps
//     G11 gate consumption (only a PASS certificate is a valid gate input).
const test = require("node:test");
const assert = require("node:assert/strict");
const { createHash } = require("node:crypto");

const { createFoundationServices, ph03Ids, stableStringify } = require("../../../dist/apps/api/src");

const SIGNER = "user-ph16c-sr-custodian";

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: SIGNER,
    actorUserId: SIGNER,
    permissions: ["*"],
    roles: ["sr_custodian"],
    fieldGrants: ["*"],
    correlationId: "corr-ph16c",
    ...extra,
  };
}

function draft(services, overrides = {}) {
  return services.leaveSrCatalog.createMappingDraft(actor(), {
    leaveTypeCode: "EL",
    eventType: "APPROVED",
    disposition: "POST_SR",
    srEntryType: "EL_AVAILED",
    qualifyingServiceRule: "QUALIFYING",
    statutoryRuleRef: "CCS (Leave) Rules 1972 r.26",
    effectiveFrom: "2026-01-01",
    ...overrides,
  });
}

function enqueueApproved(services, overrides = {}) {
  return services.leaveSrRelay.enqueueApprovedLeave(actor(), {
    leaveApplicationId: "leave-ph16c-1",
    employeeId: "emp-ph16c-1",
    eventDate: "2026-06-01",
    leaveTypeCode: "EL",
    payload: { leaveTypeCode: "EL", daysCount: 10 },
    ...overrides,
  });
}

// =======================================================================================
// FR-G04-02 — versioned sr_event_mapping catalog
// =======================================================================================

test("PH-16C sr_event_mapping lifecycle: DRAFT is editable, PUBLISHED is immutable, RETIRED closes the version", async () => {
  const services = createFoundationServices();
  const mapping = draft(services);
  assert.equal(mapping.status, "DRAFT");
  assert.equal(mapping.mappingVersion, 1);

  const edited = services.leaveSrCatalog.editMappingDraft(actor(), mapping.id, { annotationTemplate: "Availed {days} days EL" });
  assert.equal(edited.annotationTemplate, "Availed {days} days EL");

  const published = services.leaveSrCatalog.publishMapping(actor(), mapping.id);
  assert.equal(published.status, "PUBLISHED");

  // Immutable once PUBLISHED: edits are rejected; changes create a new version.
  assert.throws(
    () => services.leaveSrCatalog.editMappingDraft(actor(), mapping.id, { annotationTemplate: "nope" }),
    (error) => error.code === "CONFLICT"
  );

  const retired = services.leaveSrCatalog.retireMapping(actor(), mapping.id);
  assert.equal(retired.status, "RETIRED");
  // A RETIRED version can be neither re-published nor re-retired.
  assert.throws(
    () => services.leaveSrCatalog.publishMapping(actor(), mapping.id),
    (error) => error.code === "CONFLICT"
  );

  // The next draft for the same (leave_type_code, event_type) allocates version 2.
  const next = draft(services);
  assert.equal(next.mappingVersion, 2);
});

test("PH-16C NEGATIVE overlap: publishing an intersecting PUBLISHED effective range is rejected ERR-G04-MAPPING-OVERLAP", async () => {
  const services = createFoundationServices();
  const bounded = draft(services, { effectiveFrom: "2026-01-01", effectiveTo: "2026-05-31" });
  services.leaveSrCatalog.publishMapping(actor(), bounded.id);

  // Adjacent (non-intersecting) range publishes cleanly.
  const adjacent = draft(services, { effectiveFrom: "2026-06-01" });
  services.leaveSrCatalog.publishMapping(actor(), adjacent.id);

  // Intersecting range: rejected at publish with the registered code (409).
  const overlapping = draft(services, { effectiveFrom: "2026-05-01" });
  assert.throws(
    () => services.leaveSrCatalog.publishMapping(actor(), overlapping.id),
    (error) => error.code === "ERR-G04-MAPPING-OVERLAP" && error.details.conflictingMappingIds.length > 0
  );
  // The rejected version stays DRAFT — publish is atomic, nothing half-published.
  const rows = services.leaveSrCatalog.listMappings(actor());
  assert.equal(rows.find((row) => row.id === overlapping.id).status, "DRAFT");

  // A different (leave_type_code, event_type) key never trips the overlap guard.
  const otherKey = draft(services, { leaveTypeCode: "HPL", srEntryType: "HPL_AVAILED", effectiveFrom: "2026-01-01" });
  services.leaveSrCatalog.publishMapping(actor(), otherKey.id);
});

test("PH-16C NEGATIVE citation: a POST_SR mapping without statutory_rule_ref fails closed VAL-G04-CITATION", async () => {
  const services = createFoundationServices();
  // Create-time guard (mirrors ck_sr_mapping_post_sr at publish depth).
  assert.throws(
    () => draft(services, { statutoryRuleRef: undefined }),
    (error) => error.code === "VAL-G04-CITATION" && error.field === "statutory_rule_ref"
  );
  // Edit-time guard: a draft cannot shed its citation while staying POST_SR.
  const mapping = draft(services);
  assert.throws(
    () => services.leaveSrCatalog.editMappingDraft(actor(), mapping.id, { statutoryRuleRef: undefined }),
    (error) => error.code === "VAL-G04-CITATION"
  );
  // EXCLUDED_NON_SR needs no citation (and must not carry an SR target type).
  const excluded = draft(services, {
    leaveTypeCode: "CASUAL",
    disposition: "EXCLUDED_NON_SR",
    srEntryType: undefined,
    qualifyingServiceRule: undefined,
    statutoryRuleRef: undefined,
  });
  assert.equal(services.leaveSrCatalog.publishMapping(actor(), excluded.id).status, "PUBLISHED");
});

// =======================================================================================
// FR-G04-02 BR3 + FR-G04-15 — pin at first claim, relay_partition_lease, JOB-G04-REAPER
// =======================================================================================

test("PH-16C pinned_mapping_version is resolved once at first claim and reused across a reaped retry", async () => {
  // lease_timeout 0: the claim's lease_expires_at is already past, so the reaper can recover it.
  const services = createFoundationServices({ g04LeaseTimeoutMs: 0 });
  const v1 = draft(services, { effectiveFrom: "2026-01-01" });
  services.leaveSrCatalog.publishMapping(actor(), v1.id);
  const event = enqueueApproved(services);

  // First claim: IN_FLIGHT with claimed_at/lease_expires_at, pinned to version 1.
  const first = services.leaveSrCatalog.claimPartition(actor(), { partitionKey: "emp-ph16c-1", workerId: "worker-a" });
  assert.equal(first.claimedEvents.length, 1);
  assert.equal(first.claimedEvents[0].status, "IN_FLIGHT");
  assert.equal(first.claimedEvents[0].pinnedMappingVersion, 1);
  assert.ok(first.claimedEvents[0].claimedAt);
  assert.ok(first.claimedEvents[0].leaseExpiresAt);

  // Worker crashes mid-post: the reaper returns the row to retry-eligible (attempt_count + 1).
  const sweep = services.leaveSrCatalog.runReaperSweep(actor(), { runKey: "reap-1" });
  assert.equal(sweep.reapedEvents.length, 1);
  assert.equal(sweep.reapedEvents[0].status, "FAILED");
  assert.equal(sweep.reapedEvents[0].attempts, 1);
  assert.equal(sweep.reapedEvents[0].pinnedMappingVersion, 1);

  // The catalog moves on: v1 retired, v2 published over the same range.
  services.leaveSrCatalog.retireMapping(actor(), v1.id);
  const v2 = draft(services, { statutoryRuleRef: "CCS (Leave) Rules 1972 r.26 (amended)" });
  assert.equal(services.leaveSrCatalog.publishMapping(actor(), v2.id).mappingVersion, 2);

  // Retry claim: the persisted pinned_mapping_version is REUSED, never recomputed (BRD rule 3).
  const retry = services.leaveSrCatalog.claimPartition(actor(), { partitionKey: "emp-ph16c-1", workerId: "worker-b" });
  assert.equal(retry.claimedEvents.length, 1);
  assert.equal(retry.claimedEvents[0].pinnedMappingVersion, 1);
  // A fresh spell enqueued after the remap pins the new version.
  enqueueApproved(services, { leaveApplicationId: "leave-ph16c-2", employeeId: "emp-ph16c-2" });
  const fresh = services.leaveSrCatalog.claimPartition(actor(), { partitionKey: "emp-ph16c-2", workerId: "worker-c" });
  assert.equal(fresh.claimedEvents[0].pinnedMappingVersion, 2);
});

test("PH-16C relay_partition_lease: an ACTIVE lease is never double-claimed; claims run in event_sequence order", async () => {
  const services = createFoundationServices();
  const mapping = draft(services);
  services.leaveSrCatalog.publishMapping(actor(), mapping.id);
  const cancelMapping = draft(services, { eventType: "CANCELLED", srEntryType: "EL_AVAILED_REVERSAL" });
  services.leaveSrCatalog.publishMapping(actor(), cancelMapping.id);
  enqueueApproved(services, { leaveApplicationId: "leave-seq-a", leaveSpellLineageId: "lineage-seq" });
  services.leaveSrRelay.enqueueLeaveCancellation(actor(), {
    leaveApplicationId: "leave-seq-a",
    employeeId: "emp-ph16c-1",
    eventDate: "2026-06-05",
    leaveTypeCode: "EL",
    leaveSpellLineageId: "lineage-seq",
    payload: { leaveTypeCode: "EL", daysCount: 10 },
  });

  const claim = services.leaveSrCatalog.claimPartition(actor(), { partitionKey: "emp-ph16c-1", workerId: "worker-a" });
  assert.equal(claim.lease.status, "ACTIVE");
  assert.deepEqual(claim.claimedEvents.map((event) => event.eventSequence), [1, 2]);
  assert.equal(claim.lease.lastProcessedSequence, 2);

  // Live lease: a second claim on the same partition is rejected, never double-claimed.
  assert.throws(
    () => services.leaveSrCatalog.claimPartition(actor(), { partitionKey: "emp-ph16c-1", workerId: "worker-b" }),
    (error) => error.code === "CONFLICT"
  );
  // Released lease frees the partition for the next in-order claim.
  services.leaveSrCatalog.releaseLease(actor(), claim.lease.id);
  const next = services.leaveSrCatalog.claimPartition(actor(), { partitionKey: "emp-ph16c-1", workerId: "worker-b" });
  assert.equal(next.claimedEvents.length, 0); // nothing eligible; both rows still IN_FLIGHT
});

test("PH-16C JOB-G04-REAPER: expired IN_FLIGHT reaped to retry-eligible with attempt_count incremented; a live lease is untouched", async () => {
  // Expired path (lease_timeout 0).
  const expired = createFoundationServices({ g04LeaseTimeoutMs: 0 });
  const m1 = draft(expired);
  expired.leaveSrCatalog.publishMapping(actor(), m1.id);
  enqueueApproved(expired);
  const claim = expired.leaveSrCatalog.claimPartition(actor(), { partitionKey: "emp-ph16c-1", workerId: "worker-a" });
  assert.equal(claim.claimedEvents[0].status, "IN_FLIGHT");
  const sweep = expired.leaveSrCatalog.runReaperSweep(actor(), { runKey: "reap-expired" });
  assert.equal(sweep.job.status, "SUCCEEDED");
  assert.equal(sweep.job.outcomeDetail.reaped_in_flight_count, 1);
  assert.equal(sweep.reapedEvents[0].status, "FAILED"); // retry-eligible, never silently lost
  assert.equal(sweep.reapedEvents[0].attempts, 1); // attempt_count = attempt_count + 1
  assert.equal(sweep.releasedLeases.length, 1);
  assert.equal(sweep.releasedLeases[0].status, "EXPIRED");
  // The reaped row is immediately claimable again (fail-closed recovery, not a dead end).
  const reclaimed = expired.leaveSrCatalog.claimPartition(actor(), { partitionKey: "emp-ph16c-1", workerId: "worker-b" });
  assert.equal(reclaimed.claimedEvents.length, 1);

  // Live path (default lease_timeout 120000 ms per integration_config): nothing is reaped.
  const live = createFoundationServices();
  const m2 = draft(live);
  live.leaveSrCatalog.publishMapping(actor(), m2.id);
  enqueueApproved(live);
  live.leaveSrCatalog.claimPartition(actor(), { partitionKey: "emp-ph16c-1", workerId: "worker-live" });
  const liveSweep = live.leaveSrCatalog.runReaperSweep(actor(), { runKey: "reap-live" });
  assert.equal(liveSweep.reapedEvents.length, 0);
  assert.equal(liveSweep.releasedLeases.length, 0);
  const outbox = live.leaveSrRelay.list(actor());
  assert.equal(outbox[0].status, "IN_FLIGHT"); // live IN_FLIGHT untouched
  assert.equal(outbox[0].attempts, 0);
  assert.equal(live.leaveSrCatalog.listLeases(actor())[0].status, "ACTIVE");
});

test("PH-16C claim settles unmapped and excluded events fail-closed (MAPPING_MISSING DLQ / EXCLUDED no-op)", async () => {
  const services = createFoundationServices();
  const excluded = draft(services, {
    leaveTypeCode: "CASUAL",
    disposition: "EXCLUDED_NON_SR",
    srEntryType: undefined,
    qualifyingServiceRule: undefined,
    statutoryRuleRef: undefined,
  });
  services.leaveSrCatalog.publishMapping(actor(), excluded.id);
  // CASUAL -> EXCLUDED_NON_SR no-op; LWP has no PUBLISHED mapping at all -> DLQ.
  enqueueApproved(services, { leaveApplicationId: "leave-casual", employeeId: "emp-mix", leaveTypeCode: "CASUAL", payload: { leaveTypeCode: "CASUAL", daysCount: 2 } });
  enqueueApproved(services, { leaveApplicationId: "leave-lwp", employeeId: "emp-mix", leaveTypeCode: "LWP", payload: { leaveTypeCode: "LWP", daysCount: 30 } });

  const claim = services.leaveSrCatalog.claimPartition(actor(), { partitionKey: "emp-mix", workerId: "worker-a" });
  const byApp = new Map(claim.claimedEvents.map((event) => [event.leaveApplicationId, event]));
  assert.equal(byApp.get("leave-casual").status, "EXCLUDED");
  assert.equal(byApp.get("leave-casual").pinnedMappingVersion, 1);
  assert.equal(byApp.get("leave-lwp").status, "DEAD_LETTERED");
  const deadLetter = services.leaveSrRelay.listDeadLetters(actor()).find((record) => record.outboxEventId === byApp.get("leave-lwp").id);
  assert.equal(deadLetter.failureClass, "MAPPING_MISSING");
});

// =======================================================================================
// FR-G04-18 — prepension_certificate (G11 gate input)
// =======================================================================================

/** Post an approved NON_QUALIFYING LWP spell end-to-end so lineage is complete. */
function settleLwpSpell(services, employeeId, days) {
  const mapping = draft(services, {
    leaveTypeCode: "LWP",
    srEntryType: "LWP_SPELL",
    qualifyingServiceRule: "NON_QUALIFYING",
    statutoryRuleRef: "FR 17-A non-qualifying service",
  });
  services.leaveSrCatalog.publishMapping(actor(), mapping.id);
  const event = enqueueApproved(services, {
    leaveApplicationId: `leave-${employeeId}`,
    employeeId,
    leaveTypeCode: "LWP",
    payload: { leaveTypeCode: "LWP", daysCount: days },
  });
  services.leaveSrCatalog.claimPartition(actor(), { partitionKey: employeeId, workerId: "worker-cert" });
  services.leaveSrRelay.relayEvent(actor(), event.id); // IN_FLIGHT -> POSTED
  return event;
}

test("PH-16C prepension_certificate PASS: zero open findings, zero provisional, lineage complete, SHA-256 checksum, G11 consumption", async () => {
  const services = createFoundationServices();
  const employeeId = "emp-cert-pass";
  settleLwpSpell(services, employeeId, 121);

  const { run } = services.leaveSrRelay.runReconciliation(actor(), { ledgerEntries: [], runType: "PRE_PENSION" });
  const certificate = services.leaveSrCatalog.issuePrepensionCertificate(actor(), { employeeId, runId: run.id });
  assert.equal(certificate.result, "PASS");
  assert.equal(certificate.evidence.open_high_critical_findings, 0);
  assert.equal(certificate.evidence.provisional_entries_remaining, 0);
  assert.equal(certificate.evidence.lineage_complete, true);
  // total_non_qualifying_days sourced solely from the PINNED mapping (BR-02.2 / AC4).
  assert.equal(certificate.totalNonQualifyingDays, 121);
  assert.equal(certificate.signedBy, SIGNER);
  // Real SHA-256 over the certified evidence bundle — recomputable, not a constant.
  assert.match(certificate.checksum, /^[0-9a-f]{64}$/);
  assert.equal(certificate.checksum, createHash("sha256").update(stableStringify(certificate.evidence)).digest("hex"));

  // G11 gate consumption stamps consumed_by_g11_at once; re-consumption is idempotent.
  const consumed = services.leaveSrCatalog.consumeCertificateForG11(actor(), certificate.id);
  assert.ok(consumed.consumedByG11At);
  assert.equal(services.leaveSrCatalog.consumeCertificateForG11(actor(), certificate.id).consumedByG11At, consumed.consumedByG11At);
  assert.equal(services.leaveSrCatalog.getLatestCertificate(actor(), employeeId).id, certificate.id);
});

test("PH-16C prepension_certificate FAIL: an open HIGH/CRITICAL finding blocks PASS and names the blocking counts", async () => {
  const services = createFoundationServices();
  const employeeId = "emp-cert-findings";
  // A G03 ledger debit with no SR event -> MISSING_SR (HIGH) finding in the PRE_PENSION run.
  const { run, findings } = services.leaveSrRelay.runReconciliation(actor(), {
    ledgerEntries: [{ employeeId, leaveApplicationId: "leave-unposted", entryType: "DEBIT", units: 10 }],
    runType: "PRE_PENSION",
  });
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "HIGH");

  const certificate = services.leaveSrCatalog.issuePrepensionCertificate(actor(), { employeeId, runId: run.id });
  assert.equal(certificate.result, "FAIL");
  assert.equal(certificate.evidence.open_high_critical_findings, 1); // blocking count named
  assert.deepEqual(certificate.evidence.open_finding_ids, [findings[0].id]);
  assert.match(certificate.checksum, /^[0-9a-f]{64}$/);

  // A FAIL certificate is not a valid G11 gate input.
  assert.throws(
    () => services.leaveSrCatalog.consumeCertificateForG11(actor(), certificate.id),
    (error) => error.code === "PRECONDITION_FAILED" && error.details.open_high_critical_findings === 1
  );
});

test("PH-16C prepension_certificate FAIL: a remaining PROVISIONAL migrated entry blocks PASS until adjudicated; append-only re-issue", async () => {
  const services = createFoundationServices();
  const employeeId = "emp-cert-provisional";
  const record = services.leaveSrCatalog.recordProvisionalMigratedEntry(actor(), {
    employeeId,
    leaveTypeCode: "EL",
    daysCount: 12,
  });
  const { run } = services.leaveSrRelay.runReconciliation(actor(), { ledgerEntries: [], runType: "PRE_PENSION" });

  const failed = services.leaveSrCatalog.issuePrepensionCertificate(actor(), { employeeId, runId: run.id });
  assert.equal(failed.result, "FAIL");
  assert.equal(failed.evidence.provisional_entries_remaining, 1); // blocking count named
  assert.deepEqual(failed.evidence.provisional_record_ids, [record.id]);

  // Adjudication clears the block; the re-issued certificate APPENDS (never mutates the FAIL).
  services.leaveSrCatalog.adjudicateMigratedEntry(actor(), record.id, "ADJUDICATED_CONFIRMED");
  const passed = services.leaveSrCatalog.issuePrepensionCertificate(actor(), { employeeId, runId: run.id });
  assert.equal(passed.result, "PASS");
  assert.equal(passed.evidence.provisional_entries_remaining, 0);
  assert.notEqual(passed.id, failed.id);
  assert.notEqual(passed.checksum, failed.checksum); // checksum tracks the evidence, not a constant
  const history = services.leaveSrCatalog.listCertificates(actor(), employeeId);
  assert.deepEqual(history.map((item) => item.result), ["FAIL", "PASS"]);
  assert.equal(services.leaveSrCatalog.getLatestCertificate(actor(), employeeId).result, "PASS");
});

test("PH-16C prepension_certificate requires a COMPLETED PRE_PENSION run; unsettled lineage blocks PASS", async () => {
  const services = createFoundationServices();
  const employeeId = "emp-cert-lineage";
  // Wrong run type (ON_DEMAND) is rejected outright (FR-18 AC1).
  const onDemand = services.leaveSrRelay.runReconciliation(actor(), { ledgerEntries: [] });
  assert.throws(
    () => services.leaveSrCatalog.issuePrepensionCertificate(actor(), { employeeId, runId: onDemand.run.id }),
    (error) => error.code === "PRECONDITION_FAILED"
  );

  // An event still READY (never settled) breaks lineage completeness -> FAIL.
  const mapping = draft(services);
  services.leaveSrCatalog.publishMapping(actor(), mapping.id);
  enqueueApproved(services, { leaveApplicationId: "leave-lineage", employeeId });
  const { run } = services.leaveSrRelay.runReconciliation(actor(), {
    ledgerEntries: [{ employeeId, leaveApplicationId: "leave-lineage", entryType: "DEBIT", units: 10 }],
    runType: "PRE_PENSION",
  });
  const certificate = services.leaveSrCatalog.issuePrepensionCertificate(actor(), { employeeId, runId: run.id });
  assert.equal(certificate.result, "FAIL");
  assert.equal(certificate.evidence.lineage_complete, false);
  assert.equal(certificate.evidence.incomplete_lineage_ids.length, 1);
});
