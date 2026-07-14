const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph57a",
    actorUserId: "user-ph57a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph57a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph57a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

const approver = { userId: "fnf-approver", actorUserId: "fnf-approver" };

test("PH-57A G10 full-and-final: settle -> approve (SoD); single-record + reads", async () => {
  const api = createFoundationApi(createFoundationServices());
  const settled = await call(api, {
    method: "POST",
    path: "/api/v1/payroll/fnf-settlements",
    headers: { "Idempotency-Key": "fnf-1" },
    body: { employeeId: ph03Ids.employee, separationDate: "2026-06-30", finalMonthPayPaise: 5000000, leaveEncashmentPaise: 1200000, gratuityPaise: 3000000 },
  });
  assert.equal(settled.status, 201);
  const id = settled.body.settlement.id;
  assert.equal(settled.body.settlement.status, "COMPUTED");

  // AC1: a second consolidated FnF record for the same employee is a CONFLICT.
  const dup = await call(api, {
    method: "POST",
    path: "/api/v1/payroll/fnf-settlements",
    headers: { "Idempotency-Key": "fnf-dup" },
    body: { employeeId: ph03Ids.employee, separationDate: "2026-06-30", finalMonthPayPaise: 5000000 },
  });
  assert.equal(dup.status, 409);

  const approved = await call(api, { method: "POST", path: `/api/v1/payroll/fnf-settlements/${id}:approve`, headers: { "Idempotency-Key": "fnf-a" }, actor: approver, body: {} });
  assert.equal(approved.status, 202);
  assert.equal(approved.body.settlement.status, "APPROVED");

  const list = await call(api, { method: "GET", path: `/api/v1/payroll/fnf-settlements`, query: { employeeId: ph03Ids.employee } });
  assert.equal(list.status, 200);
  assert.equal(list.body.items.length, 1);
});

test("PH-57A G10 recovery/loan/hold reads respond through the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());
  const paths = [
    `/api/v1/payroll/employees/${ph03Ids.employee}/recovery-schedules`,
    `/api/v1/payroll/employees/${ph03Ids.employee}/loans`,
    "/api/v1/payroll/runs/any-run/holds",
  ];
  for (const path of paths) {
    const res = await call(api, { method: "GET", path });
    assert.equal(res.status, 200, path);
    assert.ok(Array.isArray(res.body.items), path);
  }
});

test("PH-57A G10 FnF settle rejects negative paise (VALIDATION_FAILED)", async () => {
  const api = createFoundationApi(createFoundationServices());
  const bad = await call(api, {
    method: "POST",
    path: "/api/v1/payroll/fnf-settlements",
    headers: { "Idempotency-Key": "fnf-bad" },
    body: { employeeId: ph03Ids.employee, separationDate: "2026-06-30", finalMonthPayPaise: -1 },
  });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "VALIDATION_FAILED");
});
