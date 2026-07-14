// PH-10D G14 analytics-engine oracle tests (BRD G14 v3 FR-02/03/04/17/23):
//   - governed kpi_definitions with versioning + explicit activation (only the ACTIVE version
//     computes; maker cannot self-activate; cross-version aggregation -> ERR-G14-XVER-AGG);
//   - bitemporal kpi_snapshots: valid_time + knowledge_time, append-only; a restatement appends
//     a superseding row (is_superseded) and the as-of-knowledge query with an earlier
//     knowledgeTime reproduces the pre-restatement value (no as-of data -> ERR-G14-ASOF-NA);
//   - k-anonymity suppression via suppression_policies (default min_cell_size_k = 5): a
//     4-member cohort is suppressed (ERR-G14-SMALL-CELL) and complementary suppression prevents
//     recovery by subtraction from totals (ERR-G14-COMP-SUPPRESS);
//   - analytics_scope_policies maker-checker: maker==checker activation -> ERR-G14-SCOPE-CHECKER;
//   - JOB-G14-MART-* refresh populates the seeded marts and logs to datamart_refresh_logs.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

const MAKER_ID = "user-ph10d-maker";
const CHECKER_ID = "user-ph10d-checker";

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: MAKER_ID,
    actorUserId: MAKER_ID,
    permissions: ["*"],
    roles: ["analytics_admin"],
    fieldGrants: [],
    correlationId: "corr-ph10d-g14",
    ...extra,
  };
}

function checker(extra = {}) {
  return actor({ userId: CHECKER_ID, actorUserId: CHECKER_ID, ...extra });
}

function captureAttendanceDays(services, employeeId, dates, times = { inTime: "09:00", outTime: "17:30" }) {
  for (const attendanceDate of dates) {
    services.leave.captureAttendance(actor(), { employeeId, attendanceDate, ...times });
  }
}

function defineAttendanceKpi(services, kpiCode) {
  return services.analyticsEngine.defineKpi(actor(), {
    kpiCode,
    name: "Attendance days captured",
    description: "Count of captured attendance day records",
    domain: "ATTENDANCE",
    sourceMartCode: "MART_ATTENDANCE",
    expression: "COUNT(*)",
    unit: "COUNT",
    grain: "ORG_UNIT",
  });
}

test("PH-10D KPI definitions are versioned with an explicit governed activation; only the ACTIVE version computes", async () => {
  const services = createFoundationServices();
  const v1 = defineAttendanceKpi(services, "ATT_DAYS");
  assert.equal(v1.status, "DRAFT");
  assert.equal(v1.version, 1);
  assert.ok(v1.definitionHash.length === 64, "definition_hash is a SHA-256 hex digest");

  // Computing before any activation fails: DRAFT never computes.
  assert.throws(
    () => services.analyticsEngine.computeKpiSnapshot(actor(), { kpiCode: "ATT_DAYS", periodKey: "2026-06", validTime: "2026-06-30" }),
    (error) => error.code === "PRECONDITION_FAILED"
  );

  // The defining maker cannot self-activate (P01 maker-checker publication).
  assert.throws(
    () => services.analyticsEngine.activateKpi(actor(), { kpiCode: "ATT_DAYS", version: 1 }),
    (error) => error.code === "FORBIDDEN"
  );

  const activated = services.analyticsEngine.activateKpi(checker(), { kpiCode: "ATT_DAYS", version: 1 });
  assert.equal(activated.status, "ACTIVE");
  assert.equal(activated.approvedBy, CHECKER_ID);

  // A new version starts DRAFT; activating it retires v1 so at most one version computes.
  const v2 = defineAttendanceKpi(services, "ATT_DAYS");
  assert.equal(v2.version, 2);
  services.analyticsEngine.activateKpi(checker(), { kpiCode: "ATT_DAYS", version: 2 });
  const versions = services.analyticsEngine.listKpis(actor(), "ATT_DAYS");
  assert.deepEqual(
    versions.map((def) => [def.version, def.status]),
    [
      [1, "RETIRED"],
      [2, "ACTIVE"],
    ]
  );

  // Computing against the retired (non-ACTIVE) version fails.
  assert.throws(
    () => services.analyticsEngine.computeKpiSnapshot(actor(), { kpiCode: "ATT_DAYS", periodKey: "2026-06", validTime: "2026-06-30", version: 1 }),
    (error) => error.code === "PRECONDITION_FAILED"
  );

  // Every snapshot is stamped with kpi_version + definition_hash.
  captureAttendanceDays(services, ph03Ids.employee, ["2026-06-01", "2026-06-02"]);
  const snapshot = services.analyticsEngine.computeKpiSnapshot(actor(), { kpiCode: "ATT_DAYS", periodKey: "2026-06", validTime: "2026-06-30" });
  assert.equal(snapshot.kpiVersion, 2);
  assert.equal(snapshot.definitionHash, v2.definitionHash);
  assert.equal(snapshot.value, 2);
});

