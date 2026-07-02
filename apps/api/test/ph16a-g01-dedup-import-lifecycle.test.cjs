// PH-16A — G01 alias-based dedup/merge (FR-EPM-015), PROVISIONAL bulk import (FR-EPM-017),
// and profile lifecycle :separate/:reactivate/:archive (FR-EPM-018) at BRD depth:
//   - dedup_candidates queue: exact statutory-ID match scores HIGH (>= 90) with matched attributes;
//   - 4-eyes merge writes one employee_id_aliases(loser -> survivor) row with a merge_snapshot,
//     soft-deletes the loser, and emits RECORDS_MERGED{survivor_id, loser_id} on the change feed;
//   - loser ids resolve to the survivor through employee_id_aliases (chained collapse) and the
//     merge is reversible inside the configurable window (UNDO_EXPIRED past it);
//   - employee_import_batches + import_staging_rows: validation_profile MIGRATION commits
//     PROVISIONAL rows (login disabled, remediation_state=QUEUED) and promote-active re-validates
//     under STRICT before flipping record_state to ACTIVE;
//   - §10.1 lifecycle guards: INVALID_STATE, LEGAL_HOLD_ACTIVE, BLOCKING_OBLIGATIONS,
//     maker != checker (SOD_VIOLATION) on merge approval and separation approval.
const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph16a-maker",
    actorUserId: "user-ph16a-maker",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: ["*"],
    correlationId: "corr-ph16a",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph16a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

let idemCounter = 0;
function idem() {
  idemCounter += 1;
  return `idem-ph16a-${idemCounter}`;
}

function createEmployee(api, body) {
  const response = call(api, {
    method: "POST",
    path: "/api/v1/employees",
    headers: { "Idempotency-Key": idem() },
    body: { orgUnitId: ph03Ids.orgRevenue, dateOfJoining: "2019-04-01", ...body },
  });
  assert.equal(response.status, 201);
  return response.body.employee;
}

/** Full merge helper: scan -> request (maker) -> approve (checker). Returns merge response body. */
function mergePair(api, survivorId, loserId) {
  const scan = call(api, { method: "POST", path: "/api/v1/dedup/scan", headers: { "Idempotency-Key": idem() } });
  assert.equal(scan.status, 201);
  const candidates = call(api, { method: "GET", path: "/api/v1/dedup/candidates", query: { status: "OPEN" } });
  const candidate = candidates.body.items.find(
    (item) =>
      (item.employeeAId === survivorId && item.employeeBId === loserId) ||
      (item.employeeAId === loserId && item.employeeBId === survivorId)
  );
  assert.ok(candidate, "expected an OPEN dedup candidate for the pair");
  const request = call(api, {
    method: "POST",
    path: `/api/v1/dedup/candidates/${candidate.id}:merge`,
    headers: { "Idempotency-Key": idem() },
    body: { survivorId },
  });
  assert.equal(request.status, 202);
  const approve = call(api, {
    method: "POST",
    path: `/api/v1/dedup/candidates/${candidate.id}:merge-approve`,
    headers: { "Idempotency-Key": idem() },
    actor: { userId: "user-ph16a-checker", actorUserId: "user-ph16a-checker" },
  });
  assert.equal(approve.status, 202);
  return approve.body;
}

// =========================================================================================
// FR-EPM-015 — dedup candidates + 4-eyes alias merge
// =========================================================================================

test("PH-16A dedup: exact statutory-ID match queues a HIGH (>=90) dedup candidate with matched attributes", () => {
  const api = createFoundationApi(createFoundationServices());
  const original = createEmployee(api, { firstName: "Rahul", lastName: "Verma", pan: "PQRST1111Z", dob: "1985-03-10" });
  const duplicate = createEmployee(api, { firstName: "Rahul", lastName: "Varma", pan: "PQRST1111Z", dob: "1985-03-10" });

  const scan = call(api, { method: "POST", path: "/api/v1/dedup/scan", headers: { "Idempotency-Key": idem() } });
  assert.equal(scan.status, 201);
  const candidates = call(api, { method: "GET", path: "/api/v1/dedup/candidates", query: { status: "OPEN" } });
  assert.equal(candidates.status, 200);
  const candidate = candidates.body.items.find(
    (item) =>
      (item.employeeAId === original.id && item.employeeBId === duplicate.id) ||
      (item.employeeAId === duplicate.id && item.employeeBId === original.id)
  );
  assert.ok(candidate, "exact PAN pair must be queued in dedup_candidates");
  assert.ok(candidate.matchScore >= 90, "exact statutory-ID match scores HIGH (>= 90)");
  assert.equal(candidate.band, "HIGH");
  assert.ok(candidate.matchedAttributes.includes("pan"));
});

