// PH-16D — G05 vacancy lifecycle, interactive counselling, and mutual-transfer pairing at
// BRD depth (FR-G05-003 / FR-G05-019 / BRD rules 5 & 6):
//   - vacancy_positions published with strength READ THROUGH from the PH-08A
//     sanctioned-posts kernel (G06) — vacant_count derived (sanctioned − filled − reserved),
//     never a G05-owned counter; the cache refreshes from the kernel on read;
//   - vacancy_reservations lifecycle RESERVED -> VACATED_ON_RELIEF -> FILLED_ON_JOIN with a
//     transactional re-check; NEGATIVE: over-allotment and join-time double-fill ->
//     error.code === 'ERR-G05-VACANCY-FULL' (409, fail closed);
//   - transfer_preferences: ranked, unique-contiguous, allotted=true on reservation;
//   - counselling_sessions turn engine: SENIORITY/MERIT order with service_no tie-break;
//     current_turn_employee_id holds the vacancy lock; NEGATIVE: out-of-turn choice ->
//     error.code === 'ERR-G05-COUNSEL-TURN' (409); counselling_choices is an APPEND-ONLY
//     ledger and a CHOSEN vacancy converts to a RESERVED reservation;
//   - JOB-G05-COUNSEL-TIMEOUT: a turn past turn_timeout_seconds records AUTO_PASS_TIMEOUT
//     (injectable clock — no busy-wait) and the turn advances;
//   - MUTUAL pairing: reciprocal requests couple; approval publishes BOTH orders atomically
//     posting the frozen G12 catalog SR code MUTUAL_TRANSFER; NEGATIVE: non-reciprocal pair
//     and asymmetric completion -> error.code === 'ERR-G05-MUTUAL-PAIR' (409).
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const PRESIDER = "user-ph16d-presider";

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: PRESIDER,
    actorUserId: PRESIDER,
    permissions: ["*"],
    roles: ["transfer_authority"],
    fieldGrants: ["*"],
    correlationId: "corr-ph16d",
    ...extra,
  };
}

/** Foundation services with a controllable counselling clock (JOB-G05-COUNSEL-TIMEOUT). */
function servicesWithClock(startIso = "2026-07-03T10:00:00Z") {
  const state = { nowMs: new Date(startIso).getTime() };
  const services = createFoundationServices({ g05CounsellingClock: () => new Date(state.nowMs) });
  return { services, advanceSeconds: (seconds) => (state.nowMs += seconds * 1000) };
}

/** PH-08A sanctioned-posts kernel row — the authoritative strength source (read-through). */
function registerPost(services, overrides = {}) {
  return services.promotion.registerSanctionedPost(actor(), {
    cadreId: ph03Ids.cadreRevenue,
    gradeDesignationId: "des-revenue-inspector",
    orgUnitId: ph03Ids.orgRevenue,
    sanctionOrderRef: "SO/EST/2026/0071",
    sanctionedStrength: 10,
    filledCount: 9,
    drQuotaPct: 50,
    promotionQuotaPct: 40,
    ldceQuotaPct: 10,
    asOnDate: "2026-07-01",
    approverActorId: "user-ph16d-approver",
    ...overrides,
  });
}

function publishVacancy(services, post, overrides = {}) {
  return services.transferCounselling.publishVacancyPosition(actor(), {
    sanctionedPostId: post.id,
    driveId: "drive-ph16d-annual",
    cadre: "REVENUE",
    ...overrides,
  });
}

function newEmployee(services, firstName) {
  return services.employeeMaster.create(actor(), {
    firstName,
    lastName: "PH16D",
    orgUnitId: ph03Ids.orgRevenue,
    dateOfJoining: "2015-06-01",
  }).employee;
}

// =======================================================================================
// FR-G05-003 — vacancy publication with strength read-through + preferences
// =======================================================================================

