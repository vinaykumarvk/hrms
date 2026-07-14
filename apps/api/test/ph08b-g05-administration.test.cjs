const test = require("node:test");
const assert = require("node:assert/strict");

const {
  createFoundationApi,
  createFoundationServices,
  ph03Ids,
} = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph08b-hr",
    actorUserId: "user-ph08b-hr",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph08b-g05",
    ...extra,
  };
}

const authorityActor = () => actor({ userId: "user-ph08b-authority", actorUserId: "user-ph08b-authority", roles: ["transfer_authority"] });
const receivingActor = () => actor({ userId: "user-ph08b-receiving", actorUserId: "user-ph08b-receiving", roles: ["manager_l1"] });
const employeeActor = () => actor({ userId: "user-ph08b-employee", actorUserId: "user-ph08b-employee", roles: ["employee"] });

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph08b-g05", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function transferInput(extra = {}) {
  return {
    employeeId: ph03Ids.employee,
    fromOrgUnitId: ph03Ids.orgRevenue,
    toOrgUnitId: ph03Ids.orgAssessment,
    orderDate: "2026-08-01",
    effectiveDate: "2026-08-10",
    reason: "PH-08B administration depth",
    ...extra,
  };
}

function approvedOrder(services, suffix = "001", extra = {}) {
  const initiated = services.transfer.initiate(actor(), transferInput(extra));
  const approved = services.transfer.approve(actor(), initiated.order.id, { idempotencyKey: `idem-ph08b-approve-${suffix}` });
  return approved.order;
}

function clearAll(services, order, completedOn = "2026-08-11", deemedOn = "2026-08-12") {
  const codes = order.clearanceItems.map((item) => item.code);
  for (const code of codes.slice(1)) {
    services.transfer.completeClearance(actor(), order.id, code, completedOn);
  }
  services.transfer.deemClearance(actor(), order.id, codes[0], deemedOn);
}

function manualChannelPolicy(services) {
  // Publication via a manual channel: no auto-service, HR must record proof-of-service explicitly.
  services.transfer.configureAdministrationPolicy(actor(), {
    defaultDeliveryChannel: "REGISTERED_POST",
    deemedServiceWindowDays: 7,
    disputeSlaHours: 72,
    permissibleRetentionMonths: 2,
    deputationDefaultMaxTenureMonths: 36,
  });
}

test("PH-08B FR-020 publication auto-serves via the system channel and the employee acknowledges", async () => {
  const services = createFoundationServices();
  const order = approvedOrder(services, "ack");
  // FR-G05-020 AC1: publication created the order_acknowledgements row (IN_APP system channel).
  const served = services.transfer.getServiceRecord(actor(), order.id);
  assert.equal(served.acknowledgementStatus, "SERVED");
  assert.equal(served.deliveryChannel, "IN_APP");
  assert.equal(served.servedOnDate, "2026-08-01");
  assert.equal(order.servedOnDate, "2026-08-01");

  const acknowledged = services.transfer.acknowledgeOrder(employeeActor(), order.id, { acknowledgedAt: "2026-08-02T09:00:00Z" });
  assert.equal(acknowledged.acknowledgementStatus, "ACKNOWLEDGED");
  assert.equal(acknowledged.acknowledgedAt, "2026-08-02T09:00:00Z");
  assert.equal(services.transfer.getOrder(actor(), order.id).acknowledgedAt, "2026-08-02T09:00:00Z");
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G05_ORDER_ACKNOWLEDGED"));
});