test("PH-16A merge: 4-eyes merge writes employee_id_aliases with merge_snapshot, soft-deletes the loser, emits RECORDS_MERGED", () => {
  const api = createFoundationApi(createFoundationServices());
  const survivor = createEmployee(api, { firstName: "Sunita", lastName: "Devi", pan: "LMNOP2222Q" });
  const loser = createEmployee(api, { firstName: "Sunitha", lastName: "Devi", pan: "LMNOP2222Q" });
  // The loser owns a satellite that must be consolidated under the survivor (G01-owned only).
  const contact = call(api, {
    method: "POST",
    path: `/api/v1/employees/${loser.id}/contacts`,
    headers: { "Idempotency-Key": idem() },
    body: { contactType: "MOBILE", contactValue: "+919811100011", isPrimary: true },
  });
  assert.equal(contact.status, 201);

  const merged = mergePair(api, survivor.id, loser.id);
  assert.equal(merged.alias.loserId, loser.id);
  assert.equal(merged.alias.survivorId, survivor.id);
  assert.equal(merged.alias.isReversed, false);
  assert.ok(merged.alias.mergeSnapshot.loser, "merge_snapshot must capture the loser row for undo");
  assert.ok(merged.alias.mergeSnapshot.movedSatellites.contactIds.length >= 1, "moved satellite ids recorded in merge_snapshot");
  // RECORDS_MERGED{survivor_id, loser_id} tombstone on the change feed (FR-EPM-015 AC4/AC7).
  assert.equal(merged.outboxEvent.eventType, "RECORDS_MERGED");
  assert.equal(merged.outboxEvent.payload.survivor_id, survivor.id);
  assert.equal(merged.outboxEvent.payload.loser_id, loser.id);
  assert.equal(merged.outboxEvent.payload.is_tombstone, true);
  const feed = call(api, { method: "GET", path: "/api/v1/employees/changes" });
  assert.ok(
    feed.body.items.some((event) => event.eventType === "RECORDS_MERGED" && event.payload.loser_id === loser.id),
    "RECORDS_MERGED must be served by the change feed"
  );
  // The loser's satellite now belongs to the survivor.
  const survivorContacts = call(api, { method: "GET", path: `/api/v1/employees/${survivor.id}/contacts` });
  assert.ok(survivorContacts.body.items.some((item) => item.contactValue === "+919811100011"));
});

test("PH-16A alias resolution: a merged loser id resolves to the survivor via employee_id_aliases (chained collapse)", () => {
  const api = createFoundationApi(createFoundationServices());
  const a = createEmployee(api, { firstName: "Deepak", lastName: "Kumar", pan: "AAAAB1111A" });
  const b = createEmployee(api, { firstName: "Dipak", lastName: "Kumar", pan: "AAAAB1111A" });
  mergePair(api, a.id, b.id); // b -> a

  const resolved = call(api, { method: "GET", path: `/api/v1/employees/${b.id}/resolve` });
  assert.equal(resolved.status, 200);
  assert.equal(resolved.body.employeeId, a.id, "loser resolves to survivor");
  assert.equal(resolved.body.resolvedVia, "employee_id_aliases");
  // Alias-transparent read: fetching the merged loser id returns the survivor row.
  const read = call(api, { method: "GET", path: `/api/v1/employees/${b.id}` });
  assert.equal(read.status, 200);
  assert.equal(read.body.employee.id, a.id);

  // Chained aliases collapse to the ultimate survivor: merge a -> c, then b resolves to c.
  const c = createEmployee(api, { firstName: "Deepak", lastName: "Kumaar", pan: "AAAAB1111A" });
  mergePair(api, c.id, a.id); // a -> c
  const chained = call(api, { method: "GET", path: `/api/v1/employees/${b.id}/resolve` });
  assert.equal(chained.body.employeeId, c.id, "chained aliases collapse b -> a -> c");
  assert.equal(chained.body.resolvedVia, "employee_id_aliases");
});

