// PH-16B — G02 bulk corrections, fraud/velocity risk signals, and employment-status gating
// at BRD depth (FR-G02-009 / FR-G02-018 / FR-G02-019):
//   - bulk_correction_batches: dry-run validation with row-level reasons, aggregate P01
//     approval (SoD approver != initiator), per-row idempotent commit, PARTIAL_FAILED when a
//     seeded row fails (never wholesale rollback), replay is a no-op;
//   - cr_risk_signals (append-only): DUPLICATE_BANK_ACCOUNT (mule) and
//     AUTH_CHANNEL_THEN_FINANCIAL detectors, risk_score/risk_band aggregation;
//   - NEGATIVE: commit while risk_band=BLOCKED -> error.code === 'ERR-G02-RISKBLOCK' (412)
//     until a fraud reviewer distinct from the requester clears; CONFIRMED_FRAUD rejects and
//     keeps the block;
//   - NEGATIVE: self-service on a non-ACTIVE employment_status_at_submit ->
//     error.code === 'ERR-G02-STATUSGATE' (403);
//   - DECEASED bank/nominee -> elevated family-pension path with dual control (never auto-apply).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const HR_MAKER = "user-ph16b-hr-maker";
const APPROVER = "user-ph16b-approver";
const SECOND_APPROVER = "user-ph16b-approver-2";
const FRAUD_REVIEWER = "user-ph16b-fraud-reviewer";

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: HR_MAKER,
    actorUserId: HR_MAKER,
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: ["*"],
    correlationId: "corr-ph16b",
    ...extra,
  };
}

function approver(extra = {}) {
  return actor({ userId: APPROVER, actorUserId: APPROVER, ...extra });
}