test("PH-08B FR-020 deemed service flips to DEEMED_SERVED only after the statutory window, with recorded basis", async () => {
  const services = createFoundationServices();
  manualChannelPolicy(services);
  const order = approvedOrder(services, "deem");
  // Manual channel: publication did NOT auto-serve.
  assert.equal(services.transfer.getServiceRecord(actor(), order.id), undefined);

  const served = services.transfer.serveOrder(actor(), order.id, {
    servedOnDate: "2026-08-03",
    deliveryChannel: "REGISTERED_POST",
    proofDocumentTitle: "Registered post receipt TO/2026/00001",
  });
  assert.equal(served.acknowledgementStatus, "SERVED");
  assert.ok(served.proofDocumentId, "manual service must carry a G13 proof document");

  // Window (7 days from served-on 2026-08-03) has not elapsed: deeming is refused.
  assert.throws(
    () => services.transfer.deemOrderServed(authorityActor(), order.id, { asOf: "2026-08-08", basis: "NON_ACKNOWLEDGEMENT", reason: "No response" }),
    (error) => error.code === "PRECONDITION_FAILED"
  );

  const deemed = services.transfer.deemOrderServed(authorityActor(), order.id, {
    asOf: "2026-08-12",
    basis: "NON_ACKNOWLEDGEMENT",
    reason: "Employee did not acknowledge within the statutory window",
  });
  // Evidence-backed deemed service: basis + timestamps + the statutory window applied.
  assert.equal(deemed.acknowledgementStatus, "DEEMED_SERVED");
  assert.equal(deemed.deemedServedBasis, "NON_ACKNOWLEDGEMENT");
  assert.equal(deemed.deemedServedOn, "2026-08-12");
  assert.equal(deemed.statutoryWindowDays, 7);
  assert.ok(deemed.deemedServedReason.length > 0);

  // A DEEMED_SERVED order satisfies the served gate: relieving proceeds.
  clearAll(services, order);
  const joined = services.transfer.relieveAndJoin(actor(), order.id, {
    relievingDate: "2026-08-20",
    joiningDate: "2026-08-22",
    idempotencyKey: "idem-ph08b-deem-join-001",
  });
  assert.equal(joined.order.status, "JOINED");
});

test("PH-08B FR-020 negative: an unserved order cannot relieve or be deemed relieved (ERR-G05-NOT-SERVED)", async () => {
  const services = createFoundationServices();
  manualChannelPolicy(services);
  const order = approvedOrder(services, "unserved");
  clearAll(services, order);
  // BRD invariant 5.6-15: relieve of an unserved order fails closed with the registered code.
  assert.throws(
    () => services.transfer.relieveAndJoin(actor(), order.id, { relievingDate: "2026-08-20", joiningDate: "2026-08-22", idempotencyKey: "idem-ph08b-unserved-001" }),
    (error) => error.code === "ERR-G05-NOT-SERVED" && error.details.transferOrderId === order.id
  );
  // ...and the forced (deemed-relief) effecting path is equally gated.
  assert.throws(
    () => services.transfer.deemRelieved(actor(), order.id, { deemedRelievingDate: "2026-08-21", reason: "Authority forced action", idempotencyKey: "idem-ph08b-unserved-002" }),
    (error) => error.code === "ERR-G05-NOT-SERVED"
  );
});

test("PH-08B FR-007 charge handover: dispute blocks relieving until the Authority certifies UNDER_PROTEST after SLA breach", async () => {
  const services = createFoundationServices();
  const receiving = services.employeeMaster.create(actor(), {
    firstName: "Ravi",
    lastName: "Iyer",
    orgUnitId: ph03Ids.orgRevenue,
    dateOfJoining: "2019-04-01",
  }).employee;
  const order = approvedOrder(services, "handover");
  clearAll(services, order);

  const handover = services.transfer.recordChargeHandover(actor(), order.id, {
    receivingEmployeeId: receiving.id,
    handoverDate: "2026-08-05",
    chargeType: "FULL",
    cashImprestAmount: 12500.5,
    pendingFilesCount: 4,
  });
  assert.equal(handover.status, "SUBMITTED");
  assert.ok(handover.handoverNoteDocumentId, "handover note must be a G13 document");

  // Relinquisher and receiver must differ (P02 SoD).
  assert.throws(
    () => services.transfer.recordChargeHandover(actor(), order.id, { receivingEmployeeId: ph03Ids.employee, handoverDate: "2026-08-05" }),
    (error) => error.code === "VALIDATION_FAILED"
  );

  const disputed = services.transfer.disputeChargeHandover(receivingActor(), handover.id, {
    remarks: "Cash imprest short by INR 2,500",
    disputedAt: "2026-08-05T10:00:00Z",
  });
  assert.equal(disputed.status, "DISPUTED");
  assert.equal(disputed.disputeSlaDueAt, "2026-08-08T10:00:00.000Z");

  // A disputed handover blocks relieving with the registered 409 code.
  assert.throws(
    () => services.transfer.relieveAndJoin(actor(), order.id, { relievingDate: "2026-08-20", joiningDate: "2026-08-22", idempotencyKey: "idem-ph08b-handover-block-001" }),
    (error) => error.code === "ERR-G05-HANDOVER-DISPUTED" && error.details.chargeHandoverId === handover.id
  );

  // Under-protest is only available AFTER the dispute SLA breaches.
  assert.throws(
    () => services.transfer.certifyHandoverUnderProtest(authorityActor(), handover.id, { asOf: "2026-08-07T10:00:00.000Z", reason: "premature" }),
    (error) => error.code === "PRECONDITION_FAILED"
  );

  const underProtest = services.transfer.certifyHandoverUnderProtest(authorityActor(), handover.id, {
    asOf: "2026-08-09T10:00:00.000Z",
    reason: "Dispute unresolved past SLA; relieving unblocked under protest",
  });
  assert.equal(underProtest.status, "UNDER_PROTEST");
  assert.equal(underProtest.underProtest, true);
  assert.equal(underProtest.forcedActionType, "HANDOVER_UNDER_PROTEST");
  // The dispute record is preserved for separate resolution.
  assert.equal(underProtest.disputeRemarks, "Cash imprest short by INR 2,500");

  const joined = services.transfer.relieveAndJoin(actor(), order.id, {
    relievingDate: "2026-08-20",
    joiningDate: "2026-08-22",
    idempotencyKey: "idem-ph08b-handover-join-001",
  });
  assert.equal(joined.order.status, "JOINED");
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G05_CHARGE_HANDOVER_UNDER_PROTEST"));
});

