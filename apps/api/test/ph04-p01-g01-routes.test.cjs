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

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph04-p01-g01", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-04B P01 starts workflow, lists task, and approves instance", () => {
  const api = createFoundationApi(createFoundationServices());
  const started = call(api, {
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

  const tasks = call(api, { method: "GET", path: "/api/v1/workflow/tasks", query: { limit: "250" } });
  assert.equal(tasks.status, 200);
  assert.equal(tasks.body.limit, 100);
  assert.equal(tasks.body.items.length, 1);

  const approved = call(api, {
    method: "POST",
    path: `/api/v1/workflow/instances/${started.body.instance.id}/approve`,
    headers: { "Idempotency-Key": "idem-p01-approve-001" },
    body: {},
  });
  assert.equal(approved.status, 202);
  assert.equal(approved.body.action.action, "APPROVE");
});

test("PH-04B G01 list, detail, and profile routes enforce pagination and P02 masking", () => {
  const api = createFoundationApi(createFoundationServices());
  const list = call(api, { method: "GET", path: "/api/v1/employees", query: { limit: "250" } });
  assert.equal(list.status, 200);
  assert.equal(list.body.limit, 100);
  assert.equal(list.body.items.length, 2);
  assert.equal(list.body.next_cursor, null);

  const detail = call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.manager}` });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.employee.serviceNo, "GOV-100245");

  const masked = call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.manager}/profile-360` });
  assert.equal(masked.status, 200);
  assert.equal(masked.body.profile.pan, "[HIDDEN]");

  const visible = call(api, {
    method: "GET",
    path: `/api/v1/employees/${ph03Ids.manager}/profile-360`,
    actor: { fieldGrants: ["employee.pan", "employee.aadhaar", "employee.category"] },
  });
  assert.equal(visible.body.profile.pan, "ABCDE1234F");
});

test("PH-04B G01 governed change posts through Service Register", () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  const changed = call(api, {
    method: "POST",
    path: `/api/v1/employees/${ph03Ids.employee}/governed-changes`,
    headers: { "Idempotency-Key": "idem-g01-api-change-001" },
    body: {
      newDisplayName: "Kiran Patel API",
      reason: "Gazette correction",
      effectiveDate: "2026-07-02",
    },
  });
  assert.equal(changed.status, 201);
  assert.match(changed.body.srEventId, /^sr-/);
  assert.equal(services.serviceRegister.getTimeline(actor(), ph03Ids.employee).length, 1);

  const pending = call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.employee}/governed-changes` });
  assert.equal(pending.status, 200);
  assert.equal(pending.body.employeeId, ph03Ids.employee);
});