test("PH-16D vacancy_positions: published strength is a read-through from the sanctioned-posts kernel and vacant_count is derived, never G05-owned", () => {
  const { services } = servicesWithClock();
  const post = registerPost(services, { sanctionedStrength: 12, filledCount: 9 });
  const vacancy = publishVacancy(services, post);

  assert.equal(vacancy.strengthSource, "G06");
  assert.equal(vacancy.sanctionedStrengthCached, 12);
  assert.equal(vacancy.filledCountCached, 9);
  assert.equal(vacancy.reservedCount, 0);
  assert.equal(vacancy.vacantCount, 3); // derived: sanctioned − filled − reserved
  assert.equal(vacancy.isPublished, true);

  // The kernel stays authoritative: a G06 revision flows through on the next read.
  services.promotion.reviseSanctionedPost(actor(), post.id, {
    filledCount: 11,
    approverActorId: "user-ph16d-approver",
  });
  const refreshed = services.transferCounselling.getVacancyPosition(actor(), vacancy.id);
  assert.equal(refreshed.filledCountCached, 11);
  assert.equal(refreshed.vacantCount, 1);
});

test("PH-16D transfer_preferences: ranked capture requires unique contiguous ranks and marks allotted=true on reservation", () => {
  const { services } = servicesWithClock();
  const post = registerPost(services);
  const vacancy = publishVacancy(services, post);

  assert.throws(
    () =>
      services.transferCounselling.capturePreferences(actor(), {
        driveId: "drive-ph16d-annual",
        employeeId: ph03Ids.employee,
        preferences: [
          { preferenceRank: 1, preferredOrgUnitId: ph03Ids.orgRevenue, vacancyPositionId: vacancy.id },
          { preferenceRank: 3, preferredOrgUnitId: ph03Ids.orgAssessment },
        ],
      }),
    (error) => error.code === "VALIDATION_FAILED"
  );

  const preferences = services.transferCounselling.capturePreferences(actor(), {
    driveId: "drive-ph16d-annual",
    employeeId: ph03Ids.employee,
    preferences: [
      { preferenceRank: 1, preferredOrgUnitId: ph03Ids.orgRevenue, vacancyPositionId: vacancy.id, seniorityScore: 82.5 },
      { preferenceRank: 2, preferredOrgUnitId: ph03Ids.orgAssessment },
    ],
  });
  assert.equal(preferences.length, 2);
  assert.equal(preferences[0].allotted, false);

  services.transferCounselling.allotVacancy(actor(), {
    vacancyPositionId: vacancy.id,
    employeeId: ph03Ids.employee,
    driveId: "drive-ph16d-annual",
  });
  const stored = services.transferCounselling.listPreferences(actor(), "drive-ph16d-annual", ph03Ids.employee);
  assert.equal(stored.find((row) => row.vacancyPositionId === vacancy.id).allotted, true);
});

// =======================================================================================
// BRD rule 6 — reservation lifecycle + transactional over-allotment guard
// =======================================================================================

test("PH-16D vacancy_reservations lifecycle: RESERVED -> VACATED_ON_RELIEF -> FILLED_ON_JOIN with stamps", () => {
  const { services } = servicesWithClock();
  const post = registerPost(services, { sanctionedStrength: 10, filledCount: 8 });
  const vacancy = publishVacancy(services, post);

  const reservation = services.transferCounselling.allotVacancy(actor(), {
    vacancyPositionId: vacancy.id,
    employeeId: ph03Ids.employee,
    driveId: "drive-ph16d-annual",
  });
  assert.equal(reservation.lifecycleState, "RESERVED");
  assert.ok(reservation.reservedAt);

  const vacated = services.transferCounselling.markReservationVacatedOnRelief(actor(), reservation.id, { vacatedOn: "2026-08-01" });
  assert.equal(vacated.lifecycleState, "VACATED_ON_RELIEF");
  assert.equal(vacated.vacatedAt, "2026-08-01");

  const filled = services.transferCounselling.markReservationFilledOnJoin(actor(), reservation.id, { joinedOn: "2026-08-05" });
  assert.equal(filled.lifecycleState, "FILLED_ON_JOIN");
  assert.equal(filled.filledAt, "2026-08-05");

  // Reservation is G05-authoritative and counted into the derived vacant_count.
  const view = services.transferCounselling.getVacancyPosition(actor(), vacancy.id);
  assert.equal(view.reservedCount, 1);
  assert.equal(view.vacantCount, 1); // 10 − 8 − 1
});