test("PH-08B FR-009 joining time derives from configured distance-band rule rows (VAL-G05-JTIME)", async () => {
  const services = createFoundationServices();
  const order = approvedOrder(services, "jtime");

  // Seeded §16.4 defaults: MEDIUM (200–500 km) grants 5 working days.
  const medium = services.transfer.computeJoiningTime(actor(), order.id, { distanceKm: 350 });
  assert.equal(medium.joiningDistanceBand, "MEDIUM");
  assert.equal(medium.joiningTimeDays, 5);
  const persisted = services.transfer.getOrder(actor(), order.id);
  assert.equal(persisted.joiningDistanceBand, "MEDIUM");
  assert.equal(persisted.joiningTimeDays, 5);

  // Same station resolves LOCAL/0; >1000 km resolves OUTSTATION/10.
  assert.equal(services.transfer.computeJoiningTime(actor(), order.id, { sameStation: true }).joiningDistanceBand, "LOCAL");
  const outstation = services.transfer.computeJoiningTime(actor(), order.id, { distanceKm: 1200 });
  assert.equal(outstation.joiningDistanceBand, "OUTSTATION");
  assert.equal(outstation.joiningTimeDays, 10);

  // Band boundaries are DATA: reconfiguring the distance-band rules changes the outcome without code.
  services.transfer.configureJoiningTimeRules(actor(), [
    { band: "LOCAL", sameStation: true, minDistanceKm: 0, maxDistanceKm: 0, joiningTimeDays: 0 },
    { band: "SHORT", sameStation: false, minDistanceKm: 0, maxDistanceKm: 400, joiningTimeDays: 4 },
    { band: "OUTSTATION", sameStation: false, minDistanceKm: 400, joiningTimeDays: 12 },
  ]);
  const reconfigured = services.transfer.computeJoiningTime(actor(), order.id, { distanceKm: 350 });
  assert.equal(reconfigured.joiningDistanceBand, "SHORT");
  assert.equal(reconfigured.joiningTimeDays, 4);

  // Missing distance fails the VAL-G05-JTIME validation rather than guessing a band.
  assert.throws(
    () => services.transfer.computeJoiningTime(actor(), order.id, {}),
    (error) => error.code === "VALIDATION_FAILED" && error.details.messageId === "VAL-G05-JTIME"
  );
});

