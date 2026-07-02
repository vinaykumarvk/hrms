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
    userId: "user-ph15c-g03",
    actorUserId: "user-ph15c-g03",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph15c-g03",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph15c-g03", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-15C FR-01 shifts: timings/grace/date_anchor_rule persist; malformed timings throw VAL-G03-SHIFT-TIMES", () => {
  const services = createFoundationServices();

  const general = services.attendanceOps.defineShift(actor(), {
    shiftCode: "GEN",
    name: "General shift",
    startTime: "09:00",
    endTime: "17:30",
    graceMinutes: 10,
  });
  assert.equal(general.dateAnchorRule, "SHIFT_START_LOCAL_DATE");
  assert.equal(general.isNightShift, false);

  // NEGATIVE: malformed HH:MM, zero-length span, negative grace, and an is_night_shift flag
  // inconsistent with the start/end order all fail closed with VAL-G03-SHIFT-TIMES.
  for (const bad of [
    { shiftCode: "BAD1", name: "Bad", startTime: "9am", endTime: "17:00" },
    { shiftCode: "BAD2", name: "Bad", startTime: "09:00", endTime: "09:00" },
    { shiftCode: "BAD3", name: "Bad", startTime: "09:00", endTime: "17:00", graceMinutes: -5 },
    { shiftCode: "BAD4", name: "Bad", startTime: "22:00", endTime: "06:00", isNightShift: false },
  ]) {
    assert.throws(
      () => services.attendanceOps.defineShift(actor(), bad),
      (error) => error.code === "VAL-G03-SHIFT-TIMES"
    );
  }
  assert.equal(services.attendanceOps.listShifts(actor()).length, 1);
});

test("PH-15C FR-01 rosters: NEGATIVE roster overlap rejected (VAL-G03-ROSTER-OVERLAP); publish supersedes the prior open-ended roster", () => {
  const services = createFoundationServices();
  const shift = services.attendanceOps.defineShift(actor(), { shiftCode: "GEN", name: "General", startTime: "09:00", endTime: "17:30" });

  // Open-ended PUBLISHED roster from July.
  const openEnded = services.attendanceOps.assignRoster(actor(), { employeeId: ph03Ids.employee, shiftId: shift.id, effectiveFrom: "2026-07-01" });
  services.attendanceOps.publishRoster(actor(), openEnded.id);

  // NEGATIVE: a bounded roster intersecting the published range is rejected with
  // error.code === 'VAL-G03-ROSTER-OVERLAP' and stays DRAFT.
  const clashing = services.attendanceOps.assignRoster(actor(), {
    employeeId: ph03Ids.employee,
    shiftId: shift.id,
    effectiveFrom: "2026-06-15",
    effectiveTo: "2026-07-15",
  });
  assert.throws(
    () => services.attendanceOps.publishRoster(actor(), clashing.id),
    (error) => error.code === "VAL-G03-ROSTER-OVERLAP"
  );
  assert.equal(services.attendanceOps.listRosters(actor()).find((item) => item.id === clashing.id).status, "DRAFT");

  // Publishing a later open-ended roster SUPERSEDES the prior one from the new effective_from.
  const replacement = services.attendanceOps.assignRoster(actor(), { employeeId: ph03Ids.employee, shiftId: shift.id, effectiveFrom: "2026-09-01" });
  const published = services.attendanceOps.publishRoster(actor(), replacement.id);
  assert.deepEqual(published.supersededRosterIds, [openEnded.id]);
  const superseded = services.attendanceOps.listRosters(actor()).find((item) => item.id === openEnded.id);
  assert.equal(superseded.status, "SUPERSEDED");
  assert.equal(superseded.effectiveTo, "2026-08-31");
  assert.equal(published.roster.status, "PUBLISHED");
});