function reviewer(extra = {}) {
  return actor({ userId: FRAUD_REVIEWER, actorUserId: FRAUD_REVIEWER, ...extra });
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph16b", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

let idemCounter = 0;
function idem() {
  idemCounter += 1;
  return `idem-ph16b-${idemCounter}`;
}

function createEmployee(services, firstName) {
  return services.employeeMaster.create(actor(), {
    firstName,
    orgUnitId: ph03Ids.orgRevenue,
    dateOfJoining: "2019-04-01",
  }).employee;
}

/** FR-EPM-018 maker+checker separation flow to move an employee to the target status. */
function separateEmployee(services, employeeId, targetStatus) {
  services.employeeIdentityOps.initiateSeparation(actor(), {
    employeeId,
    targetStatus,
    separationDate: "2026-07-01",
    separationReason: `PH-16B ${targetStatus} fixture`,
  });
  services.employeeIdentityOps.approveSeparation(approver(), { employeeId });
}

function submitHrChange(services, employeeId, fieldKey, newValue, extra = {}) {
  return services.changeGovernance.submitChange(actor(), {
    employeeId,
    fieldKey,
    newValue,
    reason: "PH-16B governed change",
    origin: "HR_ON_BEHALF",
    ...extra,
  });
}

// =======================================================================================
// FR-G02-009 — bulk corrections
// =======================================================================================

test("PH-16B bulk dry-run reports total/valid/invalid with row-level reasons (bulk_correction_batches VALIDATED)", () => {
  const services = createFoundationServices();
  const empA = createEmployee(services, "BulkA");
  const empB = createEmployee(services, "BulkB");
  const batch = services.changeGovernance.createBatch(actor(), {
    rows: [
      { employeeId: empA.id, fieldKey: "bankAccountNumber", newValue: "SBIN0001-111" },
      { employeeId: empB.id, fieldKey: "displayName", newValue: "Bulk B Corrected" },
      { employeeId: "emp-does-not-exist", fieldKey: "displayName", newValue: "Ghost" },
      // duplicate field per employee inside one batch -> rejected, not silently skipped (BR2)
      { employeeId: empA.id, fieldKey: "bankAccountNumber", newValue: "SBIN0001-222" },
    ],
    reason: "Mass data cleanup",
  });
  assert.equal(batch.status, "UPLOADED");
  assert.match(batch.batchNumber, /^BLK-2026-/);

  const report = services.changeGovernance.validateBatch(actor(), batch.id);
  assert.equal(report.status, "VALIDATED");
  assert.equal(report.totalRows, 4);
  assert.equal(report.validRows, 2);
  assert.equal(report.invalidRows, 2);
  assert.deepEqual(report.rows.find((row) => row.rowNo === 3).reasons, ["EMPLOYEE_NOT_FOUND"]);
  assert.deepEqual(report.rows.find((row) => row.rowNo === 4).reasons, ["DUPLICATE_FIELD_FOR_EMPLOYEE"]);
});

test("PH-16B bulk aggregate approval commits per-row idempotently; a seeded failing row ends the batch PARTIAL_FAILED", () => {
  const services = createFoundationServices();
  const empMule = createEmployee(services, "MuleSeed");
  const empA = createEmployee(services, "RowA");
  const empB = createEmployee(services, "RowB");
  // Seeded failing row: another employee already requested the SAME new bank account, so the
  // batch child for empA fires DUPLICATE_BANK_ACCOUNT (BLOCK) and its commit is held.
  submitHrChange(services, empMule.id, "bankAccountNumber", "HDFC0009-SHARED");

  const batch = services.changeGovernance.createBatch(actor(), {
    rows: [
      { employeeId: empA.id, fieldKey: "bankAccountNumber", newValue: "HDFC0009-SHARED" },
      { employeeId: empB.id, fieldKey: "displayName", newValue: "Row B Corrected" },
    ],
    reason: "Bulk with a blocked row",
  });
  services.changeGovernance.validateBatch(actor(), batch.id);
  const submitted = services.changeGovernance.submitBatch(actor(), batch.id);
  assert.equal(submitted.status, "PENDING_APPROVAL");
  assert.equal(submitted.highestSensitivity, "HIGH");

  const childRows = services.changeGovernance.getBatchReport(actor(), batch.id);
  assert.equal(childRows.validRows, 2);

  // BR3 SoD: the initiator cannot approve the aggregate batch.
  assert.throws(
    () => services.changeGovernance.approveBatch(actor(), batch.id),
    (error) => error.code === "FORBIDDEN"
  );

  const decided = services.changeGovernance.approveBatch(approver(), batch.id);
  assert.equal(decided.status, "PARTIAL_FAILED");
  const failedRow = decided.commitReport.find((row) => row.rowNo === 1);
  const committedRow = decided.commitReport.find((row) => row.rowNo === 2);
  assert.equal(failedRow.committed, false);
  assert.equal(failedRow.errorCode, "ERR-G02-RISKBLOCK");
  assert.equal(committedRow.committed, true);

  const committedChild = services.changeGovernance.commitChange(
    approver(),
    committedRow.changeRequestId,
    `${batch.id}:row:2`
  );
  assert.equal(committedChild.status, "COMMITTED");
  assert.equal(committedChild.employmentStatusAtSubmit, "ACTIVE");
  const firstCommittedAt = committedChild.committedAt;

  // Replaying the batch commit is a per-row no-op: the committed row keeps its timestamp,
  // the blocked row stays failed, the batch stays PARTIAL_FAILED.
  const replayed = services.changeGovernance.commitBatch(approver(), batch.id);
  assert.equal(replayed.status, "PARTIAL_FAILED");
  const replayedChild = services.changeGovernance.commitChange(approver(), committedRow.changeRequestId, `${batch.id}:row:2`);
  assert.equal(replayedChild.committedAt, firstCommittedAt);

  // After the fraud reviewer clears the blocking signal, a retry commits the remaining row.
  const risk = services.changeGovernance.getRisk(actor(), failedRow.changeRequestId);
  assert.equal(risk.riskBand, "BLOCKED");
  services.changeGovernance.reviewRiskSignal(reviewer(), failedRow.changeRequestId, risk.signals[0].id, {
    outcome: "CLEARED",
    comment: "Verified joint family account with branch",
  });
  const retried = services.changeGovernance.commitBatch(approver(), batch.id);
  assert.equal(retried.status, "COMMITTED");
  assert.equal(retried.commitReport.every((row) => row.committed), true);
});

// =======================================================================================
// FR-G02-019 — detectors over the append-only cr_risk_signals ledger
// =======================================================================================

test("PH-16B mule detector: the same new bank account across two employees fires DUPLICATE_BANK_ACCOUNT into cr_risk_signals", () => {
  const services = createFoundationServices();
  const empOne = createEmployee(services, "MuleOne");
  const empTwo = createEmployee(services, "MuleTwo");
  const first = submitHrChange(services, empOne.id, "bankAccountNumber", "ICIC0044-999");
  assert.equal(first.riskBand, "LOW");

  const second = submitHrChange(services, empTwo.id, "bankAccountNumber", "ICIC0044-999");
  const risk = services.changeGovernance.getRisk(actor(), second.id);
  assert.equal(risk.signals.length, 1);
  assert.equal(risk.signals[0].signalType, "DUPLICATE_BANK_ACCOUNT");
  assert.equal(risk.signals[0].severity, "BLOCK");
  // AC4: the signal surfaces the linked employees as evidence.
  assert.deepEqual(risk.signals[0].detail.matchedEmployeeIds, [empOne.id]);
  assert.equal(risk.riskBand, "BLOCKED");
  assert.equal(risk.riskScore, 70);
  assert.equal(risk.fraudReviewRequired, true);
  // AC6: the blocked request surfaces on the fraud-review queue.
  assert.equal(
    services.changeGovernance.listFraudQueue(actor()).some((item) => item.id === second.id),
    true
  );
});

test("PH-16B velocity chain: an auth-channel change followed by a financial change fires AUTH_CHANNEL_THEN_FINANCIAL", () => {
  const services = createFoundationServices();
  const emp = createEmployee(services, "AuthChain");
  submitHrChange(services, emp.id, "mobileNumber", "+91-99999-11111");
  const financial = submitHrChange(services, emp.id, "bankAccountNumber", "UTIB0777-001");

  const risk = services.changeGovernance.getRisk(actor(), financial.id);
  const signal = risk.signals.find((item) => item.signalType === "AUTH_CHANNEL_THEN_FINANCIAL");
  assert.ok(signal, "expected the AUTH_CHANNEL_THEN_FINANCIAL signal to fire");
  assert.equal(signal.severity, "HIGH");
  assert.equal(risk.riskBand, "HIGH");
  // FR-G02-002 AC7: a HIGH band injects the mandatory fraud-review stage before approval.
  assert.equal(risk.fraudReviewRequired, true);
});

test("PH-16B NEGATIVE: commit while risk_band=BLOCKED fails closed with ERR-G02-RISKBLOCK (412) until a reviewer clears", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const empOne = createEmployee(services, "BlockOne");
  const empTwo = createEmployee(services, "BlockTwo");
  submitHrChange(services, empOne.id, "bankAccountNumber", "PUNB0123-777");
  const blocked = submitHrChange(services, empTwo.id, "bankAccountNumber", "PUNB0123-777");
  assert.equal(blocked.riskBand, "BLOCKED");

  // Approval is not the hold — commit is (signal-after-approval edge: commit held, review forced).
  const approved = services.changeGovernance.approveChange(approver(), blocked.id);
  assert.equal(approved.status, "APPROVED");
  assert.throws(
    () => services.changeGovernance.commitChange(approver(), blocked.id, idem()),
    (error) => error.code === "ERR-G02-RISKBLOCK"
  );
  // Wire contract: the registered code maps to 412 PRECONDITION on the API surface.
  const response = call(api, {
    method: "POST",
    path: `/api/v1/change-requests/${blocked.id}:commit`,
    headers: { "Idempotency-Key": idem() },
    actor: { userId: APPROVER, actorUserId: APPROVER },
  });
  assert.equal(response.status, 412);
  assert.equal(response.body.error.code, "ERR-G02-RISKBLOCK");

  // The requester can never review their own request's signals (fail-closed SoD).
  const risk = services.changeGovernance.getRisk(actor(), blocked.id);
  assert.throws(
    () => services.changeGovernance.reviewRiskSignal(actor(), blocked.id, risk.signals[0].id, { outcome: "CLEARED", comment: "self" }),
    (error) => error.code === "FORBIDDEN"
  );

  // A distinct fraud reviewer clears the signal (review fields mutate; the ledger row stays).
  const cleared = services.changeGovernance.reviewRiskSignal(reviewer(), blocked.id, risk.signals[0].id, {
    outcome: "CLEARED",
    comment: "Legitimate shared family account, verified against passbook",
  });
  assert.equal(cleared.signal.reviewOutcome, "CLEARED");
  assert.equal(cleared.signal.signalType, "DUPLICATE_BANK_ACCOUNT");
  assert.equal(cleared.request.riskBand, "LOW");
  const committed = services.changeGovernance.commitChange(approver(), blocked.id, idem());
  assert.equal(committed.status, "COMMITTED");
});

