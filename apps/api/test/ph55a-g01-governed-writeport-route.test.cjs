const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph55a",
    actorUserId: "user-ph55a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph55a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph55a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

test("PH-55A G01 governed write-ports: identity change, transfer posting, probation confirmation", async () => {
  const api = createFoundationApi(createFoundationServices());

  const identity = await call(api, {
    method: "POST",
    path: `/api/v1/employees/${ph03Ids.employee}:governed-identity-change`,
    headers: { "Idempotency-Key": "gic-1" },
    body: { newDisplayName: "Ashok Kumar (corrected)", reason: "Gazette name correction", effectiveDate: "2026-07-02" },
  });
  assert.equal(identity.status, 202);
  assert.equal(identity.body.employee.displayName, "Ashok Kumar (corrected)");
  assert.ok(identity.body.srEventId);

  const posting = await call(api, {
    method: "POST",
    path: `/api/v1/employees/${ph03Ids.employee}:apply-transfer-posting`,
    headers: { "Idempotency-Key": "atp-1" },
    body: { toOrgUnitId: "OU-NEW", transferOrderId: "TO-1", orderNo: "ORD/2026/1", effectiveDate: "2026-07-05" },
  });
  assert.equal(posting.status, 202);
  assert.equal(posting.body.employee.orgUnitId, "OU-NEW");

  const probation = await call(api, {
    method: "POST",
    path: `/api/v1/employees/${ph03Ids.employee}:apply-probation-confirmation`,
    headers: { "Idempotency-Key": "apc-1" },
    body: { confirmationEffectiveDate: "2026-07-06", confirmationRef: "PROB/2026/1" },
  });
  assert.equal(probation.status, 202);
  assert.equal(probation.body.employee.confirmationDate, "2026-07-06");
});

test("PH-55A G01 live-record + count reads respond through the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());
  const live = await call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.employee}/live-record` });
  assert.equal(live.status, 200);
  assert.equal(live.body.employee.id, ph03Ids.employee);

  const list = await call(api, { method: "GET", path: "/api/v1/employees:list-live-records" });
  assert.equal(list.status, 200);
  assert.ok(list.body.items.length >= 1);

  const count = await call(api, { method: "GET", path: "/api/v1/employees:count" });
  assert.equal(count.status, 200);
  assert.ok(count.body.count >= 1);
});

test("PH-55A G01 transfer posting on an unknown employee fails closed (NOT_FOUND)", async () => {
  const api = createFoundationApi(createFoundationServices());
  const res = await call(api, {
    method: "POST",
    path: "/api/v1/employees/nope:apply-transfer-posting",
    headers: { "Idempotency-Key": "atp-x" },
    body: { toOrgUnitId: "OU-NEW", transferOrderId: "TO-2", orderNo: "ORD/2026/2", effectiveDate: "2026-07-05" },
  });
  assert.equal(res.status, 404);
});