test("PH-15C FR-03 punch ingestion: append-only dedup on (device_id, source_ref); NEGATIVES DEVICE_NOT_AUTHORIZED and INVALID_PUNCH_TIME", () => {
  const services = createFoundationServices();
  const device = services.attendanceOps.registerDevice(actor(), { deviceCode: "HQ-GATE-1" });

  const first = services.attendanceOps.ingestPunch(actor(), {
    employeeId: ph03Ids.employee,
    deviceId: device.id,
    punchTime: "2026-07-10T09:02",
    punchDirection: "IN",
    sourceRef: "raw-evt-0001",
    asOf: "2026-07-10T12:00",
  });
  assert.equal(first.ingestionStatus, "ACCEPTED");
  assert.equal(first.punch.attendanceDate, "2026-07-10");

  // Dedup: replaying the same (device_id, source_ref) returns DUPLICATE and stores NO second row.
  const replay = services.attendanceOps.ingestPunch(actor(), {
    employeeId: ph03Ids.employee,
    deviceId: device.id,
    punchTime: "2026-07-10T09:02",
    punchDirection: "IN",
    sourceRef: "raw-evt-0001",
    asOf: "2026-07-10T12:00",
  });
  assert.equal(replay.ingestionStatus, "DUPLICATE");
  assert.equal(replay.punch.id, first.punch.id);
  assert.equal(services.attendanceOps.listPunches(actor()).length, 1);

  // NEGATIVE: unknown device fails closed with error.code === 'DEVICE_NOT_AUTHORIZED'.
  assert.throws(
    () =>
      services.attendanceOps.ingestPunch(actor(), {
        employeeId: ph03Ids.employee,
        deviceId: "device-unregistered",
        punchTime: "2026-07-10T09:05",
        sourceRef: "raw-evt-0002",
        asOf: "2026-07-10T12:00",
      }),
    (error) => error.code === "DEVICE_NOT_AUTHORIZED"
  );

  // NEGATIVE: an INACTIVE registered device is also rejected — fail closed, not fail open.
  const retired = services.attendanceOps.registerDevice(actor(), { deviceCode: "HQ-GATE-2", status: "INACTIVE" });
  assert.throws(
    () =>
      services.attendanceOps.ingestPunch(actor(), {
        employeeId: ph03Ids.employee,
        deviceId: retired.id,
        punchTime: "2026-07-10T09:06",
        sourceRef: "raw-evt-0003",
        asOf: "2026-07-10T12:00",
      }),
    (error) => error.code === "DEVICE_NOT_AUTHORIZED"
  );

  // NEGATIVE: future-dated punch is rejected with INVALID_PUNCH_TIME.
  assert.throws(
    () =>
      services.attendanceOps.ingestPunch(actor(), {
        employeeId: ph03Ids.employee,
        deviceId: device.id,
        punchTime: "2026-07-10T18:00",
        sourceRef: "raw-evt-0004",
        asOf: "2026-07-10T12:00",
      }),
    (error) => error.code === "INVALID_PUNCH_TIME"
  );
  assert.equal(services.attendanceOps.listPunches(actor()).length, 1);
});

