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
    userId: "user-ph04-p01-g01",
    actorUserId: "user-ph04-p01-g01",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph04-p01-g01",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph04-p01-g01", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-04B P01 starts workflow, lists task, and approves instance", async () => {
  const api = createFoundationApi(createFoundationServices());
  const started = await call(api, {
    method: "POST",
    path: "/api/v1/workflow/instances",
    headers: { "Idempotency-Key": "idem-p01-start-001" },
    body: {
      workflowCode: "WF-G03-LEAVE",
      subjectEmployeeId: ph03Ids.employee,
      stage: "PENDING_MANAGER",
      mechanism: "REPORTING_CHAIN",
    },
  });
  assert.equal(started.status, 201);
  assert.equal(started.body.instance.status, "RUNNING");
  assert.equal(started.body.task.resolution.resolverType, "REPORTING_CHAIN");

  const tasks = await call(api, { method: "GET", path: "/api/v1/workflow/tasks", query: { limit: "250" } });
  assert.equal(tasks.status, 200);
  assert.equal(tasks.body.limit, 100);
  assert.equal(tasks.body.items.length, 1);

  const approved = await call(api, {
    method: "POST",
    path: `/api/v1/workflow/instances/${started.body.instance.id}/approve`,
    headers: { "Idempotency-Key": "idem-p01-approve-001" },
    body: {},
  });
  assert.equal(approved.status, 202);
  assert.equal(approved.body.action.action, "APPROVE");
});

test("PH-04B G01 list, detail, and profile routes enforce pagination and P02 masking", async () => {
  const api = createFoundationApi(createFoundationServices());
  const list = await call(api, { method: "GET", path: "/api/v1/employees", query: { limit: "250" } });
  assert.equal(list.status, 200);
  assert.equal(list.body.limit, 100);
  assert.equal(list.body.items.length, 2);
  assert.equal(list.body.next_cursor, null);

  const detail = await call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.manager}` });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.employee.serviceNo, "GOV-100245");

  const masked = await call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.manager}/profile-360` });
  assert.equal(masked.status, 200);
  assert.equal(masked.body.profile.pan, "[HIDDEN]");

  const visible = await call(api, {
    method: "GET",
    path: `/api/v1/employees/${ph03Ids.manager}/profile-360`,
    actor: { fieldGrants: ["employee.pan", "employee.aadhaar", "employee.category"] },
  });
  assert.equal(visible.body.profile.pan, "ABCDE1234F");
});

test("PH-04B P01 task-grain claim, delegate, and approve mutate workflow state", async () => {
  const api = createFoundationApi(createFoundationServices());
  const started = await call(api, {
    method: "POST",
    path: "/api/v1/workflow/instances",
    headers: { "Idempotency-Key": "idem-p01-task-start-001" },
    body: { workflowCode: "WF-G03-LEAVE", subjectEmployeeId: ph03Ids.employee, mechanism: "REPORTING_CHAIN" },
  });
  assert.equal(started.status, 201);
  const taskId = started.body.task.id;

  const claimed = await call(api, {
    method: "POST",
    path: `/api/v1/workflow/tasks/${taskId}/claim`,
    headers: { "Idempotency-Key": "idem-p01-task-claim-001" },
    body: {},
  });
  assert.equal(claimed.status, 202);
  assert.equal(claimed.body.task.status, "CLAIMED");
  assert.equal(claimed.body.task.claimedByUserId, "user-ph04-p01-g01");

  const delegated = await call(api, {
    method: "POST",
    path: `/api/v1/workflow/tasks/${taskId}/delegate`,
    headers: { "Idempotency-Key": "idem-p01-task-delegate-001" },
    body: { toUserId: "user-ph04-delegate-target", reason: "Leave coverage" },
  });
  assert.equal(delegated.status, 202);
  assert.equal(delegated.body.task.claimedByUserId, "user-ph04-delegate-target");
  assert.equal(delegated.body.action.action, "DELEGATE");

  const missingDelegate = await call(api, {
    method: "POST",
    path: `/api/v1/workflow/tasks/${taskId}/delegate`,
    headers: { "Idempotency-Key": "idem-p01-task-delegate-002" },
    body: {},
  });
  assert.equal(missingDelegate.status, 400);
  assert.equal(missingDelegate.body.error.code, "VALIDATION_FAILED");

  const approved = await call(api, {
    method: "POST",
    path: `/api/v1/workflow/tasks/${taskId}/approve`,
    headers: { "Idempotency-Key": "idem-p01-task-approve-001" },
    body: {},
  });
  assert.equal(approved.status, 202);
  assert.equal(approved.body.action.action, "APPROVE");

  const instance = await call(api, { method: "GET", path: `/api/v1/workflow/instances/${started.body.instance.id}` });
  assert.equal(instance.body.instance.status, "APPROVED");

  const reclaim = await call(api, {
    method: "POST",
    path: `/api/v1/workflow/tasks/${taskId}/claim`,
    headers: { "Idempotency-Key": "idem-p01-task-claim-002" },
    body: {},
  });
  assert.equal(reclaim.status, 409);
});