test("PH-10D bitemporal snapshots: restatement appends a superseding knowledge-version and the as-of-knowledge query reproduces the pre-restatement value", async () => {
  const services = createFoundationServices();
  captureAttendanceDays(services, ph03Ids.employee, ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]);
  defineAttendanceKpi(services, "ATT_DAYS");
  services.analyticsEngine.activateKpi(checker(), { kpiCode: "ATT_DAYS", version: 1 });

  const original = services.analyticsEngine.computeKpiSnapshot(actor(), { kpiCode: "ATT_DAYS", periodKey: "2026-06", validTime: "2026-06-30" });
  assert.equal(original.value, 5);
  assert.equal(original.validTime, "2026-06-30");
  assert.equal(original.isSuperseded, false);
  assert.ok(original.knowledgeTime, "snapshot carries knowledge_time");

  // Backfill arrives late: two more June days become known -> restatement (FR-23), which
  // APPENDS a new knowledge-version row and marks the prior is_superseded. Never mutates.
  captureAttendanceDays(services, ph03Ids.employee, ["2026-06-08", "2026-06-09"]);
  const restated = services.analyticsEngine.restateKpiSnapshot(actor(), { kpiCode: "ATT_DAYS", periodKey: "2026-06", reason: "late backfill" });
  assert.equal(restated.value, 7);
  assert.equal(restated.validTime, "2026-06-30", "valid_time unchanged — same business instant");
  assert.ok(restated.knowledgeTime > original.knowledgeTime, "restatement carries a strictly later knowledge_time");

  const rows = services.analyticsEngine
    .listKpis(actor(), "ATT_DAYS")
    .map((def) => def.id);
  assert.equal(rows.length, 1);

  // The prior row is flagged superseded and points at its restatement; its value is intact.
  const asOfOriginal = services.analyticsEngine.kpiValueAsOfKnowledge(actor(), {
    kpiCode: "ATT_DAYS",
    periodKey: "2026-06",
    asOfKnowledgeTime: original.knowledgeTime,
  });
  assert.equal(asOfOriginal.value, 5, "as-of the original knowledgeTime reproduces what was known then");
  assert.equal(asOfOriginal.isSuperseded, true, "the reproduced row is now marked superseded");
  assert.equal(asOfOriginal.knowledgeTime, original.knowledgeTime);

  const asOfNow = services.analyticsEngine.kpiValueAsOfKnowledge(actor(), {
    kpiCode: "ATT_DAYS",
    periodKey: "2026-06",
    asOfKnowledgeTime: new Date(Date.now() + 60_000).toISOString(),
  });
  assert.equal(asOfNow.value, 7, "as-of now returns the restated value");

  // No snapshot was known before the first compute -> ERR-G14-ASOF-NA.
  assert.throws(
    () =>
      services.analyticsEngine.kpiValueAsOfKnowledge(actor(), {
        kpiCode: "ATT_DAYS",
        periodKey: "2026-06",
        asOfKnowledgeTime: "2026-01-01T00:00:00.000Z",
      }),
    (error) => error.code === "ERR-G14-ASOF-NA"
  );
});