test("PH-16B confirmed fraud keeps the block: CONFIRMED_FRAUD rejects the request and commit still throws ERR-G02-RISKBLOCK", () => {
  const services = createFoundationServices();
  const empOne = createEmployee(services, "FraudOne");
  const empTwo = createEmployee(services, "FraudTwo");
  submitHrChange(services, empOne.id, "bankAccountNumber", "BARB0555-321");
  const blocked = submitHrChange(services, empTwo.id, "bankAccountNumber", "BARB0555-321");

  const risk = services.changeGovernance.getRisk(actor(), blocked.id);
  const confirmed = services.changeGovernance.reviewRiskSignal(reviewer(), blocked.id, risk.signals[0].id, {
    outcome: "CONFIRMED_FRAUD",
    comment: "Same account credited from four unrelated employees",
  });
  // BR2: a confirmed signal rejects the request; the block is never lifted.
  assert.equal(confirmed.request.status, "REJECTED");
  assert.equal(confirmed.request.riskBand, "BLOCKED");
  assert.throws(
    () => services.changeGovernance.commitChange(approver(), blocked.id, idem()),
    (error) => error.code === "ERR-G02-RISKBLOCK"
  );
});

// =======================================================================================
// FR-G02-018 — employment-status gate + DECEASED elevation
// =======================================================================================