test("PH-16A NEGATIVE merge SoD: maker = checker approval fails closed with SOD_VIOLATION (403)", () => {
  const api = createFoundationApi(createFoundationServices());
  const survivor = createEmployee(api, { firstName: "Asha", lastName: "Rani", pan: "CCCCD3333C" });
  const loser = createEmployee(api, { firstName: "Aasha", lastName: "Rani", pan: "CCCCD3333C" });
  call(api, { method: "POST", path: "/api/v1/dedup/scan", headers: { "Idempotency-Key": idem() } });
  const candidates = call(api, { method: "GET", path: "/api/v1/dedup/candidates", query: { status: "OPEN" } });
  const candidate = candidates.body.items.find(
    (item) => [item.employeeAId, item.employeeBId].includes(survivor.id) && [item.employeeAId, item.employeeBId].includes(loser.id)
  );
  const request = call(api, {
    method: "POST",
    path: `/api/v1/dedup/candidates/${candidate.id}:merge`,
    headers: { "Idempotency-Key": idem() },
    body: { survivorId: survivor.id },
  });
  assert.equal(request.status, 202);
  // Same user (the maker) attempts approval: FR-EPM-015 BR maker != checker.
  const selfApprove = call(api, {
    method: "POST",
    path: `/api/v1/dedup/candidates/${candidate.id}:merge-approve`,
    headers: { "Idempotency-Key": idem() },
  });
  assert.equal(selfApprove.status, 403);
  assert.equal(selfApprove.body.error.code === "SOD_VIOLATION", true);
  // The guard leaves nothing half-merged: loser still readable under its own id.
  const stillThere = call(api, { method: "GET", path: `/api/v1/employees/${loser.id}/resolve` });
  assert.equal(stillThere.body.resolvedVia, "IDENTITY");
});

test("PH-16A NEGATIVE merge conflict: conflicting ACTIVE statutory states without override fail with MERGE_CONFLICT (409)", () => {
  const api = createFoundationApi(createFoundationServices());
  // Same phonetic name + dob queue a fuzzy candidate, but the two live PANs conflict.
  const survivor = createEmployee(api, { firstName: "Mohan", lastName: "Sharma", pan: "EEEEF4444E", dob: "1980-01-01" });
  const loser = createEmployee(api, { firstName: "Mohun", lastName: "Sharma", pan: "GGGGH5555G", dob: "1980-01-01" });
  call(api, { method: "POST", path: "/api/v1/dedup/scan", headers: { "Idempotency-Key": idem() } });
  const candidates = call(api, { method: "GET", path: "/api/v1/dedup/candidates", query: { status: "OPEN" } });
  const candidate = candidates.body.items.find(
    (item) => [item.employeeAId, item.employeeBId].includes(survivor.id) && [item.employeeAId, item.employeeBId].includes(loser.id)
  );
  assert.ok(candidate, "fuzzy composite (phonetic name + dob) must queue the pair");
  assert.ok(candidate.matchScore > 0 && candidate.matchScore <= 100);
  assert.ok(candidate.matchedAttributes.includes("name_phonetic"));
  const request = call(api, {
    method: "POST",
    path: `/api/v1/dedup/candidates/${candidate.id}:merge`,
    headers: { "Idempotency-Key": idem() },
    body: { survivorId: survivor.id },
  });
  assert.equal(request.status, 202);
  const approve = call(api, {
    method: "POST",
    path: `/api/v1/dedup/candidates/${candidate.id}:merge-approve`,
    headers: { "Idempotency-Key": idem() },
    actor: { userId: "user-ph16a-checker", actorUserId: "user-ph16a-checker" },
  });
  assert.equal(approve.status, 409);
  assert.equal(approve.body.error.code === "MERGE_CONFLICT", true);
});