test("PH-16D NEGATIVE over-allotment: reservation beyond the read-through vacant_count fails closed with ERR-G05-VACANCY-FULL", () => {
  const { services } = servicesWithClock();
  const post = registerPost(services, { sanctionedStrength: 10, filledCount: 9 }); // exactly one vacancy
  const vacancy = publishVacancy(services, post);

  const first = services.transferCounselling.allotVacancy(actor(), {
    vacancyPositionId: vacancy.id,
    employeeId: ph03Ids.employee,
    driveId: "drive-ph16d-annual",
  });
  assert.equal(first.lifecycleState, "RESERVED");

  // Transactional re-check at reservation time: the second allotment is over-allotment.
  assert.throws(
    () =>
      services.transferCounselling.allotVacancy(actor(), {
        vacancyPositionId: vacancy.id,
        employeeId: ph03Ids.manager,
        driveId: "drive-ph16d-annual",
      }),
    (error) => error.code === "ERR-G05-VACANCY-FULL"
  );
  // Fail closed: no reservation row was written for the rejected allotment.
  assert.equal(services.transferCounselling.listReservations(actor(), vacancy.id).length, 1);
});

test("PH-16D NEGATIVE join-time double-fill: a second FILLED_ON_JOIN on the same reservation throws ERR-G05-VACANCY-FULL", () => {
  const { services } = servicesWithClock();
  const post = registerPost(services, { sanctionedStrength: 10, filledCount: 8 });
  const vacancy = publishVacancy(services, post);
  const reservation = services.transferCounselling.allotVacancy(actor(), {
    vacancyPositionId: vacancy.id,
    employeeId: ph03Ids.employee,
  });
  services.transferCounselling.markReservationVacatedOnRelief(actor(), reservation.id, { vacatedOn: "2026-08-01" });
  services.transferCounselling.markReservationFilledOnJoin(actor(), reservation.id, { joinedOn: "2026-08-05" });

  assert.throws(
    () => services.transferCounselling.markReservationFilledOnJoin(actor(), reservation.id, { joinedOn: "2026-08-06" }),
    (error) => error.code === "ERR-G05-VACANCY-FULL"
  );
});

// =======================================================================================
// FR-G05-019 — counselling turn engine, vacancy lock, append-only choice ledger
// =======================================================================================

function scheduledSession(services, vacancy, overrides = {}) {
  // Seeded serviceNos: manager GOV-100245 < employee GOV-100246 — equal scores tie-break on service_no.
  return services.transferCounselling.scheduleCounsellingSession(actor(), {
    sessionCode: "CNS-PH16D-01",
    driveId: "drive-ph16d-counselling",
    scheduledAt: "2026-07-10T09:30:00Z",
    turnOrderMethod: "SENIORITY",
    presidingOfficerId: PRESIDER,
    turnTimeoutSeconds: 120,
    candidates: [
      { employeeId: ph03Ids.employee, seniorityScore: 70 },
      { employeeId: ph03Ids.manager, seniorityScore: 70 },
    ],
    ...overrides,
  });
}

test("PH-16D counselling_sessions: SENIORITY turn order breaks ties by service_no and the live turn holds the vacancy lock", () => {
  const { services } = servicesWithClock();
  const post = registerPost(services, { sanctionedStrength: 10, filledCount: 8 });
  const vacancy = publishVacancy(services, post, { driveId: "drive-ph16d-counselling" });
  const session = scheduledSession(services, vacancy);

  // Equal seniority scores: GOV-100245 (manager) precedes GOV-100246 (employee).
  assert.deepEqual(
    session.queue.map((candidate) => candidate.employeeId),
    [ph03Ids.manager, ph03Ids.employee]
  );
  assert.equal(session.status, "SCHEDULED");
  assert.equal(session.turnTimeoutSeconds, 120);

  const started = services.transferCounselling.startCounsellingSession(actor(), session.id);
  assert.equal(started.status, "IN_PROGRESS");
  assert.equal(started.currentTurnEmployeeId, ph03Ids.manager); // vacancy lock holder
});