test("PH-08B FR-011 deputation lifecycle: tenure cap blocks over-extension and repatriation raises the reverse order", async () => {
  const services = createFoundationServices();
  const order = approvedOrder(services, "deputation");
  const record = services.transfer.createDeputationRecord(actor(), order.id, {
    startDate: "2026-08-10",
    initialTenureMonths: 12,
    maxTenureMonths: 24,
    deputationTerms: { payProtection: true, deputationAllowancePercent: 10 },
  });
  assert.equal(record.repatriationStatus, "ACTIVE");
  assert.equal(record.currentEndDate, "2027-08-10");
  assert.equal(record.repatriationDueDate, "2027-08-10");
  assert.equal(record.borrowingOrgUnitId, ph03Ids.orgAssessment);
  assert.equal(record.lendingOrgUnitId, ph03Ids.orgRevenue);

  const extended = services.transfer.extendDeputation(actor(), record.id, { extensionMonths: 6, reason: "Project continuity" });
  assert.equal(extended.repatriationStatus, "EXTENDED");
  assert.equal(extended.tenureMonths, 18);
  assert.equal(extended.currentEndDate, "2028-02-10");
  assert.equal(extended.extensionCount, 1);

  // FR-G05-011 AC2: extension beyond max_tenure_months is blocked (422 / ERR-G05-DEPUTATION-CAP).
  assert.throws(
    () => services.transfer.extendDeputation(actor(), record.id, { extensionMonths: 12 }),
    (error) => error.code === "ERR-G05-DEPUTATION-CAP" && error.details.maxTenureMonths === 24
  );
  // Creation beyond the cap is equally blocked.
  const capOrder = approvedOrder(services, "deputation-cap");
  assert.throws(
    () => services.transfer.createDeputationRecord(actor(), capOrder.id, { startDate: "2026-08-10", initialTenureMonths: 48, maxTenureMonths: 24 }),
    (error) => error.code === "ERR-G05-DEPUTATION-CAP"
  );

  // SoD: the deputation initiator cannot approve their own repatriation.
  assert.throws(
    () => services.transfer.repatriateDeputation(actor(), record.id, { repatriationDate: "2028-02-10", reason: "Tenure complete" }),
    (error) => error.code === "FORBIDDEN"
  );
  const repatriated = services.transfer.repatriateDeputation(authorityActor(), record.id, {
    repatriationDate: "2028-02-10",
    reason: "Tenure complete",
  });
  assert.equal(repatriated.record.repatriationStatus, "REPATRIATED");
  assert.equal(repatriated.record.repatriatedOn, "2028-02-10");
  // Repatriation is a reverse transfer back to the lending unit.
  assert.equal(repatriated.repatriationOrder.fromOrgUnitId, ph03Ids.orgAssessment);
  assert.equal(repatriated.repatriationOrder.toOrgUnitId, ph03Ids.orgRevenue);
  assert.equal(repatriated.record.repatriationOrderId, repatriated.repatriationOrder.id);
  assert.equal(services.transfer.listDeputationRecords(actor()).length, 1);
});

test("PH-08B FR-022 quarter retention: penal-rate flip on overstay and the permissible-period guard", async () => {
  const services = createFoundationServices();
  const order = approvedOrder(services, "quarter");

  // Retention beyond the permissible policy period is rejected with the registered 422 code.
  assert.throws(
    () => services.transfer.requestQuarterRetention(actor(), order.id, { quarterRef: "QTR-B-14", vacateByDate: "2026-12-01", licenceFeeRate: 1200 }),
    (error) => error.code === "ERR-G05-QUARTER-OVERSTAY" && error.details.permissibleUntil === "2026-10-10"
  );

  const requested = services.transfer.requestQuarterRetention(actor(), order.id, {
    quarterRef: "QTR-B-14",
    vacateByDate: "2026-09-15",
    licenceFeeRate: 1200,
    penalLicenceFeeRate: 4800,
  });
  assert.equal(requested.retentionStatus, "RETENTION_REQUESTED");
  assert.equal(requested.penalRateApplies, false);

  // SoD: the requesting officer cannot approve the retention.
  assert.throws(
    () => services.transfer.approveQuarterRetention(actor(), requested.id, { approvedOn: "2026-08-12" }),
    (error) => error.code === "FORBIDDEN"
  );
  const approved = services.transfer.approveQuarterRetention(authorityActor(), requested.id, { approvedOn: "2026-08-12" });
  assert.equal(approved.retentionStatus, "RETENTION_APPROVED");
  assert.equal(approved.retentionAllowed, true);

  // Not yet overstayed: the penal flip is refused.
  assert.throws(
    () => services.transfer.flagQuarterOverstay(actor(), requested.id, { asOf: "2026-09-10" }),
    (error) => error.code === "PRECONDITION_FAILED"
  );

  // JOB-G05-QTR-OVERSTAY: overstay past vacate-by flips penal_rate_applies and the licence-fee rate.
  const overstayed = services.transfer.flagQuarterOverstay(actor(), requested.id, { asOf: "2026-09-20" });
  assert.equal(overstayed.retentionStatus, "OVERSTAY");
  assert.equal(overstayed.penalRateApplies, true);
  assert.equal(overstayed.licenceFeeRate, 4800);
  assert.equal(overstayed.licenceFeeRecoveryRef, `G10:LICENCE_FEE_RECOVERY:${requested.id}`);
  assert.ok(services.audit.listAudit(actor()).some((entry) => entry.action === "G05_QUARTER_PENAL_RATE_FLIPPED"));

  const vacated = services.transfer.recordQuarterVacation(actor(), requested.id, { vacatedOn: "2026-09-25" });
  assert.equal(vacated.retentionStatus, "VACATED");
  assert.equal(vacated.vacatedOn, "2026-09-25");
  assert.equal(services.transfer.listQuarterAllotments(actor()).length, 1);
});