test("PH-16B NEGATIVE: self-service on a non-ACTIVE target fails closed with ERR-G02-STATUSGATE (403)", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const emp = createEmployee(services, "RetiredSelf");
  separateEmployee(services, emp.id, "RETIRED");

  assert.throws(
    () =>
      services.changeGovernance.submitChange(actor(), {
        employeeId: emp.id,
        fieldKey: "mobileNumber",
        newValue: "+91-88888-00000",
        reason: "post-retirement update",
        origin: "SELF_SERVICE",
      }),
    (error) => error.code === "ERR-G02-STATUSGATE"
  );
  // Wire contract: 403 FORBIDDEN with the registered code.
  const response = call(api, {
    method: "POST",
    path: "/api/v1/change-requests",
    headers: { "Idempotency-Key": idem() },
    body: { employeeId: emp.id, fieldKey: "mobileNumber", newValue: "+91-88888-00000", reason: "self", origin: "SELF_SERVICE" },
  });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, "ERR-G02-STATUSGATE");

  // AC2: HR-on-behalf on the same non-ACTIVE record is permitted only via the elevated route.
  const hrRoute = submitHrChange(services, emp.id, "mobileNumber", "+91-88888-00000");
  assert.equal(hrRoute.employmentStatusAtSubmit, "RETIRED");
  assert.equal(hrRoute.elevatedPath, "STATUS_ELEVATED");
  assert.equal(hrRoute.requiredApprovals, 2);
});

