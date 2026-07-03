const test = require("node:test");
const assert = require("node:assert/strict");

const { createFoundationApi, createFoundationServices, ph03Ids } = require("../../../dist/apps/api/src");

function actor(extra = {}) {
  return {
    tenantId: ph03Ids.tenant,
    entityId: ph03Ids.entity,
    userId: "user-ph63a",
    actorUserId: "user-ph63a",
    permissions: ["*"],
    roles: ["hr_admin"],
    fieldGrants: [],
    correlationId: "corr-ph63a",
    ...extra,
  };
}

function call(api, request) {
  return api.dispatch({
    ...request,
    headers: { "X-Correlation-Id": "corr-ph63a", ...(request.headers ?? {}) },
    actor: actor(request.actor ?? {}),
  });
}

function addContact(api, key, body) {
  return call(api, { method: "POST", path: `/api/v1/employees/${ph03Ids.employee}/emergency-contacts`, headers: { "Idempotency-Key": key }, body });
}

test("PH-63A G01 emergency contacts hold distinct call-order priorities (CONFLICT on clash)", () => {
  const api = createFoundationApi(createFoundationServices());

  const first = addContact(api, "ec-1", { name: "Spouse", phone: "+91-90000-00001", priority: 1 });
  assert.equal(first.status, 201);
  assert.equal(first.body.emergencyContact.priority, 1);

  const second = addContact(api, "ec-2", { name: "Sibling", phone: "+91-90000-00002", priority: 2 });
  assert.equal(second.status, 201);

  // Priority 1 is taken -> CONFLICT.
  const clash = addContact(api, "ec-3", { name: "Parent", phone: "+91-90000-00003", priority: 1 });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.error.code, "CONFLICT");

  const list = call(api, { method: "GET", path: `/api/v1/employees/${ph03Ids.employee}/emergency-contacts` });
  assert.equal(list.status, 200);
  assert.deepEqual(list.body.items.map((c) => c.priority), [1, 2]);
});

test("PH-63A G01 emergency-contact update uses row_version optimistic locking", () => {
  const api = createFoundationApi(createFoundationServices());
  const created = addContact(api, "eu-1", { name: "Spouse", phone: "+91-90000-00001", priority: 1 });
  const id = created.body.emergencyContact.id;

  const updated = call(api, {
    method: "PATCH",
    path: `/api/v1/employees/${ph03Ids.employee}/emergency-contacts/${id}`,
    headers: { "Idempotency-Key": "eu-u" },
    body: { rowVersion: 1, phone: "+91-90000-99999" },
  });
  assert.equal(updated.status, 200);
  assert.equal(updated.body.emergencyContact.phone, "+91-90000-99999");
  assert.equal(updated.body.emergencyContact.rowVersion, 2);

  const stale = call(api, {
    method: "PATCH",
    path: `/api/v1/employees/${ph03Ids.employee}/emergency-contacts/${id}`,
    headers: { "Idempotency-Key": "eu-s" },
    body: { rowVersion: 1, phone: "+91-90000-88888" },
  });
  assert.equal(stale.status, 409);
});

test("PH-63A G01 soft-delete frees the emergency-contact priority", () => {
  const api = createFoundationApi(createFoundationServices());
  const created = addContact(api, "ed-1", { name: "Spouse", phone: "+91-90000-00001", priority: 1 });
  const id = created.body.emergencyContact.id;

  // Priority 1 is taken.
  assert.equal(addContact(api, "ed-2", { name: "Parent", phone: "+91-90000-00003", priority: 1 }).status, 409);

  const removed = call(api, { method: "POST", path: `/api/v1/employees/${ph03Ids.employee}/emergency-contacts/${id}:remove`, headers: { "Idempotency-Key": "ed-r" }, body: {} });
  assert.equal(removed.status, 200);

  // The freed priority is available again.
  assert.equal(addContact(api, "ed-3", { name: "Parent", phone: "+91-90000-00003", priority: 1 }).status, 201);
});