test("PH-16A merge undo: within the window the snapshot restores the loser and flips is_reversed", () => {
  const api = createFoundationApi(createFoundationServices());
  const survivor = createEmployee(api, { firstName: "Farida", lastName: "Begum", pan: "IIIIJ6666I" });
  const loser = createEmployee(api, { firstName: "Fareeda", lastName: "Begum", pan: "IIIIJ6666I" });
  const merged = mergePair(api, survivor.id, loser.id);

  const undo = call(api, {
    method: "POST",
    path: `/api/v1/dedup/merges/${merged.alias.id}:undo`,
    headers: { "Idempotency-Key": idem() },
  });
  assert.equal(undo.status, 202);
  assert.equal(undo.body.alias.isReversed, true);
  assert.equal(undo.body.restored.id, loser.id);
  // Restored loser resolves to itself again and the feed re-emits resolution.
  const resolved = call(api, { method: "GET", path: `/api/v1/employees/${loser.id}/resolve` });
  assert.equal(resolved.body.employeeId, loser.id);
  assert.equal(resolved.body.resolvedVia, "IDENTITY");
  const feed = call(api, { method: "GET", path: "/api/v1/employees/changes", query: { limit: "100" } });
  assert.ok(feed.body.items.some((event) => event.eventType === "MERGE_UNDONE" && event.payload.loser_id === loser.id));
});

test("PH-16A NEGATIVE undo window: undo past the configured window fails closed with UNDO_EXPIRED (409)", () => {
  // FR-EPM-015 AC5: the window is configurable (default 7 days) — a zero-day window makes
  // every alias immediately past its mergeable_back_until, exercising the expiry guard.
  const api = createFoundationApi(createFoundationServices({ g01MergeUndoWindowDays: 0 }));
  const survivor = createEmployee(api, { firstName: "Gopal", lastName: "Nair", pan: "KKKKL7777K" });
  const loser = createEmployee(api, { firstName: "Gopaal", lastName: "Nair", pan: "KKKKL7777K" });
  const merged = mergePair(api, survivor.id, loser.id);

  const undo = call(api, {
    method: "POST",
    path: `/api/v1/dedup/merges/${merged.alias.id}:undo`,
    headers: { "Idempotency-Key": idem() },
  });
  assert.equal(undo.status, 409);
  assert.equal(undo.body.error.code === "UNDO_EXPIRED", true);
  // Expired undo restores nothing: the loser still resolves to the survivor.
  const resolved = call(api, { method: "GET", path: `/api/v1/employees/${loser.id}/resolve` });
  assert.equal(resolved.body.employeeId, survivor.id);
});

// =========================================================================================
// FR-EPM-017 — bulk import: employee_import_batches + import_staging_rows PROVISIONAL glide path
// =========================================================================================

