const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph48a",
    actorUserId: "user-ph48a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph48a",
    ...extra,
  };
}

async function call(api, request) {
  return await api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph48a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function seedEvent(services) {
  services.serviceRegister.ingest(actor(), "sr-seed-1", {
    sourceModule: "G01",
    sourceReferenceId: "g01:emp:1",
    sourceEventVersion: 1,
    employeeId: ph03Ids.employee,
    eventTypeCode: "APPOINTMENT",
    eventDate: "2020-01-01",
    factKey: "G01:emp:APPOINTMENT",
    payload: { grade: "GR-1" },
  });
}

test("PH-48A G12 SR-ledger chain reads respond through the kernel", async () => {
  const services = createFoundationServices();
  const api = createFoundationApi(services);
  seedEvent(services);

  const entry = await call(api, { method: "GET", path: `/api/v1/sr/employees/${ph03Ids.employee}/entry-chain` });
  assert.equal(entry.status, 200);
  assert.ok(entry.body.items.length >= 1);

  for (const suffix of ["status-chain", "status-events"]) {
    const res = await call(api, { method: "GET", path: `/api/v1/sr/employees/${ph03Ids.employee}/${suffix}` });
    assert.equal(res.status, 200, suffix);
    assert.ok(Array.isArray(res.body.items), suffix);
  }

  const chainEmployees = await call(api, { method: "GET", path: "/api/v1/sr/chain-employees" });
  assert.equal(chainEmployees.status, 200);
  assert.ok(chainEmployees.body.items.includes(ph03Ids.employee));

  const feed = await call(api, { method: "GET", path: "/api/v1/sr/feed-events" });
  assert.equal(feed.status, 200);
  assert.ok(feed.body.items.length >= 1);
});

test("PH-48A G12 RFC-3161 timestamp verify round-trips; a tampered token is rejected", async () => {
  const api = createFoundationApi(createFoundationServices());
  const issued = await call(api, { method: "POST", path: "/api/v1/sr/timestamp", headers: { "Idempotency-Key": "ts-1" }, body: { payload: { docId: "D1", hash: "abc" } } });
  assert.equal(issued.status, 201);
  const token = issued.body.token;

  const good = await call(api, { method: "POST", path: "/api/v1/sr/timestamp:verify", headers: { "Idempotency-Key": "ts-v1" }, body: { payload: { docId: "D1", hash: "abc" }, token } });
  assert.equal(good.status, 200);
  assert.equal(good.body.valid, true);

  const tampered = await call(api, { method: "POST", path: "/api/v1/sr/timestamp:verify", headers: { "Idempotency-Key": "ts-v2" }, body: { payload: { docId: "D1", hash: "TAMPERED" }, token } });
  assert.equal(tampered.status, 200);
  assert.equal(tampered.body.valid, false);
});

test("PH-48A G12 offline verification bundle round-trips through the kernel", async () => {
  const api = createFoundationApi(createFoundationServices());
  const issued = await call(api, {
    method: "POST",
    path: "/api/v1/sr/verification-bundle",
    headers: { "Idempotency-Key": "vb-1" },
    body: { subjectRef: "sr:emp:1", entryHash: "deadbeef", anchorRef: "anchor-1", issuedAt: "2026-07-02T00:00:00.000Z" },
  });
  assert.equal(issued.status, 201);

  const verified = await call(api, { method: "POST", path: "/api/v1/sr/verification-bundle:verify", headers: { "Idempotency-Key": "vb-v1" }, body: issued.body.bundle });
  assert.equal(verified.status, 200);
  assert.equal(verified.body.valid, true);
});
