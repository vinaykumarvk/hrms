const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph56a",
    actorUserId: "user-ph56a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph56a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph56a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-56A G10 engine run: create + reads through the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());
  const created = await call(api, { method: "POST", path: "/api/v1/payroll/engine-runs", headers: { "Idempotency-Key": "run-1" }, body: { period: "2026-07", runMode: "DRAFT" } });
  assert.equal(created.status, 201);
  const id = created.body.run.id;
  assert.equal(created.body.run.status, "QUEUED");

  const read = await call(api, { method: "GET", path: `/api/v1/payroll/engine-runs/${id}` });
  assert.equal(read.status, 200);
  assert.equal(read.body.run.id, id);

  const payslips = await call(api, { method: "GET", path: `/api/v1/payroll/engine-runs/${id}/payslips` });
  assert.equal(payslips.status, 200);
  assert.ok(Array.isArray(payslips.body.items));
});

test("PH-56A G10 engine run: period must be YYYY-MM", async () => {
  const api = createFoundationApi(createFoundationServices());
  const bad = await call(api, { method: "POST", path: "/api/v1/payroll/engine-runs", headers: { "Idempotency-Key": "run-bad" }, body: { period: "July 2026" } });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, "VALIDATION_FAILED");
});

test("PH-56A G10 engine run mutation routes fail closed on an unknown run (NOT_FOUND)", async () => {
  const api = createFoundationApi(createFoundationServices());
  const steps = [
    "/api/v1/payroll/engine-runs/nope:snapshot",
    "/api/v1/payroll/engine-runs/nope:compute",
    "/api/v1/payroll/engine-runs/nope:approve",
    "/api/v1/payroll/engine-runs/nope:lock",
  ];
  steps.forEach(async (path, i) => {
    const res = await call(api, { method: "POST", path, headers: { "Idempotency-Key": `run-nf-${i}` }, body: {} });
    assert.equal(res.status, 404, path);
  });
});