test("PH-16A import: MIGRATION profile commits PROVISIONAL rows login-disabled and QUEUED; promote-active re-validates under STRICT", () => {
  const api = createFoundationApi(createFoundationServices());
  // validation_profile=MIGRATION: row 1 passes STRICT, row 2 misses dob/doj (PROVISIONAL), row 3 is unrecoverable.
  const createBatch = call(api, {
    method: "POST",
    path: "/api/v1/imports",
    headers: { "Idempotency-Key": idem() },
    body: {
      templateVersion: "G01-IMPORT-V1",
      validationProfile: "MIGRATION",
      rows: [
        { firstName: "Lata", lastName: "Joshi", orgUnitId: ph03Ids.orgRevenue, dateOfJoining: "2001-06-01", dob: "1975-02-02", legacyId: "LEG-001" },
        { firstName: "Bhola", lastName: "Prasad", orgUnitId: ph03Ids.orgRevenue, legacyId: "LEG-002" },
        { lastName: "NoFirstName", orgUnitId: ph03Ids.orgRevenue, legacyId: "LEG-003" },
      ],
    },
  });
  assert.equal(createBatch.status, 201);
  const batchId = createBatch.body.batch.id;
  assert.equal(createBatch.body.batch.validationProfile, "MIGRATION");

  const validate = call(api, { method: "POST", path: `/api/v1/imports/${batchId}:validate`, headers: { "Idempotency-Key": idem() } });
  assert.equal(validate.status, 202);
  assert.equal(validate.body.batch.validRows, 1);
  assert.equal(validate.body.batch.provisionalRows, 1);
  assert.equal(validate.body.batch.errorRows, 1);
  const report = call(api, { method: "GET", path: `/api/v1/imports/${batchId}/report` });
  const statuses = report.body.rows.map((row) => row.validationStatus);
  assert.deepEqual(statuses, ["VALID", "PROVISIONAL", "ERROR"]);
  assert.ok(report.body.rows[1].validationErrors.some((err) => err.field === "dob"), "PROVISIONAL rows list their gaps");

  const commit = call(api, { method: "POST", path: `/api/v1/imports/${batchId}:commit`, headers: { "Idempotency-Key": idem() } });
  assert.equal(commit.status, 202);
  assert.equal(commit.body.committed, 2);
  assert.equal(commit.body.replayed, false);
  assert.equal(commit.body.batch.status, "COMMITTED");

  // AC4: replay is an idempotent skip — no re-execution, no duplicate rows.
  const replay = call(api, { method: "POST", path: `/api/v1/imports/${batchId}:commit`, headers: { "Idempotency-Key": idem() } });
  assert.equal(replay.status, 202);
  assert.equal(replay.body.replayed, true);
  assert.equal(replay.body.committed, 2);

  // AC5: the PROVISIONAL employee is login-disabled and sits in the remediation queue as QUEUED.
  const committedRows = call(api, { method: "GET", path: `/api/v1/imports/${batchId}/report` }).body.rows;
  const provisionalRow = committedRows.find((row) => row.remediationState === "QUEUED");
  assert.ok(provisionalRow, "import_staging_rows must carry remediation_state=QUEUED for the PROVISIONAL commit");
  const provisionalEmployeeId = provisionalRow.resolvedEmployeeId;
  const provisionalEmployee = call(api, { method: "GET", path: `/api/v1/employees/${provisionalEmployeeId}` }).body.employee;
  assert.equal(provisionalEmployee.recordState, "PROVISIONAL");
  assert.equal(provisionalEmployee.loginDisabled, true);
  const queue = call(api, { method: "GET", path: "/api/v1/remediation-queue", query: { state: "QUEUED" } });
  assert.ok(queue.body.items.some((row) => row.resolvedEmployeeId === provisionalEmployeeId));

  // Promote with remaining gaps -> 409. The BRD registers only the status (no named code) for
  // promote-with-gaps, so the closest registered code INVALID_STATE is asserted here.
  const blockedPromote = call(api, {
    method: "POST",
    path: `/api/v1/employees/${provisionalEmployeeId}:promote-active`,
    headers: { "Idempotency-Key": idem() },
    body: {},
  });
  assert.equal(blockedPromote.status, 409);
  assert.equal(blockedPromote.body.error.code === "INVALID_STATE", true);

  // Remediate the gaps: promote-active re-validates under STRICT and flips record_state.
  const promote = call(api, {
    method: "POST",
    path: `/api/v1/employees/${provisionalEmployeeId}:promote-active`,
    headers: { "Idempotency-Key": idem() },
    body: { dob: "1969-09-09", dateOfJoining: "1995-01-15" },
  });
  assert.equal(promote.status, 202);
  assert.equal(promote.body.employee.recordState, "ACTIVE");
  assert.equal(promote.body.employee.loginDisabled, false);
  const resolvedQueue = call(api, { method: "GET", path: "/api/v1/remediation-queue", query: { state: "RESOLVED" } });
  assert.ok(resolvedQueue.body.items.some((row) => row.resolvedEmployeeId === provisionalEmployeeId));
});

test("PH-16A import guards: STRICT profile hard-fails gap rows; template version mismatch blocks the upload", () => {
  const api = createFoundationApi(createFoundationServices());
  const wrongTemplate = call(api, {
    method: "POST",
    path: "/api/v1/imports",
    headers: { "Idempotency-Key": idem() },
    body: { templateVersion: "G01-IMPORT-V0", validationProfile: "STRICT", rows: [{ firstName: "X", orgUnitId: ph03Ids.orgRevenue }] },
  });
  assert.equal(wrongTemplate.status, 400);

  const strictBatch = call(api, {
    method: "POST",
    path: "/api/v1/imports",
    headers: { "Idempotency-Key": idem() },
    body: {
      templateVersion: "G01-IMPORT-V1",
      validationProfile: "STRICT",
      rows: [{ firstName: "Hari", lastName: "Om", orgUnitId: ph03Ids.orgRevenue, legacyId: "LEG-010" }],
    },
  });
  const validated = call(api, {
    method: "POST",
    path: `/api/v1/imports/${strictBatch.body.batch.id}:validate`,
    headers: { "Idempotency-Key": idem() },
  });
  // The same gap row that is PROVISIONAL under MIGRATION is ERROR under STRICT (AC2).
  assert.equal(validated.body.batch.errorRows, 1);
  assert.equal(validated.body.batch.provisionalRows, 0);
});