test("PH-15C FR-03 attendance_date derives via the shift date_anchor_rule: a night-shift punch after midnight anchors to the shift start date", () => {
  const services = createFoundationServices();
  const night = services.attendanceOps.defineShift(actor(), {
    shiftCode: "NIGHT-A",
    name: "Night shift A",
    startTime: "22:00",
    endTime: "06:00",
    graceMinutes: 15,
    isNightShift: true,
    dateAnchorRule: "SHIFT_START_LOCAL_DATE",
  });
  const roster = services.attendanceOps.assignRoster(actor(), { employeeId: ph03Ids.employee, shiftId: night.id, effectiveFrom: "2026-07-01" });
  services.attendanceOps.publishRoster(actor(), roster.id);
  const device = services.attendanceOps.registerDevice(actor(), { deviceCode: "PLANT-GATE-1" });

  // Shift-start punch on 10 Jul anchors to 10 Jul.
  const inPunch = services.attendanceOps.ingestPunch(actor(), {
    employeeId: ph03Ids.employee,
    deviceId: device.id,
    punchTime: "2026-07-10T22:05",
    punchDirection: "IN",
    sourceRef: "night-evt-0001",
    asOf: "2026-07-11T12:00",
  });
  assert.equal(inPunch.punch.attendanceDate, "2026-07-10");

  // The out-punch AFTER MIDNIGHT (02:00 on 11 Jul) anchors to the shift START date (10 Jul).
  const outPunch = services.attendanceOps.ingestPunch(actor(), {
    employeeId: ph03Ids.employee,
    deviceId: device.id,
    punchTime: "2026-07-11T02:00",
    punchDirection: "OUT",
    sourceRef: "night-evt-0002",
    asOf: "2026-07-11T12:00",
  });
  assert.equal(outPunch.punch.attendanceDate, "2026-07-10");
  assert.equal(services.attendanceOps.listPunches(actor(), ph03Ids.employee, "2026-07-10").length, 2);
});

test("PH-15C FR-03 punch-derived attendance feeds the PH-07D FR-04 derivation (PRESENT day from ledger punches)", () => {
  const services = createFoundationServices();
  const shift = services.attendanceOps.defineShift(actor(), { shiftCode: "GEN", name: "General", startTime: "09:00", endTime: "17:30" });
  const roster = services.attendanceOps.assignRoster(actor(), { employeeId: ph03Ids.employee, shiftId: shift.id, effectiveFrom: "2026-07-01" });
  services.attendanceOps.publishRoster(actor(), roster.id);
  const device = services.attendanceOps.registerDevice(actor(), { deviceCode: "HQ-GATE-1" });
  services.attendanceOps.ingestPunch(actor(), {
    employeeId: ph03Ids.employee,
    deviceId: device.id,
    punchTime: "2026-07-13T09:01",
    punchDirection: "IN",
    sourceRef: "day-evt-0001",
    asOf: "2026-07-13T20:00",
  });
  services.attendanceOps.ingestPunch(actor(), {
    employeeId: ph03Ids.employee,
    deviceId: device.id,
    punchTime: "2026-07-13T17:35",
    punchDirection: "OUT",
    sourceRef: "day-evt-0002",
    asOf: "2026-07-13T20:00",
  });

  const derived = services.attendanceOps.deriveAttendanceFromPunches(actor(), { employeeId: ph03Ids.employee, attendanceDate: "2026-07-13" });
  assert.equal(derived.status, "PRESENT");
  assert.equal(derived.inTime, "09:01");
  assert.equal(derived.outTime, "17:35");
  // The derived day lands in the same PH-07D attendance store the payroll feed reads.
  assert.equal(services.leave.listAttendance(actor()).some((record) => record.id === derived.id), true);
});