test("PH-10D cross-version aggregation is blocked with ERR-G14-XVER-AGG unless acknowledged", async () => {
  const services = createFoundationServices();
  captureAttendanceDays(services, ph03Ids.employee, ["2026-05-04", "2026-05-05"]);
  defineAttendanceKpi(services, "ATT_DAYS");
  services.analyticsEngine.activateKpi(checker(), { kpiCode: "ATT_DAYS", version: 1 });
  services.analyticsEngine.computeKpiSnapshot(actor(), { kpiCode: "ATT_DAYS", periodKey: "2026-05", validTime: "2026-05-31" });

  defineAttendanceKpi(services, "ATT_DAYS");
  services.analyticsEngine.activateKpi(checker(), { kpiCode: "ATT_DAYS", version: 2 });
  services.analyticsEngine.computeKpiSnapshot(actor(), { kpiCode: "ATT_DAYS", periodKey: "2026-06", validTime: "2026-06-30" });

  assert.throws(
    () => services.analyticsEngine.kpiSeries(actor(), { kpiCode: "ATT_DAYS", periodKeys: ["2026-05", "2026-06"] }),
    (error) => error.code === "ERR-G14-XVER-AGG"
  );
  const acknowledged = services.analyticsEngine.kpiSeries(actor(), {
    kpiCode: "ATT_DAYS",
    periodKeys: ["2026-05", "2026-06"],
    acknowledgeCrossVersion: true,
  });
  assert.equal(acknowledged.crossVersion, true);
  assert.deepEqual(acknowledged.kpiVersions, [1, 2]);
  assert.equal(acknowledged.points.length, 2);
});