test("PH-16B DECEASED elevation: bank change routes to the family-pension controlled path with dual control, never auto-applied", () => {
  const services = createFoundationServices();
  const emp = createEmployee(services, "FamilyPension");
  separateEmployee(services, emp.id, "DECEASED");

  // Self-service on a DECEASED record is always blocked (AC1).
  assert.throws(
    () =>
      services.changeGovernance.submitChange(actor(), {
        employeeId: emp.id,
        fieldKey: "bankAccountNumber",
        newValue: "SBIN0300-100",
        reason: "family pension account",
        origin: "SELF_SERVICE",
      }),
    (error) => error.code === "ERR-G02-STATUSGATE"
  );

  const request = submitHrChange(services, emp.id, "bankAccountNumber", "SBIN0300-100", {
    reason: "Family pension bank account with succession evidence",
  });
  assert.equal(request.employmentStatusAtSubmit, "DECEASED");
  assert.equal(request.elevatedPath, "FAMILY_PENSION");
  assert.equal(request.workflowStage, "PENDING_FAMILY_PENSION_SANCTION");
  assert.equal(request.requiredApprovals, 2);

  // P02 SoD: the requester can never sanction their own elevated request.
  assert.throws(
    () => services.changeGovernance.approveChange(actor(), request.id),
    (error) => error.code === "FORBIDDEN"
  );
  // First sanction alone never applies the change (BR2 dual control).
  const firstSanction = services.changeGovernance.approveChange(approver(), request.id);
  assert.equal(firstSanction.status, "IN_REVIEW");
  assert.throws(
    () => services.changeGovernance.commitChange(approver(), request.id, idem()),
    (error) => error.code === "PRECONDITION_FAILED"
  );
  // The same authority cannot double-sanction (VAL-G02-DUALAUTH).
  assert.throws(
    () => services.changeGovernance.approveChange(approver(), request.id),
    (error) => error.code === "FORBIDDEN"
  );
  const secondSanction = services.changeGovernance.approveChange(
    actor({ userId: SECOND_APPROVER, actorUserId: SECOND_APPROVER }),
    request.id
  );
  assert.equal(secondSanction.status, "APPROVED");
  const committed = services.changeGovernance.commitChange(approver(), request.id, idem());
  assert.equal(committed.status, "COMMITTED");
});

test("PH-16B bulk rows on non-ACTIVE employees are flagged for the elevated path in the dry-run report (BR5)", () => {
  const services = createFoundationServices();
  const active = createEmployee(services, "ActiveRow");
  const deceased = createEmployee(services, "DeceasedRow");
  separateEmployee(services, deceased.id, "DECEASED");

  const batch = services.changeGovernance.createBatch(actor(), {
    rows: [
      { employeeId: active.id, fieldKey: "displayName", newValue: "Active Row Fixed" },
      { employeeId: deceased.id, fieldKey: "bankAccountNumber", newValue: "SBIN0300-200" },
    ],
  });
  const report = services.changeGovernance.validateBatch(actor(), batch.id);
  assert.equal(report.rows.find((row) => row.rowNo === 1).elevatedPath, "NONE");
  // Bulk can never bypass the DECEASED family-pension controls (FR-G02-018 BR3).
  assert.equal(report.rows.find((row) => row.rowNo === 2).elevatedPath, "FAMILY_PENSION");

  const submitted = services.changeGovernance.submitBatch(actor(), batch.id);
  assert.equal(submitted.status, "PENDING_APPROVAL");
  const decided = services.changeGovernance.approveBatch(approver(), batch.id);
  // The single aggregate approval satisfies the standard row but NOT the dual-control row:
  // the elevated child stays uncommitted and the batch ends PARTIAL_FAILED.
  assert.equal(decided.status, "PARTIAL_FAILED");
  const elevatedRow = decided.commitReport.find((row) => row.rowNo === 2);
  assert.equal(elevatedRow.committed, false);
  assert.equal(elevatedRow.errorCode, "PRECONDITION_FAILED");
});