test("PH-15C FR-09 comp_off_ledger: FIFO redemption from non-expired credits, expiry sweep, and NEGATIVES COMP_OFF_INSUFFICIENT / COMP_OFF_EXPIRED", () => {
  const services = createFoundationServices();

  // Two credits: the older one expires first (FIFO order = earn date).
  const older = services.attendanceOps.earnCompOff(actor(), { employeeId: ph03Ids.employee, days: 1, earnedOn: "2026-05-10", expiresOn: "2026-08-10" });
  const newer = services.attendanceOps.earnCompOff(actor(), { employeeId: ph03Ids.employee, days: 2, earnedOn: "2026-06-20", expiresOn: "2026-09-20" });
  assert.equal(older.balanceAfter, 1);
  assert.equal(newer.balanceAfter, 3);

  // NEGATIVE: over-balance redemption throws error.code === 'COMP_OFF_INSUFFICIENT'.
  assert.throws(
    () => services.attendanceOps.redeemCompOff(actor(), { employeeId: ph03Ids.employee, days: 4, redeemOn: "2026-07-01" }),
    (error) => error.code === "COMP_OFF_INSUFFICIENT"
  );

  // FIFO: a 2-day redemption consumes the OLDER credit fully before touching the newer one.
  const redemption = services.attendanceOps.redeemCompOff(actor(), { employeeId: ph03Ids.employee, days: 2, redeemOn: "2026-07-01" });
  assert.deepEqual(redemption.consumed, [
    { creditEntryId: older.id, days: 1 },
    { creditEntryId: newer.id, days: 1 },
  ]);
  assert.equal(redemption.entry.balanceAfter, 1);

  // Expiry sweep (JOB-G03-COMPOFF-EXPIRE): nothing lapses before expires_on...
  const early = services.attendanceOps.runCompOffExpirySweep(actor(), { asOfDate: "2026-08-01" });
  assert.equal(early.lapsed.length, 0);

  // ...and past 2026-09-20 the unused remainder of the newer credit lapses via an EXPIRE entry.
  const sweep = services.attendanceOps.runCompOffExpirySweep(actor(), { asOfDate: "2026-10-01" });
  assert.equal(sweep.lapsed.length, 1);
  assert.equal(sweep.lapsed[0].entryType, "EXPIRE");
  assert.equal(sweep.lapsed[0].days, -1);
  assert.equal(sweep.lapsed[0].sourceRefId, newer.id);
  assert.equal(sweep.lapsed[0].balanceAfter, 0);
  assert.equal(sweep.job.status, "SUCCEEDED");

  // NEGATIVE: redemption targeting an expired credit throws COMP_OFF_EXPIRED; expired
  // credits are never consumed, so the available balance is now zero.
  assert.throws(
    () => services.attendanceOps.redeemCompOff(actor(), { employeeId: ph03Ids.employee, days: 1, redeemOn: "2026-10-02", targetEntryId: newer.id }),
    (error) => error.code === "COMP_OFF_EXPIRED"
  );
  const balance = services.attendanceOps.getCompOffBalance(actor(), ph03Ids.employee, "2026-10-02");
  assert.equal(balance.ledgerBalance, 0);
  assert.equal(balance.availableBalance, 0);

  // The ledger is append-only and balance_after reconciles to the running signed sum.
  const ledger = services.attendanceOps.listCompOffLedger(actor(), ph03Ids.employee);
  assert.equal(ledger.length, 4);
  let running = 0;
  for (const entry of ledger) {
    running += entry.days;
    assert.equal(entry.balanceAfter, running);
  }
});