test("PH-16D NEGATIVE out-of-turn: a choice by anyone other than current_turn_employee_id throws ERR-G05-COUNSEL-TURN and appends nothing", () => {
  const { services } = servicesWithClock();
  const post = registerPost(services, { sanctionedStrength: 10, filledCount: 8 });
  const vacancy = publishVacancy(services, post, { driveId: "drive-ph16d-counselling" });
  const session = scheduledSession(services, vacancy);
  services.transferCounselling.startCounsellingSession(actor(), session.id);

  // It is the manager's turn — the employee's choice is out of turn (one live turn at a time).
  assert.throws(
    () =>
      services.transferCounselling.recordChoice(actor(), session.id, {
        employeeId: ph03Ids.employee,
        choiceAction: "CHOSEN",
        vacancyPositionId: vacancy.id,
      }),
    (error) => error.code === "ERR-G05-COUNSEL-TURN"
  );
  // Fail closed: no ledger row, no reservation, lock unchanged.
  assert.equal(services.transferCounselling.listChoices(actor(), session.id).length, 0);
  assert.equal(services.transferCounselling.listReservations(actor(), vacancy.id).length, 0);
  assert.equal(services.transferCounselling.getCounsellingSession(actor(), session.id).currentTurnEmployeeId, ph03Ids.manager);
});

test("PH-16D counselling_choices ledger: CHOSEN converts to a RESERVED reservation, rows are append-only with turn_position and recording officer", () => {
  const { services } = servicesWithClock();
  const post = registerPost(services, { sanctionedStrength: 10, filledCount: 8 });
  const vacancy = publishVacancy(services, post, { driveId: "drive-ph16d-counselling" });
  const session = scheduledSession(services, vacancy);
  services.transferCounselling.startCounsellingSession(actor(), session.id);

  const chosen = services.transferCounselling.recordChoice(actor(), session.id, {
    employeeId: ph03Ids.manager,
    choiceAction: "CHOSEN",
    vacancyPositionId: vacancy.id,
  });
  assert.equal(chosen.choice.choiceAction, "CHOSEN");
  assert.equal(chosen.choice.turnPosition, 1);
  assert.equal(chosen.choice.recordedBy, PRESIDER);
  assert.equal(chosen.reservation.lifecycleState, "RESERVED"); // FR-019 AC5
  assert.equal(chosen.reservation.vacancyPositionId, vacancy.id);
  assert.equal(chosen.session.currentTurnEmployeeId, ph03Ids.employee); // turn advanced

  const passed = services.transferCounselling.recordChoice(actor(), session.id, {
    employeeId: ph03Ids.employee,
    choiceAction: "PASSED",
  });
  assert.equal(passed.reservation, undefined);
  assert.equal(passed.session.status, "COMPLETED"); // queue exhausted
  assert.equal(passed.session.currentTurnEmployeeId, undefined);

  // Append-only ledger: both rows present, immutable snapshots (mutating a returned copy
  // never touches the ledger), and the repository exposes no update/delete for choices.
  const ledger = services.transferCounselling.listChoices(actor(), session.id);
  assert.deepEqual(ledger.map((row) => row.choiceAction), ["CHOSEN", "PASSED"]);
  ledger[0].choiceAction = "DECLINED";
  const reread = services.transferCounselling.listChoices(actor(), session.id);
  assert.deepEqual(reread.map((row) => row.choiceAction), ["CHOSEN", "PASSED"]);
  assert.ok(reread.every((row) => row.choiceMadeAt && row.recordedBy && row.turnPosition >= 1));
});