// =========================================================================================
// FR-EPM-018 — lifecycle :separate / :reactivate / :archive with §10.1 transition guards
// =========================================================================================

test("PH-16A lifecycle: maker!=checker separation applies status + separation_reason, disables login, emits SEPARATION", () => {
  const api = createFoundationApi(createFoundationServices());
  const employee = createEmployee(api, { firstName: "Prakash", lastName: "Iyer" });
  const initiate = call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}:separate`,
    headers: { "Idempotency-Key": idem() },
    body: { targetStatus: "RETIRED", separationDate: "2026-06-30", separationReason: "SUPERANNUATION" },
  });
  assert.equal(initiate.status, 202);
  assert.equal(initiate.body.request.status, "PENDING");

  // NEGATIVE maker=checker on separation approval (FR-EPM-018 AC1).
  const selfApprove = call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}/separation:approve`,
    headers: { "Idempotency-Key": idem() },
  });
  assert.equal(selfApprove.status, 403);
  assert.equal(selfApprove.body.error.code === "SOD_VIOLATION", true);

  const approve = call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}/separation:approve`,
    headers: { "Idempotency-Key": idem() },
    actor: { userId: "user-ph16a-checker", actorUserId: "user-ph16a-checker" },
  });
  assert.equal(approve.status, 202);
  assert.equal(approve.body.employee.employmentStatus, "RETIRED");
  assert.equal(approve.body.employee.separationReason, "SUPERANNUATION");
  assert.equal(approve.body.employee.loginDisabled, true, "linked login disabled on separation (AC2)");
  assert.equal(approve.body.outboxEvent.eventType, "SEPARATION");
  const feed = call(api, { method: "GET", path: "/api/v1/employees/changes", query: { limit: "100" } });
  assert.ok(feed.body.items.some((event) => event.eventType === "SEPARATION" && event.employeeId === employee.id));

  // AC5: reactivation (rehire) restores access and emits REACTIVATION with assignment reason HIRE.
  const reactivate = call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}:reactivate`,
    headers: { "Idempotency-Key": idem() },
    body: { effectiveDate: "2026-08-01" },
  });
  assert.equal(reactivate.status, 202);
  assert.equal(reactivate.body.employee.employmentStatus, "ACTIVE");
  assert.equal(reactivate.body.employee.loginDisabled, false);
  assert.equal(reactivate.body.outboxEvent.eventType, "REACTIVATION");
  assert.equal(reactivate.body.outboxEvent.payload.assignment_reason, "HIRE");
});