test("PH-04B G01 employee CREATE validates, generates service_no, and feeds PROFILE_CREATED to /changes", async () => {
  const api = createFoundationApi(createFoundationServices());
  const createdEmployee = await call(api, {
    method: "POST",
    path: "/api/v1/employees",
    headers: { "Idempotency-Key": "idem-g01-create-001" },
    body: {
      firstName: "Meera",
      lastName: "Iyer",
      orgUnitId: ph03Ids.orgAssessment,
      designation: "Section Officer",
      dateOfJoining: "2026-07-01",
      category: "GEN",
    },
  });
  assert.equal(createdEmployee.status, 201);
  assert.equal(createdEmployee.body.employee.employmentStatus, "ACTIVE");
  assert.match(createdEmployee.body.employee.serviceNo, /^GOV-\d+$/);
  assert.equal(createdEmployee.body.outboxEvent.eventType, "PROFILE_CREATED");

  const missingField = await call(api, {
    method: "POST",
    path: "/api/v1/employees",
    headers: { "Idempotency-Key": "idem-g01-create-002" },
    body: { firstName: "No Org Unit", dateOfJoining: "2026-07-01" },
  });
  assert.equal(missingField.status, 400);
  assert.equal(missingField.body.error.code, "VALIDATION_FAILED");

  const badPan = await call(api, {
    method: "POST",
    path: "/api/v1/employees",
    headers: { "Idempotency-Key": "idem-g01-create-003" },
    body: { firstName: "Bad", lastName: "Pan", orgUnitId: ph03Ids.orgAssessment, dateOfJoining: "2026-07-01", pan: "NOTAPAN" },
  });
  assert.equal(badPan.status, 400);
  assert.equal(badPan.body.error.details.messageId, "ERR-G01-IDFMT");

  const dupServiceNo = await call(api, {
    method: "POST",
    path: "/api/v1/employees",
    headers: { "Idempotency-Key": "idem-g01-create-004" },
    body: { firstName: "Dup", orgUnitId: ph03Ids.orgAssessment, dateOfJoining: "2026-07-01", serviceNo: "GOV-100245" },
  });
  assert.equal(dupServiceNo.status, 409);

  const feed = await call(api, { method: "GET", path: "/api/v1/employees/changes", query: { limit: "10" } });
  assert.equal(feed.status, 200);
  assert.equal(feed.body.items.length, 1);
  assert.equal(feed.body.items[0].eventType, "PROFILE_CREATED");
  assert.equal(feed.body.items[0].employeeId, createdEmployee.body.employee.id);
  assert.equal(feed.body.next_cursor, null);

  const pagedFeed = await call(api, { method: "GET", path: "/api/v1/employees/changes", query: { limit: "1" } });
  assert.equal(pagedFeed.body.items.length, 1);
});

test("PH-04B G01 governed change request is decided via :approve and posts to the Service Register", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const requested = await call(api, {
    method: "POST",
    path: `/api/v1/employees/${ph03Ids.employee}/governed-changes`,
    headers: { "Idempotency-Key": "idem-g01-api-change-001" },
    body: {
      newDisplayName: "Kiran Patel API",
      reason: "Gazette correction",
      effectiveDate: "2026-07-02",
    },
  });
  assert.equal(requested.status, 201);
  assert.equal(requested.body.request.status, "PENDING");
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee).length, 0);

  const pending = await call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.employee}/governed-changes` });
  assert.equal(pending.status, 200);
  assert.equal(pending.body.employeeId, ph03Ids.employee);
  assert.equal(pending.body.items.length, 1);
  assert.equal(pending.body.items[0].status, "PENDING");

  const approved = await call(api, {
    method: "POST",
    path: `/api/v1/governed-changes/${requested.body.request.id}:approve`,
    headers: { "Idempotency-Key": "idem-g01-api-approve-001" },
    body: {},
  });
  assert.equal(approved.status, 202);
  assert.equal(approved.body.request.status, "APPROVED");
  assert.match(approved.body.srEventId, /^sr-/);
  assert.equal(approved.body.employee.displayName, "Kiran Patel API");
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee).length, 1);

  const again = await call(api, {
    method: "POST",
    path: `/api/v1/governed-changes/${requested.body.request.id}:approve`,
    headers: { "Idempotency-Key": "idem-g01-api-approve-002" },
    body: {},
  });
  assert.equal(again.status, 409);
  assert.equal(again.body.error.details.messageId, "ERR-G01-STATE");

  const feed = await call(api, { method: "GET", path: "/api/v1/employees/changes", query: { limit: "100" } });
  const eventTypes = feed.body.items.map((item) => item.eventType);
  assert.equal(eventTypes.includes("GOVERNED_CHANGE_REQUESTED"), true);
  assert.equal(eventTypes.includes("GOVERNED_CHANGE_APPROVED"), true);
});

test("PH-04B G01 governed change :reject records the decision reason without mutating the master", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const requested = await call(api, {
    method: "POST",
    path: `/api/v1/employees/${ph03Ids.employee}/governed-changes`,
    headers: { "Idempotency-Key": "idem-g01-api-change-002" },
    body: { newDisplayName: "Kiran Patel Rejected", reason: "Unverified affidavit", effectiveDate: "2026-07-02" },
  });
  assert.equal(requested.status, 201);

  const missingReason = await call(api, {
    method: "POST",
    path: `/api/v1/governed-changes/${requested.body.request.id}:reject`,
    headers: { "Idempotency-Key": "idem-g01-api-reject-001" },
    body: {},
  });
  assert.equal(missingReason.status, 400);
  assert.equal(missingReason.body.error.code, "VALIDATION_FAILED");

  const rejected = await call(api, {
    method: "POST",
    path: `/api/v1/governed-changes/${requested.body.request.id}:reject`,
    headers: { "Idempotency-Key": "idem-g01-api-reject-002" },
    body: { reason: "Supporting gazette copy missing" },
  });
  assert.equal(rejected.status, 202);
  assert.equal(rejected.body.request.status, "REJECTED");
  assert.equal(rejected.body.request.decisionReason, "Supporting gazette copy missing");
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee).length, 0);

  const detail = await call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.employee}` });
  assert.equal(detail.body.employee.displayName, "Kiran Patel");
});