test("PH-16D JOB-G05-COUNSEL-TIMEOUT: a turn past turn_timeout_seconds records AUTO_PASS_TIMEOUT and advances (injectable clock, no busy-wait)", () => {
  const { services, advanceSeconds } = servicesWithClock();
  const post = registerPost(services, { sanctionedStrength: 10, filledCount: 8 });
  const vacancy = publishVacancy(services, post, { driveId: "drive-ph16d-counselling" });
  const session = scheduledSession(services, vacancy);
  services.transferCounselling.startCounsellingSession(actor(), session.id);

  // Before the timeout the sweep is a no-op.
  advanceSeconds(60);
  const early = services.transferCounselling.sweepTurnTimeout(actor(), session.id);
  assert.equal(early.timedOut, false);
  assert.equal(early.session.currentTurnEmployeeId, ph03Ids.manager);

  // Past turn_timeout_seconds (120): the live turn auto-passes and the lock moves on.
  advanceSeconds(61);
  const swept = services.transferCounselling.sweepTurnTimeout(actor(), session.id);
  assert.equal(swept.timedOut, true);
  assert.equal(swept.session.currentTurnEmployeeId, ph03Ids.employee);

  const ledger = services.transferCounselling.listChoices(actor(), session.id);
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].choiceAction, "AUTO_PASS_TIMEOUT");
  assert.equal(ledger[0].employeeId, ph03Ids.manager);
  assert.equal(ledger[0].recordedBy, PRESIDER); // presiding officer records the auto-pass
});

test("PH-16D counselling + vacancy guard: a CHOSEN vacancy with no remaining capacity fails closed with ERR-G05-VACANCY-FULL before the ledger append", () => {
  const { services } = servicesWithClock();
  const post = registerPost(services, { sanctionedStrength: 10, filledCount: 9 }); // one vacancy
  const vacancy = publishVacancy(services, post, { driveId: "drive-ph16d-counselling" });
  // Exhaust the only slot outside the session.
  services.transferCounselling.allotVacancy(actor(), { vacancyPositionId: vacancy.id, employeeId: newEmployee(services, "Meera").id });

  const session = scheduledSession(services, vacancy);
  services.transferCounselling.startCounsellingSession(actor(), session.id);
  assert.throws(
    () =>
      services.transferCounselling.recordChoice(actor(), session.id, {
        employeeId: ph03Ids.manager,
        choiceAction: "CHOSEN",
        vacancyPositionId: vacancy.id,
      }),
    (error) => error.code === "ERR-G05-VACANCY-FULL"
  );
  // The failed choice never reached the append-only log; the turn did not advance.
  assert.equal(services.transferCounselling.listChoices(actor(), session.id).length, 0);
  assert.equal(services.transferCounselling.getCounsellingSession(actor(), session.id).currentTurnEmployeeId, ph03Ids.manager);
});

// =======================================================================================
// BRD rule 5 — MUTUAL_TRANSFER coupled pairing (both-or-neither)
// =======================================================================================

function reciprocalRequests(services) {
  const first = services.transferCounselling.fileMutualRequest(actor(), {
    employeeId: ph03Ids.manager,
    mutualCounterpartEmployeeId: ph03Ids.employee,
    fromOrgUnitId: ph03Ids.orgRevenue,
    toOrgUnitId: ph03Ids.orgAssessment,
  });
  const second = services.transferCounselling.fileMutualRequest(actor(), {
    employeeId: ph03Ids.employee,
    mutualCounterpartEmployeeId: ph03Ids.manager,
    fromOrgUnitId: ph03Ids.orgAssessment,
    toOrgUnitId: ph03Ids.orgRevenue,
  });
  return { first, second };
}