test("PH-16A NEGATIVE lifecycle transitions: §10.1 guards fail closed with INVALID_STATE (409)", () => {
  const api = createFoundationApi(createFoundationServices());
  const employee = createEmployee(api, { firstName: "Nisha", lastName: "Kapoor" });
  // Reactivating an ACTIVE employee is not a §10.1 transition.
  const badReactivate = call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}:reactivate`,
    headers: { "Idempotency-Key": idem() },
    body: { effectiveDate: "2026-07-01" },
  });
  assert.equal(badReactivate.status, 409);
  assert.equal(badReactivate.body.error.code === "INVALID_STATE", true);
  // Archiving an ACTIVE (non-separated) employee is blocked.
  const badArchive = call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}:archive`,
    headers: { "Idempotency-Key": idem() },
  });
  assert.equal(badArchive.status, 409);
  assert.equal(badArchive.body.error.code === "INVALID_STATE", true);
  // RESIGNED is only reachable from ACTIVE: retire first, then a second separation is invalid.
  call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}:separate`,
    headers: { "Idempotency-Key": idem() },
    body: { targetStatus: "RETIRED", separationDate: "2026-06-30", separationReason: "SUPERANNUATION" },
  });
  call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}/separation:approve`,
    headers: { "Idempotency-Key": idem() },
    actor: { userId: "user-ph16a-checker", actorUserId: "user-ph16a-checker" },
  });
  const doubleSeparation = call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}:separate`,
    headers: { "Idempotency-Key": idem() },
    body: { targetStatus: "RESIGNED", separationDate: "2026-07-01", separationReason: "PERSONAL" },
  });
  assert.equal(doubleSeparation.status, 409);
  assert.equal(doubleSeparation.body.error.code === "INVALID_STATE", true);
});

test("PH-16A NEGATIVE archive under hold: an ACTIVE legal hold blocks archival with LEGAL_HOLD_ACTIVE (409)", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const employee = createEmployee(api, { firstName: "Vikram", lastName: "Singh" });
  // Separate + approve so the record is archivable per §10.1.
  call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}:separate`,
    headers: { "Idempotency-Key": idem() },
    body: { targetStatus: "RETIRED", separationDate: "2026-06-30", separationReason: "SUPERANNUATION" },
  });
  call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}/separation:approve`,
    headers: { "Idempotency-Key": idem() },
    actor: { userId: "user-ph16a-checker", actorUserId: "user-ph16a-checker" },
  });
  // Place an ACTIVE E31 legal hold on the employee.
  const { hold } = services.employeeIdentityOps.placeLegalHold(actor(), {
    employeeId: employee.id,
    holdType: "LITIGATION",
    reason: "Pending service-matter litigation",
  });
  assert.equal(hold.status, "ACTIVE");

  const blocked = call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}:archive`,
    headers: { "Idempotency-Key": idem() },
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code === "LEGAL_HOLD_ACTIVE", true);

  // Releasing the hold unblocks the archive: record_state flips to ARCHIVED.
  services.employeeIdentityOps.releaseLegalHold(actor(), { holdId: hold.id });
  const archived = call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}:archive`,
    headers: { "Idempotency-Key": idem() },
  });
  assert.equal(archived.status, 202);
  assert.equal(archived.body.employee.recordState, "ARCHIVED");
});

test("PH-16A NEGATIVE blocking obligations: open obligations without override fail separation with BLOCKING_OBLIGATIONS (409)", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const employee = createEmployee(api, { firstName: "Ramesh", lastName: "Gupta" });
  services.employeeIdentityOps.registerBlockingObligation(actor(), {
    employeeId: employee.id,
    description: "Unreturned government quarters",
  });
  const blocked = call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}:separate`,
    headers: { "Idempotency-Key": idem() },
    body: { targetStatus: "RESIGNED", separationDate: "2026-07-15", separationReason: "PERSONAL" },
  });
  assert.equal(blocked.status, 409);
  assert.equal(blocked.body.error.code === "BLOCKING_OBLIGATIONS", true);
  // Explicit override (configurable per BR) lets the separation proceed to PENDING.
  const overridden = call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}:separate`,
    headers: { "Idempotency-Key": idem() },
    body: { targetStatus: "RESIGNED", separationDate: "2026-07-15", separationReason: "PERSONAL", overrideObligations: true },
  });
  assert.equal(overridden.status, 202);
  assert.equal(overridden.body.request.status, "PENDING");
});

test("PH-16A lifecycle DEATH: a DECEASED separation emits DEATH with the FR-024/G11 succession handoff", () => {
  const api = createFoundationApi(createFoundationServices());
  const employee = createEmployee(api, { firstName: "Shanta", lastName: "Bai" });
  call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}:separate`,
    headers: { "Idempotency-Key": idem() },
    body: { targetStatus: "DECEASED", separationDate: "2026-06-01", separationReason: "DEATH_IN_SERVICE" },
  });
  const approve = call(api, {
    method: "POST",
    path: `/api/v1/employees/${employee.id}/separation:approve`,
    headers: { "Idempotency-Key": idem() },
    actor: { userId: "user-ph16a-checker", actorUserId: "user-ph16a-checker" },
  });
  assert.equal(approve.status, 202);
  assert.equal(approve.body.employee.employmentStatus, "DECEASED");
  assert.equal(approve.body.outboxEvent.eventType, "DEATH");
  assert.equal(approve.body.outboxEvent.payload.succession_handoff, "FR-024/G11_FAMILY_PENSION");
});