test("PH-10D NEGATIVE: a 4-member cohort is suppressed under min_cell_size_k=5 (ERR-G14-SMALL-CELL) with complementary suppression so totals cannot recover it", async () => {
  const services = createFoundationServices();
  // Employee A: a 4-member cohort (below k=5). Employee B: 6 records (at/above k).
  captureAttendanceDays(services, ph03Ids.employee, ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04"]);
  captureAttendanceDays(services, ph03Ids.manager, ["2026-06-01", "2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05", "2026-06-08"]);

  const aggregate = services.analyticsEngine.queryAggregate(actor(), { martCode: "MART_ATTENDANCE", dimension: "employeeId" });
  assert.equal(aggregate.minCellSizeK, 5, "default suppression_policies k is 5");

  const smallCell = aggregate.cells.find((cell) => cell.key === ph03Ids.employee);
  assert.equal(smallCell.suppressed, true, "the 4-member cohort is suppressed");
  assert.equal(smallCell.value, null, "the raw count is never emitted for a suppressed cell");
  assert.equal(smallCell.suppressionReason, "ERR-G14-SMALL-CELL");

  // Complementary suppression: with a single primary-suppressed cell, the smallest visible
  // cell is suppressed too and the total withheld, so subtraction cannot recover the cohort.
  const complementCell = aggregate.cells.find((cell) => cell.key === ph03Ids.manager);
  assert.equal(complementCell.suppressed, true);
  assert.equal(complementCell.suppressionReason, "ERR-G14-COMP-SUPPRESS");
  assert.equal(aggregate.total, null, "total is withheld whenever any cell is suppressed");
  assert.equal(JSON.stringify(aggregate).includes('"value":4'), false, "the suppressed count leaks nowhere in the payload");

  // Direct drill into the 4-member cohort is refused outright.
  assert.throws(
    () => services.analyticsEngine.drillCohort(actor(), { martCode: "MART_ATTENDANCE", dimension: "employeeId", key: ph03Ids.employee }),
    (error) => error.code === "ERR-G14-SMALL-CELL"
  );
});

test("PH-10D NEGATIVE: maker==checker scope-policy activation is rejected with ERR-G14-SCOPE-CHECKER; a distinct checker activates", async () => {
  const services = createFoundationServices();
  const policy = services.analyticsEngine.createScopePolicy(actor(), {
    role: "hr_admin",
    scopeDimensions: ["org_unit", "entity"],
    martCode: "MART_ATTENDANCE",
  });
  assert.equal(policy.status, "PENDING_APPROVAL");
  assert.equal(policy.createdBy, MAKER_ID);
  assert.equal(policy.isActive, false);

  // Self-approval refused: the maker cannot be the checker (FR-04 AC7).
  assert.throws(
    () => services.analyticsEngine.activateScopePolicy(actor(), policy.id),
    (error) => error.code === "ERR-G14-SCOPE-CHECKER"
  );

  const activated = services.analyticsEngine.activateScopePolicy(checker(), policy.id);
  assert.equal(activated.status, "ACTIVE");
  assert.equal(activated.isActive, true);
  assert.equal(activated.approvedBy, CHECKER_ID);
  assert.notEqual(activated.approvedBy, activated.createdBy);

  // A replacement binding for the same (role, mart) supersedes the prior on activation.
  const replacement = services.analyticsEngine.createScopePolicy(actor(), {
    role: "hr_admin",
    scopeDimensions: ["org_unit"],
    martCode: "MART_ATTENDANCE",
  });
  services.analyticsEngine.activateScopePolicy(checker(), replacement.id);
  const policies = services.analyticsEngine.listScopePolicies(actor());
  assert.equal(policies.find((row) => row.id === policy.id).status, "SUPERSEDED");
  assert.equal(policies.filter((row) => row.role === "hr_admin" && row.isActive).length, 1);
});

test("PH-10D JOB-G14-MART-* refresh populates the seeded marts from module sources and appends datamart_refresh_logs", async () => {
  const services = createFoundationServices();
  captureAttendanceDays(services, ph03Ids.employee, ["2026-06-01", "2026-06-02", "2026-06-03"]);

  const result = services.analyticsEngine.refreshDatamarts(actor(), { runType: "MANUAL", runKey: "ph10d-refresh-001" });
  const martCodes = result.marts.map((mart) => mart.martCode).sort();
  assert.deepEqual(martCodes, ["MART_APPRAISAL", "MART_ATTENDANCE", "MART_ESTABLISHMENT", "MART_LEAVE"]);

  // Every mart run lands one datamart_refresh_logs row with counts and a SUCCESS status.
  assert.equal(result.logs.length, 4);
  for (const log of result.logs) {
    assert.equal(log.status, "SUCCESS");
    assert.ok(log.startedAt && log.finishedAt, "refresh log carries started/finished timestamps");
    assert.equal(typeof log.rowsWritten, "number");
  }
  const attendanceLog = result.logs.find((log) => log.martCode === "MART_ATTENDANCE");
  assert.equal(attendanceLog.rowsWritten, 3, "the mart consumed the G03 source rows");
  const attendanceMart = result.marts.find((mart) => mart.martCode === "MART_ATTENDANCE");
  assert.equal(attendanceMart.rowCount, 3);
  assert.equal(attendanceMart.refreshJobId, "JOB-G14-MART-ATTENDANCE");
  assert.ok(attendanceMart.lastRefreshedAt, "mart watermark advanced");

  const logs = services.analyticsEngine.listRefreshLogs(actor());
  assert.equal(logs.length, 4);

  // The refresh ran under its registered JOB-G14-MART-* jobs and is audited against
  // datamart_refresh_logs rows.
  assert.ok(
    services.audit
      .listAudit(actor())
      .some((entry) => entry.action === "G14_DATAMART_REFRESHED" && entry.subjectRef.startsWith("datamart_refresh_logs:") && String(entry.metadata.jobId).startsWith("JOB-G14-MART-")),
    "refresh is audited with the datamart_refresh_logs subject and JOB-G14-MART-* job id"
  );
});