test("PH-08B routes expose the administration surface (serve, handover, joining-time, deputations, quarters)", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const receiving = services.employeeMaster.create(actor(), {
    firstName: "Sunita",
    lastName: "Deshmukh",
    orgUnitId: ph03Ids.orgRevenue,
    dateOfJoining: "2018-06-01",
  }).employee;
  const initiated = await call(api, {
    method: "POST",
    path: "/api/v1/transfers/orders",
    headers: { "Idempotency-Key": "idem-ph08b-route-init-001" },
    body: transferInput(),
  });
  assert.equal(initiated.status, 201);
  const orderId = initiated.body.order.id;
  assert.equal(
    (await call(api, { method: "POST", path: `/api/v1/transfers/orders/${orderId}/approve`, headers: { "Idempotency-Key": "idem-ph08b-route-approve-001" }, body: {} })).status,
    202
  );

  const serviceRecord = await call(api, { method: "GET", path: `/api/v1/transfers/orders/${orderId}/service-record` });
  assert.equal(serviceRecord.status, 200);
  assert.equal(serviceRecord.body.acknowledgement.acknowledgementStatus, "SERVED");

  const handover = await call(api, {
    method: "POST",
    path: `/api/v1/transfers/orders/${orderId}/charge-handover`,
    headers: { "Idempotency-Key": "idem-ph08b-route-handover-001" },
    body: { receivingEmployeeId: receiving.id, handoverDate: "2026-08-05", chargeType: "FULL" },
  });
  assert.equal(handover.status, 201);
  assert.equal(handover.body.chargeHandover.status, "SUBMITTED");

  const joiningTime = await call(api, {
    method: "POST",
    path: `/api/v1/transfers/orders/${orderId}/joining-time`,
    headers: { "Idempotency-Key": "idem-ph08b-route-jtime-001" },
    body: { distanceKm: 650 },
  });
  assert.equal(joiningTime.status, 202);
  assert.equal(joiningTime.body.joiningDistanceBand, "LONG");
  assert.equal(joiningTime.body.joiningTimeDays, 7);

  const deputation = await call(api, {
    method: "POST",
    path: `/api/v1/transfers/orders/${orderId}/deputation`,
    headers: { "Idempotency-Key": "idem-ph08b-route-dep-001" },
    body: { startDate: "2026-08-10", initialTenureMonths: 12, maxTenureMonths: 24 },
  });
  assert.equal(deputation.status, 201);
  assert.equal((await call(api, { method: "GET", path: "/api/v1/deputations" })).body.items.length, 1);

  const quarter = await call(api, {
    method: "POST",
    path: `/api/v1/transfers/orders/${orderId}/quarter-retention`,
    headers: { "Idempotency-Key": "idem-ph08b-route-qtr-001" },
    body: { quarterRef: "QTR-C-2", vacateByDate: "2026-09-15", licenceFeeRate: 1500, penalLicenceFeeRate: 6000 },
  });
  assert.equal(quarter.status, 201);
  assert.equal((await call(api, { method: "GET", path: "/api/v1/quarter-allotments" })).body.items.length, 1);

  // Wire negative: the registered 409 code surfaces on the relieve of a disputed-handover order.
  const disputeBlocked = await call(api, {
    method: "POST",
    path: `/api/v1/transfers/orders/${orderId}:relieve-and-join`,
    headers: { "Idempotency-Key": "idem-ph08b-route-join-001" },
    body: { relievingDate: "2026-08-20", joiningDate: "2026-08-22" },
  });
  assert.equal(disputeBlocked.status, 409);
  assert.equal(disputeBlocked.body.error.code, "ERR-G05-HANDOVER-DISPUTED");
});