test("PH-16D MUTUAL pairing: reciprocal requests couple and approval publishes BOTH orders atomically with the frozen SR code MUTUAL_TRANSFER", () => {
  const { services } = servicesWithClock();
  const { first, second } = reciprocalRequests(services);

  const paired = services.transferCounselling.pairMutualRequests(actor(), {
    requestId: first.id,
    counterpartRequestId: second.id,
  });
  assert.ok(paired.pairId);
  assert.deepEqual(paired.requests.map((request) => request.status), ["PAIRED", "PAIRED"]);

  const approved = services.transferCounselling.approveMutualPair(actor(), paired.pairId, {
    orderDate: "2026-07-15",
    effectiveDate: "2026-08-01",
    idempotencyKey: "idem-ph16d-mutual-001",
  });
  const [orderA, orderB] = approved.orders;
  // Coupled pair: cross-linked mutual_pair_order_id, both published together.
  assert.equal(orderA.mutualPairOrderId, orderB.id);
  assert.equal(orderB.mutualPairOrderId, orderA.id);
  assert.deepEqual([orderA.status, orderB.status], ["PUBLISHED", "PUBLISHED"]);

  // Frozen G12 catalog code MUTUAL_TRANSFER posted verbatim for BOTH employees.
  const srEvents = [ph03Ids.manager, ph03Ids.employee].map((employeeId) =>
    services.serviceRegister.getTimeline(actor(), employeeId).filter((event) => event.eventTypeCode === "MUTUAL_TRANSFER")
  );
  assert.deepEqual(srEvents.map((events) => events.length), [1, 1]);
  assert.deepEqual([orderA.srEventId, orderB.srEventId].sort(), srEvents.flat().map((event) => event.id).sort());
});

test("PH-16D NEGATIVE non-reciprocal pair: pairing without a matching counterpart request throws ERR-G05-MUTUAL-PAIR", () => {
  const { services } = servicesWithClock();
  const stranger = newEmployee(services, "Farhan");
  const first = services.transferCounselling.fileMutualRequest(actor(), {
    employeeId: ph03Ids.manager,
    mutualCounterpartEmployeeId: ph03Ids.employee,
    fromOrgUnitId: ph03Ids.orgRevenue,
    toOrgUnitId: ph03Ids.orgAssessment,
  });
  // The second request names a DIFFERENT counterpart — asymmetric, not a mutual pair.
  const mismatched = services.transferCounselling.fileMutualRequest(actor(), {
    employeeId: stranger.id,
    mutualCounterpartEmployeeId: ph03Ids.manager,
    fromOrgUnitId: ph03Ids.orgAssessment,
    toOrgUnitId: ph03Ids.orgRevenue,
  });
  assert.throws(
    () => services.transferCounselling.pairMutualRequests(actor(), { requestId: first.id, counterpartRequestId: mismatched.id }),
    (error) => error.code === "ERR-G05-MUTUAL-PAIR"
  );
});

test("PH-16D NEGATIVE asymmetric completion: joining one side while the counterpart has not been relieved throws ERR-G05-MUTUAL-PAIR", () => {
  const { services } = servicesWithClock();
  const { first, second } = reciprocalRequests(services);
  const paired = services.transferCounselling.pairMutualRequests(actor(), {
    requestId: first.id,
    counterpartRequestId: second.id,
  });
  const approved = services.transferCounselling.approveMutualPair(actor(), paired.pairId, {
    orderDate: "2026-07-15",
    effectiveDate: "2026-08-01",
    idempotencyKey: "idem-ph16d-mutual-002",
  });
  const [orderA, orderB] = approved.orders;

  services.transferCounselling.recordMutualRelief(actor(), orderA.id, { relievedOn: "2026-08-01" });
  // Counterpart (orderB) is still PUBLISHED — completing orderA's joining is asymmetric.
  assert.throws(
    () => services.transferCounselling.recordMutualJoin(actor(), orderA.id, { joinedOn: "2026-08-03" }),
    (error) => error.code === "ERR-G05-MUTUAL-PAIR"
  );

  // Paired progress: once the counterpart is relieved, both sides may complete.
  services.transferCounselling.recordMutualRelief(actor(), orderB.id, { relievedOn: "2026-08-02" });
  const joinedA = services.transferCounselling.recordMutualJoin(actor(), orderA.id, { joinedOn: "2026-08-03" });
  const joinedB = services.transferCounselling.recordMutualJoin(actor(), orderB.id, { joinedOn: "2026-08-04" });
  assert.deepEqual([joinedA.status, joinedB.status], ["JOINED", "JOINED"]);
});