test("PH-15C API routes expose shifts, rosters, punch ingestion, and comp-off with fail-closed wire negatives", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);

  const shift = call(api, {
    method: "POST",
    path: "/api/v1/atl/shifts",
    headers: { "Idempotency-Key": "idem-ph15c-shift-001" },
    body: { shiftCode: "GEN", name: "General", startTime: "09:00", endTime: "17:30" },
  });
  assert.equal(shift.status, 201);

  // NEGATIVE over the wire: malformed shift timings are 422 VAL-G03-SHIFT-TIMES.
  const badShift = call(api, {
    method: "POST",
    path: "/api/v1/atl/shifts",
    headers: { "Idempotency-Key": "idem-ph15c-shift-002" },
    body: { shiftCode: "BAD", name: "Bad", startTime: "9am", endTime: "17:00" },
  });
  assert.equal(badShift.status, 422);
  assert.equal(badShift.body.error.code, "VAL-G03-SHIFT-TIMES");

  const roster = call(api, {
    method: "POST",
    path: "/api/v1/atl/rosters",
    headers: { "Idempotency-Key": "idem-ph15c-roster-001" },
    body: { shiftId: shift.body.shift.id, effectiveFrom: "2026-07-01" },
  });
  assert.equal(roster.status, 201);
  const publish = call(api, {
    method: "POST",
    path: `/api/v1/atl/rosters/${roster.body.roster.id}:publish`,
    headers: { "Idempotency-Key": "idem-ph15c-roster-002" },
  });
  assert.equal(publish.status, 202);

  // NEGATIVE over the wire: overlapping publish is 409 VAL-G03-ROSTER-OVERLAP.
  const clash = call(api, {
    method: "POST",
    path: "/api/v1/atl/rosters",
    headers: { "Idempotency-Key": "idem-ph15c-roster-003" },
    body: { shiftId: shift.body.shift.id, effectiveFrom: "2026-06-15", effectiveTo: "2026-07-15" },
  });
  const clashPublish = call(api, {
    method: "POST",
    path: `/api/v1/atl/rosters/${clash.body.roster.id}:publish`,
    headers: { "Idempotency-Key": "idem-ph15c-roster-004" },
  });
  assert.equal(clashPublish.status, 409);
  assert.equal(clashPublish.body.error.code, "VAL-G03-ROSTER-OVERLAP");

  const device = call(api, {
    method: "POST",
    path: "/api/v1/atl/attendance-devices",
    headers: { "Idempotency-Key": "idem-ph15c-device-001" },
    body: { deviceCode: "HQ-GATE-1" },
  });
  assert.equal(device.status, 201);

  // NEGATIVE over the wire: unregistered device is 403 DEVICE_NOT_AUTHORIZED (fail closed).
  const rogue = call(api, {
    method: "POST",
    path: "/api/v1/atl/attendance-punches",
    headers: { "Idempotency-Key": "idem-ph15c-punch-000" },
    body: { deviceId: "device-unknown", punchTime: "2026-07-10T09:00", sourceRef: "wire-evt-0000", asOf: "2026-07-10T12:00" },
  });
  assert.equal(rogue.status, 403);
  assert.equal(rogue.body.error.code, "DEVICE_NOT_AUTHORIZED");

  const punch = call(api, {
    method: "POST",
    path: "/api/v1/atl/attendance-punches",
    headers: { "Idempotency-Key": "idem-ph15c-punch-001" },
    body: { deviceId: device.body.device.id, punchTime: "2026-07-10T09:00", punchDirection: "IN", sourceRef: "wire-evt-0001", asOf: "2026-07-10T12:00" },
  });
  assert.equal(punch.status, 201);
  assert.equal(punch.body.ingestionStatus, "ACCEPTED");

  // NEGATIVE over the wire: future punch is 422 INVALID_PUNCH_TIME.
  const future = call(api, {
    method: "POST",
    path: "/api/v1/atl/attendance-punches",
    headers: { "Idempotency-Key": "idem-ph15c-punch-002" },
    body: { deviceId: device.body.device.id, punchTime: "2026-07-10T18:00", sourceRef: "wire-evt-0002", asOf: "2026-07-10T12:00" },
  });
  assert.equal(future.status, 422);
  assert.equal(future.body.error.code, "INVALID_PUNCH_TIME");

  // Comp-off earn + over-balance redemption negative over the wire (409 COMP_OFF_INSUFFICIENT).
  const earned = call(api, {
    method: "POST",
    path: "/api/v1/atl/comp-off:earn",
    headers: { "Idempotency-Key": "idem-ph15c-compoff-001" },
    body: { days: 1, earnedOn: "2026-07-05", expiresOn: "2026-10-05" },
  });
  assert.equal(earned.status, 201);
  const overdraw = call(api, {
    method: "POST",
    path: "/api/v1/atl/comp-off:redeem",
    headers: { "Idempotency-Key": "idem-ph15c-compoff-002" },
    body: { days: 3, redeemOn: "2026-07-10" },
  });
  assert.equal(overdraw.status, 409);
  assert.equal(overdraw.body.error.code, "COMP_OFF_INSUFFICIENT");

  const ledger = call(api, { method: "GET", path: "/api/v1/atl/comp-off-ledger" });
  assert.equal(ledger.status, 200);
  assert.equal(ledger.body.items.length, 1);
  assert.equal(ledger.body.items[0].entryType, "EARN");
});
